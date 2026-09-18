"""Single-writer, resumable bounded ingestion and deterministic RDF exports."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import asdict
from pathlib import Path
from time import perf_counter
from typing import Any

from rdflib import Graph

from .fetcher import FetchError, WikipediaFetcher, atomic_json
from .graph_builder import build_dataset
from .models import WikipediaPage
from .validation import validate_graph


def export_graph(graph: Graph, path: Path) -> str:
    # N-Triples is a Turtle subset; this graph has no blank nodes.
    content = "".join(sorted(graph.serialize(format="nt").splitlines(keepends=True)))
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content)
    temporary.replace(path)
    return hashlib.sha256(content.encode()).hexdigest()


def ingest(
    titles: list[str],
    *,
    fetcher: WikipediaFetcher,
    output: Path,
    state: Path,
    max_pages: int = 25,
    max_depth: int = 0,
) -> dict[str, Any]:
    if not titles or not all(t.strip() for t in titles) or max_pages < 1 or max_depth < 0:
        raise ValueError("Nonempty titles, positive page limit, and nonnegative depth required")
    started = perf_counter()
    state.parent.mkdir(parents=True, exist_ok=True)
    config: dict[str, Any] = {
        "titles": sorted(set(titles)),
        "max_pages": max_pages,
        "max_depth": max_depth,
        "intro_only": fetcher.intro_only,
    }
    with sqlite3.connect(state) as db:
        db.execute("CREATE TABLE IF NOT EXISTS config (value TEXT NOT NULL)")
        previous = db.execute("SELECT value FROM config").fetchone()
        encoded = json.dumps(config, sort_keys=True)
        if previous and previous[0] != encoded:
            raise ValueError("Run configuration changed; use a new state database")
        if not previous:
            db.execute("INSERT INTO config VALUES (?)", (encoded,))
        db.execute(
            "CREATE TABLE IF NOT EXISTS jobs (title TEXT PRIMARY KEY, depth INTEGER, "
            "status TEXT, page TEXT, error TEXT)"
        )
        for title in config["titles"][:max_pages]:
            db.execute("INSERT OR IGNORE INTO jobs VALUES (?, 0, 'pending', NULL, NULL)", (title,))
        db.commit()
        # Failed jobs get one new attempt on an explicit resume, never an infinite loop.
        db.execute("UPDATE jobs SET status='pending' WHERE status='failed'")
        db.commit()
        while row := db.execute(
            "SELECT title, depth FROM jobs WHERE status='pending' ORDER BY depth, title LIMIT 1"
        ).fetchone():
            title, depth = row
            try:
                page = fetcher.fetch_page(title)
                if page.disambiguation:
                    raise FetchError("Disambiguation page requires an explicit topic")
                db.execute(
                    "UPDATE jobs SET status='done', page=?, error=NULL WHERE title=?",
                    (json.dumps(asdict(page)), title),
                )
                if depth < max_depth:
                    for link in page.links:
                        count = db.execute("SELECT count(*) FROM jobs").fetchone()[0]
                        if count >= max_pages:
                            break
                        db.execute(
                            "INSERT OR IGNORE INTO jobs VALUES (?, ?, 'pending', NULL, NULL)",
                            (link, depth + 1),
                        )
            except FetchError as exc:
                db.execute(
                    "UPDATE jobs SET status='failed', error=? WHERE title=?", (str(exc), title)
                )
            db.commit()
        pages: dict[tuple[str, int], WikipediaPage] = {}
        for (raw,) in db.execute("SELECT page FROM jobs WHERE status='done' ORDER BY title"):
            page = WikipediaPage(**json.loads(raw))
            key = (page.source_kind, page.page_id)
            previous_page = pages.get(key)
            if previous_page:
                aliases = set(previous_page.aliases) | set(page.aliases)
                page = max([previous_page, page], key=lambda p: p.revision_id)
                page.aliases = sorted(aliases - {page.title})
            pages[key] = page
        graph = build_dataset(list(pages.values()))
        validate_graph(graph)
        digest = export_graph(graph, output)
        manifest = {
            "schema_version": 1,
            "config": config,
            "pages": len(pages),
            "triples": len(graph),
            "sha256": digest,
            "requests": fetcher.requests_used,
            "elapsed_seconds": round(perf_counter() - started, 6),
            "sources": [
                {
                    "page_id": p.page_id,
                    "revision_id": p.revision_id,
                    "title": p.title,
                    "source_kind": p.source_kind,
                }
                for p in pages.values()
            ],
            "failures": [
                {"title": t, "error": e}
                for t, e in db.execute(
                    "SELECT title, error FROM jobs WHERE status='failed' ORDER BY title"
                )
            ],
        }
        atomic_json(output.with_suffix(".manifest.json"), manifest)
        atomic_json(output.with_suffix(".pages.json"), [asdict(p) for p in pages.values()])
        return manifest
