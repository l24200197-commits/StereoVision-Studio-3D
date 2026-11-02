/**
 * Teléfono emulado (Pixel 7, táctil): modo VR, orientación, asistente de las
 * gafas y diseño sin desbordes. Las gafas reales y la comodidad visual NO se
 * pueden comprobar aquí (ver README, «Limitaciones de las pruebas»).
 */
import { test, expect } from '@playwright/test';
import { openStudio, state, loadSample, hasH264 } from './helpers.js';

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('portada y Studio en vertical: sin desplazamiento horizontal y objetivos táctiles ≥ 44 px', async ({ page }) => {
  const session = await openStudio(page);
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.click('.input-slate[data-module="sbs-image"]');
  await loadSample(page);
  expect(await noHorizontalScroll(page)).toBe(true);
  // Área sensible real: si el dibujo mide menos de 44 px, se comprueba con elementFromPoint
  // que los puntos a ±21 px del centro siguen tocando el mismo control.
  const small = await page.evaluate(() => {
    const found = [];
    for (const el of document.querySelectorAll('.studio button, .studio .seg-opt')) {
      if (!el.offsetParent || el.closest('[hidden]')) continue;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width >= 43.5 && r.height >= 43.5) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hits = [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
      if (!hits) found.push(`${el.id || el.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return found;
  });
  expect(small).toEqual([]);
  await session.assertClean();
});

test('13 · entrar y salir del modo VR conserva archivo y calibración; asistente de gafas', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 }); // horizontal
  const session = await openStudio(page, { module: 'sbs-image' });
  await loadSample(page);
  await page.locator('#cal-shiftX').fill('1.5');
  const before = await state(page);
  await page.click('#btn-vr');
  await expect(page.locator('body')).toHaveClass(/vr-active/);
  await expect(page.locator('.panel-left')).toBeHidden();
  await expect(page.locator('#vr-exit')).toBeFocused();
  // Primera vez: el asistente aparece solo.
  await expect(page.locator('#vr-wizard')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.wz-left .wz-step')).toHaveText('1/3 · Separación');
  // Tercio derecho = más.
  const box = await page.locator('#vr-wizard').boundingBox();
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect(page.locator('.wz-left .wz-value')).toHaveText('+0.2 %');
  await page.keyboard.press('Enter'); // Altura
  await page.keyboard.press('Enter'); // Tamaño (sobre la imagen real)
  await expect(page.locator('#vr-wizard')).toHaveClass(/is-content/);
  await page.keyboard.press('Enter'); // listo
  await expect(page.locator('#vr-wizard')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('svs3d.lens')))).toEqual({ x: 0.2, y: 0 });
  // Salir con Esc.
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/vr-active/);
  const after = await state(page);
  expect(after.file).toEqual(before.file);
  expect(after.params).toEqual(before.params);
  await expect(page.locator('#btn-vr')).toBeFocused();
  await session.assertClean();
});

test('modo VR en vertical: aviso de girar el teléfono y salida siempre accesible', async ({ page }) => {
  const session = await openStudio(page, { module: 'sbs-image' });
  await page.evaluate(() => localStorage.setItem('svs3d.lens', JSON.stringify({ x: 0, y: 0 })));
  await loadSample(page);
  await page.click('#btn-vr');
  await expect(page.locator('#vr-warning')).toBeVisible();
  await expect(page.locator('#vr-exit')).toBeVisible();
  await page.tap('#vr-exit');
  await expect(page.locator('body')).not.toHaveClass(/vr-active/);
  await session.assertClean();
});

test('video en VR: reproducir y pausar desde el visor', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  const session = await openStudio(page, { module: 'sbs-video' });
  test.skip(!(await hasH264(page)), 'Este navegador de pruebas no decodifica H.264');
  await page.evaluate(() => localStorage.setItem('svs3d.lens', JSON.stringify({ x: 0, y: 0 })));
  await loadSample(page);
  await page.click('#btn-vr');
  await page.tap('#stage', { position: { x: 400, y: 300 } }); // muestra los controles
  await page.tap('#vr-play');
  await page.waitForFunction(() => window.__studio.store.get().status === 'reproduciendo');
  await page.tap('#vr-play');
  await page.waitForFunction(() => window.__studio.store.get().status === 'pausado');
  await session.assertClean();
});

test('pellizcar y arrastrar sobre el visor cambian zoom y encuadre', async ({ page }) => {
  const session = await openStudio(page, { module: 'anaglyph' });
  await loadSample(page);
  // Tras cargar, el propio Studio trae el visor a la vista (estaba arriba de los botones).
  await expect.poll(() => page.evaluate(() => document.getElementById('stage').getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Pellizco con dos punteros táctiles (CDP).
  const client = await page.context().newCDPSession(page);
  const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let d = 40; d <= 100; d += 10) await touch('touchMove', [[cx - d, cy], [cx + d, cy]]);
  await touch('touchEnd', []);
  expect((await state(page)).params.scale).toBeGreaterThan(150);
  await session.assertClean();
});
