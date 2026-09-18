"""Measure a clean offline pipeline run, including SQLite state, validation and export."""

import hashlib
import json
import tempfile
from pathlib import Path
from time import perf_counter

from wikigraph.fetcher import WikipediaFetcher, atomic_json
from wikigraph.pipeline import ingest

root = Path(__file__).resolve().parents[1]
corpus = root / "data/wikipedia"
seeds = json.loads((corpus / "seeds.json").read_text())
with tempfile.TemporaryDirectory(prefix="wikigraph-rebuild-") as temporary:
    path = Path(temporary)
    started = perf_counter()
    report = ingest(
        seeds,
        fetcher=WikipediaFetcher(cache_dir=corpus / "cache", offline=True),
        output=path / "graph.ttl",
        state=path / "jobs.sqlite",
        max_pages=len(seeds),
    )
    elapsed = perf_counter() - started
    expected = hashlib.sha256((corpus / "graph.ttl").read_bytes()).hexdigest()
    if report["sha256"] != expected or report["failures"]:
        raise SystemExit("Offline rebuild differs from the published corpus")
    atomic_json(
        root / "reports/rebuild.json",
        {
            "pages": report["pages"],
            "triples": report["triples"],
            "sha256": report["sha256"],
            "elapsed_seconds": elapsed,
            "pages_per_second": report["pages"] / elapsed,
            "requests": report["requests"],
            "byte_identical": True,
            "scope": "Single offline run; includes new SQLite jobs, graph building, SHACL, and disk export; OS caches not cleared.",
        },
    )
    print(f"Byte-identical {report['pages']}-page rebuild in {elapsed:.2f}s; zero network requests")
