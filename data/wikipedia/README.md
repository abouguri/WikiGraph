# Computing corpus v1

A curated set of 101 requested English Wikipedia titles, resolving to 100 distinct
page IDs. The redirects are recorded, not treated as extra pages. `seeds.json`
defines the requests. `cache/` stores normalized page data and raw API responses;
`graph.pages.json` records the distinct snapshots used by `graph.ttl`.
`graph.manifest.json` records revisions and the export hash.

Article text and derived text are by **Wikipedia contributors**, available under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The WikiGraph
transformations and derived dataset here are distributed under the same license.
Each snapshot includes the source URL and revision ID; the Sources list below
links to the original revision and contributor history. Normalization removes
reference markers and HTML, collapses whitespace, and extracts typed graph records.
External media referenced in raw HTML are not bundled or licensed by this notice.
See [Wikipedia's reuse terms](https://en.wikipedia.org/wiki/Wikipedia:Copyrights).

Rebuild without network access from the repository root:

```sh
python scripts/rebuild_corpus.py --output /tmp/wiki-rebuild/graph.ttl
```

The corpus is a demonstration dataset, not a reviewed extraction benchmark.
The small set of sentence rules has low coverage. Links dominate the graph;
links do not establish factual relations. Redirects can point to a broader topic
(e.g. a person redirecting to a language), an unresolved semantic identity risk.

## Sources

See [SOURCES.md](SOURCES.md) for per-page revision and contributor-history links.
