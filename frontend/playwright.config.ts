import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8765" },
  webServer: {
    command:
      "../.venv/bin/python -m wikigraph.cli demo --output /tmp/wikigraph-browser.ttl && WIKIGRAPH_GRAPH=/tmp/wikigraph-browser.ttl ../.venv/bin/uvicorn wikigraph.api:create_app --factory --port 8765",
    url: "http://127.0.0.1:8765/health",
    reuseExistingServer: false,
  },
});
