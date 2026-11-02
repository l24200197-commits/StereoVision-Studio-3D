/**
 * depthPost.js — Preparación del mapa de profundidad antes de usarlo en el visor.
 *
 * El modelo entrega un mapa en gris (blanco = cerca). Se suaviza un poco (los
 * bordes duros del sujeto rompen la imagen al desplazarla) y se elige el plano
 * de pantalla en la mediana: lo más cercano sale hacia el espectador y el resto
 * queda detrás. Sin DOM: corre en un Worker o en Node.
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

/** @returns { data: Uint8Array, width, height, plane } con filas de arriba hacia abajo */
export function finishDepthMap(gray, width, height) {
  const data = boxBlur(gray, width, height, 3);
  return { data, width, height, plane: quantile(data, 0.5) };
}
