from __future__ import annotations

import typer

from .extractor import extract_entities, extract_relationships
from .fetcher import WikipediaFetcher
from .graph_builder import build_graph

app = typer.Typer(add_completion=False)


@app.command()
def build(title: str) -> None:
    fetcher = WikipediaFetcher()
    page = fetcher.fetch_page(title)
    entities = extract_entities(page)
    relationships = extract_relationships(page)
    graph = build_graph(page, entities, relationships)
    typer.echo(f"title={page.title}")
    typer.echo(f"entities={len(entities)}")
    typer.echo(f"relationships={len(relationships)}")
    typer.echo(f"triples={len(graph)}")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
