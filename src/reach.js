import ClipperLib from 'clipper-lib'
import { makeProjection, ringArea, openRing, bboxOf, pointInRing, segSegDist2, pointSegDist } from './geo.js'

export const SPEED_M_PER_MIN = 80 // 4.8 km/h
export const MINUTES = [5, 10, 15]
export const BAND_M = 25
export const MAX_SNAP_M = 100

const SCALE = 100 // Clipper works in whole numbers: centimetres
const GRID = 50 // spatial index cell, metres

// Builds everything that doesn't depend on the click: projected buildings,
// the walkable graph and the census cells, all in metres.
export function prepareKit({ kit, buildings, graph, zensus, shops }) {
  const project = makeProjection(kit.center)

  const blds = buildings.features.map((f) => {
    const rings = f.geometry.coordinates.map((r) => openRing(r).map(project))
    return {
      id: f.properties.id,
      use: f.properties.use ?? 'undefined',
      height: f.properties.height,
      rings,
      bbox: bboxOf(rings[0]),
    }
  })

  const nodeIndex = new Map()
  const nodes = graph.nodes.map((n, i) => {
    nodeIndex.set(n.id, i)
    return { id: n.id, xy: project([n.lon, n.lat]), adj: [] }
  })
  const edges = []
  for (const e of graph.edges) {
    if (!e.walkable) continue
    const a = nodeIndex.get(e.from)
    const b = nodeIndex.get(e.to)
    const coords = e.coords.map(project)
    const k = edges.length
    edges.push({ a, b, length: e.length, coords })
    nodes[a].adj.push(k)
    nodes[b].adj.push(k)
  }

  const cells = zensus.features.map((f) => {
    const ring = openRing(f.geometry.coordinates[0]).map(project)
    return { id: f.properties.id, population: f.properties.population, ring, area: Math.abs(ringArea(ring)), bbox: bboxOf(ring) }
  })

  const places = shops.features.map((f) => {
    const xy = project(f.geometry.coordinates)
    const b = blds.find((b) => xy[0] >= b.bbox[0] && xy[0] <= b.bbox[2] && xy[1] >= b.bbox[1] && xy[1] <= b.bbox[3] && pointInRing(xy, b.rings[0]))
    return { ...f.properties, xy, roof: b ? b.height : 0, ...snapToStreet(edges, xy) }
  })

  return { project, buildings: blds, nodes, edges, cells, shops: places }
}

// The nearest point on any walkable edge: which edge, how far along it
// (measured in the edge's own `length`, like the walk) and how far away.
function snapToStreet(edges, [px, py]) {
  let best = { edge: -1, along: 0, streetDist: Infinity }
  edges.forEach((e, k) => {
    let total = 0
    const seg = []
    for (let i = 1; i < e.coords.length; i++) {
      const l = Math.hypot(e.coords[i][0] - e.coords[i - 1][0], e.coords[i][1] - e.coords[i - 1][1])
      seg.push(l)
      total += l
    }
    let acc = 0
    for (let i = 1; i < e.coords.length; i++) {
      const [ax, ay] = e.coords[i - 1], [bx, by] = e.coords[i], l = seg[i - 1]
      const t = l ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (l * l))) : 0
      const d = Math.hypot(ax + t * (bx - ax) - px, ay + t * (by - ay) - py)
      if (d < best.streetDist) best = { edge: k, along: total ? ((acc + t * l) / total) * e.length : 0, streetDist: d }
      acc += l
    }
  })
  return best
}

// Shops within `budget` metres of walking, nearest first. The walk is measured
// to the street point nearest the shop; the last stretch to the door, often
// through an arcade or courtyard, isn't counted. Shops more than 100 m from
// any street are left out, the same limit as for clicks.
export function shopsReached(prep, dist, budget) {
  const out = []
  prep.shops.forEach((s, i) => {
    if (s.edge < 0 || s.streetDist > MAX_SNAP_M) return
    const e = prep.edges[s.edge]
    const walk = Math.min(dist[e.a] + s.along, dist[e.b] + e.length - s.along)
    if (walk <= budget) out.push({ i, walk, minutes: Math.max(1, Math.ceil(walk / SPEED_M_PER_MIN)) })
  })
  return out.sort((a, b) => a.walk - b.walk)
}

// Finds where the walk starts: the nearest node that has a walkable edge,
// unless no walkable street passes within 100 m of the click.
export function findStart(prep, xy) {
  let best = Infinity
  for (const e of prep.edges) {
    for (let i = 1; i < e.coords.length; i++) best = Math.min(best, pointSegDist(xy, e.coords[i - 1], e.coords[i]))
  }
  if (best > MAX_SNAP_M) return { ok: false, streetDist: best }
  let node = -1, nd = Infinity
  prep.nodes.forEach((n, i) => {
    if (!n.adj.length) return
    const d = Math.hypot(n.xy[0] - xy[0], n.xy[1] - xy[1])
    if (d < nd) { nd = d; node = i }
  })
  return { ok: true, node, nodeDist: nd, streetDist: best }
}

// Walking distance in metres from the start node to every node (Dijkstra).
export function walkDistances(prep, start) {
  const dist = new Float64Array(prep.nodes.length).fill(Infinity)
  dist[start] = 0
  const heap = [[0, start]]
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, u] = pop()
    if (d > dist[u]) continue
    for (const k of prep.nodes[u].adj) {
      const e = prep.edges[k]
      const v = e.a === u ? e.b : e.a
      const nd = d + e.length
      if (nd < dist[v]) { dist[v] = nd; push([nd, v]) }
    }
  }
  return dist
}

// The part of a polyline between distances s0 and s1 from its start,
// measured along the edge's own `length` so it matches the walk.
function slice(coords, length, s0, s1) {
  const seg = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const l = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1])
    seg.push(l)
    total += l
  }
  const f = total / length // drawn length vs. stated length
  const t0 = s0 * f, t1 = s1 * f
  const out = []
  let acc = 0
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i], l = seg[i - 1]
    const lerp = (t) => { const u = l ? (t - acc) / l : 0; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] }
    if (acc + l >= t0 && acc <= t1) {
      if (!out.length) out.push(lerp(Math.max(t0, acc)))
      out.push(lerp(Math.min(t1, acc + l)))
    }
    acc += l
  }
  return out.length >= 2 ? out : null
}

// The street pieces reachable within `budget` metres, including the reachable
// part of the last segment, walked in from either end.
export function reachedPieces(prep, dist, budget) {
  const pieces = []
  for (const e of prep.edges) {
    const fromA = budget - dist[e.a]
    const fromB = budget - dist[e.b]
    if (fromA <= 0 && fromB <= 0) continue
    if (fromA + fromB >= e.length) {
      pieces.push(e.coords)
      continue
    }
    if (fromA > 0) { const p = slice(e.coords, e.length, 0, fromA); if (p) pieces.push(p) }
    if (fromB > 0) { const p = slice(e.coords, e.length, e.length - fromB, e.length); if (p) pieces.push(p) }
  }
  return pieces
}

// The 25 m band around the pieces, joined into one shape.
// Returns polygons as [outer, ...holes] rings in metres, plus Clipper paths.
export function bandArea(pieces) {
  const co = new ClipperLib.ClipperOffset(2, 25) // round joins, curves within 25 cm
  for (const p of pieces) {
    co.AddPath(p.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound)
  }
  const tree = new ClipperLib.PolyTree()
  co.Execute(tree, BAND_M * SCALE)
  const toM = (path) => path.map((pt) => [pt.X / SCALE, pt.Y / SCALE])
  const polygons = []
  const walk = (node) => {
    for (const outer of node.Childs()) {
      polygons.push([toM(outer.Contour()), ...outer.Childs().map((h) => toM(h.Contour()))])
      for (const hole of outer.Childs()) walk(hole)
    }
  }
  walk(tree)
  return { polygons, paths: ClipperLib.Clipper.PolyTreeToPaths(tree) }
}

function gridIndex(pieces) {
  const grid = new Map()
  pieces.forEach((p, i) => {
    for (let j = 1; j < p.length; j++) {
      const [x0, y0, x1, y1] = bboxOf([p[j - 1], p[j]])
      for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++) {
        for (let gy = Math.floor(y0 / GRID); gy <= Math.floor(y1 / GRID); gy++) {
          const key = gx + ',' + gy
          if (!grid.has(key)) grid.set(key, [])
          grid.get(key).push([p[j - 1], p[j]])
        }
      }
    }
  })
  return grid
}

// A building touches the area when its footprint comes within 25 m of a
// reached street piece: that is exactly what the band covers.
export function touchedBuildings(prep, pieces) {
  const grid = gridIndex(pieces)
  const r2 = BAND_M * BAND_M
  const hit = new Set()
  prep.buildings.forEach((b, i) => {
    const [x0, y0, x1, y1] = b.bbox
    const seen = new Set()
    for (let gx = Math.floor((x0 - BAND_M) / GRID); gx <= Math.floor((x1 + BAND_M) / GRID); gx++) {
      for (let gy = Math.floor((y0 - BAND_M) / GRID); gy <= Math.floor((y1 + BAND_M) / GRID); gy++) {
        for (const s of grid.get(gx + ',' + gy) ?? []) {
          if (seen.has(s)) continue
          seen.add(s)
          if (pointInRing(s[0], b.rings[0])) { hit.add(i); return }
          for (const ring of b.rings) {
            for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) {
              if (segSegDist2(s[0], s[1], ring[m], ring[k]) <= r2) { hit.add(i); return }
            }
          }
        }
      }
    }
  })
  return hit
}

// Residents: each overlapping cell's population times the share of the cell
// inside the area. Cells with no published figure are counted, not summed.
// Only the street pieces within 25 m of a cell can reach into it, so the band
// is rebuilt from those few pieces per cell: same shape, much faster.
export function residents(prep, pieces) {
  const grid = gridIndex(pieces)
  let sum = 0
  let unknown = 0
  for (const c of prep.cells) {
    const [x0, y0, x1, y1] = c.bbox
    const near = new Set()
    for (let gx = Math.floor((x0 - BAND_M) / GRID); gx <= Math.floor((x1 + BAND_M) / GRID); gx++) {
      for (let gy = Math.floor((y0 - BAND_M) / GRID); gy <= Math.floor((y1 + BAND_M) / GRID); gy++) {
        for (const s of grid.get(gx + ',' + gy) ?? []) near.add(s)
      }
    }
    if (!near.size) continue
    const local = bandArea([...near])
    const clip = new ClipperLib.Clipper()
    clip.AddPaths(local.paths, ClipperLib.PolyType.ptSubject, true)
    clip.AddPath(c.ring.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })), ClipperLib.PolyType.ptClip, true)
    const out = []
    clip.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
    const inside = Math.abs(out.reduce((a, p) => a + ClipperLib.Clipper.Area(p), 0)) / (SCALE * SCALE)
    if (inside <= 0.01) continue
    if (c.population == null) unknown++
    else sum += c.population * Math.min(1, inside / c.area)
  }
  return { residents: Math.round(sum / 10) * 10, raw: sum, unknownCells: unknown }
}

// Everything the screen needs for one click.
export function computeReach(prep, xy) {
  const start = findStart(prep, xy)
  if (!start.ok) return { ok: false, streetDist: start.streetDist }
  const dist = walkDistances(prep, start.node)
  const levels = MINUTES.map((min) => {
    const pieces = reachedPieces(prep, dist, min * SPEED_M_PER_MIN)
    const area = bandArea(pieces)
    const touched = touchedBuildings(prep, pieces)
    return { minutes: min, polygons: area.polygons, touched, ...residents(prep, pieces) }
  })
  const shops = shopsReached(prep, dist, MINUTES[0] * SPEED_M_PER_MIN)
  return { ok: true, startNode: start.node, startXY: prep.nodes[start.node].xy, levels, shops }
}
