from dataclasses import replace

import pytest
from rdflib import RDF
from rdflib.compare import isomorphic

from wikigraph.graph_builder import WG, EntityIndex, build_dataset, entity_uri
from wikigraph.models import WikipediaPage
from wikigraph.validation import validate_graph


def page(title, id, **kwargs):
    return WikipediaPage(
        title, f"https://example.org/{id}", "", "", page_id=id, revision_id=id + 100, **kwargs
    )


def test_aliases_unicode_and_ambiguity():
    pages = [page("Café", 1, aliases=["Coffee", "Shared"]), page("Other", 2, aliases=["Shared"])]
    index = EntityIndex(pages)
    assert index.resolve("Cafe\u0301") == entity_uri(pages[0])
    assert index.resolve("Coffee") == entity_uri(pages[0])
    assert index.resolve("Shared") is None
    assert index.resolve("Missing") is None
    assert index.resolve("Other") != index.resolve("Coffee")


def test_reproducible_graph_and_missing_evidence():
    pages = [
        page("Language (test)", 1, links=["Alias", "Unresolved"]),
        page("Person / Ω", 2, aliases=["Alias"]),
    ]
    graph = build_dataset(pages)
    validate_graph(graph)
    assert isomorphic(graph, build_dataset(list(reversed(pages))))
    assert (entity_uri(pages[0]), WG.linksTo, entity_uri(pages[1])) in graph
    assert len(list(graph.subjects(RDF.type, WG.Entity))) == 2
    assert len(list(graph.subjects(RDF.type, WG.UnresolvedMention))) == 1
    assertion = next(graph.subjects(RDF.type, WG.Assertion))
    graph.remove((assertion, WG.evidence, None))
    with pytest.raises(ValueError, match="SHACL"):
        validate_graph(graph)


def test_fixture_ids_cannot_collide_with_wikipedia():
    real = page("A", 1)
    assert entity_uri(real) != entity_uri(replace(real, source_kind="synthetic"))


def test_orphan_fact_rejected():
    pages = [page("A", 1), page("B", 2)]
    graph = build_dataset(pages)
    graph.add((entity_uri(pages[0]), WG.designedBy, entity_uri(pages[1])))
    with pytest.raises(ValueError, match="without an assertion"):
        validate_graph(graph)
