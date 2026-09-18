import json
from dataclasses import asdict
from unittest.mock import Mock

import pytest
from rdflib import Graph

from wikigraph.fetcher import FetchError, WikipediaFetcher, atomic_json
from wikigraph.models import WikipediaPage
from wikigraph.pipeline import ingest


def test_25_page_offline_rebuild_and_resume(tmp_path):
    fetcher = WikipediaFetcher(cache_dir=tmp_path / "cache", offline=True)
    titles = [f"Fixture {i:02d}" for i in range(25)]
    for i, title in enumerate(titles):
        page = WikipediaPage(
            title,
            f"https://example.org/{i}",
            "Fixture",
            "Fixture text",
            links=titles,
            page_id=i + 1,
            revision_id=i + 101,
            source_kind="synthetic",
        )
        atomic_json(fetcher.cache_path(title), {"schema_version": 1, "page": asdict(page)})
    output = tmp_path / "graph.ttl"
    state = tmp_path / "jobs.sqlite"
    first = ingest(titles, fetcher=fetcher, output=output, state=state)
    assert first["pages"] == 25 and first["requests"] == 0 and not first["failures"]
    before = output.read_bytes()
    assert len(Graph().parse(output, format="turtle")) == first["triples"]
    fetcher.fetch_page = Mock(side_effect=AssertionError("Already completed"))
    second = ingest(titles, fetcher=fetcher, output=output, state=state)
    assert output.read_bytes() == before and first["sha256"] == second["sha256"]
    assert json.loads(output.with_suffix(".manifest.json").read_text())["pages"] == 25
    with pytest.raises(ValueError, match="configuration"):
        ingest(titles, fetcher=fetcher, output=output, state=state, max_pages=30)


def test_failure_report_and_resume(tmp_path):
    fetcher = WikipediaFetcher(offline=True)
    fetcher.fetch_page = Mock(side_effect=FetchError("Injected failure"))
    options = {
        "titles": ["A"],
        "fetcher": fetcher,
        "output": tmp_path / "g.ttl",
        "state": tmp_path / "j.db",
    }
    report = ingest(**options)
    assert report["failures"] == [{"title": "A", "error": "Injected failure"}]
    fetcher.fetch_page = Mock(
        return_value=WikipediaPage("A", "https://example.org/A", "", "", page_id=1, revision_id=1)
    )
    report = ingest(**options)
    assert report["pages"] == 1 and not report["failures"]


def test_interrupted_run_keeps_committed_pages(tmp_path):
    fetcher = WikipediaFetcher(offline=True)
    a = WikipediaPage("A", "https://example.org/A", "", "", page_id=1, revision_id=1)
    b = WikipediaPage("B", "https://example.org/B", "", "", page_id=2, revision_id=2)
    fetcher.fetch_page = Mock(side_effect=[a, KeyboardInterrupt()])
    options = {
        "titles": ["A", "B"],
        "fetcher": fetcher,
        "output": tmp_path / "g.ttl",
        "state": tmp_path / "j.db",
    }
    with pytest.raises(KeyboardInterrupt):
        ingest(**options)
    fetcher.fetch_page = Mock(return_value=b)
    report = ingest(**options)
    fetcher.fetch_page.assert_called_once_with("B")
    assert report["pages"] == 2
