"""Replay the versioned corpus; use a fresh state directory for a clean rebuild."""

import argparse
import json
from pathlib import Path

from wikigraph.fetcher import WikipediaFetcher
from wikigraph.pipeline import ingest

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, default=Path("artifacts/wikipedia.ttl"))
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
titles = json.loads((root / "data/wikipedia/seeds.json").read_text())
report = ingest(
    titles,
    fetcher=WikipediaFetcher(cache_dir=root / "data/wikipedia/cache", offline=True),
    output=args.output,
    state=args.output.with_suffix(".sqlite"),
    max_pages=len(titles),
)
print(json.dumps(report, indent=2))
raise SystemExit(bool(report["failures"]))
