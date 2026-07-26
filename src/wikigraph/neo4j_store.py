from __future__ import annotations

from neo4j import GraphDatabase
from rdflib import Graph


class Neo4jStore:
    def __init__(self, uri: str, username: str, password: str) -> None:
        self.driver = GraphDatabase.driver(uri, auth=(username, password))

    def close(self) -> None:
        self.driver.close()

    def load_graph(self, graph: Graph) -> None:
        with self.driver.session() as session:
            for subject, predicate, object_ in graph:
                session.run(
                    """
                    MERGE (s:Resource {uri: $subject})
                    MERGE (o:Resource {uri: $object})
                    MERGE (s)-[r:RELATIONSHIP {predicate: $predicate}]->(o)
                    """,
                    subject=str(subject),
                    predicate=str(predicate),
                    object=str(object_),
                )
