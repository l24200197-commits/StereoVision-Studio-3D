/**
 * depthPost.js — Preparación del mapa de profundidad antes de usarlo en el visor.
 *
 * El modelo entrega un mapa en gris (blanco = cerca). Se aplica suavizado
 * bilateral separable para preservar discontinuidades de profundidad, después
 * contraste robusto por percentiles y plano de pantalla en la mediana. Es una
 * profundidad relativa estimada, no distancia física. Sin DOM: Worker o Node.
 */

/** Desenfoque de caja separable (dos pasadas) de radio r. */
export function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      let sum = 0; let n = 0;
      for (let d = -r; d <= r; d += 1) {
        const xx = x + d;
        if (xx >= 0 && xx < w) { sum += src[row + xx]; n += 1; }
      }
      tmp[row + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0; let n = 0;
      for (let d = -r; d <= r; d += 1) {
        const yy = y + d;
        if (yy >= 0 && yy < h) { sum += tmp[yy * w + x]; n += 1; }
      }
      out[y * w + x] = Math.round(sum / n);
    }
  }
  return out;
}

/** Valor (0…1) bajo el que queda la fracción `q` de los píxeles. */
export function quantile(data, q) {
  const histogram = new Uint32Array(256);
  for (const value of data) histogram[value] += 1;
  let seen = 0;
  for (let v = 0; v < 256; v += 1) {
    seen += histogram[v];
    if (seen >= data.length * q) return v / 255;
  }
  return 1;
}

/**
 * Suavizado bilateral separable aproximado: reduce ruido sin mezclar tanto
 * profundidades distintas a ambos lados de un borde.
 */
export function edgeAwareBlur(src, w, h, radius = 3, sigmaRange = 22) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || src.length !== w * h) {
    throw new RangeError('El mapa de profundidad debe tener dimensiones válidas.');
  }
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const sigmaSpatial = Math.max(1, radius);
  const rangeDenom = 2 * sigmaRange * sigmaRange;
  const spatialDenom = 2 * sigmaSpatial * sigmaSpatial;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const center = src[row + x]; let weighted = 0; let weights = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const xx = x + d; if (xx < 0 || xx >= w) continue;
        const value = src[row + xx];
        const spatial = Math.exp(-(d * d) / spatialDenom);
        const range = Math.exp(-((value - center) ** 2) / rangeDenom);
        const weight = spatial * range; weighted += value * weight; weights += weight;
      }
      tmp[row + x] = weighted / Math.max(weights, 1e-12);
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const center = tmp[y * w + x]; let weighted = 0; let weights = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const yy = y + d; if (yy < 0 || yy >= h) continue;
        const value = tmp[yy * w + x];
        const spatial = Math.exp(-(d * d) / spatialDenom);
        const range = Math.exp(-((value - center) ** 2) / rangeDenom);
        const weight = spatial * range; weighted += value * weight; weights += weight;
      }
      out[y * w + x] = Math.round(weighted / Math.max(weights, 1e-12));
    }
  }
  return out;
}

/** Contraste robusto por percentiles; conserva mapas uniformes sin amplificarlos. */
export function normalizeDepthMap(data, lowQ = 0.02, highQ = 0.98) {
  const low = Math.round(quantile(data, lowQ) * 255);
  const high = Math.round(quantile(data, highQ) * 255);
  if (high <= low) return Uint8Array.from(data);
  const scale = 255 / (high - low);
  return Uint8Array.from(data, (value) => Math.round(Math.max(0, Math.min(255, (value - low) * scale))));
}

/** @returns { data: Uint8Array, width, height, plane } con filas de arriba hacia abajo */
export function finishDepthMap(gray, width, height) {
  const smoothed = edgeAwareBlur(gray, width, height, 3, 22);
  const data = normalizeDepthMap(smoothed);
  return { data, width, height, plane: quantile(data, 0.5) };
}

