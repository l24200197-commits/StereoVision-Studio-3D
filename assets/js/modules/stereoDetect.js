/**
 * stereoDetect.js — Reconoce qué trae una imagen: anaglifo, par SBS o foto normal.
 *
 * Trabaja sobre una copia reducida (≈160 px de ancho), así que tarda unos
 * milisegundos. Es una estimación: el usuario puede corregirla en «Tipo de foto».
 *   · Anaglifo: el canal rojo y el verde son la misma escena vista desde dos
 *     puntos, así que se parecen más al desplazar uno respecto del otro, o se
 *     parecen poco entre sí.
 *   · SBS: la mitad izquierda y la derecha son casi la misma imagen.
 */
const SAMPLE_W = 160;
const SBS_THRESHOLD = 0.75;

/** Desenfoque de caja 5×5: deja la forma general de la escena. */
function blur(src, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0; let n = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += src[yy * w + xx]; n += 1;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

/** Correlación normalizada entre a y b comparando a[x] con b[x + shift] por filas. */
function correlation(a, b, w, h, shift, aStart = 0, bStart = 0, span = w) {
  let n = 0; let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0;
  const from = Math.max(0, -shift);
  const to = Math.min(span, span - shift);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = from; x < to; x += 1) {
      const va = a[row + aStart + x];
      const vb = b[row + bStart + x + shift];
      n += 1; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
    }
  }
  if (n < 16) return 0;
  const cov = sab - (sa * sb) / n;
  const den = Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
  return den > 1e-6 ? cov / den : 0;
}

export function analyzeStereo(image) {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const w = SAMPLE_W;
  const h = Math.max(16, Math.min(240, Math.round((SAMPLE_W * srcH) / srcW)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    r[i] = data[i * 4];
    g[i] = data[i * 4 + 1];
    lum[i] = 0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2];
  }

  // Anaglifo: ¿rojo y verde coinciden mejor desplazados?
  const rg0 = correlation(r, g, w, h, 0);
  let rgBest = rg0;
  let rgShift = 0;
  for (let s = -8; s <= 8; s += 1) {
    if (s === 0) continue;
    const c = correlation(r, g, w, h, s);
    if (c > rgBest) { rgBest = c; rgShift = s; }
  }
  const anaglyph = (rgShift !== 0 && rgBest - rg0 > 0.02 && rgBest > 0.5) || rg0 < 0.5;

  // SBS: ¿las dos mitades son casi la misma imagen? Se suaviza antes de comparar
  // para que la textura fina y la disparidad propia del par no bajen la puntuación.
  const soft = blur(lum, w, h);
  const half = Math.floor(w / 2);
  let sbsScore = -1;
  for (let s = -10; s <= 10; s += 1) {
    sbsScore = Math.max(sbsScore, correlation(soft, soft, w, h, s, 0, half, half));
  }
  // Un objeto simétrico centrado (una chamarra, una cara) se parece a su mitad
  // en espejo; un par SBS se parece a la otra mitad sin reflejar.
  const mirrored = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < half; x += 1) mirrored[y * w + half + x] = soft[y * w + (w - 1 - x)];
  }
  const mirrorScore = correlation(soft, mirrored, w, h, 0, 0, half, half);
  const sbs = !anaglyph && sbsScore > SBS_THRESHOLD && sbsScore >= mirrorScore;

  return { anaglyph, sbs, scores: { rg0, rgBest, rgShift, sbsScore, mirrorScore } };
}
