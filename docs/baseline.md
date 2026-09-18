# Baseline before semantic extraction

Original implementation: commit `8be865c`.

- Entity candidates: page title, outgoing link titles, and multiword capitalized phrases.
- Relationships: one `mentions` edge per outgoing link. No factual extraction.
- One broad graph-construction test; no extraction accuracy dataset.
- Fetching: introduction, at most 20 current-page links, no revision provenance,
  retry, durable cache, or offline replay.

The original graph test passed locally before changes (1 test). This establishes
behavior only, not precision or recall. No real-corpus accuracy number is claimed.
The first ingestion task adds a deterministic 25-page synthetic fixture test;
these fixtures validate pipeline behavior, not Wikipedia extraction quality.
