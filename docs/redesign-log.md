# Cosmos redesign implementation log

The working plan stays local. Work is committed phase by phase on `redesign/cosmos`.

## Phase 0 — baseline and constraints

- Frontend: strict TypeScript, ES2022, esbuild; bundle is checked in at `src/wikigraph/static/app.js`. FastAPI serves static files. Playwright starts a synthetic server on port 8765. No runtime graph dependency.
- Deployment remains Vercel's root `app.py` application factory wrapper. No deployment configuration change is needed for this branch.
- Public entity identifiers are `enwiki-{pageId}` and `fixture-{pageId}`. Assertion identifiers are stable hashes. Existing response contracts must remain unchanged.
- Real corpus: 300 entities, 5,111 page-link assertions, one designedBy and one developedBy assertion. Incoming page-link degree: min 0, median 11, max 119. Largest hubs: Programming language (119), Operating system (106), Software release life cycle (96), ISBN (90), C (87), Programming paradigm (84).
- Teaching corpus: 25 entities, 41 page links, 16 factual assertions. Incoming page-link degree: min 0, median 1, max 24.
- Both corpora lack meaningful entity types and year fields. Use Other and null year. Hide unavailable year controls; do not infer metadata from titles or article text.
- Existing caps now live in `frontend/src/config.ts`: 12 connections per expansion, 40 nodes, 120 edges. This phase changes no behavior.
- Baseline browser captures live outside Git in `/tmp/cosmos-baseline`, for both datasets at 1440×900 and 390×844. Subsequent visual verification will use committed reports and refreshed media.
- The user's existing `.gitignore` edit is intentionally left unstaged.

Validation: TypeScript check and production bundle pass.

Baseline headless Chromium wheel interaction: real 40 nodes/60 edges 60.0 FPS; teaching default neighborhood 5 nodes/7 edges 60.2 FPS. This is a wheel-event baseline, not evidence for the future 300/900 target.

## Phase 1 — dark visual foundation

Replaced the light page with a viewport-sized canvas, floating glass controls and evidence panel. Added the specified palette, solid fallbacks, visible focus rings, and a bottom sheet below 900px. Control borders use a stronger separate token than decorative hairlines for contrast. SVG remains functional with dark-compatible colors while Canvas is developed. Verified load, evidence inspection and no horizontal overflow at 1440, 900 and 390px. Typecheck and bundle pass.
