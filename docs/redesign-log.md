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

## Phase 2 — Canvas renderer

Replaced SVG rendering with DPR-aware Canvas 2D. Added cached radial glow sprites, incoming-degree sizing, prioritized measured labels, fact arrows/evidence dots, node spatial hashing, edge hit testing, cursor-centered wheel zoom, pan/pinch, and panel-aware animated fit. Rendering is event-driven and stops when idle. The existing expansion, search, path and evidence logic continues through the same GraphView interface. Real and teaching smoke checks pass; two new hit-testing/idle-rendering tests pass. Existing SVG DOM-specific tests will be migrated with the new map workflow. Dense performance and multi-edge refinements remain in the final verification phase.

## Phase 3 — live simulation

Added bounded pairwise repulsion, weighted springs, gravity, collision padding and cooling. Existing positions stay held when adding neighbors; new nodes settle over approximately 12 animation frames. Dragging pins a node; double-click releases it. Pause and Re-arrange controls are wired. Path mode stops simulation and preserves neighborhood positions. Reduced motion computes the final arrangement synchronously, with no visible settling animation. Simulation stops scheduling frames when cool or paused. Three targeted tests pass, covering stable expansion, pin/unpin, termination and reduced-motion idle rendering. Build passes.

## Phase 4 — similarity API

Added weighted incoming/outgoing cosine similarity, direct-reference/fact bonuses, geometric multi-origin ranking, bounded two-hop candidates, invisible similarity springs, deterministic clusters, hub-filtered side lists, explanations and suggested origins. Endpoints are additive; existing response models remain unchanged. Metadata comes from RDF snapshots only. Teaching JSON now carries the same descriptive metadata for offline parity.

Decisions: degree is unique incoming plus unique outgoing page neighbors; candidates may traverse factual edges as well as page references. Zero-similarity candidates are omitted. `limit` counts non-origin recommendations, with origins added separately; it clamps to 5–80. Unknown origins return 404; empty/duplicate/more than three origins return 422. Lists exclude degree strictly above 25% of the corpus.

Validation: 53 backend tests pass; Ruff and mypy pass. Real-corpus request times for one/two/three origins: 18.36 / 31.87 / 30.21 ms with 41 / 42 / 43 nodes. Startup, including RDF parsing and validation, took 7.27 seconds separately; this is not included in warm map latency. Returned assertion identifiers resolve to stored evidence. The existing cold-start cost remains a deployment constraint.

## Phase 5 — origin-based map workflow

Added a central store, hash serialization, offline similarity implementation, list/detail modules, suggested origins and a map landing state. Users can create up to three origins, inspect shared-neighbor explanations, use Foundations/Builds on this, add/remove/expand entities, switch encodings, inspect assertions and find paths. Drawing caps are now 150 entities and 500 connections, with factual edges prioritized when trimming. The hash preserves origins, map size, selection, encodings, expansions, additions/removals, saved IDs, filters and camera; legacy entity query links still load. Missing shared origins produce a notice.

Offline scoring is implemented without a new dependency and checked against Python for one, two and three origins, including ranked nodes, clusters, lists and spring weights. Three parity/workflow browser tests pass. Real Wikipedia maps were checked at 1440, 900 and 390px with no horizontal overflow or browser errors. Build passes. Final polish will consolidate panel positioning and migrate the old SVG-specific suite.
