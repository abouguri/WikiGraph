# Cosmos visual verification

The redesign is tracked in [the implementation log](redesign-log.md). The local
working plan is intentionally excluded from Git.

The browser suite exercises 1440×900, 900×900 and 390×900 layouts on the server and
offline teaching datasets. It covers landing, origin maps, shared-neighbor details,
evidence, keyboard search, focus restoration, multi-origin controls, failed requests,
filters, conditional timeline, exports and URL restoration. Dedicated Canvas checks
cover node/edge hit targets, curved parallel edges, cursor zoom, drag pinning,
Shift-drag selection, touch long-press and pinch.

Real-corpus captures are refreshed by `node frontend/record-demo.mjs`:

- [Landing](media/cosmos-landing.png)
- [Similarity map](media/dense-graph.png)
- [Shared-neighbor explanation](media/cosmos-explanation.png)
- [Wikipedia evidence](media/real-evidence.png)
- [Mobile](media/mobile.png), [mobile details](media/mobile-details.png)

The renderer stress test uses 300 nodes and 900 edges, beyond the normal 150/500 cap.
Its raw results and measurement method are in [cosmos-renderer.json](../reports/cosmos-renderer.json).
Frame rate is measured while panning the camera in headless Chromium, separately
from API request latency and server cold startup. Zero idle frames is checked after
settling. These results do not substitute for testing on physical mobile hardware.

The shipped datasets have no meaningful types or years. The production timeline is
therefore hidden; a dated browser fixture verifies brushing without modifying real data.
Human usability review and physical-device testing remain follow-up work.
