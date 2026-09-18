"""Vercel ASGI entry point serving the checked-in Wikipedia snapshot."""

import os
from pathlib import Path

from src.wikigraph.api import create_app

root = Path(__file__).resolve().parent
graph_path = Path(os.environ.get("WIKIGRAPH_GRAPH", "data/wikipedia/graph.ttl"))
if not graph_path.is_absolute():
    graph_path = root / graph_path

app = create_app(graph_path)
