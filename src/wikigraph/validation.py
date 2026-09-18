from __future__ import annotations

from importlib.resources import files

from pyshacl import validate
from rdflib import RDF, Graph, Literal

from .graph_builder import WG


def validate_graph(graph: Graph) -> None:
    shapes = Graph().parse(
        data=files("wikigraph").joinpath("shapes.ttl").read_text(), format="turtle"
    )
    conforms, _, report = validate(graph, shacl_graph=shapes)
    if not conforms:
        raise ValueError(f"Graph violates SHACL constraints:\n{report}")
    for assertion in graph.subjects(RDF.type, WG.Assertion):
        snapshot = graph.value(assertion, WG.snapshot)
        predicate = graph.value(assertion, WG.predicate)
        evidence = graph.value(assertion, WG.evidence)
        subject = graph.value(assertion, WG.subject)
        target = graph.value(assertion, WG.object)
        if (subject, predicate, target) not in graph:
            raise ValueError("Assertion has no corresponding edge")
        if graph.value(snapshot, WG.page) != subject:
            raise ValueError("Assertion subject must match its source page")
        if predicate == WG.linksTo:
            link = graph.value(assertion, WG.linkTarget)
            if link is None or (snapshot, WG.linkTarget, link) not in graph or link != evidence:
                raise ValueError("Link evidence does not match snapshot")
        else:
            start = graph.value(assertion, WG.start)
            end = graph.value(assertion, WG.end)
            if not isinstance(start, Literal) or not isinstance(end, Literal):
                raise ValueError("Factual assertion lacks offsets")
            text = str(graph.value(snapshot, WG.text))
            a, b = int(start), int(end)
            if a < 0 or b <= a or b > len(text) or text[a:b] != str(evidence):
                raise ValueError("Evidence offsets do not match stored text")
    for predicate in [WG.linksTo, WG.designedBy, WG.developedBy, WG.influencedBy]:
        supported = {
            (graph.value(a, WG.subject), graph.value(a, WG.object))
            for a in graph.subjects(WG.predicate, predicate)
        }
        if any((s, o) not in supported for s, o in graph.subject_objects(predicate)):
            raise ValueError("Graph contains an edge without an assertion")
