// Downloads shops, cafés and restaurants in the kit area from OpenStreetMap
// once and saves them as public/data/shops.geojson. The app reads that file;
// it never goes online itself. Run with: npm run fetch-shops
import { readFile, writeFile } from 'node:fs/promises'

const FOOD = ['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'ice_cream', 'biergarten']
// The main server is often busy, so the mirrors are tried in turn.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const kit = JSON.parse(await readFile(new URL('../public/data/kit.json', import.meta.url)))
const [w, s, e, n] = kit.bbox
const box = `(${s},${w},${n},${e})`

const query = `[out:json][timeout:60];
(
  nwr["shop"]${box};
  nwr["amenity"~"^(${FOOD.join('|')})$"]${box};
);
out center tags;`

let data = null
for (const url of OVERPASS) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'city-kit-fetch-shops' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(90_000),
    })
    if (res.ok) { data = await res.json(); break }
    console.log(`${url}: ${res.status}, trying the next server`)
  } catch (err) {
    console.log(`${url}: ${err.message}, trying the next server`)
  }
}
if (!data) throw new Error('No Overpass server answered. Try again in a few minutes.')
const { elements, osm3s } = data

const features = []
for (const el of elements) {
  const t = el.tags ?? {}
  if (t.shop === 'vacant' || t.disused === 'yes') continue
  const lon = el.lon ?? el.center?.lon
  const lat = el.lat ?? el.center?.lat
  if (lon == null || lon < w || lon > e || lat < s || lat > n) continue
  const food = FOOD.includes(t.amenity)
  features.push({
    type: 'Feature',
    properties: {
      osm_id: `${el.type}/${el.id}`,
      name: t.name ?? null,
      kind: food ? t.amenity : t.shop,
      group: food ? 'food_and_drink' : 'retail',
    },
    geometry: { type: 'Point', coordinates: [+lon.toFixed(6), +lat.toFixed(6)] },
  })
}
features.sort((a, b) => a.properties.osm_id.localeCompare(b.properties.osm_id))

const out = { type: 'FeatureCollection', osm_timestamp: osm3s?.timestamp_osm_base ?? null, features }
await writeFile(new URL('../public/data/shops.geojson', import.meta.url), JSON.stringify(out))

const count = (f) => features.filter(f).length
console.log(`${features.length} places, data as of ${out.osm_timestamp}`)
console.log(`retail ${count((f) => f.properties.group === 'retail')}, food and drink ${count((f) => f.properties.group === 'food_and_drink')}`)
console.log(`without a name ${count((f) => !f.properties.name)}`)
