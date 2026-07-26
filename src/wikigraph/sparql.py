from __future__ import annotations

from rdflib import Graph


def query_graph(graph: Graph, query: str) -> list[dict[str, object]]:
    results = graph.query(query)
    return [dict(row.asdict()) for row in results]
