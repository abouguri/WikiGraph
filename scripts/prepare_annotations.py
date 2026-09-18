"""Select review candidates; these are NOT gold labels or evaluation results."""

import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pages = json.loads((root / "data/wikipedia/graph.pages.json").read_text())
candidates = []
for page in pages:
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
        digest = hashlib.sha256(str(page["page_id"]).encode()).hexdigest()
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
                "split": "test" if int(digest[:8], 16) % 5 == 0 else "dev",
                "expected": [],
                "reviewed": False,
                "reviewers": [],
                "category": "unreviewed",
            }
        )
path = root / "data/evaluation/wikipedia-review.jsonl"
path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in candidates))
print(f"Prepared {len(candidates)} unreviewed candidates; no accuracy claim is possible yet.")
