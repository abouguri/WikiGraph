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
requests or during startup. The server now opens the API dataset by default. Visitors can switch to the
synthetic teaching sample, or use `?mode=offline`, for offline example relationships.

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


## Prepared Render deployment

`render.yaml` defines one Docker web service named `wikigraph`, on the free plan
in Frankfurt, from the repository's `main` branch. It specifies `/health`, uses
the bundled real graph, and requests deployment after CI checks pass. It does not
create a paid instance, database, or persistent disk. If a service with this name
already exists in the destination workspace, inspect it before applying the blueprint.

The `python -m wikigraph.server` entry point reads the provider's `PORT` environment
variable and defaults to 8000 locally. The Docker health check uses the same port.
`WIKIGRAPH_DEFAULT_MODE=api` makes the real server dataset the landing view; the
static-only explorer falls back to the offline sample when `/config` is unavailable.

Publication requires an authenticated Render workspace and repository access.
No Render service has been created yet. After the account is connected, inspect
existing services, deploy the blueprint, wait for a successful deploy, and verify
`/health`, search, evidence, and the browser flow on the returned public URL.

Render's free web services sleep after inactivity and take time to restart. They
are appropriate for a preview, not an always-available production guarantee.
For an always-on instance, review the selected paid plan before provisioning.

Sources: [Docker hosting](https://render.com/docs/docker),
[Blueprint fields](https://render.com/docs/blueprint-spec),
[Free service limits](https://render.com/docs/free).
