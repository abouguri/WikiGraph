"""Expand the computing seed corpus by deterministic link overlap, with hard limits."""

import argparse
import json
from collections import Counter
from pathlib import Path

from wikigraph.fetcher import FetchError, WikipediaFetcher, atomic_json
from wikigraph.models import WikipediaPage
from wikigraph.pipeline import ingest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=300)
    parser.add_argument("--max-requests", type=int, default=600)
    parser.add_argument("--state", type=Path, default=Path("artifacts/corpus-expansion.sqlite"))
    args = parser.parse_args()
    if not 100 <= args.target <= 500:
        parser.error("Target must be between 100 and 500")
    root = Path(__file__).resolve().parents[1]
    directory = root / "data/wikipedia"
    originals = [
        WikipediaPage(**p) for p in json.loads((directory / "graph.pages.json").read_text())
    ]
    requested = json.loads((directory / "seeds.json").read_text())
    seen = {p.page_id for p in originals}
    overlap = Counter(link for p in originals for link in set(p.links))
    candidates = sorted(overlap, key=lambda title: (-overlap[title], title))
    fetcher = WikipediaFetcher(cache_dir=directory / "cache", max_requests=args.max_requests)
    failures = []
    attempted = 0
    for title in candidates:
        if len(seen) >= args.target:
            break
        if title in requested:
            continue
        attempted += 1
        if attempted > args.target * 2 or fetcher.requests_used >= args.max_requests:
            break
        try:
            page = fetcher.fetch_page(title)
            if page.disambiguation:
                failures.append({"title": title, "error": "disambiguation"})
                continue
            if page.page_id not in seen:
                requested.append(title)
                seen.add(page.page_id)
                if len(seen) % 10 == 0:
                    print(
                        f"{len(seen)} distinct pages; {fetcher.requests_used} requests", flush=True
                    )
        except FetchError as exc:
            failures.append({"title": title, "error": str(exc)})
    atomic_json(
        directory / "expansion-report.json",
        {
            "selection": "Descending outgoing-link overlap across the original seed corpus, then title",
            "target": args.target,
            "distinct_pages": len(seen),
            "attempted": attempted,
            "network_requests": fetcher.requests_used,
            "failures": failures,
            "limitations": "Expanded pages are linked benchmark context, not manually curated computing topics.",
        },
    )
    if len(seen) != args.target:
        raise SystemExit(f"Only {len(seen)} distinct pages; previous export remains unchanged")
    requested = sorted(set(requested))
    atomic_json(directory / "seeds.json", requested)
    report = ingest(
        requested,
        fetcher=WikipediaFetcher(cache_dir=directory / "cache", offline=True),
        output=directory / "graph.ttl",
        state=args.state,
        max_pages=len(requested),
    )
    if report["failures"]:
        raise SystemExit("Offline corpus rebuild reported failures")
    print(json.dumps({k: report[k] for k in ["pages", "triples", "sha256"]}), flush=True)


if __name__ == "__main__":
    main()
