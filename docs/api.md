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
