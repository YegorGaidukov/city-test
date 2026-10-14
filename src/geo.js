// Turns longitude/latitude into metres around the kit centre (x east, y north).
// Over 2 km a flat projection like this is off by well under a metre.
const R = 6371008.8

export function makeProjection([lon0, lat0]) {
  const k = (Math.PI / 180) * R
  const kx = k * Math.cos((lat0 * Math.PI) / 180)
  return ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * k]
}

// Signed area of a ring in m², positive when counter-clockwise.
export function ringArea(ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  }
  return a / 2
}

// Drops the repeated closing point that GeoJSON rings carry.
export function openRing(ring) {
  const n = ring.length
  if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) return ring.slice(0, -1)
  return ring
}

export function bboxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

export function pointInRing([px, py], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function pointSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const ex = ax + t * dx - px, ey = ay + t * dy - py
  return ex * ex + ey * ey
}

function cross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

// Shortest distance between two segments, squared (0 when they cross).
export function segSegDist2(a, b, c, d) {
  const d1 = cross(a[0], a[1], b[0], b[1], c[0], c[1])
  const d2 = cross(a[0], a[1], b[0], b[1], d[0], d[1])
  const d3 = cross(c[0], c[1], d[0], d[1], a[0], a[1])
  const d4 = cross(c[0], c[1], d[0], d[1], b[0], b[1])
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  return Math.min(
    pointSegDist2(a[0], a[1], c[0], c[1], d[0], d[1]),
    pointSegDist2(b[0], b[1], c[0], c[1], d[0], d[1]),
    pointSegDist2(c[0], c[1], a[0], a[1], b[0], b[1]),
    pointSegDist2(d[0], d[1], a[0], a[1], b[0], b[1]),
  )
}

export function pointSegDist([px, py], [ax, ay], [bx, by]) {
  return Math.sqrt(pointSegDist2(px, py, ax, ay, bx, by))
}
