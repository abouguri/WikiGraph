"""Verify idempotency/RDF round-trip and compare one-hop traversal implementations."""

import argparse
import json
import os
import statistics
from pathlib import Path
from time import perf_counter

from rdflib import XSD, Graph, Literal, URIRef

from wikigraph.graph_builder import WG
from wikigraph.neo4j_store import Neo4jStore, encode_term, graph_fingerprint


def measure(function, count=50):
    results = []
    for _ in range(count):
        started = perf_counter()
        function()
        results.append((perf_counter() - started) * 1000)
    return {
        "samples": count,
        "p50_ms": statistics.median(results),
        "p95_ms": sorted(results)[int(0.95 * (count - 1))],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--uri", default="bolt://127.0.0.1:17687")
    parser.add_argument("--graph", type=Path, default=Path("data/wikipedia/graph.ttl"))
    parser.add_argument("--output", type=Path, default=Path("reports/neo4j.json"))
    args = parser.parse_args()
    store = Neo4jStore(args.uri, password=os.environ.get("NEO4J_PASSWORD"))
    graph = Graph().parse(args.graph, format="turtle")
    try:
        started = perf_counter()
        dataset = store.load_graph(graph)
        first = perf_counter() - started
        started = perf_counter()
        assert store.load_graph(graph) == dataset
        repeat = perf_counter() - started
        rebuilt = store.read_graph(dataset)
        assert len(rebuilt) == len(graph)
        assert graph_fingerprint(rebuilt) == graph_fingerprint(graph)
        # Also exercise term distinctions absent from this Wikipedia corpus.
        terms = Graph()
        for value in [
            URIRef("https://example.org/O"),
            Literal("https://example.org/O"),
            Literal("bonjour", lang="fr"),
            Literal("01", datatype=XSD.integer, normalize=False),
        ]:
            terms.add((URIRef("https://example.org/S"), URIRef("https://example.org/P"), value))
        term_dataset = store.load_graph(terms, batch_size=2)
        assert graph_fingerprint(store.read_graph(term_dataset)) == graph_fingerprint(terms)
        source = WG["entity/enwiki/23862"]
        if (source, None, None) not in graph:
            source = next(s for s, _, _ in graph.triples((None, WG.linksTo, None)))
        expected = sorted(str(o) for o in graph.objects(source, WG.linksTo))
        with store.driver.session(database=store.database) as session:
            version = session.run(
                "CALL dbms.components() YIELD versions RETURN versions[0] AS version"
            ).single()["version"]

            def neo4j_neighbors():
                return sorted(
                    row["value"]
                    for row in session.run(
                        "MATCH (s:WikiGraphTerm {dataset:$dataset, id:$id})"
                        "-[r:TRIPLE {predicate:$predicate}]->(o) RETURN o.value AS value",
                        dataset=dataset,
                        id=encode_term(source)["id"],
                        predicate=str(WG.linksTo),
                    )
                )

            def rdf_neighbors():
                return sorted(str(o) for o in graph.objects(source, WG.linksTo))

            assert neo4j_neighbors() == expected
            results = {
                "neo4j_bolt": measure(neo4j_neighbors),
                "rdflib_in_process": measure(rdf_neighbors),
            }
        report = {
            "dataset": dataset,
            "triples": len(graph),
            "neo4j_version": version,
            "initial_import_seconds": first,
            "repeat_import_seconds": repeat,
            "repeat_import_does_not_duplicate": True,
            "roundtrip_fingerprint_matches": True,
            "literal_iri_language_datatype_roundtrip": True,
            "traversal": results,
            "traversal_source": str(source),
            "neighbor_count": len(expected),
            "limitations": "Serial warm one-hop workload: remote Bolt serialization versus in-process RDFLib, not equivalent deployment architectures or a general speed comparison.",
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    finally:
        store.close()


if __name__ == "__main__":
    main()
