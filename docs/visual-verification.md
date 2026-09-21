# Explorer visual verification

The [visual system](design-system.md) documents the current themes, typography,
and responsive surfaces.

The browser suite exercises 1440×900, 900×900, 390×900 and 320×900 layouts on the server and
offline teaching datasets. It covers landing, origin maps, shared-neighbor details,
evidence, keyboard search, focus restoration, multi-origin controls, failed requests,
filters, conditional timeline, exports and URL restoration. Dedicated Canvas checks
cover node/edge hit targets, curved parallel edges, cursor zoom, drag pinning,
Shift-drag selection, touch long-press and pinch.

Current real-corpus captures:

- [Landing](media/minimal-landing.png)
- [Light map](media/patterns-light-workspace.png), [dark map](media/patterns-dark-workspace.png)
- [Light mobile details](media/patterns-light-mobile.png), [dark mobile details](media/patterns-dark-mobile.png)

`node frontend/record-demo.mjs` reproduces a walkthrough using the actual application.

The renderer stress test uses 300 nodes and 900 edges, beyond the normal 150/500 cap.
Its raw results and measurement method are in [cosmos-renderer.json](../reports/cosmos-renderer.json).
Frame rate is measured while panning the camera in headless Chromium, separately
from API request latency and server cold startup. Zero idle frames is checked after
settling. These results do not substitute for testing on physical mobile hardware.

The shipped datasets have no meaningful types or years. The production timeline is
therefore hidden; a dated browser fixture verifies brushing without modifying real data.
Human usability review and physical-device testing remain follow-up work.
