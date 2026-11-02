/**
 * Profundidad estimada con IA (Depth Anything V2) — necesita red la primera vez
 * para descargar el modelo (≈27 MB). Con OFFLINE=1 se omite.
 * Además comprueba la privacidad: ninguna petición lleva cuerpo (la foto nunca
 * sale del dispositivo) y solo se contacta al propio sitio, jsDelivr y Hugging Face.
 */
import { test, expect } from '@playwright/test';
import { openStudio, state, waitStatus } from './helpers.js';

test.skip(Boolean(process.env.OFFLINE), 'Sin red: no se puede descargar el modelo');
test.describe.configure({ mode: 'serial' }); // una descarga del modelo a la vez

/** Foto «normal»: la mitad izquierda del par de muestra, creada en el navegador. */
async function importNormalPhoto(page) {
  await page.evaluate(async () => {
    const blob = await (await fetch('./assets/media/sbs_muestra.jpg')).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width / 2, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const photo = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    await window.__studio.studio.importFile(new File([photo], 'foto_normal.jpg', { type: 'image/jpeg' }));
  });
  await waitStatus(page, 'listo');
}

test('foto normal → anaglifo: la IA estima la profundidad en un Worker y la imagen no sale del equipo @serie', async ({ page }) => {
  test.setTimeout(240_000);
  const requests = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method(), body: request.postDataBuffer()?.length ?? 0 }));
  const session = await openStudio(page, { module: 'anaglyph' });
  await importNormalPhoto(page);
  expect((await state(page)).params.source).toBe('2d');
  await expect(page.locator('#task')).toBeVisible();
  await expect(page.locator('#task')).toBeHidden({ timeout: 200_000 });
  const s = await state(page);
  expect(s.message.text).toMatch(/Profundidad estimada/);
  expect(await page.evaluate(() => Boolean(window.__studio.view.depthTexture))).toBe(true);

  const external = requests.filter((r) => !r.url.startsWith('http://localhost') && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
  const hosts = new Set(external.map((r) => new URL(r.url).hostname));
  for (const host of hosts) expect(host).toMatch(/(^|\.)(jsdelivr\.net|huggingface\.co|hf\.co|googleapis\.com|gstatic\.com)$/);
  expect(requests.filter((r) => r.method !== 'GET' || r.body > 0)).toEqual([]);
  expect(requests.some((r) => r.url.endsWith('/workers/depth.worker.js'))).toBe(true);
  await session.assertClean();
});

test('cancelar la estimación deja el relieve aproximado y permite reintentar @serie', async ({ page }) => {
  test.setTimeout(240_000);
  const session = await openStudio(page, { module: 'sbs-image' });
  await importNormalPhoto(page);
  await expect(page.locator('#task')).toBeVisible();
  await page.click('#task-cancel');
  await expect(page.locator('#task')).toBeHidden();
  let s = await state(page);
  expect(s.message.text).toMatch(/Estimación cancelada/);
  expect(s.message.action).toBe('Estimar profundidad');
  expect(await page.evaluate(() => Boolean(window.__studio.view.depthTexture))).toBe(false);
  await page.click('#message-action');
  await expect(page.locator('#task')).toBeHidden({ timeout: 200_000 });
  s = await state(page);
  expect(s.message.text).toMatch(/Profundidad estimada/);
  await session.assertClean();
});
