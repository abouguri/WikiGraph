from wikigraph.extractor import extract_entities, extract_relationships
from wikigraph.graph_builder import build_graph
from wikigraph.models import WikipediaPage


def test_build_graph_adds_page_and_entities() -> None:
    page = WikipediaPage(
        title="Python (programming language)",
        url="https://en.wikipedia.org/wiki/Python_(programming_language)",
        summary="Python is a programming language.",
        text="Python is a programming language. It is used by Guido van Rossum.",
        links=["Guido van Rossum", "Programming language"],
    )

    entities = extract_entities(page)
    relationships = extract_relationships(page)
    graph = build_graph(page, entities, relationships)

    assert len(entities) >= 2
    assert len(relationships) == 2
    assert len(graph) >= 5
