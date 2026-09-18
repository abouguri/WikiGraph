"""Freeze review candidates; never infer gold labels from the extractor."""

import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / "data/evaluation"
pages = json.loads((root / "data/wikipedia/graph.pages.json").read_text())
old_ids = {
    int(json.loads(line)["page_id"])
    for line in (directory / "development-candidates-v1.jsonl").read_text().splitlines()
}
rank = lambda p: hashlib.sha256(str(p["page_id"]).encode()).hexdigest()
development = sorted((p for p in pages if p["page_id"] in old_ids), key=rank)[:60]
held_out = sorted((p for p in pages if p["page_id"] not in old_ids), key=rank)[:40]
candidates = []
for split, selected_pages in [("dev", development), ("test", held_out)]:
    for page in selected_pages:
        sentences = list(re.finditer(r"[^.!?]+[.!?]?(?:\s|$)", page["text"]))
        selected = sorted(
            sentences,
            key=lambda m: (
                not bool(re.search(r"\b(design|develop|influenc)\w*\b", m.group(), re.IGNORECASE)),
                m.start(),
            ),
        )[:2]
        for match in selected:
            text = match.group().strip()
            if not text:
                continue
            start = match.start() + len(match.group()) - len(match.group().lstrip())
            candidates.append(
                {
                    "id": f"enwiki-{page['page_id']}-{page['revision_id']}-{start}",
                    "page_id": str(page["page_id"]),
                    "revision_id": page["revision_id"],
                    "title": page["title"],
                    "aliases": page["aliases"],
                    "text": text,
                    "start": start,
                    "end": start + len(text),
                    "links": page["links"],
                    "source_url": f"https://en.wikipedia.org/w/index.php?oldid={page['revision_id']}",
                    "source_kind": "wikipedia",
                    "split": split,
                    "expected": [],
                    "reviewed": False,
                    "reviewers": [],
                    "category": "unreviewed",
                }
            )
path = directory / "wikipedia-review.jsonl"
payload = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in candidates)
path.write_text(payload)
manifest = {
    "schema_version": 1,
    "candidate_sha256": hashlib.sha256(payload.encode()).hexdigest(),
    "corpus_sha256": hashlib.sha256((root / "data/wikipedia/graph.ttl").read_bytes()).hexdigest(),
    "extractor_sha256_at_freeze": hashlib.sha256(
        (root / "src/wikigraph/extractor.py").read_bytes()
    ).hexdigest(),
    "development_pages": [p["page_id"] for p in development],
    "test_pages": [p["page_id"] for p in held_out],
    "split_sentences": {s: sum(r["split"] == s for r in candidates) for s in ["dev", "test"]},
    "sampling": "Two sentences per page, favoring design/develop/influence vocabulary, then earliest offset.",
    "status": "Unreviewed. Test pages come from the newly fetched expansion, disjoint from inspected seed pages.",
    "limitations": "Vocabulary-biased sample, heuristic sentence boundaries, no independent review yet.",
}
(directory / "split-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(
    f"Prepared {len(candidates)} unreviewed records; test labels must remain sealed during tuning."
)
