# 004: Bound public queries and make incomplete searches explicit

Status: accepted.

Public endpoints expose validated query templates, pagination, and bounded BFS.
The server does not accept arbitrary SPARQL. Limits constrain output size, depth,
visited entities and traversal time. A truncated result cannot establish that a
path does not exist.

Release review found a boundary case: reaching the visited-node limit could
return before processing a target already in the queue. The corrected search
continues processing discovered nodes without admitting new ones. A regression
test demonstrates the failure at a two-node budget. Depth-bound truncation now
considers only eligible unvisited edges, so incoming or filtered edges do not
cause a misleading truncation notice.

The read-only graph is validated and indexed on startup. Updates require a new
export and process restart. Per-process rate limiting and timing metrics are
sufficient for this demo; multi-worker deployment needs a shared gateway limit.
