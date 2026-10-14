// Runs the walk in the background so the 3D view stays smooth while it works.
import { prepareKit, computeReach } from './reach.js'

let prep = null

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    prep = prepareKit(data.kit)
    return
  }
  if (data.type === 'reach') {
    const r = computeReach(prep, data.xy)
    if (r.ok) for (const l of r.levels) l.touched = [...l.touched]
    self.postMessage({ id: data.id, result: r })
  }
}
