# Explorer development

The API serves the explorer at `/`. The compact workspace opens the real API
corpus by default, with a prominent entity search, Graph/Connections views and a
source inspector. Static hosting falls back to the labeled synthetic teaching
sample if `/config` is unavailable. The dataset selector always distinguishes
Wikipedia from the authored sample.

## Exploring

Search ranks exact titles or aliases first, then prefixes, then substring matches.
Arrow keys navigate results; Enter selects. Selecting a graph node opens its
summary without expanding it. Use **Expand connections** / **Show more connections**
to fetch 12 assertions at a time. **Focus here** starts a fresh neighborhood.
The graph remains capped at 40 entities and 120 assertions. Fetched, available
and visible counts are separate; a cap never claims the full neighborhood is shown.

SVG rendering uses deterministic force positions with existing positions pinned
on expansion. Labels are measured and placed only where space permits; the selected
name gets a callout when it cannot fit nearby. Full names remain available in
Connections, the inspector and node tooltips. Arrowheads and solid/dashed strokes
separate direction and factual/reference edges. Selecting evidence highlights its
exact assertion; unrelated edges are subdued. Reciprocal/multiple edges curve
apart, and the Connections view exposes every visible assertion individually.

Use Fit, +/−, wheel zoom and background drag/pinch. With the canvas focused, arrow
keys pan and +/− zoom. Nodes support Enter/Space selection. Connections provides
complete equivalent evidence and node-selection actions with sortable, wrapping
rows. Path mode displays only the ordered route and numbered connection steps;
**Back to neighborhood** restores the preceding visible graph.

The inspector leads with the relationship, evidence type, supporting text and
source link. Technical extraction metadata is inside a disclosure. Synthetic
revisions are explicitly labeled and never linked as Wikipedia evidence.
Below 1200 px the inspector opens as a dismissible sheet/dialog, traps focus,
and returns it on close. Below 768 px Connections is the default view. The graph
remains one tab away. Reduced-motion mode requires no moving simulation.

The URL retains dataset, selected entity, predicate, direction and destination.
It does not serialize expanded neighborhoods, pan/zoom, open panels or tab history.
The destination list loads up to 1,000 entities, covering the full 300-page corpus.
Dataset, search and evidence requests discard stale responses. Loading, empty
results and errors are explicit; Retry repeats the failed operation.

## Build and verify

```sh
cd frontend
npm ci
npm run build
npx playwright install chromium
npm test
```

Sources are in `frontend/src`: `main.ts` coordinates requests and interaction,
`graph.ts` renders SVG/camera/labels, `layout.ts` computes bounded positions, and
`search.ts` ranks local matches. Compiled `app.js` is committed in the Python
package, so hosting needs no Node build. Rebuild it with every frontend change.
Playwright runs an isolated synthetic test server. Dense fixtures exercise both
40 nodes / 54 edges and 40 nodes / 120 edges. The viewport matrix captures loading,
default, evidence, path, empty search and errors at four sizes in ignored
`frontend/test-results/design/`. These captures aid visual review; they are not
an assertion that a pixel baseline or independent human usability review passed.

`node frontend/record-demo.mjs` regenerates the captioned video and real screenshots
using the actual 300-page graph. See [demo instructions](demo.md).
