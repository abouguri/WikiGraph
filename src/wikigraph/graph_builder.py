"""Canonical entity identities and inspectable assertion records."""

from __future__ import annotations

import hashlib
import json
import unicodedata

from rdflib import RDF, Graph, Literal, Namespace, URIRef

from .models import Entity, Relationship, WikipediaPage

WG = Namespace("https://example.org/wikigraph/")
WIKI = Namespace("https://en.wikipedia.org/wiki/")
EXTRACTOR_VERSION = "rules-v2"


def normalize(label: str) -> str:
    # Preserve case: different Wikipedia titles may differ only by letter case.
    return unicodedata.normalize("NFC", label.replace("_", " ").strip())


def entity_uri(page: WikipediaPage) -> URIRef:
    if page.page_id <= 0:
        raise ValueError("Canonical entities require positive page IDs")
    namespace = "fixture" if page.source_kind == "synthetic" else "enwiki"
    return WG[f"entity/{namespace}/{page.page_id}"]


class EntityIndex:
    def __init__(self, pages: list[WikipediaPage]) -> None:
        self.labels: dict[str, set[URIRef]] = {}
        self.pages = {entity_uri(p): p for p in pages if not p.disambiguation}
        for page in self.pages.values():
            for label in [page.title, *page.aliases]:
                self.labels.setdefault(normalize(label), set()).add(entity_uri(page))

    def resolve(self, label: str) -> URIRef | None:
        matches = self.labels.get(normalize(label), set())
        return next(iter(matches)) if len(matches) == 1 else None


def assertion_uri(page: WikipediaPage, relation: Relationship) -> URIRef:
    payload = [
        str(entity_uri(page)),
        page.revision_id,
        relation.subject,
        relation.predicate,
        relation.object,
        relation.start,
        relation.end,
        relation.source,
        EXTRACTOR_VERSION,
    ]
    return WG["assertion/" + hashlib.sha256(json.dumps(payload).encode()).hexdigest()]


def build_dataset(pages: list[WikipediaPage]) -> Graph:
    from .extractor import extract_entities, extract_relationships

    index = EntityIndex(pages)
    graph = Graph()
    graph.bind("wg", WG)
    for page in sorted(index.pages.values(), key=lambda p: str(entity_uri(p))):
        graph += build_graph(page, extract_entities(page), extract_relationships(page), index=index)
    return graph


def build_graph(
    page: WikipediaPage,
    entities: list[Entity],
    relationships: list[Relationship],
    *,
    index: EntityIndex | None = None,
) -> Graph:
    index = index or EntityIndex([page])
    graph = Graph()
    graph.bind("wg", WG)
    subject = entity_uri(page)
    snapshot = WG[f"snapshot/{page.source_kind}/{page.page_id}/{page.revision_id}"]
    graph.add((subject, RDF.type, WG.Entity))
    graph.add((subject, WG.label, Literal(page.title)))
    graph.add((subject, WG.pageId, Literal(page.page_id)))
    graph.add((subject, WG.url, URIRef(page.url)))
    for alias in page.aliases:
        graph.add((subject, WG.alias, Literal(alias)))
    graph.add((snapshot, RDF.type, WG.Snapshot))
    graph.add((snapshot, WG.page, subject))
    graph.add((snapshot, WG.revisionId, Literal(page.revision_id)))
    graph.add((snapshot, WG.text, Literal(page.text)))
    graph.add((snapshot, WG.sourceKind, Literal(page.source_kind)))
    source_url = (
        f"https://en.wikipedia.org/w/index.php?oldid={page.revision_id}"
        if page.source_kind == "wikipedia"
        else page.url
    )
    graph.add((snapshot, WG.url, URIRef(source_url)))
    for entity in entities:
        if index.resolve(entity.label) is None:
            digest = hashlib.sha256(f"{snapshot}|{entity.label}".encode()).hexdigest()
            mention = WG[f"mention/{digest}"]
            graph.add((mention, RDF.type, WG.UnresolvedMention))
            graph.add((mention, WG.label, Literal(entity.label)))
            graph.add((mention, WG.snapshot, snapshot))
    for relation in relationships:
        target = index.resolve(relation.object)
        origin = index.resolve(relation.subject)
        if target is None or origin is None:
            continue  # Ambiguous/unresolved references are not promoted to facts.
        assertion = assertion_uri(page, relation)
        predicate = WG[relation.predicate]
        graph.add((origin, predicate, target))
        graph.add((assertion, RDF.type, WG.Assertion))
        graph.add((assertion, WG.subject, origin))
        graph.add((assertion, WG.predicate, predicate))
        graph.add((assertion, WG.object, target))
        graph.add((assertion, WG.snapshot, snapshot))
        graph.add((assertion, WG.method, Literal(relation.source)))
        graph.add((assertion, WG.extractorVersion, Literal(EXTRACTOR_VERSION)))
        graph.add((assertion, WG.evidence, Literal(relation.evidence or relation.object)))
        graph.add((assertion, WG.confidence, Literal("rule-match; not a calibrated probability")))
        if relation.predicate == "linksTo":
            graph.add((assertion, WG.linkTarget, Literal(relation.object)))
            graph.add((snapshot, WG.linkTarget, Literal(relation.object)))
        else:
            if relation.start < 0 or relation.end <= relation.start:
                raise ValueError("Factual assertions require sentence offsets")
            graph.add((assertion, WG.start, Literal(relation.start)))
            graph.add((assertion, WG.end, Literal(relation.end)))
    return graph
