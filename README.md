# Walking reach

A 3D map of central Weimar that shows how far you can walk from any point in 5, 10 and 15 minutes, and about how many people live in that area.

Click on the ground. The app starts at the nearest point of the pedestrian network and draws three nested areas, one each for 5, 10 and 15 minutes, in three shades of orange. Buildings touching each area turn the matching shade. A panel lists, for each time, how many buildings you reach and about how many residents live there. When it isn't highlighting a walk, each building is coloured by its main use, and the legend names each colour.

## Run it

```
npm install     install the packages
npm run dev     start the app at http://localhost:5173
```

Drag to orbit, right-drag to pan, scroll to zoom. A push to `main` publishes the app on GitHub Pages at `https://<user>.github.io/<repo>/`.

## Method and its limits

- **Walking speed.** 4.8 km/h, which is 80 m per minute, so 400, 800 and 1200 m for 5, 10 and 15 minutes. Everyone walks at the same pace. The walk has no waits at crossings and no slopes.
- **Start.** The walk starts at the nearest junction or dead end of the pedestrian network. The distance from your click to that point isn't counted. If no walkable street lies within 100 m of the click, the app says so and doesn't start a walk.
- **The area.** Each area is the set of street pieces reached in that time, including the reachable part of the last street, widened by 25 m on each side and merged into one shape. It isn't a circle or a convex hull. A building counts as reached if any part of its footprint touches the area.
- **Residents.** These come from the Zensus 2022 census on a 100 m grid. Every cell that overlaps the area adds its residents times the share of the cell's area that lies inside. The sum is rounded to the nearest 10. This assumes people are spread evenly within each cell, which they aren't. The census also changes small counts slightly at random to protect privacy, so the figure is an estimate.
- **Cells without a figure.** For some cells the census published no resident count. These aren't zero. They are left out of the sum, and the panel shows how many such cells overlap the area. In this kit there is one such cell.
- **Edge of the kit.** The network and buildings stop at the kit boundary, so walks near the edge are cut short.

## Data sources

All data comes from `public/data/`. Nothing is fetched from the internet. See `public/data/SOURCES.md` for fields and units.

| Data | Source | Licence |
| --- | --- | --- |
| Building footprints and heights | 3D building models LoD2 of Thuringia, © GDI-Th; uses added by Egor Gaydukov | dl-de/by-2-0 |
| Pedestrian network | Egor Gaydukov, InfAU, Bauhaus-Universität Weimar | |
| Census grid | Zensus 2022, © Statistische Ämter des Bundes und der Länder | dl-de/by-2-0 |

Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).

## How this was made

1. Tools: Claude Code, with Claude Opus 5.5 (claude-opus-5-5).
2. I decided:
3. The agent did: read the data, built the 3D map with React Three Fiber, wrote the walking, 25 m band and resident-count calculations, and tested them in Node and in the browser on a GitHub Pages-style path.
4. I checked:
