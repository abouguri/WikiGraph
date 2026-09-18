# ADR 005: deploy a prebuilt graph in one container

Status: accepted for the portfolio preview; public deployment pending.

The server ships a validated graph and the compiled explorer in a Python
container. Ingestion runs separately. The host supplies `PORT`; `/health`
reports readiness after graph loading. Render configuration is checked in.

This keeps requests independent of Wikipedia and makes rollback an image change.
The image runs as a non-root user, and local verification uses a read-only
filesystem, dropped capabilities, and a 512 MiB limit. A static-only deployment
can demonstrate the teaching sample but cannot serve the real query API.

The tradeoffs are dataset refreshes requiring a new image, startup parsing cost,
and one in-memory copy per worker. A free preview host can sleep between visits.
Base-image tags are not digest-pinned; the build is not claimed bit-reproducible.
For multiple workers, enforce shared quotas at the proxy. Revisit storage only
after a larger representative workload exceeds the memory or latency budget.
