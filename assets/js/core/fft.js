/**
 * fft.js — Transformada rápida de Fourier (radix-2, in situ) y correlación cruzada.
 *
 * La sincronía por audio compara dos huellas de varios miles de muestras en
 * todos los desfases posibles. Hacerlo directo cuesta O(N·desfases); con la FFT
 * cuesta O(N log N) y da el mismo resultado (las pruebas lo comparan).
 * Sin DOM: corre igual en el hilo principal, en un Worker o en Node.
 */

export function nextPow2(n) {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** FFT compleja in situ. `inverse` aplica la inversa sin normalizar. */
export function fft(re, im, inverse = false) {
  const n = re.length;
  // Reordenamiento por inversión de bits.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    const half = len / 2;
    for (let start = 0; start < n; start += len) {
      let cRe = 1;
      let cIm = 0;
      for (let k = 0; k < half; k += 1) {
        const a = start + k;
        const b = a + half;
        const tRe = re[b] * cRe - im[b] * cIm;
        const tIm = re[b] * cIm + im[b] * cRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const next = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = next;
      }
    }
  }
}

/**
 * scores[lag + maxLag] = Σ a[i] · b[i + lag], para lag en [−maxLag, maxLag].
 * El tamaño de la FFT cubre a.length + b.length, así que no hay solape circular.
 */
export function crossCorrelate(a, b, maxLag) {
  const n = nextPow2(a.length + b.length);
  const aRe = new Float64Array(n);
  const aIm = new Float64Array(n);
  const bRe = new Float64Array(n);
  const bIm = new Float64Array(n);
  aRe.set(a);
  bRe.set(b);
  fft(aRe, aIm);
  fft(bRe, bIm);
  // conj(A) · B
  for (let i = 0; i < n; i += 1) {
    const re = aRe[i] * bRe[i] + aIm[i] * bIm[i];
    const im = aRe[i] * bIm[i] - aIm[i] * bRe[i];
    aRe[i] = re;
    aIm[i] = im;
  }
  fft(aRe, aIm, true);
  const scores = new Float32Array(2 * maxLag + 1);
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    scores[lag + maxLag] = aRe[lag >= 0 ? lag : n + lag] / n;
  }
  return scores;
}

/** Versión directa O(N·desfases): referencia para las pruebas. */
export function crossCorrelateDirect(a, b, maxLag) {
  const scores = new Float32Array(2 * maxLag + 1);
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    const from = Math.max(0, -lag);
    const to = Math.min(a.length, b.length - lag);
    for (let i = from; i < to; i += 1) sum += a[i] * b[i + lag];
    scores[lag + maxLag] = sum;
  }
  return scores;
}
