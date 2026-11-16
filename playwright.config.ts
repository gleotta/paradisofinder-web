import { defineConfig } from "@playwright/test";

/**
 * Pruebas de interfaz (14/09 — `docs/DECISION_2026-09-14_qa-produccion.md`).
 * Corren contra un P1 YA levantado (`BASE_URL`, default http://localhost:3000):
 * el Docker local, `npm run dev` o el stage. Las mismas pruebas pasan con P2
 * real y con los mocks (`P2_MODE=mock`): no dependen de datos concretos,
 * salvo el catálogo SEO (`src/data/seo-catalog.json`, versionado).
 *
 * Browser: el Google Chrome del sistema (`channel: "chrome"`) — no hay que
 * descargar Chromium. Mobile primero: el proyecto `mobile` (380 px) corre
 * antes que `desktop`.
 *
 *   npm run test:e2e                 # todo
 *   npx playwright test t1           # una tarea
 *   BASE_URL=http://localhost:3001 npx playwright test --project=mobile
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/e2e/.report" }]],
  outputDir: "tests/e2e/.artifacts",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    locale: "es-AR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 380, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 900 } },
    },
  ],
});
