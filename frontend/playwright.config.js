import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  globalTeardown: "./stop-checkin-server.js",
  webServer: {
    command: process.platform === "win32"
      ? "..\\.venv\\Scripts\\python.exe ../tools/checkin_test_server.py"
      : "../.venv/bin/python ../tools/checkin_test_server.py",
    url: "http://127.0.0.1:5001/api/health",
    timeout: 30000,
    reuseExistingServer: false,
  },
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:5000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["json", { outputFile: "../tmp/browser-results.json" }]],
  projects: [
    { name: "chrome", use: { browserName: "chromium", channel: "chrome" } },
    { name: "edge", use: { browserName: "chromium", channel: "msedge" } },
  ],
});
