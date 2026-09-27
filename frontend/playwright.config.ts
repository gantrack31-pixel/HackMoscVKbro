import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const runDirectory = mkdtempSync(join(tmpdir(), "deckly-e2e-"));
mkdirSync(runDirectory, { recursive: true });
process.on("exit", () => rmSync(runDirectory, { recursive: true, force: true }));
const python = process.env.DECKLY_TEST_PYTHON || join(root, "backend", ".venv", ...(process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"]));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:5183",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: `"${python}" "${join(root, "frontend", "e2e", "start_backend.py")}"`,
      env: { DECKLY_E2E_RUN_DIR: runDirectory },
      url: "http://127.0.0.1:8183/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 5183 --strictPort",
      env: { DECKLY_API_TARGET: "http://127.0.0.1:8183" },
      url: "http://127.0.0.1:5183",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
