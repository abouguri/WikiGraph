# Annotation and evaluation protocol

## Current evidence

`synthetic.jsonl` contains 180 authored regression sentences (120 development,
60 test), split by fictional page. Known patterns were used during implementation;
these scores establish behavior, not generalization to Wikipedia.

`wikipedia-review.jsonl` contains 199 real revision-linked candidates with **no gold
labels yet**. `split-manifest.json` freezes the candidate/corpus/extractor hashes
and page assignments. Development pages come from the inspected computing seed
corpus. Test pages come from the later expansion and are disjoint from those seed
pages. Do not tune rules using test text or labels. Archive the manifest with each
review, and use a new untouched test set if test errors influence development.

Selection favors design/develop/influence vocabulary and then sentence position.
This sampling bias and the punctuation-based sentence boundaries must be reported.
`expected: []` with `reviewed: false` is a placeholder, not a negative label.
`development-candidates-v1.jsonl` preserves the earlier inspected candidate set.

## Labeling rules

Label explicit `designedBy`, `developedBy`, and `influencedBy` relations about the
page subject. Do not infer a fact from a link or nearby name. Exclude negated,
hypothetical, quoted, and ambiguous claims unless adjudication establishes an
explicit supported reading. Coordinated objects may contain true relations even
when the current extractor abstains; label them so recall reflects that limitation.
Record exact linked target titles. Mark a true negative explicitly as `[]`.

For separate identity evaluation, annotate mention → canonical Wikipedia page ID
cases in `entity_links`. Use null where the appropriate behavior is abstention.
Resolve identities from the source revision and corpus, not the system prediction.
Two independent reviewers should complete each split, then reconcile disagreements.
Do not show predictions to reviewers before their initial labels are submitted.

## Exchange files and merge reviews

```sh
python scripts/review_annotations.py export --split dev --output /tmp/reviewer-a.csv
# Give each reviewer a separate copy; complete expected and optional entity_links.
python scripts/review_annotations.py merge --split dev \
  --first /tmp/reviewer-a.csv --second /tmp/reviewer-b.csv \
  --first-reviewer reviewer-a --second-reviewer reviewer-b \
  --output /tmp/reviewed-dev.jsonl
wikigraph evaluate --dataset /tmp/reviewed-dev.jsonl --split dev \
  --corpus data/wikipedia/graph.pages.json --output reports/real-dev.json
```

The `expected` CSV cell is a JSON list, for example:
`[{"predicate":"designedBy","object":"James Gosling"}]`.
An identity case looks like `[{"mention":"Java","page_id":15881}]`.
Keep source text and IDs unchanged. Preserve `UNREVIEWED` until a person has
actually labeled a record. The merger requires distinct reviewer IDs, exact
candidate IDs/text, and matching label sets before setting `reviewed: true`.
Conflicts are saved with both original reviews as `needs-adjudication`; they block
evaluation. Have the reviewers reconcile, retain their originals, document the
adjudicator's reasoning, and merge the agreed revised files. Reviewer IDs record
attestations; software cannot prove human independence or annotation correctness.

Export and merge the test split separately only after rules are frozen. The
merger emits only the selected split so held-out labels need not enter tuning files.
Never regenerate candidate files after review starts without versioning the change.

## Reproduce metrics

```sh
wikigraph evaluate
wikigraph evaluate --baseline --output reports/baseline.json
```

Reports contain micro/per-predicate precision, recall, F1, support, false positives,
false negatives, a dataset hash, and Wilson 95% precision intervals. Undefined
metrics are null. Correlated sentences make the interval descriptive rather than
a guarantee of generalization. Duplicate IDs and page leakage are rejected.

Optional entity-linking accuracy scores separately reviewed mention→ID cases,
including correct abstentions, using the supplied corpus's canonical index. The
report records support and resolved counts; absent identity gold yields null.
Factual extraction metrics still compare predicate/target-title pairs. `linksTo`
is excluded. The original link-only baseline emits no factual relations.
