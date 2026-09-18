import csv
import json
from dataclasses import asdict

import pytest

from wikigraph.annotation_review import export_template, merge_reviews
from wikigraph.evaluation import evaluate
from wikigraph.models import WikipediaPage


@pytest.fixture()
def candidates(tmp_path):
    path = tmp_path / "candidates.jsonl"
    row = {
        "id": "one",
        "split": "test",
        "page_id": "1",
        "title": "A",
        "text": "A was designed by B.",
        "source_url": "https://en.wikipedia.org/w/index.php?oldid=1",
        "links": ["B"],
        "source_kind": "wikipedia",
        "reviewed": False,
        "expected": [],
    }
    path.write_text(json.dumps(row) + "\n")
    return path


def fill_review(path, expected, entity_links=None):
    with path.open(newline="") as f:
        rows = list(csv.DictReader(f))
    rows[0]["expected"] = json.dumps(expected)
    rows[0]["entity_links"] = json.dumps(entity_links or [])
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def test_review_agreement_and_canonical_link_metrics(candidates, tmp_path):
    first, second, output = [tmp_path / name for name in ["a.csv", "b.csv", "gold.jsonl"]]
    for path in [first, second]:
        export_template(candidates, path, split="test")
        fill_review(
            path,
            [{"predicate": "designedBy", "object": "B"}],
            [{"mention": "Alias B", "page_id": 2}, {"mention": "Ambiguous", "page_id": None}],
        )
    result = merge_reviews(
        candidates, first, second, output, first_reviewer="r1", second_reviewer="r2", split="test"
    )
    assert result["agreed"] == 1
    pages = [
        WikipediaPage(
            "B", "https://example.org/B", "", "", page_id=2, revision_id=1, aliases=["Alias B"]
        )
    ]
    corpus = tmp_path / "pages.json"
    corpus.write_text(json.dumps([asdict(p) for p in pages]))
    report = evaluate(output, corpus=corpus)
    assert report["micro"]["tp"] == 1
    assert report["entity_linking_accuracy"] == 1
    assert report["entity_linking"]["support"] == 2


def test_disagreements_and_blank_reviews_cannot_be_scored(candidates, tmp_path):
    first, second, output = [tmp_path / name for name in ["a.csv", "b.csv", "gold.jsonl"]]
    for path in [first, second]:
        export_template(candidates, path, split="test")
    with pytest.raises(ValueError, match="unreviewed"):
        merge_reviews(
            candidates,
            first,
            second,
            output,
            first_reviewer="r1",
            second_reviewer="r2",
            split="test",
        )
    fill_review(first, [])
    fill_review(second, [{"predicate": "designedBy", "object": "B"}])
    result = merge_reviews(
        candidates, first, second, output, first_reviewer="r1", second_reviewer="r2", split="test"
    )
    assert result["needs_adjudication"] == 1
    with pytest.raises(ValueError, match="reviewed annotations"):
        evaluate(output)
    with pytest.raises(ValueError, match="distinct reviewer"):
        merge_reviews(
            candidates,
            first,
            second,
            output,
            first_reviewer="R1",
            second_reviewer="r1",
            split="test",
        )
