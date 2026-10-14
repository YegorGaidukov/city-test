import { useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { USE_COLOR, REACH, GROUND, STREET, SHOP } from './palette.js'

// Scene axes: x east, y up, z south. Kit metres (x, north) map to (x, -z).
const shapeFrom = ([outer, ...holes]) => {
  const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)))
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
  return s
}

// All buildings in one mesh. Each building keeps its range of vertices so it
// can be recoloured when the reach changes.
function useBuildingGeometry(buildings) {
  return useMemo(() => {
    const parts = buildings.map((b) => {
      const g = new THREE.ExtrudeGeometry(shapeFrom(b.rings), { depth: b.height, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      return g
    })
    const total = parts.reduce((n, g) => n + g.attributes.position.count, 0)
    const pos = new Float32Array(total * 3)
    const nor = new Float32Array(total * 3)
    const ranges = []
    let at = 0
    for (const g of parts) {
      const n = g.attributes.position.count
      pos.set(g.attributes.position.array, at * 3)
      nor.set(g.attributes.normal.array, at * 3)
      ranges.push([at, n])
      at += n
      g.dispose()
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(total * 3), 3))
    geom.computeBoundingSphere()
    return { geom, ranges }
  }, [buildings])
}

function Buildings({ buildings, levelOf, onPick }) {
  const { geom, ranges } = useBuildingGeometry(buildings)

  useEffect(() => {
    const col = geom.attributes.color.array
    const c = new THREE.Color()
    buildings.forEach((b, i) => {
      const lvl = levelOf.get(i)
      c.set(lvl === undefined ? USE_COLOR[b.use] ?? USE_COLOR.undefined : REACH[lvl].building)
      const [start, n] = ranges[i]
      for (let k = start; k < start + n; k++) {
        col[k * 3] = c.r
        col[k * 3 + 1] = c.g
        col[k * 3 + 2] = c.b
      }
    })
    geom.attributes.color.needsUpdate = true
  }, [geom, ranges, buildings, levelOf])

  return (
    <mesh geometry={geom} onClick={onPick}>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

function Streets({ edges }) {
  const geom = useMemo(() => {
    const pts = []
    for (const e of edges) {
      for (let i = 1; i < e.coords.length; i++) {
        const [x0, y0] = e.coords[i - 1]
        const [x1, y1] = e.coords[i]
        pts.push(x0, 0.4, -y0, x1, 0.4, -y1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [edges])
  return (
    <lineSegments geometry={geom} renderOrder={5}>
      <lineBasicMaterial color={STREET} />
    </lineSegments>
  )
}

function Area({ polygons, color, order }) {
  const geom = useMemo(() => {
    const g = new THREE.ShapeGeometry(polygons.map(shapeFrom))
    g.rotateX(-Math.PI / 2)
    return g
  }, [polygons])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <mesh geometry={geom} position={[0, 0.05 * order, 0]} renderOrder={order}>
      <meshBasicMaterial color={color} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4 * order} />
    </mesh>
  )
}

function Marker({ xy }) {
  return (
    <mesh position={[xy[0], 25, -xy[1]]}>
      <cylinderGeometry args={[5, 5, 50, 24]} />
      <meshLambertMaterial color="#3a1405" />
    </mesh>
  )
}

// One dot per reached shop, just above the roof of its building, all in one
// instanced mesh. The shop hovered in the list grows.
function ShopPins({ shops, reached, hover }) {
  const ref = useRef()
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    reached.forEach(({ i }, k) => {
      const s = shops[i]
      const r = i === hover ? 2.6 : 1
      m.makeScale(r, r, r).setPosition(s.xy[0], s.roof + 4 * r, -s.xy[1])
      mesh.setMatrixAt(k, m)
      mesh.setColorAt(k, c.set(SHOP[s.group]))
    })
    mesh.count = reached.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [shops, reached, hover])
  return (
    <instancedMesh ref={ref} args={[null, null, Math.max(1, shops.length)]} renderOrder={10}>
      <sphereGeometry args={[3.5, 16, 12]} />
      <meshLambertMaterial />
    </instancedMesh>
  )
}

export default function City({ prep, size, result, hoverShop, onGroundClick }) {
  const levelOf = useMemo(() => {
    const m = new Map()
    if (result?.ok) {
      // Innermost first, so a building gets the shade of the shortest walk.
      result.levels.forEach((l, li) => l.touched.forEach((i) => { if (!m.has(i)) m.set(i, li) }))
    }
    return m
  }, [result])

  const pick = (e) => {
    e.stopPropagation()
    if (e.delta > 4) return // that was a drag, not a click
    onGroundClick([e.point.x, -e.point.z])
  }

  const extent = Math.max(size[0], size[1]) + 1200

  return (
    <Canvas flat camera={{ position: [-300, 1900, 1900], fov: 38, near: 5, far: 20000 }} dpr={[1, 2]}>
      <color attach="background" args={[GROUND]} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[-600, 1200, 400]} intensity={1.8} />
      <directionalLight position={[700, 500, -500]} intensity={0.5} />

      <mesh rotation-x={-Math.PI / 2} onClick={pick}>
        <planeGeometry args={[extent, extent]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>

      {result?.ok &&
        [...result.levels].reverse().map((l) => {
          const li = REACH.findIndex((r) => r.minutes === l.minutes)
          return <Area key={l.minutes} polygons={l.polygons} color={REACH[li].area} order={3 - li} />
        })}

      <Streets edges={prep.edges} />
      <Buildings buildings={prep.buildings} levelOf={levelOf} onPick={pick} />
      {result?.ok && <Marker xy={result.startXY} />}
      {result?.ok && <ShopPins shops={prep.shops} reached={result.shops} hover={hoverShop} />}

      <OrbitControls makeDefault target={[0, 0, 0]} maxPolarAngle={1.4} minDistance={60} maxDistance={6000} screenSpacePanning={false} />
    </Canvas>
  )
}
