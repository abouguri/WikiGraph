# 002: Conservative extraction with explicit coverage limits

Status: accepted for the first release candidate.

The initial exact-title rules extracted no factual edges from the first 99-page
real corpus. Inspection showed shortened language names and trailing location/year
context. Rules-v2 accepts the unparenthesized page name as the sentence subject,
optional “originally,” and explicit place/year context after one exact linked object.
Negation, pronouns, conjunctions, and guessed object aliases remain unsupported.

This is a useful coverage improvement, not evidence of general accuracy. The
synthetic regression set has known sentence forms, and the current real corpus
has been inspected during development. A separate uninspected page set and reviewed
labels are needed before claiming the planned 90% precision target.

An additional ingestion bug surfaced with redirects: deduplicating page IDs could
lose an alias. Deduplication now unions aliases and deterministically chooses the
highest fetched revision. It never combines text from different revisions.

Limits: sentence splitting is punctuation-based, parentheses stripping is a subject
heuristic, redirects can refer to a broader topic, and canonical IDs are not an
ontology of real-world identity. These issues belong in annotation/error analysis.
