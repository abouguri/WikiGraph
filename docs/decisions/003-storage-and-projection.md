# 003: Keep RDF authoritative, project to Neo4j only when needed

Status: accepted.

The 300-page bounded HTTP workload passes its latency target with RDFLib plus
immutable query indexes. A database service is not required for the current demo.
The source RDF is exportable, validated, and byte-reproducible from snapshots.

The original Neo4j loader erased the distinction between IRIs and literals. The
replacement preserves RDF terms and uses a dataset fingerprint for isolation,
managed batched writes, uniqueness constraints, and a loading/ready marker.
Round-trip verification catches corruption that a node-count check would miss.

This representation favors fidelity and rebuildability over idiomatic property
nodes. The measured one-hop comparison includes Bolt serialization only on the
Neo4j side and is not an apples-to-apples database benchmark. A production graph
projection should follow a demonstrated traversal/query requirement rather than
being included solely to add another technology.
