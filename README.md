# WikiGraph

WikiGraph turns Wikipedia pages into a knowledge graph that can be queried with SPARQL and optionally loaded into Neo4j.

## Goals

- Extract entities from Wikipedia pages.
- Extract simple relationships from page text and links.
- Build an RDF graph with RDFLib.
- Query the graph with SPARQL.
- Export or sync the graph to Neo4j.

## Initial roadmap

1. Build a reliable Wikipedia page fetcher.
2. Extract entities from links, headings, and capitalized phrases.
3. Detect lightweight relationships from sentence patterns.
4. Materialize the result as RDF triples.
5. Add SPARQL query helpers and a small CLI.
6. Add Neo4j export and sync support.
7. Expand tests with fixture pages and graph assertions.

## Project layout

- `src/wikigraph/fetcher.py` fetches page content.
- `src/wikigraph/extractor.py` identifies entities and relationships.
- `src/wikigraph/graph_builder.py` builds RDF graphs.
- `src/wikigraph/sparql.py` contains query helpers.
- `src/wikigraph/neo4j_store.py` handles Neo4j export.
- `src/wikigraph/cli.py` exposes the command line interface.

## Development

Install the package in editable mode with dev tools, then run:

```bash
python -m pip install -e '.[dev]'
```

Then run:

```bash
python -m pytest
python -m wikigraph.cli --help
```
