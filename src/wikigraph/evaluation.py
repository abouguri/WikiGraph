"""Reproducible sentence-level relation evaluation with page-separated splits."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from .extractor import PREDICATES, extract_relationships
from .graph_builder import EntityIndex
from .models import WikipediaPage


def metrics(tp: int, fp: int, fn: int) -> dict[str, Any]:
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
    interval = None
    if precision is not None:
        n, z = tp + fp, 1.96
        center = (precision + z * z / (2 * n)) / (1 + z * z / n)
        radius = (
            z * math.sqrt(precision * (1 - precision) / n + z * z / (4 * n * n)) / (1 + z * z / n)
        )
        interval = [max(0, center - radius), min(1, center + radius)]
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "support": tp + fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "precision_95ci": interval,
    }


def evaluate(
    path: Path, split: str = "test", baseline: bool = False, corpus: Path | None = None
) -> dict[str, Any]:
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    pages: dict[str, str] = {}
    ids: set[str] = set()
    for row in records:
        if row["source_kind"] == "wikipedia" and row.get("reviewed") is not True:
            raise ValueError("Wikipedia evaluation requires reviewed annotations")
        if row["source_kind"] == "wikipedia":
            reviewers = {
                str(r).strip().casefold() for r in row.get("reviewers", []) if str(r).strip()
            }
            if len(reviewers) < 2:
                raise ValueError("Wikipedia evaluation requires two distinct reviewers")
        row["page_id"] = str(row["page_id"])
        if row["id"] in ids:
            raise ValueError("Duplicate evaluation ID")
        ids.add(row["id"])
        if row["split"] not in {"dev", "test"}:
            raise ValueError("Invalid split")
        if row["page_id"] in pages and pages[row["page_id"]] != row["split"]:
            raise ValueError("Page leakage between splits")
        pages[row["page_id"]] = row["split"]
    counts = {p: [0, 0, 0] for p in PREDICATES.values()}
    errors = []
    selected = [r for r in records if r["split"] == split]
    if not selected:
        raise ValueError("Selected evaluation split is empty")
    index = (
        EntityIndex([WikipediaPage(**r) for r in json.loads(corpus.read_text())])
        if corpus
        else None
    )
    linked_correct = linked_total = linked_resolved = 0
    for row in selected:
        for gold in row.get("entity_links", []):
            if index is None:
                raise ValueError("Entity-link evaluation requires a corpus snapshot")
            resolved = index.resolve(gold["mention"])
            predicted_id = int(str(resolved).rsplit("/", 1)[-1]) if resolved is not None else None
            linked_total += 1
            linked_resolved += int(predicted_id is not None)
            linked_correct += int(predicted_id == gold["page_id"])
        page = WikipediaPage(
            row["title"], "", "", row["text"], row["links"], aliases=row.get("aliases", [])
        )
        predicted = (
            set()
            if baseline
            else {
                (r.predicate, r.object)
                for r in extract_relationships(page)
                if r.predicate != "linksTo"
            }
        )
        expected = {(r["predicate"], r["object"]) for r in row["expected"]}
        if any(p not in counts for p, _ in expected):
            raise ValueError("Unsupported annotation predicate")
        for predicate, values in counts.items():
            pred = {r for r in predicted if r[0] == predicate}
            gold = {r for r in expected if r[0] == predicate}
            for i, value in enumerate([len(pred & gold), len(pred - gold), len(gold - pred)]):
                values[i] += value
        if predicted != expected:
            errors.append(
                {
                    "id": row["id"],
                    "false_positives": sorted(predicted - expected),
                    "false_negatives": sorted(expected - predicted),
                    "category": row.get("category"),
                }
            )
    totals = [sum(c[i] for c in counts.values()) for i in range(3)]
    return {
        "dataset": path.name,
        "dataset_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "split": split,
        "sentences": len(selected),
        "source_kinds": sorted({r["source_kind"] for r in selected}),
        "method": "link-only-baseline" if baseline else "rules-v2",
        "micro": metrics(*totals),
        "per_predicate": {p: metrics(*c) for p, c in counts.items()},
        "entity_linking_accuracy": linked_correct / linked_total if linked_total else None,
        "entity_linking": {
            "support": linked_total,
            "correct": linked_correct,
            "resolved": linked_resolved,
        },
        "limitations": "Synthetic fixtures measure regression behavior, not real-corpus accuracy. "
        "Entity-linking accuracy, when present, scores separately reviewed mention-to-page-ID cases including abstentions.",
        "errors": errors,
    }
