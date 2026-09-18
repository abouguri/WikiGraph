# Dependency and license review

The release audit checked all 35 pinned Python runtime distributions with
`pip-audit 2.10.1` and the frontend lock with `npm audit`. Both reported zero
known vulnerabilities. These results describe the saved dependency versions and
the advisory databases at scan time; they are not a security guarantee.

Raw evidence: [Python audit](../reports/python-audit.json),
[npm audit](../reports/npm-audit.json), and
[license inventory](../reports/dependency-inventory.json).

To repeat the review after installing the locked runtime:

```sh
python scripts/dependency_inventory.py
python -m venv /tmp/wikigraph-audit-env
/tmp/wikigraph-audit-env/bin/pip install pip-audit==2.10.1
/tmp/wikigraph-audit-env/bin/pip-audit -r requirements.lock --no-deps --disable-pip --strict --format json --output reports/python-audit.json
npm --prefix frontend audit --json > reports/npm-audit.json
```

The Python lock includes transitive dependencies; `--no-deps` avoids resolving a
different environment during the audit. Build tools, development-only Python
packages, OS packages, and Docker base images are outside this saved Python scan.
The frontend inventory includes optional platform-specific lock entries.

Most dependencies declare MIT or BSD terms. Other declarations include Apache,
ISC, PSF/Python, W3C, and MPL terms; consult each distribution's license files
before redistribution. The inventory records declarations rather than deciding
compatibility. Installed Python distribution metadata must match the lock used
to generate it. Node packages and Python distributions retain their own notices.

Wikipedia text has separate attribution and share-alike terms, documented in
[the corpus README](../data/wikipedia/README.md) and per-page source records.
No project-wide code license has been selected in this repository; dependency
licenses do not grant a license to the project's original code. The repository
owner should choose that license before presenting the code as open source.
