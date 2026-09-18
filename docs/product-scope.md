# WikiGraph product scope

WikiGraph helps visitors explore the history of computing through connections
whose origin they can inspect. The flagship journey starts at Python, expands
related people and languages, finds a path to another entity, and opens the
source revision and evidence for an edge.

## Release boundaries

- Curated English Wikipedia corpus: initially 25 pages for pipeline validation,
  then 100–300 pages for the public demo. Bound crawling by pages, depth, and requests.
- Candidate factual predicates: `designedBy`, `developedBy`, and `influencedBy`.
  Annotation and corpus inspection decide which can meet the precision target.
- Links are `linksTo`, not facts. Unresolved text mentions are not canonical entities.
- RDF is authoritative. Neo4j is a rebuildable, optional projection.
- Search, neighbors, bounded paths, evidence, and an accessible graph explorer
  form the product. Serving uses a prebuilt dataset, separate from ingestion.
- No Wikipedia-wide crawling, accounts, chat interface, or distributed services
  in the first release.

## Evidence required for release

Versioned snapshots and run manifests; deterministic offline rebuilds; tests for
failure recovery and identity; a page-separated labeled evaluation set; precision,
recall and sample counts; workload-specific latency measurements; source attribution;
and an independently reproducible setup. The 90% precision and 300 ms p95 goals
are targets, never assumed achievements. Synthetic test data cannot establish
real Wikipedia extraction accuracy.

## Delivery sequence

1. Foundation: reliable revision-pinned ingestion, snapshots, resumable jobs,
   offline replay, exports, CI, and a recorded baseline.
2. Graph model: canonical identities, aliases, assertion provenance, validation.
3. Extraction: annotation guide, conservative patterns, evaluation and errors.
4. Query service: typed bounded API, request logs, health and metrics.
5. Explorer: graph and list views, filters, paths, evidence, shareable state.
6. Release: containers, measured benchmarks, decisions, case study, demo assets.

Each completed task is checked, committed, and pushed separately. Work requiring
external infrastructure, independent annotation, or human usability reviewers is
recorded explicitly rather than marked complete without evidence.
