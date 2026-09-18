"""Read-only, bounded query service over an immutable validated RDF snapshot."""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any
from typing import Literal as Choice

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from rdflib import RDF, Graph
from starlette.exceptions import HTTPException as StarletteHTTPException

from .graph_builder import WG
from .validation import validate_graph

Predicate = Choice["all", "linksTo", "designedBy", "developedBy", "influencedBy"]
Direction = Choice["out", "in", "both"]
logger = logging.getLogger("wikigraph.requests")


class EntityView(BaseModel):
    id: str
    label: str
    aliases: list[str]


class EdgeView(BaseModel):
    id: str
    subject: str
    predicate: str
    object: str


class EntityResults(BaseModel):
    items: list[EntityView]
    total: int
    offset: int
    limit: int


class NeighborResults(BaseModel):
    entity: EntityView
    nodes: list[EntityView]
    edges: list[EdgeView]
    total: int
    truncated: bool


class PathResults(BaseModel):
    nodes: list[EntityView]
    edges: list[EdgeView]
    found: bool
    truncated: bool
    visited: int


class AssertionView(EdgeView):
    evidence: str
    method: str
    extractor_version: str
    confidence: str
    source_kind: str
    source_url: str
    revision_id: int
    start: int | None
    end: int | None


def public_id(uri: Any) -> str:
    return str(uri).removeprefix(str(WG) + "entity/").replace("/", "-")


class QueryStore:
    def __init__(self, graph: Graph) -> None:
        validate_graph(graph)
        self.graph = graph
        self.entities: dict[str, EntityView] = {}
        # Fixed SPARQL template; no user query text is interpolated.
        for row in graph.query(
            "SELECT ?entity ?label WHERE { ?entity a ?kind ; ?labelProp ?label . }",
            initBindings={"kind": WG.Entity, "labelProp": WG.label},
        ):
            uri, label = row  # type: ignore[misc]
            self.entities[public_id(uri)] = EntityView(
                id=public_id(uri),
                label=str(label),
                aliases=sorted(str(a) for a in graph.objects(uri, WG.alias)),
            )
        self.assertions: dict[str, AssertionView] = {}
        self.adjacency: dict[str, list[EdgeView]] = {id: [] for id in self.entities}
        for node in sorted(graph.subjects(RDF.type, WG.Assertion), key=str):
            snapshot = graph.value(node, WG.snapshot)
            start, end = graph.value(node, WG.start), graph.value(node, WG.end)
            item = AssertionView(
                id=str(node).rsplit("/", 1)[-1],
                subject=public_id(graph.value(node, WG.subject)),
                predicate=str(graph.value(node, WG.predicate)).removeprefix(str(WG)),
                object=public_id(graph.value(node, WG.object)),
                evidence=str(graph.value(node, WG.evidence)),
                method=str(graph.value(node, WG.method)),
                extractor_version=str(graph.value(node, WG.extractorVersion)),
                confidence=str(graph.value(node, WG.confidence)),
                source_kind=str(graph.value(snapshot, WG.sourceKind)),
                source_url=str(graph.value(snapshot, WG.url)),
                revision_id=int(str(graph.value(snapshot, WG.revisionId))),
                start=int(str(start)) if start is not None else None,
                end=int(str(end)) if end is not None else None,
            )
            self.assertions[item.id] = item
            edge = EdgeView(**{key: getattr(item, key) for key in EdgeView.model_fields})
            self.adjacency[item.subject].append(edge)
            if item.object != item.subject:
                self.adjacency[item.object].append(edge)

    def entity(self, id: str) -> EntityView:
        if id not in self.entities:
            raise HTTPException(404, "Entity not found")
        return self.entities[id]

    def edges(self, id: str, predicate: str, direction: str) -> list[EdgeView]:
        return [
            e
            for e in self.adjacency[id]
            if (predicate == "all" or e.predicate == predicate)
            and (
                direction == "both"
                or (direction == "out" and e.subject == id)
                or (direction == "in" and e.object == id)
            )
        ]

    def path(
        self,
        source: str,
        target: str,
        predicate: str,
        direction: str,
        depth: int,
        max_visited: int,
        timeout_ms: int = 100,
    ) -> PathResults:
        self.entity(source)
        self.entity(target)
        deadline = time.perf_counter() + timeout_ms / 1000
        queue: deque[tuple[str, list[str], list[EdgeView]]] = deque([(source, [source], [])])
        visited = {source}
        truncated = False
        while queue:
            current, nodes, edges = queue.popleft()
            if current == target:
                return PathResults(
                    nodes=[self.entities[n] for n in nodes],
                    edges=edges,
                    found=True,
                    truncated=False,
                    visited=len(visited),
                )
            for edge in self.adjacency[current]:
                if time.perf_counter() >= deadline:
                    return PathResults(
                        nodes=[], edges=[], found=False, truncated=True, visited=len(visited)
                    )
                if predicate != "all" and edge.predicate != predicate:
                    continue
                if direction == "out" and edge.subject != current:
                    continue
                if direction == "in" and edge.object != current:
                    continue
                neighbor = edge.object if edge.subject == current else edge.subject
                if neighbor in visited:
                    continue
                if len(edges) >= depth or len(visited) >= max_visited:
                    truncated = True
                    continue
                visited.add(neighbor)
                queue.append((neighbor, [*nodes, neighbor], [*edges, edge]))
        return PathResults(
            nodes=[], edges=[], found=False, truncated=truncated, visited=len(visited)
        )


def create_app(graph_path: Path | None = None, *, rate_limit: int | None = None) -> FastAPI:
    graph_path = graph_path or Path(os.environ.get("WIKIGRAPH_GRAPH", "artifacts/demo.ttl"))
    rate_limit = (
        rate_limit if rate_limit is not None else int(os.environ.get("WIKIGRAPH_RATE_LIMIT", "180"))
    )
    if rate_limit < 1:
        raise ValueError("Rate limit must be positive")
    store = QueryStore(Graph().parse(graph_path, format="turtle"))
    app = FastAPI(
        title="WikiGraph", version="0.2.0", description="Evidence-backed, bounded graph queries"
    )
    app.state.store = store
    app.state.metrics = {"requests": 0, "errors": 0, "total_seconds": 0.0}
    window: deque[float] = deque()

    @app.middleware("http")
    async def observe(request: Request, call_next: Any) -> Any:
        started = time.perf_counter()
        request_id = str(uuid.uuid4())
        while window and window[0] < started - 60:
            window.popleft()
        if request.url.path not in {"/health", "/metrics"} and len(window) >= rate_limit:
            response = JSONResponse(
                {"error": {"code": 429, "message": "Request limit reached"}},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        else:
            if request.url.path not in {"/health", "/metrics"}:
                window.append(started)
            response = await call_next(request)
        elapsed = time.perf_counter() - started
        app.state.metrics["requests"] += 1
        app.state.metrics["errors"] += int(response.status_code >= 400)
        app.state.metrics["total_seconds"] += elapsed
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        logger.info(
            json.dumps(
                {
                    "request_id": request_id,
                    "path": request.url.path,
                    "status": response.status_code,
                    "elapsed_seconds": elapsed,
                }
            )
        )
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": exc.status_code, "message": str(exc.detail)}},
            status_code=exc.status_code,
        )

    @app.exception_handler(RequestValidationError)
    async def input_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": 422, "message": "Invalid request parameters"}}, status_code=422
        )

    @app.get("/config")
    def config() -> dict[str, str]:
        mode = os.environ.get("WIKIGRAPH_DEFAULT_MODE", "api")
        return {"default_mode": mode if mode in {"api", "offline"} else "api"}

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "entities": len(store.entities),
            "assertions": len(store.assertions),
            "triples": len(store.graph),
            "source_kinds": sorted({a.source_kind for a in store.assertions.values()}),
        }

    @app.get("/metrics")
    def metrics() -> dict[str, Any]:
        return dict(app.state.metrics)

    @app.get("/entities", response_model=EntityResults)
    def entities(
        q: str = Query("", max_length=200),
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ) -> EntityResults:
        query = q.strip().casefold()

        def rank(entity: EntityView) -> tuple[int, str, str]:
            names = [name.casefold() for name in [entity.label, *entity.aliases]]
            priority = min(
                0 if name == query else 1 if name.startswith(query) else 2 for name in names
            )
            return priority, entity.label.casefold(), entity.id

        matches = sorted(
            (
                e
                for e in store.entities.values()
                if any(query in s.casefold() for s in [e.label, *e.aliases])
            ),
            key=rank,
        )
        return EntityResults(
            items=matches[offset : offset + limit], total=len(matches), offset=offset, limit=limit
        )

    @app.get("/entities/{id}/neighbors", response_model=NeighborResults)
    def neighbors(
        id: str,
        predicate: Predicate = "all",
        direction: Direction = "both",
        limit: int = Query(30, ge=1, le=100),
        offset: int = Query(0, ge=0, le=10000),
    ) -> NeighborResults:
        entity = store.entity(id)
        edges = store.edges(id, predicate, direction)
        selected = edges[offset : offset + limit]
        ids = {id} | {e.subject for e in selected} | {e.object for e in selected}
        return NeighborResults(
            entity=entity,
            nodes=[store.entities[n] for n in sorted(ids)],
            edges=selected,
            total=len(edges),
            truncated=offset + limit < len(edges),
        )

    @app.get("/paths", response_model=PathResults)
    def paths(
        source: str = Query(max_length=80),
        target: str = Query(max_length=80),
        predicate: Predicate = "all",
        direction: Direction = "both",
        max_depth: int = Query(4, ge=1, le=6),
        max_visited: int = Query(500, ge=1, le=2000),
    ) -> PathResults:
        return store.path(source, target, predicate, direction, max_depth, max_visited)

    @app.get("/assertions/{id}", response_model=AssertionView)
    def assertion(id: str) -> AssertionView:
        if id not in store.assertions:
            raise HTTPException(404, "Assertion not found")
        return store.assertions[id]

    static = Path(__file__).parent / "static"
    if static.exists():
        app.mount("/", StaticFiles(directory=static, html=True), name="explorer")
    return app
