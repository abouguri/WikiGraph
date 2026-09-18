"""A versioned, rebuildable RDF projection; Neo4j never becomes the source of truth."""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from typing import Any

from neo4j import GraphDatabase, ManagedTransaction
from rdflib import Graph, Literal, URIRef
from rdflib.term import Node

BATCH_QUERY = """
UNWIND $rows AS row
MERGE (s:WikiGraphTerm {dataset: $dataset, id: row.subject.id})
SET s += row.subject
MERGE (o:WikiGraphTerm {dataset: $dataset, id: row.object.id})
SET o += row.object
MERGE (s)-[:TRIPLE {predicate: row.predicate}]->(o)
"""


def encode_term(term: Node) -> dict[str, str]:
    if isinstance(term, URIRef):
        details = {"kind": "iri", "value": str(term), "datatype": "", "language": ""}
    elif isinstance(term, Literal):
        details = {
            "kind": "literal",
            "value": str(term),
            "datatype": str(term.datatype or ""),
            "language": term.language or "",
        }
    else:
        raise TypeError(
            "Projection supports named RDF resources and literals; skolemize blank nodes first"
        )
    return {"id": hashlib.sha256(term.n3().encode()).hexdigest(), **details}


def decode_term(data: dict[str, Any]) -> URIRef | Literal:
    if data["kind"] == "iri":
        return URIRef(data["value"])
    if data["kind"] == "literal":
        return Literal(
            data["value"],
            datatype=URIRef(data["datatype"]) if data["datatype"] else None,
            lang=data["language"] or None,
            normalize=False,
        )
    raise ValueError("Unknown RDF term kind")


def graph_fingerprint(graph: Graph) -> str:
    return hashlib.sha256(
        "".join(sorted(graph.serialize(format="nt").splitlines(keepends=True))).encode()
    ).hexdigest()


def projection_batches(graph: Graph, batch_size: int) -> Iterator[list[dict[str, Any]]]:
    if not 1 <= batch_size <= 5000:
        raise ValueError("Batch size must be between 1 and 5000")
    batch = []
    for subject, predicate, object_ in sorted(graph, key=lambda t: tuple(n.n3() for n in t)):
        if not isinstance(predicate, URIRef):
            raise TypeError("RDF predicate must be an IRI")
        batch.append(
            {
                "subject": encode_term(subject),
                "predicate": str(predicate),
                "object": encode_term(object_),
            }
        )
        if len(batch) == batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


class Neo4jStore:
    def __init__(
        self,
        uri: str,
        username: str = "neo4j",
        password: str | None = None,
        *,
        database: str = "neo4j",
    ) -> None:
        self.driver = GraphDatabase.driver(uri, auth=(username, password) if password else None)
        self.database = database

    def close(self) -> None:
        self.driver.close()

    @staticmethod
    def _write(tx: ManagedTransaction, dataset: str, rows: list[dict[str, Any]]) -> None:
        tx.run(BATCH_QUERY, dataset=dataset, rows=rows).consume()

    def load_graph(self, graph: Graph, *, batch_size: int = 500) -> str:
        # Validate all terms before opening a transaction or modifying a dataset.
        if not 1 <= batch_size <= 5000:
            raise ValueError("Batch size must be between 1 and 5000")
        for subject, predicate, object_ in graph:
            encode_term(subject)
            encode_term(object_)
            if not isinstance(predicate, URIRef):
                raise TypeError("RDF predicate must be an IRI")
        dataset = graph_fingerprint(graph)
        with self.driver.session(database=self.database) as session:
            session.run(
                "CREATE CONSTRAINT wikigraph_term_identity IF NOT EXISTS "
                "FOR (n:WikiGraphTerm) REQUIRE (n.dataset, n.id) IS UNIQUE"
            ).consume()
            session.run(
                "CREATE CONSTRAINT wikigraph_dataset_identity IF NOT EXISTS "
                "FOR (n:WikiGraphDataset) REQUIRE n.id IS UNIQUE"
            ).consume()
            session.run(
                "MERGE (d:WikiGraphDataset {id:$dataset}) "
                "SET d.status='loading', d.expectedTriples=$count",
                dataset=dataset,
                count=len(graph),
            ).consume()
            for batch in projection_batches(graph, batch_size):
                session.execute_write(self._write, dataset, batch)
            record = session.run(
                "MATCH (s:WikiGraphTerm {dataset:$dataset})-[r:TRIPLE]->() "
                "RETURN count(r) AS count",
                dataset=dataset,
            ).single(strict=True)
            if record is None or record["count"] != len(graph):
                raise ValueError("Projection count differs from the RDF source")
            session.run(
                "MATCH (d:WikiGraphDataset {id:$dataset}) SET d.status='ready'", dataset=dataset
            ).consume()
        return dataset

    def read_graph(self, dataset: str) -> Graph:
        graph = Graph()
        with self.driver.session(database=self.database) as session:
            ready = session.run(
                "MATCH (d:WikiGraphDataset {id:$dataset, status:'ready'}) RETURN d.id",
                dataset=dataset,
            ).single()
            if ready is None:
                raise ValueError("Dataset is missing or its import is incomplete")
            for row in session.run(
                "MATCH (s:WikiGraphTerm {dataset:$dataset})-[r:TRIPLE]->(o) "
                "RETURN properties(s) AS subject, r.predicate AS predicate, "
                "properties(o) AS object",
                dataset=dataset,
            ):
                subject = decode_term(row["subject"])
                if not isinstance(subject, URIRef):
                    raise TypeError("Projected subject is not an IRI")
                graph.add((subject, URIRef(row["predicate"]), decode_term(row["object"])))
        if graph_fingerprint(graph) != dataset:
            raise ValueError("Projection fingerprint differs from the RDF source")
        return graph
