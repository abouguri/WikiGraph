# WikiGraph

Explore connections between computing topics and inspect the source behind each
edge. WikiGraph builds a revision-backed RDF graph from Wikipedia, serves bounded
queries through a typed API, and provides an interactive graph and accessible list.

![WikiGraph explorer showing a synthetic example and its evidence](docs/explorer.png)

## Try it

Python 3.11+ is supported; the locked environment was verified with Python 3.13.

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock
pip install -e . --no-deps
wikigraph demo
uvicorn wikigraph.api:create_app --factory --host 127.0.0.1 --port 8000
```

Open http://localhost:8000. The explorer opens the API dataset by default.
The `wikigraph demo` command above builds an **authored synthetic teaching
sample**, with clearly labeled fictional revisions. Select the offline mode
(or use `?mode=offline`) to run the bundled browser sample without the API.

To serve the real checked-in corpus:

```sh
WIKIGRAPH_GRAPH=data/wikipedia/graph.ttl uvicorn wikigraph.api:create_app --factory
```

Choose **Server dataset** in the explorer. API docs are at `/docs`.
Alternatively, run `docker compose up --build -d`.

## What is implemented

- Revision-pinned fetching, bounded retries and request budgets, durable raw
  snapshots, offline replay, and resumable SQLite ingestion jobs.
- Canonical page identities, alias resolution, distinct unresolved mentions,
  addressable assertions, and SHACL plus evidence-integrity validation.
- Conservative factual extraction with sentence offsets; `linksTo` stays separate
  from factual predicates.
- Typed search, paginated neighbors, bounded shortest paths, evidence lookup,
  request IDs, metrics, and a per-process request quota.
- TypeScript/SVG explorer with filters, an evidence panel, shareable selections,
  keyboard-accessible controls, mobile layout, and an offline sample.
- Python CI and Chromium browser checks, reproducible exports, evaluation tooling,
  and a measured local HTTP benchmark.

## Evidence and limits

The real corpus contains **300 entities, 5,113 assertions, and 105,268 triples**.
Of those assertions, 5,111 are page links and two are factual relations. Extraction
coverage is deliberately limited; no real-corpus precision claim has been made.

The synthetic regression split produced 30 true positives, zero false positives,
and ten false negatives. Those known templates do **not** establish Wikipedia
accuracy. The 200 real annotation candidates remain unreviewed, and evaluation
refuses to score them until review is recorded.

A local five-client HTTP benchmark measured p95 latency of 20.97 ms for search,
9.94 ms for neighbors, and 35.59 ms for the tested path query. These are one-run,
300-page results; the specified local latency gate passed, but this is not an internet SLA.
See [measured results](docs/benchmark.md) and [raw report](reports/benchmark.json).

## Reproduce and develop

```sh
pip install -r requirements-dev.lock
pip install -e . --no-deps
ruff check src tests scripts
mypy src/wikigraph
pytest -q
python scripts/rebuild_corpus.py --output /tmp/wiki-rebuild/graph.ttl
cmp data/wikipedia/graph.ttl /tmp/wiki-rebuild/graph.ttl
wikigraph evaluate
cd frontend
npm ci
npm run build
npx playwright install chromium
npm test
```

The real corpus rebuild was verified byte-for-byte without network access.
Frontend assets are bundled in the Python package; Node is needed only to change
or test the frontend.

## Design and next release gates

[Product scope](docs/product-scope.md) · [Progress](docs/progress.md) ·
[Ingestion](docs/ingestion.md) · [Identity and provenance](docs/decisions/001-identity-and-provenance.md) ·
[Extraction tradeoffs](docs/decisions/002-extraction-and-real-corpus.md) ·
[Annotation protocol](docs/annotation.md) · [API](docs/api.md) ·
[Explorer](docs/explorer.md) · [Deployment](docs/deployment.md)

Pending: independent real-corpus annotation, an untouched evaluation corpus,
three-person usability review and public hosting. The optional
[Neo4j projection](docs/neo4j.md) has verified batched imports and RDF round-trip
fidelity; the public API continues to use RDFLib.

Wikipedia text and derived text datasets retain their source licensing and
attribution; see [corpus terms](data/wikipedia/README.md) and
[per-page sources](data/wikipedia/SOURCES.md). Synthetic examples are labeled
separately and are not presented as Wikipedia evidence.
