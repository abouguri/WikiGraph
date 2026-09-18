"""Create authored synthetic demo/evaluation fixtures, never Wikipedia snapshots."""

import json
from dataclasses import asdict
from pathlib import Path

from wikigraph.models import WikipediaPage

root = Path(__file__).resolve().parents[1]
records = []
for i in range(30):
    title = f"Example language {i}"
    person = f"Example designer {i}"
    for j, (text, expected, category) in enumerate(
        [
            (
                f"{title} was designed by {person}.",
                [{"predicate": "designedBy", "object": person}],
                "positive",
            ),
            (
                f"{title} is developed by {person}.",
                [{"predicate": "developedBy", "object": person}],
                "positive",
            ),
            (
                f"{title} was influenced by {person}.",
                [{"predicate": "influencedBy", "object": person}],
                "positive",
            ),
            (f"{title} was not designed by {person}.", [], "negation"),
            (f"{title} may have been designed by {person}.", [], "hedging"),
            (
                f"{title} was designed by {person} and someone else.",
                [{"predicate": "designedBy", "object": person}],
                "unsupported-conjunction",
            ),
        ]
    ):
        records.append(
            {
                "id": f"synthetic-{i}-{j}",
                "page_id": f"synthetic-{i}",
                "title": title,
                "text": text,
                "links": [person],
                "expected": expected,
                "category": category,
                "split": "dev" if i < 20 else "test",
                "source_kind": "synthetic",
            }
        )
(root / "data/evaluation/synthetic.jsonl").write_text(
    "".join(json.dumps(r) + "\n" for r in records)
)
# A small teaching graph; text is authored for the demo, not sourced from Wikipedia.
labels = [
    "Python (programming language)",
    "Guido van Rossum",
    "ABC (programming language)",
    "JavaScript",
    "Brendan Eich",
    "C (programming language)",
    "Dennis Ritchie",
    "Go (programming language)",
    "Google",
    "Java (programming language)",
    "James Gosling",
    "Rust (programming language)",
    "Graydon Hoare",
    "Mozilla",
    "C++",
    "Bjarne Stroustrup",
    "TypeScript",
    "Microsoft",
    "Ruby (programming language)",
    "Yukihiro Matsumoto",
    "Swift (programming language)",
    "Apple Inc.",
    "Kotlin (programming language)",
    "JetBrains",
    "Programming language",
]
facts = {
    0: [("designed", 1), ("influenced", 2)],
    3: [("designed", 4), ("influenced", 5)],
    5: [("designed", 6)],
    7: [("developed", 8)],
    9: [("designed", 10)],
    11: [("designed", 12), ("developed", 13)],
    14: [("designed", 15), ("influenced", 5)],
    16: [("developed", 17), ("influenced", 3)],
    18: [("designed", 19), ("influenced", 0)],
    20: [("developed", 21)],
    22: [("developed", 23)],
}
pages = []
for i, label in enumerate(labels):
    relations = facts.get(i, [])
    text = " ".join(f"{label} was {verb} by {labels[target]}." for verb, target in relations)
    links = sorted({labels[t] for _, t in relations} | ({labels[24]} if i != 24 else set()))
    pages.append(
        asdict(
            WikipediaPage(
                label,
                f"https://example.org/wikigraph/demo/{i + 1}",
                text,
                text,
                links=links,
                page_id=i + 1,
                revision_id=1,
                source_kind="synthetic",
            )
        )
    )
(root / "data/demo/pages.json").write_text(json.dumps(pages, indent=2) + "\n")
