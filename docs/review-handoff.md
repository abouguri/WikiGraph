# Independent review handoff

Status: **not performed**. Automated checks do not count as another developer
reproducing the project or as three people completing the usability flow.

## Reproducibility reviewer

Use a fresh checkout, record its commit hash and your OS/runtime versions, and
follow the README's locked installation and development commands. Rebuild the
real corpus to a new output directory, compare its bytes, run the synthetic
evaluation, and start the Docker application. Record command output, failures,
and any undocumented step. Do not overwrite another reviewer's results.

The expected corpus has 300 entities, 5,113 assertions and 105,268 triples.
Synthetic metrics are 30 true positives, zero false positives, ten false
negatives. These are comparison values, not instructions to alter outputs.
The real annotation review is a separate task described in [annotation.md](annotation.md).

## Three usability reviewers

Give each person the running application and the tasks below without coaching.
Record completion, approximate time, assistance, and confusing labels. Repeat
the key search/evidence task using only the keyboard; include a narrow viewport.

1. Find Python and explain one connection using its evidence.
2. Find Java (programming language), filter to “was designed by,” and identify
   the source supporting the James Gosling connection.
3. Explain the difference between a page link and an extracted factual relation.
4. Find a path to another topic and explain direction or a no-path result.
5. Copy a share link, reopen it, and check that the selection is preserved.
6. Switch to the offline sample and explain whether its evidence is real Wikipedia text.

Create a separate result file per reviewer using this template:

```text
Reviewer identifier:
Commit and date:
Browser / viewport / input method:
Task | Completed unaided? | Time | Assistance | Observed friction
1    |                   |      |            |
2    |                   |      |            |
3    |                   |      |            |
4    |                   |      |            |
5    |                   |      |            |
6    |                   |      |            |
Unexpected behavior:
Suggested change:
```

Summarize actual observations and connect subsequent fixes to the observed
problem. Keep this gate pending until three real reviews exist.
