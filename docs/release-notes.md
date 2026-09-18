# 0.2.0 release candidate

WikiGraph now connects ingestion, revision-backed RDF, a bounded API and an
interactive evidence explorer in a repeatable local application.

- Added cached revision-pinned ingestion, durable resume, deterministic exports,
  canonical identities, SHACL and evidence-integrity checks.
- Added conservative factual rules, synthetic regression metrics, frozen real
  review candidates, two-reviewer merge tooling and entity-link evaluation.
- Added typed search, neighbors, paths and assertion APIs, request IDs, health,
  metrics and process-local quotas.
- Added a TypeScript explorer with mobile and keyboard flows, shareable state,
  offline teaching data, pagination and stale-response protection.
- Published the 300-page corpus, rebuild and latency reports, an optional faithful
  Neo4j projection, Docker packaging and managed-host configuration.
- Published dependency audits, architecture decisions and a technical case study.

Local verification passed 48 Python tests and six Chromium flows, lint, type
checking and frontend compilation. See the [container smoke report](../reports/container-smoke.json),
[benchmark](benchmark.md), [dependency review](dependencies.md), and
[case study](case-study.md).

This remains a release candidate: real factual accuracy, independent reproduction,
three-person usability and public hosting are pending. The corpus currently
contains just two extracted factual relations; most edges are page references.
Remote GitHub Actions results have not been verified from this environment.
