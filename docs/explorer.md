# Graph explorer

The frontend is strict TypeScript compiled with esbuild into the Python package's
`static/app.js`. It uses Canvas 2D and browser APIs, with no graph rendering library.

`main.ts` wires controls and subscriptions. `controller.ts` coordinates bounded
requests and ignores stale dataset/search/evidence responses. `store.ts` owns map
state; `url.ts` reads and writes the share hash. Panel modules render DOM lists,
details, legends, timeline and downloads without interpolating source text as HTML.

`renderer.ts` handles drawing and camera/pointer interaction. Cached radial sprites
supply glows; a padded settled scene cache avoids rerasterizing every edge and node
while panning. Labels and hit geometry remain live. `geometry.ts` separates parallel
edges and loops; `hit.ts` uses a grid for node targets and sampled edge distances.
`sim.ts` supplies deterministic seeded positions, cooling forces, pinning and stable
expansion. No animation frames run after cooling or pausing. Reduced motion computes
the settled state before drawing.

The Python similarity index precomputes incoming/outgoing page-neighbor sets and
weights. It ranks bounded two-hop candidates with weighted cosine plus direct-link
and fact bonuses. Invisible layout springs connect similar entities; visible edges
remain source-backed assertions. `offline.ts` implements the same bounded algorithm
for the teaching sample; parity tests compare scores, clusters, lists and springs.

Shared hashes include dataset, origins, map size, selected node, color/size modes,
year/type filters and optional expansion/addition/removal IDs, saved IDs, camera,
pins, path target and inspected edge. Unknown keys are ignored. Saved source metadata
persists locally per dataset. No account or external write service is involved.

Use `npm --prefix frontend run build`, `npm --prefix frontend test`, and
`node frontend/verify-renderer.mjs` to verify changes. The last command creates a
synthetic stress fixture strictly for performance testing; screenshots and the demo
use the shipped real and teaching datasets.
