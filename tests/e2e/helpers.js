import { expect } from '@playwright/test';

/**
 * Abre el Studio con ?debug (expone window.__studio) y registra todo lo que
 * indicaría un fallo: errores de consola, excepciones, violaciones de la CSP,
 * respuestas 4xx/5xx y URLs temporales (blob:) creadas y revocadas.
 */
export async function openStudio(page, { module, query = '' } = {}) {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`consola: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`excepción: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__csp.push(`${event.violatedDirective} ${event.blockedURI}`));
    window.__blobs = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (obj) => { window.__blobs.created += 1; return create(obj); };
    URL.revokeObjectURL = (url) => { window.__blobs.revoked += 1; return revoke(url); };
  });
  await page.goto(`./?debug${query}`);
  await page.waitForFunction(() => Boolean(window.__studio));
  if (module) {
    await page.click(`.input-slate[data-module="${module}"]`);
    await expect(page.locator('#intro')).toBeHidden();
  }
  return {
    problems,
    async assertClean() {
      const csp = await page.evaluate(() => window.__csp);
      expect(csp, 'violaciones de CSP').toEqual([]);
      expect(problems, 'errores en la página').toEqual([]);
    },
  };
}

export const state = (page) => page.evaluate(() => {
  const { message, task, ...rest } = window.__studio.store.get();
  return { ...rest, message: message && { kind: message.kind, text: message.text, action: message.action?.label ?? null }, task };
});

export async function waitStatus(page, status) {
  await page.waitForFunction((s) => window.__studio.store.get().status === s, status);
}

export async function loadSample(page) {
  await page.click('#btn-sample');
  await page.waitForFunction(() => ['listo', 'error'].includes(window.__studio.store.get().status));
}

/** Importa archivos por el selector real (input[type=file]). */
export async function importFiles(page, files) {
  await page.setInputFiles('#file-input', files);
}

export const hasH264 = (page) => page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') !== '');

/**
 * Exporta lo que se ve (descarga real del Studio no; la misma función de render)
 * y devuelve el color medio de dos bloques: a la izquierda y a la derecha.
 */
export const exportedHalves = (page) => page.evaluate(async () => {
  const blob = await window.__studio.view.exportImage();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const mean = (x) => {
    const { data } = ctx.getImageData(x, Math.round(bitmap.height * 0.4), Math.round(bitmap.width * 0.1), Math.round(bitmap.height * 0.2));
    let r = 0; let g = 0; let b = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    const n = data.length / 4;
    return [r / n, g / n, b / n];
  };
  return { width: bitmap.width, height: bitmap.height, left: mean(Math.round(bitmap.width * 0.2)), right: mean(Math.round(bitmap.width * 0.7)) };
});

/**
 * Crea en el navegador dos MP4 grabados «a la vez» desde dos cámaras virtuales:
 *   · el derecho empieza `delay` segundos después (desfase de audio conocido);
 *   · el derecho ve la escena con un campo más amplio (`zoom`): la misma escena
 *     se ve 1/zoom veces más pequeña, como un teléfono con otro objetivo.
 * Los golpes de sonido ocurren en instantes irregulares para que la sincronía
 * sea inequívoca. Devuelve dos File listos para importar.
 */
export const synthesizePair = (page, { seconds = 6, delay = 1.2, zoom = 1.2 } = {}) => page.evaluate(async ({ seconds, delay, zoom }) => {
  const W = 480; const H = 270;
  const blobs = Array.from({ length: 40 }, (_, i) => ({
    x: ((i * 97) % 100) / 100, y: ((i * 61) % 100) / 100, r: 0.04 + ((i * 13) % 7) / 60, hue: (i * 47) % 360,
  }));
  const makeCanvas = (scale) => {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    return {
      canvas,
      draw(t) {
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(1 / scale, 1 / scale);
        ctx.translate(-W / 2, -H / 2);
        for (const b of blobs) {
          ctx.fillStyle = `hsl(${b.hue} 70% ${35 + 30 * Math.sin(t + b.hue)}%)`;
          ctx.beginPath();
          ctx.arc(b.x * W + Math.sin(t * 0.7 + b.hue) * 6, b.y * H, b.r * H, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    };
  };
  const left = makeCanvas(1);
  const right = makeCanvas(zoom);
  const audio = new AudioContext();
  const dest = audio.createMediaStreamDestination();
  const clickTimes = [0.4, 0.9, 1.7, 2.05, 2.9, 3.3, 4.4, 4.75, 5.6, 6.3, 6.6, 7.4];
  const start = audio.currentTime + 0.2;
  for (const t of clickTimes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 900 + t * 40;
    gain.gain.setValueAtTime(0, start + t);
    gain.gain.linearRampToValueAtTime(0.8, start + t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, start + t + 0.12);
    osc.connect(gain).connect(dest);
    osc.start(start + t);
    osc.stop(start + t + 0.15);
  }
  const record = (source) => {
    const stream = new MediaStream([...source.canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks().map((track) => track.clone())]);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', videoBitsPerSecond: 2e6 });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const done = new Promise((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' })); });
    return { recorder, done };
  };
  // Temporizador y no requestAnimationFrame: con varias páginas a la vez el navegador puede
  // pausar rAF y MediaRecorder grabaría un MP4 sin imagen.
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    left.draw(t);
    right.draw(t);
  };
  draw();
  const timer = setInterval(draw, 33);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const a = record(left);
  a.recorder.start();
  await new Promise((resolve) => setTimeout(resolve, delay * 1000));
  const b = record(right);
  b.recorder.start();
  await new Promise((resolve) => setTimeout(resolve, (seconds - delay) * 1000));
  a.recorder.stop();
  await new Promise((resolve) => setTimeout(resolve, delay * 1000));
  b.recorder.stop();
  const [blobA, blobB] = await Promise.all([a.done, b.done]);
  clearInterval(timer);
  await audio.close();
  for (const blob of [blobA, blobB]) {
    const video = document.createElement('video');
    video.muted = true;
    video.src = URL.createObjectURL(blob);
    await new Promise((resolve) => { video.onloadeddata = resolve; video.onerror = resolve; });
    const ok = video.videoWidth > 0;
    const url = video.src;
    video.removeAttribute('src'); // primero se suelta el archivo, luego la URL (si no, error de carga)
    video.load();
    URL.revokeObjectURL(url);
    if (!ok) throw new Error('La grabación de prueba salió sin imagen; repite la prueba.');
  }
  window.__pair = [new File([blobA], 'escena_izq.mp4', { type: 'video/mp4' }), new File([blobB], 'escena_der.mp4', { type: 'video/mp4' })];
  return window.__pair.map((f) => f.size);
}, { seconds, delay, zoom });
