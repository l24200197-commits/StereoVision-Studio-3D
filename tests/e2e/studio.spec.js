/**
 * Recorridos reales en el navegador: importación, errores, calibración,
 * exportación, video, recursos, teclado, perfil de bajo consumo y WebGL.
 */
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { openStudio, state, waitStatus, loadSample, importFiles, hasH264, exportedHalves, synthesizePair } from './helpers.js';

const SAMPLE_JPG = readFileSync(new URL('../../assets/media/sbs_muestra.jpg', import.meta.url));

function pngHeader(width, height) {
  const bytes = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test.describe('Inicio y portada', () => {
  test('sin contenido: importar, calibrar, restablecer y VR inactivos, con instrucciones', async ({ page }) => {
    const session = await openStudio(page);
    await expect(page.locator('#intro')).toBeVisible();
    await page.click('#intro-skip');
    await expect(page.locator('#btn-import')).toBeDisabled();
    await expect(page.locator('#btn-reset')).toBeDisabled();
    await expect(page.locator('#btn-vr')).toBeDisabled();
    await expect(page.locator('#stage-empty-title')).toHaveText('Bienvenido a StereoVision Studio 3D');
    await session.assertClean();
  });
});

test.describe('Importación', () => {
  test('1 · imagen válida: se muestra, se detecta el tipo y se informa', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    await importFiles(page, { name: 'mi_par.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPG });
    await waitStatus(page, 'listo');
    const s = await state(page);
    expect(s.file).toMatchObject({ name: 'mi_par.jpg', width: 1240, height: 936 });
    expect(s.params.source).toBe('sbs');
    await expect(page.locator('#fi-name')).toHaveText('mi_par.jpg');
    await expect(page.locator('#btn-vr')).toBeEnabled();
    await expect(page.locator('#view-canvas')).toHaveAttribute('aria-label', /mi_par\.jpg/);
    await session.assertClean();
  });

  test('2 · archivo inválido (texto y PDF disfrazado): error claro y recuperación', async ({ page }) => {
    const session = await openStudio(page, { module: 'anaglyph' });
    await importFiles(page, { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
    await waitStatus(page, 'error');
    await expect(page.locator('#message-text')).toContainText('no es un formato admitido');
    await expect(page.locator('#message-kind')).toHaveText('Error: ');
    await expect(page.locator('#btn-reset')).toBeDisabled();

    await importFiles(page, { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('%PDF-1.4 documento') });
    await waitStatus(page, 'error');
    await expect(page.locator('#message-text')).toContainText('documento PDF');

    await importFiles(page, { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.concat([SAMPLE_JPG.subarray(0, 3), Buffer.alloc(3000, 0x33)]) });
    await waitStatus(page, 'error'); // JPEG dañado: firma correcta, decodificación imposible
    await expect(page.locator('#message-text')).toContainText('No se pudo decodificar');

    await loadSample(page);
    expect((await state(page)).status).toBe('listo');
    await session.assertClean();
  });

  test('3 · archivo vacío', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    await importFiles(page, { name: 'vacio.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
    await waitStatus(page, 'error');
    await expect(page.locator('#message-text')).toContainText('está vacío');
    await session.assertClean();
  });

  test('4 · archivo demasiado grande (bytes y megapíxeles)', async ({ page }, testInfo) => {
    const session = await openStudio(page, { module: 'anaglyph' });
    await importFiles(page, { name: 'bomba.png', mimeType: 'image/png', buffer: pngHeader(20000, 20000) });
    await waitStatus(page, 'error');
    await expect(page.locator('#message-text')).toContainText('MP');

    const big = testInfo.outputPath('enorme.jpg');
    const bytes = Buffer.alloc(81 * 1024 * 1024);
    SAMPLE_JPG.copy(bytes);
    await writeFile(big, bytes);
    await importFiles(page, big);
    await waitStatus(page, 'error');
    await expect(page.locator('#message-text')).toContainText('el límite para imágenes');
    await session.assertClean();
  });

  test('varias imágenes a la vez: se usa la primera y se avisa', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    // Se sueltan dos imágenes sobre el visor (arrastrar y soltar real, con DataTransfer).
    await page.evaluate(async () => {
      const blob = await (await fetch('./assets/media/sbs_muestra.jpg')).blob();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'uno.jpg', { type: 'image/jpeg' }));
      transfer.items.add(new File([blob], 'dos.jpg', { type: 'image/jpeg' }));
      document.getElementById('stage').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await waitStatus(page, 'listo');
    await expect(page.locator('#message-text')).toContainText('solo «uno.jpg»');
    await session.assertClean();
  });
});

test.describe('Recursos', () => {
  test('5 y 6 · cambiar muchas veces de archivo y de módulo no acumula texturas, videos ni URLs', async ({ page }) => {
    const session = await openStudio(page, { module: 'anaglyph' });
    const h264 = await hasH264(page);
    const modules = h264 ? ['anaglyph', 'sbs-image', 'sbs-video', 'sbs-image', 'anaglyph', 'sbs-video'] : ['anaglyph', 'sbs-image', 'anaglyph', 'sbs-image'];
    for (const module of modules) {
      await page.check(`input[name="module"][value="${module}"]`, { force: true });
      await loadSample(page);
      await loadSample(page); // reimportar sobre el mismo módulo
      expect((await state(page)).status).toBe('listo');
      const res = await page.evaluate(() => ({
        memory: window.__studio.view.memory,
        videos: document.querySelectorAll('#video-holder video').length,
      }));
      expect(res.memory.textures).toBeLessThanOrEqual(1);
      expect(res.videos).toBeLessThanOrEqual(1);
    }
    // Cambiar de módulo con archivo cargado lo libera todo.
    await page.check('input[name="module"][value="anaglyph"]', { force: true });
    const after = await page.evaluate(() => ({ memory: window.__studio.view.memory, videos: document.querySelectorAll('#video-holder video').length, blobs: window.__blobs, status: window.__studio.store.get().status }));
    expect(after.status).toBe('sin-archivo');
    expect(after.memory.textures).toBe(0);
    expect(after.videos).toBe(0);
    expect(after.blobs.created).toBe(after.blobs.revoked); // ninguna URL temporal queda viva
    await session.assertClean();
  });

  test('quitar archivo devuelve a «Sin archivo» y libera la GPU', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    await loadSample(page);
    await page.click('#btn-clear');
    const s = await state(page);
    expect(s.status).toBe('sin-archivo');
    expect(await page.evaluate(() => window.__studio.view.memory.textures)).toBe(0);
    await expect(page.locator('#stage-empty')).toBeVisible();
    await session.assertClean();
  });
});

test.describe('Calibración y exportación', () => {
  test('7 · restablecer devuelve los valores iniciales y se puede deshacer', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    await loadSample(page);
    await page.locator('#cal-shiftX').fill('3.5');
    await page.locator('#cal-scale').fill('150');
    await expect(page.locator('.ctl[data-key="shiftX"] output')).toHaveText('+3.5 %');
    await expect(page.locator('.ctl[data-key="scale"] .ctl-reset')).toBeVisible();
    await page.click('#btn-reset');
    let s = await state(page);
    expect([s.params.shiftX, s.params.scale]).toEqual([0, 100]);
    expect(s.message.action).toBe('Deshacer');
    await page.click('#message-action');
    s = await state(page);
    expect([s.params.shiftX, s.params.scale]).toEqual([3.5, 150]);
    // Restablecer un solo ajuste.
    await page.click('.ctl[data-key="scale"] .ctl-reset');
    s = await state(page);
    expect([s.params.shiftX, s.params.scale]).toEqual([3.5, 100]);
    await session.assertClean();
  });

  test('cada ojo recibe su mitad; «Intercambiar ojos» intercambia el contenido real', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    // Par sintético: mitad izquierda roja, derecha azul.
    const buffer = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(800, 400);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#e02020'; ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = '#2040e0'; ctx.fillRect(400, 0, 400, 400);
      for (let i = 0; i < 40; i += 1) { ctx.fillStyle = `rgba(255,255,255,${(i % 5) / 10})`; ctx.fillRect((i * 37) % 380, (i * 53) % 380, 18, 18); ctx.fillRect(400 + ((i * 37) % 380) + 4, (i * 53) % 380, 18, 18); }
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return [...new Uint8Array(await blob.arrayBuffer())];
    });
    await importFiles(page, { name: 'rojo_azul.png', mimeType: 'image/png', buffer: Buffer.from(buffer) });
    await waitStatus(page, 'listo');
    // Las mitades tienen distinto color, así que la detección (por luminancia) no la toma por SBS: se elige a mano.
    await page.click('.ctl[data-key="source"] .seg-opt:has(input[value="sbs"])');
    expect((await state(page)).params.source).toBe('sbs');
    let halves = await exportedHalves(page);
    expect(halves.width).toBe(800);
    expect(halves.left[0]).toBeGreaterThan(halves.left[2]); // izquierda: rojo
    expect(halves.right[2]).toBeGreaterThan(halves.right[0]); // derecha: azul
    await page.click('#cal-swap', { force: true });
    halves = await exportedHalves(page);
    expect(halves.left[2]).toBeGreaterThan(halves.left[0]);
    expect(halves.right[0]).toBeGreaterThan(halves.right[2]);
    await expect(page.locator('#eye-label-left')).toContainText('mitad derecha');
    await session.assertClean();
  });

  test('8 · exportar: descarga un JPG nuevo con la calibración, el original no cambia', async ({ page }) => {
    const session = await openStudio(page, { module: 'anaglyph' });
    await loadSample(page);
    const before = await state(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-download')]);
    expect(download.suggestedFilename()).toBe('anaglifo_muestra_anaglifo.jpg');
    const path = await download.path();
    const head = readFileSync(path).subarray(0, 3);
    expect([...head]).toEqual([0xff, 0xd8, 0xff]);
    expect((await state(page)).file).toEqual(before.file);
    await expect(page.locator('#message-text')).toContainText('El archivo original no cambió');
    await session.assertClean();
  });

  test('brillo y contraste del anaglifo cambian la imagen exportada', async ({ page }) => {
    const session = await openStudio(page, { module: 'anaglyph' });
    await loadSample(page);
    const base = await exportedHalves(page);
    await page.locator('#cal-brightness').fill('40');
    const bright = await exportedHalves(page);
    expect(bright.left[1]).toBeGreaterThan(base.left[1] + 20);
    await page.click('#btn-reset');
    const reset = await exportedHalves(page);
    expect(Math.abs(reset.left[1] - base.left[1])).toBeLessThan(2);
    await session.assertClean();
  });
});

test.describe('Video', () => {
  test('9 y 10 · reproducir, pausar, buscar y silenciar', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-video' });
    test.skip(!(await hasH264(page)), 'Este navegador de pruebas no decodifica H.264');
    await loadSample(page);
    await expect(page.locator('#t-play')).toBeEnabled();
    await page.click('#t-play');
    await waitStatus(page, 'reproduciendo');
    await page.waitForFunction(() => document.querySelector('#video-holder video').currentTime > 0.5);
    await page.click('#t-play');
    await waitStatus(page, 'pausado');
    const t1 = await page.evaluate(() => document.querySelector('#video-holder video').currentTime);
    await page.waitForTimeout(400);
    const t2 = await page.evaluate(() => document.querySelector('#video-holder video').currentTime);
    expect(t2).toBe(t1);
    await page.click('#t-mute');
    await expect(page.locator('#t-mute')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#t-back');
    expect(await page.evaluate(() => document.querySelector('#video-holder video').currentTime)).toBe(0);
    // Mientras está en pausa, mover un deslizador no vuelve a subir el cuadro a la GPU pero sí redibuja.
    await page.locator('#cal-shiftX').fill('2');
    await expect(page.locator('.ctl[data-key="shiftX"] output')).toHaveText('+2.0 %');
    await session.assertClean();
  });

  test('11 · dos videos de «dos teléfonos»: sincronía por audio y tamaño igualado @serie', async ({ page }) => {
    test.setTimeout(120_000);
    const session = await openStudio(page, { module: 'sbs-video' });
    test.skip(!(await hasH264(page)), 'Este navegador de pruebas no decodifica H.264');
    const sizes = await synthesizePair(page, { seconds: 6, delay: 1.2, zoom: 1.2 });
    expect(sizes.every((size) => size > 10_000)).toBe(true);
    await page.evaluate(() => window.__studio.studio.importFile(window.__pair));
    await expect(page.locator('#task')).toBeVisible();
    await expect(page.locator('#task')).toBeHidden({ timeout: 60_000 });
    const s = await state(page);
    expect(s.params.source).toBe('pair');
    expect(s.message.text).toMatch(/sincronizados por audio/);
    expect(Math.abs(s.params.sync - -1.2)).toBeLessThan(0.15); // el derecho empezó 1.2 s después
    expect(Math.abs(s.params.sizeR - 120)).toBeLessThanOrEqual(4);
    await expect(page.locator('#fi-name')).toHaveText('escena_izq.mp4 (izq.) + escena_der.mp4 (der.)');
    expect(await page.evaluate(() => window.__studio.view.memory.textures)).toBe(2);
    await session.assertClean();
  });

  test('12 · cancelar la unión automática detiene el trabajo y ofrece reintentar @serie', async ({ page }) => {
    test.setTimeout(120_000);
    const session = await openStudio(page, { module: 'sbs-video' });
    test.skip(!(await hasH264(page)), 'Este navegador de pruebas no decodifica H.264');
    await synthesizePair(page, { seconds: 4, delay: 0.8, zoom: 1.1 });
    // Se cancela en cuanto aparece el trabajo (con la máquina cargada podría terminar antes de un clic externo).
    await page.evaluate(() => {
      const off = window.__studio.store.subscribe((s) => {
        if (!s.task) return;
        off();
        queueMicrotask(() => document.getElementById('task-cancel').click());
      });
      window.__studio.studio.importFile(window.__pair);
    });
    await expect(page.locator('#message-text')).toContainText('cancelada', { timeout: 30_000 });
    await expect(page.locator('#task')).toBeHidden();
    let s = await state(page);
    expect(s.message.text).toMatch(/cancelada/);
    expect(s.message.action).toBe('Reintentar');
    const paramsAfterCancel = s.params;
    await page.waitForTimeout(1500); // el trabajo cancelado no debe escribir resultados tarde
    expect((await state(page)).params).toEqual(paramsAfterCancel);
    await page.click('#message-action');
    await expect(page.locator('#task')).toBeHidden({ timeout: 60_000 });
    s = await state(page);
    expect(s.message.text).toMatch(/Videos unidos/);
    await session.assertClean();
  });
});

test.describe('Teclado y accesibilidad de uso', () => {
  test('14 · el Studio se usa con teclado: portada, módulo, importar y atajos del visor', async ({ page }) => {
    const session = await openStudio(page);
    // Portada: Tab llega a la primera entrada y Enter la elige.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('.input-slate[data-module="anaglyph"]')).toBeFocused();
    await page.keyboard.press('ArrowDown'); // no debe romper nada
    await page.keyboard.press('Enter');
    await expect(page.locator('#intro')).toBeHidden();
    await expect(page.locator('#btn-import')).toBeFocused();
    // El foco es visible.
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Tab'); // Cargar muestra
    await page.keyboard.press('Enter');
    await waitStatus(page, 'listo');
    await page.focus('#stage');
    await page.keyboard.press('+');
    expect((await state(page)).params.scale).toBe(110);
    await page.keyboard.press('ArrowRight');
    expect((await state(page)).params.panX).toBeCloseTo(0.02);
    await page.keyboard.press('0');
    const s = await state(page);
    expect([s.params.scale, s.params.panX]).toEqual([100, 0]);
    // Barra del visor: mismas acciones con botones.
    await page.click('#tool-zoom-in');
    await expect(page.locator('#tool-zoom')).toHaveText('125 %');
    await page.click('#tool-fit');
    await expect(page.locator('#tool-zoom')).toHaveText('100 %');
    await session.assertClean();
  });

  test('diálogos de Ajustes y Atajos: se abren, atrapan el foco y se cierran con Esc', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    await page.click('#btn-shortcuts');
    await expect(page.locator('#dlg-shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dlg-shortcuts')).toBeHidden();
    await page.click('#btn-settings');
    await expect(page.locator('#quality-note')).toContainText('Automática eligió');
    await page.keyboard.press('Escape');
    await expect(page.locator('#dlg-settings')).toBeHidden();
    await session.assertClean();
  });
});

test.describe('Rendimiento y robustez', () => {
  test('15 · equipo de baja capacidad: perfil Ahorro sin alterar la geometría estéreo', async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 1 });
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 2 });
    });
    const session = await openStudio(page, { module: 'sbs-image' });
    const profile = await page.evaluate(() => window.__studio.settings.profile);
    expect(profile.tier).toBe('saver');
    expect(await page.evaluate(() => window.__studio.view.pixelRatio)).toBeLessThanOrEqual(1.25);
    await expect(page.locator('body')).toHaveClass(/is-lite/);
    await loadSample(page);
    const halves = await exportedHalves(page);
    expect(halves.width).toBe(1240); // misma resolución del archivo: la precisión no se degrada
    // El usuario puede pedir calidad alta igualmente.
    await page.click('#btn-settings');
    await page.check('input[name="quality"][value="high"]', { force: true });
    expect(await page.evaluate(() => window.__studio.view.pixelRatio)).toBe(2);
    await expect(page.locator('body')).not.toHaveClass(/is-lite/);
    await session.assertClean();
    await context.close();
  });

  test('pérdida y recuperación del contexto WebGL', async ({ page }) => {
    const session = await openStudio(page, { module: 'sbs-image' });
    await loadSample(page);
    await page.evaluate(() => {
      const gl = document.getElementById('view-canvas').getContext('webgl2');
      window.__lose = gl.getExtension('WEBGL_lose_context');
      window.__lose.loseContext();
    });
    await expect(page.locator('#message-text')).toContainText('interrumpió');
    await page.evaluate(() => window.__lose.restoreContext());
    await expect(page.locator('#message-text')).toContainText('se restauró');
    const halves = await exportedHalves(page);
    expect(halves.width).toBe(1240);
    expect(halves.left.some((v) => v > 10)).toBe(true); // vuelve a dibujar contenido real
    await session.assertClean();
  });
});
