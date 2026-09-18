# Annotation and evaluation protocol

The checked-in `synthetic.jsonl` contains 180 authored regression sentences,
120 development and 60 test records split by fictional page. It is **not** a
held-out Wikipedia benchmark. Its patterns were known during implementation.

For a real accuracy claim, independently annotate 150–250 candidate sentences
from revision snapshots. Freeze page-level train/development/test assignments
before tuning rules, and have a second reviewer adjudicate disagreements.

Label explicit designed-by, developed-by, and influenced-by relations. Record the
canonical target page ID and exact sentence offsets. Negated, hypothetical,
quoted, or ambiguous claims are excluded unless the annotation guide explicitly
handles them. Coordinated objects can contain a true relation even when the
current extractor abstains; label these positives so recall reflects limitations.
Do not infer authorship from a link or a nearby name. Record negatives too.

JSONL fields: `id`, `page_id`, `title`, `text`, `links`, optional `aliases`,
`expected` (list of `{predicate, object}`), `category`, `split` (`dev`/`test`),
`source_kind`. For real records, retain `revision_id`, source URL, sentence offsets,
reviewer IDs, and canonical target IDs alongside these fields. Current evaluation
compares relation/target titles; canonical entity-linking evaluation is pending.

```sh
python -m wikigraph.cli evaluate
python -m wikigraph.cli evaluate --baseline --output reports/baseline.json
```

The report includes micro and per-predicate precision/recall/F1, support, false
positives/negatives, and a Wilson 95% precision interval. Undefined metrics are
null, not a perfect score. Correlated sentences make this interval descriptive,
not a guarantee about generalization. Page leakage and duplicate IDs are rejected.

Current rules require an explicit page title/alias as subject and a single exact
linked title as object. They intentionally miss pronouns, conjunctions, passive
variants, infobox claims, and complex syntax. `linksTo` is excluded from factual
metrics. Baseline ablation emits no facts, matching the original link-only system.

`wikipedia-review.jsonl` now contains 200 real revision-linked candidates awaiting
review, selected deterministically from the computing corpus. Its `expected: []`
values are placeholders, not negative labels. The evaluator rejects Wikipedia
records unless `reviewed` is true. Do not set that flag until actual annotation
and adjudication are complete. Candidate selection favors extraction vocabulary;
report that sampling bias when evaluating. The corpus was inspected while tuning
rules-v2, so a future untouched corpus is required for a strict held-out claim.
