# Ingestion and recovery

```sh
python -m wikigraph.cli build 'Python (programming language)' \
  --output artifacts/graph.ttl --cache artifacts/cache \
  --state artifacts/jobs.sqlite --max-pages 25 --max-depth 1 --max-requests 100
# Repeat the same command with --offline to use cached snapshots only.
```

The state database belongs to one immutable run configuration. Completed jobs are
not fetched again. Failed jobs are retried once per explicit resume (each fetch
has its own bounded retry policy). Use a new state path for different seeds or
limits. Clear/use a new cache to fetch newer revisions. Use one writer per state
and cache directory. The page budget counts attempted titles, including failures
and redirects; the manifest counts distinct successful page IDs.

The API resolves the title, then `action=parse&oldid=REVISION` fetches content and
links from that revision. Unlike `query&prop=links`, this does not require link
continuation and is not truncated to 20 links. Introduction mode requests section
0; `--full-text` includes all sections. Parsed template content can depend on
current templates, so the stored raw response and normalized text—not a later
re-parse—are the reproducibility boundary. The snapshot retains retrieval time.

Exports include sorted Turtle-compatible triples, a SHA-256 manifest, and page
snapshots. A run with failed pages still exports its successful pages and exits
with status 1. Query the manifest's `failures` field for details.

Reference: [MediaWiki parsing API](https://www.mediawiki.org/wiki/API:Parsing_wikitext)
and [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).
