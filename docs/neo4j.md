# Optional Neo4j projection

RDF remains authoritative. The Neo4j exporter stores a versioned, rebuildable
projection and never modifies an existing RDF export.

```sh
# Set NEO4J_PASSWORD securely in the environment first.
wikigraph neo4j-load data/wikipedia/graph.ttl --uri bolt://localhost:7687
```

The command prints a dataset ID equal to the RDF fingerprint. Each `WikiGraphTerm`
has a dataset-scoped identity and explicit `kind`, lexical `value`, `datatype`,
and `language`. `TRIPLE` relationships retain the predicate IRI. An IRI and a
literal with identical text are different terms. Blank nodes must be skolemized
before import; they are rejected before writes begin.

Imports use bounded `UNWIND` batches and retryable managed transactions. Composite
uniqueness constraints prevent duplicate terms. Repeating an import merges the
same triples. The dataset is `loading` until counts match and becomes `ready`
only after completion. An interrupted run can be repeated. Readers reject an
incomplete dataset and verify the reconstructed fingerprint. Use one importer
per dataset at a time. New graph versions have new dataset IDs; old versions are
retained rather than silently deleted. This is versioned import, not destructive sync.

## Verified results

`python scripts/verify_neo4j.py` was run against a temporary Neo4j 5.26.30 container:

- 105,268 RDF triples imported in 23.99 seconds.
- Repeat import completed in 15.70 seconds without increasing triple count.
- Reconstructed RDF matched the original fingerprint.
- Dedicated cases preserved IRI versus literal identity, language tags, datatypes,
  and the non-normalized lexical form `"01"^^xsd:integer`.
- Fifty serial warm one-hop queries returned the same 60 Python neighbors in both
  implementations. Neo4j/Bolt p95 was 6.32 ms; in-process RDFLib p95 was 0.067 ms.

These are different deployment paths: network serialization versus an in-process
index. They do not establish general database superiority. The demo retains RDFLib
because the measured bounded workload does not justify another runtime dependency.
Raw results: [reports/neo4j.json](../reports/neo4j.json).

References: [managed transactions](https://neo4j.com/docs/python-manual/current/transactions/)
and [constraints](https://neo4j.com/docs/cypher-manual/current/constraints/managing-constraints/).
