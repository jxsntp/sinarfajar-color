import { defineConfig } from "@playwright/test";
import "./tests/support/local-env";
import { researchStations } from "./tests/support/color-station";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3308",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3308",
    env: { OPENROUTER_API_KEY: "", REPORT_ORIGIN: "http://127.0.0.1:3308", COLOR_STATIONS: researchStations },
    url: "http://127.0.0.1:3308/login",
    timeout: 90000,
    reuseExistingServer: false,
  },
});
