from __future__ import annotations

from rdflib import Graph
from rdflib.query import ResultRow


def query_graph(graph: Graph, query: str) -> list[dict[str, object]]:
    results = graph.query(query)
    if results.type != "SELECT":
        raise ValueError("query_graph supports SELECT queries only")
    return [dict(row.asdict()) for row in results if isinstance(row, ResultRow)]
