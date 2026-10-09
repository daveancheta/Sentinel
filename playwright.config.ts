import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173", ...devices["Desktop Chrome"] },
  webServer: { command: "node scripts/serve-static.mjs", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI, timeout: 10_000 },
});
