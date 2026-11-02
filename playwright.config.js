/**
 * Pruebas de navegador. Por defecto usan Google Chrome instalado (decodifica
 * H.264, como los navegadores reales); PW_CHANNEL=chromium usa el Chromium de
 * Playwright (sin H.264: las pruebas de video se omiten solas).
 * El sitio se sirve bajo /StereoVision-Studio-3D/, igual que en GitHub Pages.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 8124;
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/StereoVision-Studio-3D/`,
    channel,
    // Sin estrangular páginas «en segundo plano»: con varias pruebas a la vez, Chrome podía
    // dejar de entregar requestAnimationFrame y el visor no llegaba a dibujar.
    launchOptions: {
      args: [
        '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      ],
    },
  },
  webServer: {
    command: `PORT=${PORT} node scripts/serve.mjs`,
    url: `http://localhost:${PORT}/StereoVision-Studio-3D/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'escritorio', use: { viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: 'movil', use: { ...devices['Pixel 7'], channel }, testMatch: /mobile\.spec/ },
  ],
});
