# Query API

```sh
python -m wikigraph.cli demo
uvicorn wikigraph.api:create_app --factory --host 127.0.0.1 --port 8000
```

Set `WIKIGRAPH_GRAPH` to a validated Turtle export to serve another dataset.
Interactive API documentation: `/docs`. Schema: `/openapi.json`.

- `GET /entities?q=Python&limit=20&offset=0`: title/alias search.
- `GET /entities/fixture-1/neighbors?predicate=all&direction=both&limit=30&offset=0`.
- `GET /paths?source=fixture-1&target=fixture-3&direction=out&max_depth=4`.
- `GET /assertions/{id}`: evidence, source kind, revision, offsets and method.
- `GET /health` and `GET /metrics`: readiness and process-local request counters.

Entity IDs use `enwiki-PAGE_ID` or `fixture-PAGE_ID`. Predicates are `all`,
`linksTo`, `designedBy`, `developedBy`, and `influencedBy`. Direction is `out`,
`in`, or `both`. A returned path is the first shortest path under those settings.
`truncated=true` means a bound was reached; absence of a path is not conclusive.

Bounds: 100 items per page, six hops, 2,000 visited nodes, 100 ms traversal budget.
The in-process service applies a global 180 request/minute quota, not a per-user
quota. Readiness/metrics are excluded. For multiple workers or public deployment,
configure a shared limit at the reverse proxy. Counters are also per process.
Errors share `{ "error": { "code": HTTP_STATUS, "message": "..." } }`.
Each response includes an `X-Request-ID`; logs include status and elapsed seconds.

The RDF graph is validated and indexed on startup. A fixed SPARQL template loads
entities; immutable adjacency indexes serve repeated bounded traversal queries.
Public callers cannot submit arbitrary SPARQL. Changes require a new export and
server restart. Keep ingestion separate from this read-only service.

`WIKIGRAPH_RATE_LIMIT` overrides the per-process request quota (positive integer).
Keep the default for normal use; benchmark runs explicitly record their override.

## Structural similarity

- `GET /graph/map?origins=id[,id,id]&limit=40`: one to three distinct valid origins;
  limit clamps to 5–80 recommendations, plus the origins. Returns enriched nodes,
  original assertion edges, invisible layout springs, clusters and side lists.
- `GET /similarity/explain?a=id&b=id`: weighted shared incoming/outgoing neighbors
  and direct factual/reference assertions for an entity pair.
- `GET /entities/top?limit=6`: highest incoming-page-link-degree starting points.

Similarity is symmetric weighted cosine (incoming and outgoing components weighted
0.5 each), plus 0.15 for a direct page reference and 0.35 for a direct fact, clamped
to one. Neighbor weights are `1 / ln(2 + incoming_degree + outgoing_degree)`.
Multi-origin scores use a geometric mean with a 0.02 floor per origin. This score
is structural proximity, not a calibrated probability or a new factual relationship.
All existing search, neighbor, path and assertion response shapes remain unchanged.
