# Explorer redesign verification

The application now uses a compact workspace instead of a tall landing page.
The graph starts with a small neighborhood, preserves existing positions during
expansion, and gives labels space instead of drawing every name over every edge.
Search, connections and evidence share one selection model; small-screen evidence
opens in an accessible modal sheet.

## Recorded checks

- 49 Python tests passed, including exact/prefix/substring search ordering.
- 15 Chromium tests passed, with zero failures or skipped tests in the recorded run.
- 24 state screenshots were captured across 1440×900, 1280×800, 768×1024 and
  390×844: loading, default, evidence, path, empty search and request failure.
- Dense fixtures exercised 40 nodes / 54 edges and the 40-node / 120-edge cap.
  Visible node labels did not overlap; the selected label remained available.
- Expansion preserved existing coordinates. Node selection did not expand the
  graph. Zoom, path return, ranked destination search, retry and shared views passed.
- Keyboard result navigation, mobile focus containment/return, reduced-motion
  captures and horizontal-overflow checks passed.
- The dense test recorded 11.3 ms peak layout computation and 5.3 ms synchronous
  selection feedback. These are one-run local CPU measurements, not a hosted
  latency or end-to-end input-to-paint claim.
- Six sampled palette combinations passed the recorded text/graphic contrast
  thresholds. This is not a full accessibility conformance audit.

The [machine-readable report](../reports/visual-verification.json) includes the
compiled JavaScript hash, measurement scope, palette ratios and browser results.
Lint, Python typing and TypeScript compilation also passed.

## Visual evidence

[Real Wikipedia evidence](media/real-evidence.png) ·
[Mobile evidence sheet](media/mobile.png) ·
[Dense graph fixture](media/dense-graph.png) · [2:20 walkthrough](media/demo.webm)

The dense screenshot uses an authored stress fixture with deliberately long
names; it is not a claim about real Wikipedia relationships. The Java screenshot
uses the checked-in revision-backed Wikipedia corpus. The mobile example is
explicitly synthetic. The video is a captioned sequence of actual browser states.

The screenshots were reviewed for representative desktop, mobile, path and dense
states. Generated test captures are retained in ignored `frontend/test-results/`
for local inspection. There is no approved pixel-diff baseline yet.

## Remaining validation

The planned three-person usability review still requires real participants.
Public Vercel verification requires the deployment URL. The existing independent
annotation and reproducibility gates remain separate from this visual redesign.
