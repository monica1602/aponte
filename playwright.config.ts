import { defineConfig, devices } from "@playwright/test";

const mail = process.env.E2E_MAIL_PORT || "3910";
const env = { ...process.env, E2E_MAIL_PORT: mail } as Record<string, string>;

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { name: "e-mails", command: "node e2e/mail-mock.mjs", url: `http://127.0.0.1:${mail}/mails`, env, reuseExistingServer: false },
    { name: "principal", command: "node e2e/server.mjs main 3100", url: "http://127.0.0.1:3100/login", env, timeout: 120_000, reuseExistingServer: false },
    { name: "aprovacao", command: "node e2e/server.mjs aprov 3101 aprovacao", url: "http://127.0.0.1:3101/login", env, timeout: 120_000, reuseExistingServer: false },
  ],
});
