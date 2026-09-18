import json
from pathlib import Path

import pytest
from rdflib import Literal

from wikigraph.evaluation import evaluate
from wikigraph.extractor import extract_relationships
from wikigraph.graph_builder import WG, build_dataset
from wikigraph.models import WikipediaPage
from wikigraph.validation import validate_graph


def test_fact_offsets_and_abstention():
    a = WikipediaPage(
        "A",
        "https://example.org/A",
        "",
        "  A was designed by B. A was not developed by B.",
        ["B"],
        page_id=1,
        revision_id=1,
    )
    b = WikipediaPage("B", "https://example.org/B", "", "", page_id=2, revision_id=2)
    facts = [r for r in extract_relationships(a) if r.predicate != "linksTo"]
    assert len(facts) == 1
    assert a.text[facts[0].start : facts[0].end] == "A was designed by B."
    graph = build_dataset([a, b])
    validate_graph(graph)
    assertion = next(graph.subjects(WG.predicate, WG.designedBy))
    graph.set((assertion, WG.start, Literal(0)))
    with pytest.raises(ValueError, match="offsets"):
        validate_graph(graph)


def test_evaluation_exposes_false_negatives_and_baseline():
    path = Path("data/evaluation/synthetic.jsonl")
    report = evaluate(path)
    assert report["micro"]["tp"] == 30
    assert report["micro"]["fp"] == 0
    assert report["micro"]["fn"] == 10
    assert report["source_kinds"] == ["synthetic"]
    assert evaluate(path, baseline=True)["micro"]["recall"] == 0


def test_split_leakage_rejected(tmp_path):
    row = json.loads(Path("data/evaluation/synthetic.jsonl").read_text().splitlines()[0])
    rows = [row, {**row, "id": "new", "split": "test"}]
    path = tmp_path / "bad.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in rows))
    with pytest.raises(ValueError, match="leakage"):
        evaluate(path)


def test_explicit_short_subject_and_trailing_context():
    page = WikipediaPage(
        "Java (programming language)",
        "",
        "",
        "Java was designed by James Gosling at Sun Microsystems .",
        ["James Gosling", "Sun Microsystems"],
    )
    facts = [r for r in extract_relationships(page) if r.predicate != "linksTo"]
    assert [(r.predicate, r.object) for r in facts] == [("designedBy", "James Gosling")]
    page.text = "Java was not designed by James Gosling at Sun Microsystems."
    assert all(r.predicate == "linksTo" for r in extract_relationships(page))


def test_object_substrings_and_conjunctions_do_not_resolve():
    page = WikipediaPage("A", "", "", "A was designed by Bob and Carol.", ["Bob", "Carol"])
    assert all(r.predicate == "linksTo" for r in extract_relationships(page))
    page.text = "A was designed by Bobby."
    assert all(r.predicate == "linksTo" for r in extract_relationships(page))


def test_real_unreviewed_annotations_cannot_be_scored(tmp_path):
    row = json.loads(Path("data/evaluation/synthetic.jsonl").read_text().splitlines()[0])
    row.update(source_kind="wikipedia", reviewed=False)
    path = tmp_path / "unreviewed.jsonl"
    path.write_text(json.dumps(row))
    with pytest.raises(ValueError, match="reviewed annotations"):
        evaluate(path)
