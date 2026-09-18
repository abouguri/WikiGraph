from unittest.mock import Mock

import pytest
from rdflib import XSD, BNode, Graph, Literal, URIRef
from rdflib.compare import isomorphic

from wikigraph.neo4j_store import Neo4jStore, decode_term, encode_term, projection_batches


def sample_graph():
    graph = Graph()
    subject, predicate = URIRef("https://example.org/S"), URIRef("https://example.org/P")
    for object_ in [
        URIRef("https://example.org/O"),
        Literal("https://example.org/O"),
        Literal("café", lang="fr"),
        Literal("01", datatype=XSD.integer, normalize=False),
    ]:
        graph.add((subject, predicate, object_))
    return graph


def test_projection_roundtrip_preserves_rdf_types_and_lexical_forms():
    source = sample_graph()
    rebuilt = Graph()
    batches = list(projection_batches(source, 3))
    assert [len(b) for b in batches] == [3, 1]
    for row in [r for b in batches for r in b]:
        rebuilt.add(
            (decode_term(row["subject"]), URIRef(row["predicate"]), decode_term(row["object"]))
        )
    assert isomorphic(source, rebuilt)
    assert (
        encode_term(URIRef("https://example.org/O"))["id"]
        != encode_term(Literal("https://example.org/O"))["id"]
    )


def test_invalid_terms_rejected_before_any_write():
    store = object.__new__(Neo4jStore)
    store.driver = Mock()
    graph = sample_graph()
    graph.add((BNode(), URIRef("https://example.org/P"), Literal("bad")))
    with pytest.raises(TypeError, match="blank nodes"):
        store.load_graph(graph)
    store.driver.session.assert_not_called()


@pytest.mark.parametrize("size", [0, -1, 5001])
def test_batch_limits(size):
    with pytest.raises(ValueError, match="Batch size"):
        list(projection_batches(sample_graph(), size))
