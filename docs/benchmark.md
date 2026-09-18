# 300-page performance and reproducibility gate

Run `python scripts/benchmark_rebuild.py` and `python scripts/benchmark.py`.
The raw reports are `reports/rebuild.json` and `reports/benchmark.json`.
The original 100-page baseline is preserved in `reports/benchmark-100.json`.

Dataset: 300 distinct Wikipedia pages, 5,113 assertions, 105,268 RDF triples.
The initial computing corpus was expanded by deterministic outgoing-link overlap;
the additional pages provide linked context and are not all hand-curated computing topics.

One local HTTP run used five concurrent clients, 100 requests per workload, and
five warm-up requests. Every request opened a fresh connection. The report records
the dataset and benchmark-script hashes, CPU, OS, Python version and measurement time.

| Workload | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| search | 12.14 ms | 20.97 ms | 25.14 ms |
| neighbors | 7.18 ms | 9.94 ms | 11.00 ms |
| path | 27.76 ms | 35.59 ms | 37.41 ms |

The proposed p95 <300 ms gate for search and one-hop neighbors **passed on this
workload**. Path timing is reported separately. Startup, including graph validation
and indexing, took 8.57 seconds; peak server RSS was
288,940 KiB. The first query is application-cold; OS filesystem
caches were not cleared. The request quota was raised only for the benchmark.

A clean offline build took 6.53 seconds
(45.96 pages/second), including SQLite state, graph construction,
SHACL validation and disk export. The export matched byte-for-byte, with zero
network requests. This is not live Wikipedia ingestion throughput.

One local run does not establish WAN latency, sustained-load behavior, or hosting
provider performance. Extraction coverage remains the main limitation: only two
factual relations were extracted; the other 5,111 assertions are page links.
