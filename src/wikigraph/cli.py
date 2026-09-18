from __future__ import annotations

import json
from pathlib import Path

import typer

from .fetcher import FetchError, WikipediaFetcher
from .pipeline import ingest

app = typer.Typer(add_completion=False, no_args_is_help=True)


@app.callback()
def main() -> None:
    """Build and explore evidence-backed Wikipedia graphs."""


@app.command()
def build(
    titles: list[str],
    output: Path = Path("artifacts/graph.ttl"),
    cache: Path = Path("artifacts/cache"),
    state: Path = Path("artifacts/jobs.sqlite"),
    offline: bool = False,
    full_text: bool = False,
    max_pages: int = typer.Option(25, min=1, max=1000),
    max_depth: int = typer.Option(0, min=0, max=5),
    max_requests: int = typer.Option(1000, min=1, max=10000),
) -> None:
    """Fetch a bounded corpus, or replay cached snapshots, and export Turtle."""
    try:
        report = ingest(
            titles,
            fetcher=WikipediaFetcher(
                cache_dir=cache,
                offline=offline,
                intro_only=not full_text,
                max_requests=max_requests,
            ),
            output=output,
            state=state,
            max_pages=max_pages,
            max_depth=max_depth,
        )
    except (FetchError, ValueError) as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1) from exc
    typer.echo(json.dumps(report, indent=2))
    if report["failures"]:
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
