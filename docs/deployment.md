# Deployment choices

## Static hosting (GitHub Pages)

Serve the explorer's HTML, CSS, JavaScript and bundled teaching dataset. No Python
server is running, so only offline mode is available. This is a small, low-maintenance
portfolio preview, but it does not demonstrate live backend queries. The current
assets assume the site is served at the domain root; repository-subpath deployment
needs the asset paths adjusted before publishing.

## Full application (Docker host)

```sh
docker compose up --build -d
```

Open http://localhost:8000 and choose **Server dataset** for the real Wikipedia
corpus. The container includes a prebuilt graph; it does not crawl Wikipedia on
requests or during startup. The default initial UI mode remains the synthetic
teaching sample so its example factual relationships can be explored offline.

The image runs as UID 10001. Compose binds localhost, uses a read-only filesystem,
drops capabilities, and supplies a temporary directory. The health check tests
`/health`. Put an HTTPS reverse proxy in front for public deployment and set its
shared request limits. The application quota is per process. Rebuild the image to
publish a new graph; keep the previous image digest for rollback.

Runtime and frontend dependencies are version-locked. Base-image tags and isolated
Python build dependencies are not digest/version locked, so this is a repeatable
setup rather than a claim of bit-for-bit image reproducibility.

Docker hosting demonstrates the complete backend and frontend, but requires a
host, monitoring, updates, and resource costs. No hosting account or public URL
has been configured yet.

## Local verification

The image built successfully and passed a local smoke test with the read-only,
capability-dropped runtime settings. `/health` reported 100 entities, 815
assertions and 34,400 triples. The explorer, bundled sample, search endpoint and
OpenAPI schema all returned successful responses. The temporary test container
was stopped after verification.
