from __future__ import annotations

from rdflib import Graph, Literal, Namespace, RDF, URIRef

from .models import Entity, Relationship, WikipediaPage

WG = Namespace("https://example.org/wikigraph/")
WIKI = Namespace("https://en.wikipedia.org/wiki/")


def slugify(label: str) -> str:
    return label.replace(" ", "_")


def build_graph(
    page: WikipediaPage,
    entities: list[Entity],
    relationships: list[Relationship],
) -> Graph:
    graph = Graph()
    graph.bind("wg", WG)
    graph.bind("wiki", WIKI)

    page_uri = URIRef(page.url)
    graph.add((page_uri, RDF.type, WG.WikipediaPage))
    graph.add((page_uri, WG.title, Literal(page.title)))
    graph.add((page_uri, WG.summary, Literal(page.summary)))

    for entity in entities:
        entity_uri = URIRef(f"{WG}entity/{slugify(entity.label)}")
        graph.add((entity_uri, RDF.type, WG.Entity))
        graph.add((entity_uri, WG.label, Literal(entity.label)))
        graph.add((page_uri, WG.hasEntity, entity_uri))

    for relation in relationships:
        subject_uri = URIRef(f"{WG}entity/{slugify(relation.subject)}")
        object_uri = URIRef(f"{WG}entity/{slugify(relation.object)}")
        predicate_uri = URIRef(f"{WG}{relation.predicate}")
        graph.add((subject_uri, predicate_uri, object_uri))

    return graph
