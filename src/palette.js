// Quiet colours for building uses, in the order the legend lists them.
export const USES = [
  ['residential', 'Residential', '#e2ddd3'],
  ['service', 'Service', '#b4bec7'],
  ['office', 'Office', '#93a2b2'],
  ['retail', 'Retail', '#c8bb9b'],
  ['food_and_drink', 'Food and drink', '#b3a588'],
  ['accommodation', 'Accommodation', '#a7b4c8'],
  ['education', 'Education', '#a4b8a0'],
  ['health', 'Health', '#9fbab3'],
  ['civic', 'Civic', '#8196aa'],
  ['culture', 'Culture', '#ac9fbe'],
  ['entertainment', 'Entertainment', '#c2a9bf'],
  ['sport', 'Sport', '#90ad8f'],
  ['transport', 'Transport', '#9b9b9b'],
  ['light_industrial', 'Light industrial', '#8b867d'],
  ['undefined', 'Use not known', '#cfcfcc'],
]

export const USE_COLOR = Object.fromEntries(USES.map(([k, , c]) => [k, c]))

// One accent, three shades: 5 min darkest, 15 min lightest. Each area is a
// pale tint of its shade so the highlighted buildings stand out on it.
export const REACH = [
  { minutes: 5, area: '#f1b393', building: '#c2410c' },
  { minutes: 10, area: '#f7cfb6', building: '#ec7a3e' },
  { minutes: 15, area: '#fbe6d9', building: '#f6b083' },
]

// Shop pins and dots: blue-green for retail, plum for food and drink, both
// well away from the orange reach shades.
export const SHOP = { retail: '#1f6f78', food_and_drink: '#7a3e8c' }

export const GROUND = '#f3f1ec'
export const STREET = '#8d8a84'
