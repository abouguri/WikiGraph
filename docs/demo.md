# Reproduce the Cosmos walkthrough

Run `node frontend/record-demo.mjs` after installing the locked Python environment,
frontend development dependencies, Playwright Chromium and ffmpeg. The script starts
a local real-corpus server, drives the actual UI, captures desktop/mobile screenshots,
and assembles a one-minute captioned walkthrough in `docs/media/demo.webm`.

Chapters cover suggested origins, a Python similarity map, shared-neighbor evidence,
Java's sourced designer relation, the offline teaching sample, and saving discoveries.
The recording report is `reports/cosmos-demo.json`. The script stops its temporary
server and removes temporary frames afterward.
