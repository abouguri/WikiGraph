# Measured query baseline

Run: `python scripts/benchmark.py` (see `reports/benchmark.json` for exact results).

Dataset: 100 real Wikipedia entities, 815 assertions, 34,400 RDF triples. One local
HTTP run used five concurrent clients and 100 requests per workload, with five
warm-up requests. Each request opened a fresh connection. Rate limiting was raised
only for the benchmark. The report records graph SHA-256 and environment details.

| Workload | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Entity search | 7.46 ms | 11.36 ms | 16.60 ms |
| One-hop neighbors | 13.11 ms | 31.48 ms | 33.64 ms |
| Bounded path | 7.91 ms | 11.76 ms | 12.49 ms |

Server startup including validation/indexing: 2.88 seconds. Peak server RSS:
139,544 KiB. These figures include local HTTP transport but not internet latency.
The first query is application-cold; OS filesystem caches were not cleared.

This does not satisfy the separate 300-page performance gate or establish behavior
under sustained public traffic. The current bottleneck is semantic coverage, not
query latency: only two factual assertions were extracted from this corpus.
