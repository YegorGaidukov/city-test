import { useEffect, useRef, useState } from 'react'
import City from './City.jsx'
import { prepareKit, SPEED_M_PER_MIN, BAND_M, MAX_SNAP_M, MINUTES } from './reach.js'
import { USES, REACH, SHOP } from './palette.js'

const FILES = { kit: 'kit.json', buildings: 'buildings.geojson', graph: 'streets.graph.json', zensus: 'zensus.geojson', shops: 'shops.geojson' }

const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0). Shops: © OpenStreetMap contributors (ODbL).'

async function loadKit() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, file]) => {
      const r = await fetch(`${import.meta.env.BASE_URL}data/${file}`)
      if (!r.ok) throw new Error(`data/${file}: ${r.status}`)
      return [key, await r.json()]
    }),
  )
  return Object.fromEntries(entries)
}

const fmt = (n) => n.toLocaleString('en-GB')

// OpenStreetMap tag values in plain words: "fast_food" → "Fast food".
const kindLabel = (kind) => (kind === 'yes' ? 'Shop' : kind[0].toUpperCase() + kind.slice(1).replace(/_/g, ' '))

export default function App() {
  const [kit, setKit] = useState(null)
  const [prep, setPrep] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hoverShop, setHoverShop] = useState(null)
  const worker = useRef(null)
  const lastId = useRef(0)

  useEffect(() => {
    loadKit()
      .then((data) => {
        setKit(data.kit)
        setPrep(prepareKit(data))
        const w = new Worker(new URL('./reach.worker.js', import.meta.url), { type: 'module' })
        w.postMessage({ type: 'init', kit: data })
        w.onmessage = ({ data: msg }) => {
          if (msg.id !== lastId.current) return // a newer click is on its way
          setResult(msg.result)
          setBusy(false)
        }
        worker.current = w
      })
      .catch((e) => setError(e.message))
    return () => worker.current?.terminate()
  }, [])

  const onGroundClick = (xy) => {
    if (!worker.current) return
    lastId.current += 1
    setBusy(true)
    worker.current.postMessage({ type: 'reach', id: lastId.current, xy })
  }

  return (
    <div className="app">
      <div className="stage">
        {prep && <City prep={prep} size={kit.size_m} result={result} hoverShop={hoverShop} onGroundClick={onGroundClick} />}
        {!prep && !error && <p className="loading">Loading the city kit…</p>}
        {error && <p className="loading error">The city kit didn't load ({error}).</p>}
        <p className="attribution">{ATTRIBUTION}</p>
      </div>

      <aside className="panel">
        <h1>Walking reach</h1>
        <p className="sub">{kit ? `${kit.label}, ${fmt(kit.size_m[0])} × ${fmt(kit.size_m[1])} m` : ' '}</p>

        <Status result={result} busy={busy} />

        <table className="reach">
          <thead>
            <tr>
              <th />
              <th>Walk</th>
              <th>Buildings</th>
              <th>Residents</th>
            </tr>
          </thead>
          <tbody>
            {REACH.map((r, i) => {
              const l = result?.ok ? result.levels[i] : null
              return (
                <tr key={r.minutes} className={busy ? 'stale' : ''}>
                  <td><span className="swatch" style={{ background: r.building, boxShadow: `0 0 0 3px ${r.area}` }} /></td>
                  <td>{r.minutes} min</td>
                  <td className="num">{l ? fmt(l.touched.length) : '–'}</td>
                  <td className="num">
                    {l ? `about ${fmt(l.residents)}` : '–'}
                    {l?.unknownCells > 0 && (
                      <span className="unknown">
                        {' '}+ {l.unknownCells} {l.unknownCells === 1 ? 'cell' : 'cells'} without a figure
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="method">
          <p>
            Walking at 4.8 km/h, which is {SPEED_M_PER_MIN} m per minute, along the pedestrian network from the street
            point nearest to your click. Clicks more than {MAX_SNAP_M} m from any walkable street don't start a walk.
          </p>
          <p>
            Each area is the stretch of street you reach in that time, including the part of the last street you get
            partway along, widened by {BAND_M} m on each side. A building counts if it touches the area.
          </p>
          <p>
            Residents come from the 100 m census cells of Zensus 2022. Each cell adds its residents times the share of
            the cell that lies inside the area, and the total is rounded to the nearest 10. Cells for which the census
            published no figure are left out of the sum and counted next to it.
          </p>
          <p>
            Shops, cafés and restaurants come from OpenStreetMap and are only as complete as its mapping. A shop is
            listed when the street point nearest to it is within a {MINUTES[0]}-minute walk. The few steps from that
            street point to the door, for example through an arcade, aren't counted. Shops more than {MAX_SNAP_M} m from
            any street are left out.
          </p>
        </div>

        {result?.ok && <ShopList prep={prep} shops={result.shops} stale={busy} onHover={setHoverShop} />}

        <h2>Building use</h2>
        <ul className="legend">
          {USES.map(([key, label, color]) => (
            <li key={key}>
              <span className="swatch" style={{ background: color }} />
              {label}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

function Status({ result, busy }) {
  if (busy) return <p className="status">Walking…</p>
  if (!result) return <p className="status">Click anywhere on the ground to start a walk. Drag to orbit, right-drag to pan, scroll to zoom.</p>
  if (!result.ok)
    return (
      <p className="status warn">
        No walkable street within {MAX_SNAP_M} m of that point (the nearest is {fmt(Math.round(result.streetDist))} m away).
        Click closer to a street.
      </p>
    )
  return <p className="status">Click somewhere else to walk from there.</p>
}

function ShopList({ prep, shops, stale, onHover }) {
  const byMinute = new Map()
  for (const s of shops) {
    if (!byMinute.has(s.minutes)) byMinute.set(s.minutes, [])
    byMinute.get(s.minutes).push(s)
  }
  return (
    <section className={stale ? 'shops stale' : 'shops'}>
      <h2>
        Shops within {MINUTES[0]} min ({fmt(shops.length)})
      </h2>
      <p className="shop-key">
        <span className="dot" style={{ background: SHOP.retail }} /> Shop
        <span className="dot" style={{ background: SHOP.food_and_drink }} /> Food and drink
      </p>
      {!shops.length && <p className="status">No shops within a {MINUTES[0]}-minute walk of this point.</p>}
      {[...byMinute].map(([minutes, list]) => (
        <div key={minutes}>
          <h3>{minutes} min</h3>
          <ul className="shop-list" onMouseLeave={() => onHover(null)}>
            {list.map((s) => {
              const shop = prep.shops[s.i]
              return (
                <li key={shop.osm_id} onMouseEnter={() => onHover(s.i)}>
                  <span className="dot" style={{ background: SHOP[shop.group] }} />
                  <span className="name">{shop.name ?? <em>no name</em>}</span>
                  <span className="kind">{kindLabel(shop.kind)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
