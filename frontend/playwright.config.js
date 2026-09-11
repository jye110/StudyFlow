import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const localPython = process.platform === "win32"
  ? "../.venv/Scripts/python.exe"
  : "../.venv/bin/python";
const fixturePython = existsSync(new URL(localPython, import.meta.url))
  ? `"${localPython}"`
  : "python";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  globalTeardown: "./stop-checkin-server.js",
  webServer: {
    command: `${fixturePython} ../tools/checkin_test_server.py`,
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
