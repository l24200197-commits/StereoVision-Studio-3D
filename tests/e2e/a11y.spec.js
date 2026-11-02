/**
 * Accesibilidad automatizada con axe-core (WCAG 2.2 A/AA) en cada pantalla
 * relevante. axe detecta en torno a la mitad de los problemas posibles; el
 * resto (lectura real con lector de pantalla) se documenta como verificación
 * manual pendiente en el README.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openStudio, loadSample } from './helpers.js';

/** El contraste se mide con la página quieta: se esperan las animaciones finitas (fundidos de entrada). */
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
  .map((a) => a.finished.catch(() => {}))));

const scan = async (page, include) => {
  await settle(page);
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
};

test('portada', async ({ page }) => {
  await openStudio(page);
  await page.waitForTimeout(300); // deja arrancar las animaciones con retardo antes de esperarlas
  expect(await scan(page)).toEqual([]);
});

test('Studio vacío, con archivo y con error', async ({ page }) => {
  await openStudio(page, { module: 'sbs-image' });
  await page.waitForTimeout(600);
  expect(await scan(page)).toEqual([]);
  await loadSample(page);
  await page.click('.ctl[data-key="shiftX"] .ctl-info');
  await page.waitForTimeout(400);
  expect(await scan(page)).toEqual([]);
  await page.setInputFiles('#file-input', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await page.waitForFunction(() => window.__studio.store.get().status === 'error');
  await page.waitForTimeout(400);
  expect(await scan(page)).toEqual([]);
});

test('Studio de video y diálogos', async ({ page }) => {
  await openStudio(page, { module: 'sbs-video' });
  await page.waitForTimeout(600);
  expect(await scan(page)).toEqual([]);
  await page.click('#btn-settings');
  await page.waitForTimeout(300);
  expect(await scan(page, '#dlg-settings')).toEqual([]);
  await page.keyboard.press('Escape');
  await page.click('#btn-shortcuts');
  await page.waitForTimeout(300);
  expect(await scan(page, '#dlg-shortcuts')).toEqual([]);
});
