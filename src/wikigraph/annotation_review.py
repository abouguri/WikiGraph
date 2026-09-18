"""Two-reviewer annotation exchange; blank or conflicting labels never become gold."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from .extractor import PREDICATES

FIELDS = [
    "id",
    "split",
    "title",
    "source_url",
    "text",
    "linked_titles",
    "expected",
    "entity_links",
    "notes",
]


def export_template(source: Path, output: Path, *, split: str) -> None:
    rows = [json.loads(line) for line in source.read_text().splitlines() if line.strip()]
    with output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            if row["split"] == split:
                writer.writerow(
                    {
                        "id": row["id"],
                        "split": split,
                        "title": row["title"],
                        "source_url": row["source_url"],
                        "text": row["text"],
                        "linked_titles": json.dumps(row["links"], ensure_ascii=False),
                        "expected": "UNREVIEWED",
                        "entity_links": "[]",
                        "notes": "",
                    }
                )


def read_review(path: Path) -> dict[str, dict[str, Any]]:
    result = {}
    with path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if row["id"] in result:
                raise ValueError("Duplicate review record")
            if row["expected"] == "UNREVIEWED":
                raise ValueError("Review contains unreviewed records")
            expected = json.loads(row["expected"])
            links = json.loads(row.get("entity_links", "[]"))
            if not isinstance(expected, list) or not isinstance(links, list):
                raise TypeError("Annotations must be JSON lists")
            for item in expected:
                if (
                    not isinstance(item, dict)
                    or item.get("predicate") not in PREDICATES.values()
                    or not isinstance(item.get("object"), str)
                    or not item["object"].strip()
                ):
                    raise ValueError("Invalid factual relation annotation")
            for item in links:
                if (
                    not isinstance(item, dict)
                    or not isinstance(item.get("mention"), str)
                    or not item["mention"].strip()
                    or (
                        item.get("page_id") is not None
                        and (type(item["page_id"]) is not int or item["page_id"] <= 0)
                    )
                ):
                    raise ValueError("Invalid entity-link annotation")
            result[row["id"]] = {
                "expected": expected,
                "entity_links": links,
                "text": row["text"],
                "notes": row.get("notes", ""),
            }
    return result


def canonical(value: Any) -> str:
    return json.dumps(sorted(value, key=lambda x: json.dumps(x, sort_keys=True)), sort_keys=True)


def merge_reviews(
    source: Path,
    first: Path,
    second: Path,
    output: Path,
    *,
    first_reviewer: str,
    second_reviewer: str,
    split: str,
) -> dict[str, int]:
    reviewers = [first_reviewer.strip(), second_reviewer.strip()]
    if not all(reviewers) or reviewers[0].casefold() == reviewers[1].casefold():
        raise ValueError("Two distinct reviewer IDs are required")
    rows = [json.loads(line) for line in source.read_text().splitlines() if line.strip()]
    selected = [r for r in rows if r["split"] == split]
    if not selected:
        raise ValueError("Selected split is empty")
    a, b = read_review(first), read_review(second)
    expected_ids = {row["id"] for row in selected}
    if set(a) != expected_ids or set(b) != expected_ids:
        raise ValueError("Review IDs do not match the selected candidate split")
    disagreements = 0
    for row in selected:
        left, right = a[row["id"]], b[row["id"]]
        if left["text"] != row["text"] or right["text"] != row["text"]:
            raise ValueError("Review text differs from the frozen candidate")
        agree = all(
            canonical(left[field]) == canonical(right[field])
            for field in ["expected", "entity_links"]
        )
        row["reviewed"] = agree
        row["reviewers"] = reviewers
        row["reviews"] = {reviewers[0]: left, reviewers[1]: right}
        row["category"] = "review-agreement" if agree else "needs-adjudication"
        row["expected"] = left["expected"] if agree else []
        row["entity_links"] = left["entity_links"] if agree else []
        disagreements += int(not agree)
    # Export only the selected split, keeping held-out labels in a separate file.
    output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in selected))
    return {
        "records": len(selected),
        "agreed": len(selected) - disagreements,
        "needs_adjudication": disagreements,
    }
