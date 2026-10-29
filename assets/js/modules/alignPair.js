/**
 * alignPair.js — Iguala el tamaño y el encuadre de dos videos de teléfonos distintos.
 *
 * Cada teléfono tiene su propio zoom, resolución y forma de cuadro. Se toma un
 * cuadro de cada video en el mismo instante y se busca qué porción del video
 * derecho coincide con el cuadro del izquierdo (escala y posición). El
 * resultado son los mismos números que usa el visor para recortar el derecho:
 *   scale  tamaño relativo (1 = misma altura de escena)
 *   ox, oy desplazamiento del recorte en coordenadas de textura (UV)
 */
const LEFT_W = 64; // ancho de la miniatura de referencia
const RIGHT_W = 160; // ancho de la miniatura donde se busca

function seek(video, time) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 3000);
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = time;
  });
}

function grayThumb(video, width) {
  const height = Math.max(8, Math.round((width * video.videoHeight) / video.videoWidth));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = 0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2];
  return { gray, width, height };
}

/** Recorte del video derecho que corresponde al cuadro izquierdo (igual que stereoView). */
export function rightCrop(aspectLeft, aspectRight, scale, ox, oy) {
  const fw = aspectLeft / aspectRight / scale;
  const fh = 1 / scale;
  return [0.5 - fw / 2 + ox, 0.5 - fh / 2 + oy, fw, fh];
}

function score(L, R, crop) {
  const [cx, cy, cw, ch] = crop;
  let n = 0; let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0;
  for (let y = 0; y < L.height; y += 1) {
    const v = 1 - (y + 0.5) / L.height; // UV con y hacia arriba
    const ty = cy + v * ch;
    if (ty < 0 || ty > 1) continue;
    const py = (1 - ty) * R.height - 0.5;
    const y0 = Math.max(0, Math.min(R.height - 2, Math.floor(py)));
    const fy = Math.min(1, Math.max(0, py - y0));
    for (let x = 0; x < L.width; x += 1) {
      const tx = cx + ((x + 0.5) / L.width) * cw;
      if (tx < 0 || tx > 1) continue;
      const px = tx * R.width - 0.5;
      const x0 = Math.max(0, Math.min(R.width - 2, Math.floor(px)));
      const fx = Math.min(1, Math.max(0, px - x0));
      const i = y0 * R.width + x0;
      const top = R.gray[i] * (1 - fx) + R.gray[i + 1] * fx;
      const bottom = R.gray[i + R.width] * (1 - fx) + R.gray[i + R.width + 1] * fx;
      const b = top * (1 - fy) + bottom * fy;
      const a = L.gray[y * L.width + x];
      n += 1; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
  }
  if (n < L.width * L.height * 0.5) return -1; // el recorte se sale demasiado del video
  const cov = sab - (sa * sb) / n;
  const den = Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
  return den > 1e-6 ? cov / den : -1;
}

/**
 * @param left, right  <video> ya cargados
 * @param offset       tiempoDerecho = tiempoIzquierdo + offset
 */
export async function estimateAlignment(left, right, offset) {
  const t = Math.min(2, (left.duration || 0) / 2);
  const tr = Math.min(Math.max(t + offset, 0), Math.max(0, (right.duration || 0) - 0.1));
  await Promise.all([seek(left, t), seek(right, tr)]);
  const L = grayThumb(left, LEFT_W);
  const R = grayThumb(right, RIGHT_W);
  await Promise.all([seek(left, 0), seek(right, Math.max(0, offset))]);

  const aL = left.videoWidth / left.videoHeight;
  const aR = right.videoWidth / right.videoHeight;
  let best = { scale: 1, ox: 0, oy: 0, score: -1 };
  const tryAt = (scale, ox, oy) => {
    const s = score(L, R, rightCrop(aL, aR, scale, ox, oy));
    if (s > best.score) best = { scale, ox, oy, score: s };
  };

  // Búsqueda gruesa y luego fina alrededor del mejor resultado.
  for (let scale = 0.7; scale <= 1.45; scale *= 1.03) {
    for (let oy = -0.1; oy <= 0.1001; oy += 0.02) {
      for (let ox = -0.2; ox <= 0.2001; ox += 0.02) tryAt(scale, ox, oy);
    }
  }
  const c = { ...best };
  for (let ds = -0.03; ds <= 0.0301; ds += 0.01) {
    for (let dy = -0.015; dy <= 0.0151; dy += 0.005) {
      for (let dx = -0.015; dx <= 0.0151; dx += 0.005) tryAt(c.scale * (1 + ds), c.ox + dx, c.oy + dy);
    }
  }
  return { ...best, confident: best.score > 0.5 };
}
