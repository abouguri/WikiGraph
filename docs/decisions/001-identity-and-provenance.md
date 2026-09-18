# 001: Page IDs and assertion records

Status: accepted.

Titles change and aliases collide. Resolved entities therefore use the language
edition and numeric Wikipedia page ID. Synthetic fixtures have a separate namespace.
Unicode normalization preserves case; ambiguous aliases deliberately do not resolve.
Unfetched link targets and capitalized phrases remain unresolved mentions until a
snapshot establishes a unique identity. They cannot become factual edges.

Each edge has an addressable assertion with its source snapshot, predicate,
extractor version, method, and evidence. Factual evidence uses half-open character
offsets into the stored normalized text. Link evidence uses a recorded target title.
`linksTo` only means the revision contains that link, not a semantic claim.
Confidence is a rule-match description, not an invented probability.

RDF remains authoritative. SHACL enforces structural constraints; application
validation checks evidence offsets, edge/assertion correspondence, and source
identity. Export is sorted N-Triples (also valid Turtle), with no blank nodes.
This trades compact files for stable bytes and transparent review diffs.

Source: [SHACL recommendation](https://www.w3.org/TR/shacl/).
