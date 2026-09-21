# WikiGraph

Explore how computing topics connect, then inspect the Wikipedia revision behind each relationship. WikiGraph combines a reproducible RDF dataset, a FastAPI query service, and an interactive Canvas explorer.

![WikiGraph exploring Java and related computing topics](docs/media/patterns-light-workspace.png)

[Dark theme](docs/media/patterns-dark-workspace.png) · [Mobile view](docs/media/patterns-light-mobile.png) · [API reference](docs/api.md) · [Architecture](docs/case-study.md)

## Explore

- Search for a person, language, or concept and build a map from up to three starting points.
- Inspect shared neighbors to understand structural similarity. Proximity is not a factual claim.
- Follow dashed page links or gold factual relationships to their evidence and source revision.
- Find shortest paths, expand neighborhoods, pin nodes, and filter connections.
- Save entities in your browser, export JSON/CSV/Markdown, or share the current map through its URL.
- Switch between light and dark themes. Keyboard navigation, reduced motion, and mobile detail sheets are supported.

The interface uses TypeScript and Canvas 2D without a runtime graph library. Space Grotesk and Newsreader are self-hosted; their font licenses are bundled with the app.

## Run locally

Requires Python 3.11 or newer. Run these commands from the repository root:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock
pip install -e . --no-deps
WIKIGRAPH_GRAPH=data/wikipedia/graph.ttl \
  uvicorn wikigraph.api:create_app --factory --host 127.0.0.1 --port 8000
```

Open [localhost:8000](http://localhost:8000). This serves the checked-in Wikipedia corpus without fetching new articles. Interactive API documentation is at [localhost:8000/docs](http://localhost:8000/docs).

Choose **Teaching sample** to explore authored examples using the browser's bundled dataset. These examples have synthetic evidence and fictional revisions. To serve the teaching dataset through the API instead:

```sh
wikigraph demo
uvicorn wikigraph.api:create_app --factory --host 127.0.0.1 --port 8000
```

The compiled frontend is included, so Node.js is only needed for frontend development. Docker is another way to run the full app:

```sh
docker compose up --build -d
```

## How it works

1. **Ingest:** fetch revision-pinned Wikipedia pages with retry limits, raw response caching, and resumable jobs.
2. **Build:** resolve canonical identities and aliases, extract conservative factual relationships, and attach evidence to individual assertions.
3. **Validate:** check the RDF graph with SHACL and evidence-integrity rules, then export a deterministic snapshot and manifest.
4. **Query:** serve indexed search, neighbors, similarity maps, explanations, bounded paths, and evidence through FastAPI.
5. **Explore:** render the graph with a cooling force simulation, measured labels, and equivalent list-based interactions.

RDFLib holds the canonical graph. Neo4j is an optional, rebuildable projection; it is not required to run the API or explorer.

## Data and limitations

The included corpus contains **300 entities and 5,113 assertions**: 5,111 page links and two extracted factual relationships. A page link records a reference, not a factual relationship. Extraction coverage is limited, and the real evaluation candidates have not yet been independently annotated.

The normal graph view is capped at **150 entities and 500 connections**, with factual edges prioritized. Each expansion adds up to 12 assertions. The current datasets do not provide meaningful entity types or years, so unavailable year controls remain hidden.

The API loads the graph into memory at startup. Query benchmarks are local measurements, not hosting guarantees; see the [benchmark method and results](docs/benchmark.md). Request quotas are per process. The [evaluation protocol](docs/annotation.md) explains how real accuracy should be assessed separately from synthetic regression tests.

## Develop and verify

Install the development dependencies in the activated environment:

```sh
pip install -r requirements-dev.lock
pip install -e . --no-deps
ruff check src tests scripts
mypy src/wikigraph
pytest -q
```

For the frontend, use Node.js 22 or newer:

```sh
cd frontend
npm ci
npm run build
npx playwright install chromium
npm test
```

The build updates `src/wikigraph/static/app.js`, which is committed for Python-only deployments. GitHub Actions runs Python checks on 3.11 and 3.13 and runs the Chromium browser suite. Browser tests cover search, paths, evidence, shared state, exports, touch and keyboard interaction, both themes, and responsive layouts.

Rebuild the corpus from its public cached snapshots without network access:

```sh
python scripts/rebuild_corpus.py --output /tmp/wiki-rebuild/graph.ttl
cmp data/wikipedia/graph.ttl /tmp/wiki-rebuild/graph.ttl
wikigraph evaluate
```

## Documentation and deployment

- [Explorer controls](docs/explorer.md) and [visual system](docs/design-system.md)
- [Ingestion](docs/ingestion.md), [identity and provenance](docs/decisions/001-identity-and-provenance.md), and [extraction tradeoffs](docs/decisions/002-extraction-and-real-corpus.md)
- [API contracts](docs/api.md) and [optional Neo4j projection](docs/neo4j.md)
- [Deployment](docs/deployment.md) for the repository's Vercel, Docker, and Render configurations
- [Dependency inventory and audit scope](docs/dependencies.md)

For Vercel, the repository-root `app.py` exports the FastAPI application; `pyproject.toml` selects `app:app`. The deployment serves the prebuilt corpus and compiled frontend. Verify the deployed service's health and evidence flow using the deployment guide.

Wikipedia text and derived datasets retain their source licensing and attribution. See the [corpus terms](data/wikipedia/README.md) and [per-page source revisions](data/wikipedia/SOURCES.md). Synthetic examples are labeled separately.
