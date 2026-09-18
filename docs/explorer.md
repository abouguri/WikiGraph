# Explorer development

The API serves the explorer at `/`. The server defaults to API mode. Offline mode uses a bundled, synthetic
teaching graph and makes no Wikipedia or query API requests. Static hosting
from `src/wikigraph/static` falls back to offline mode when `/config` is unavailable.

Switch to **Server dataset** to query the API's loaded graph. The mode, selected
entity, destination, predicate and direction are shareable in the URL. Expanded
neighborhood history is not persisted. The view caps at 40 nodes, 120 visible edges and 30 edges per
expansion; reduce the scope with a filter when the limit notice appears.

The connection list supplies keyboard-accessible expansion and evidence actions.
The SVG supplies a visual overview; source/target order is explicit in the list.
Synthetic revision IDs are never presented as Wikipedia source links.

```sh
cd frontend
npm ci
npm run build
npx playwright install chromium
npm test
```

TypeScript source is under `frontend/src`. Built JavaScript is committed with the
Python package so running a released wheel does not require Node. Rebuild before
committing UI changes. The Playwright server uses an isolated `/tmp` graph.
`python scripts/export_sample.py` regenerates the offline JSON from the same
validated graph and query models used by the API.


The server's entity list is paginated into a bounded destination list of at most
1,000 entities. This includes the complete 300-page release corpus, preserves
shared selections beyond the first API page, and keeps Python as the default
starting entity. Dataset, search and evidence requests discard stale responses
when a newer user action supersedes them. Six Chromium flows cover these cases
alongside evidence, paths, share links, keyboard interaction and mobile layout.
