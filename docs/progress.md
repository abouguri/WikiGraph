# Implementation progress

This file records verified implementation, not the aspirational targets in the plan.

- [x] Product scope and delivery sequence documented.
- [x] Reliable ingestion and offline replay (25-page synthetic fixture, retry/resume tests).
- [x] Optional Neo4j projection: batched idempotent import, RDF round-trip and measured traversal comparison.
- [x] Canonical graph and evidence validation (SHACL, aliases, Unicode, orphan-edge checks).
- [x] Factual extraction and evaluation tooling (180 synthetic records; real accuracy gate remains open).
- [x] Bounded query API (integration tests, documented contracts, process-local limits).
- [x] Accessible explorer (6 Chromium flows, including full-corpus pagination and stale-response handling).
- [x] Version-locked dependencies, container build/smoke test, and a measured 100-page HTTP baseline.
- [x] 300-page, five-client HTTP latency gate and byte-identical offline rebuild.
- [ ] Complete release gates: demo video and independent reproducibility review.
- [x] Frozen real dev/test candidates, two-reviewer exchange/merge tooling, and canonical entity-link metrics.
- [ ] Real held-out gold annotation and independent review (199 candidates await human labels).
- [x] Managed-host deployment configuration (Render free-plan blueprint, provider port, server-first landing view).
- [ ] Hosted demo: Render account connection and successful public deployment pending.
- [ ] Three-person usability review.
