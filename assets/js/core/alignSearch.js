/**
 * alignSearch.js — Qué porción del video derecho coincide con el cuadro izquierdo.
 *
 * Recibe miniaturas en gris de uno o varios instantes (los mismos en los dos
 * videos) y busca escala y desplazamiento del recorte del derecho maximizando
 * la correlación normalizada media. Estrategia:
 *   1. Rejilla gruesa sobre miniaturas a media resolución.
 *   2. Los mejores candidatos se afinan dos veces a resolución completa.
 *   3. Confianza: el mejor resultado debe ser bueno Y destacar sobre el mejor
 *      candidato lejano; una pared lisa o dos escenas distintas no pasan.
 * Sin DOM: corre en un Worker o en Node.
 */
import { rightCrop } from './pairGeometry.js';

export const SEARCH = Object.freeze({
  scaleMin: 0.7,
  scaleMax: 1.45,
  scaleStep: 1.03,
  oxRange: 0.2,
  oyRange: 0.1,
  coarseStep: 0.02,
  topK: 4,
  minScore: 0.55,
  minMargin: 0.04,
  farOffset: 0.06,
  farScale: 0.08,
});

/** Correlación normalizada entre la miniatura L y el recorte `crop` de R (muestreo bilineal). */
export function scoreCrop(L, R, crop) {
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

/** Reduce una miniatura a la mitad (promedio 2×2). */
export function halve(img) {
  const width = Math.max(4, Math.floor(img.width / 2));
  const height = Math.max(4, Math.floor(img.height / 2));
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(img.width - 2, x * 2);
      const sy = Math.min(img.height - 2, y * 2);
      const i = sy * img.width + sx;
      gray[y * width + x] = (img.gray[i] + img.gray[i + 1] + img.gray[i + img.width] + img.gray[i + img.width + 1]) / 4;
    }
  }
  return { gray, width, height };
}

function meanScore(pairs, aspectLeft, aspectRight, candidate) {
  const crop = rightCrop(aspectLeft, aspectRight, candidate.scale, candidate.ox, candidate.oy);
  let total = 0;
  for (const [L, R] of pairs) {
    const s = scoreCrop(L, R, crop);
    if (s <= -1) return -1;
    total += s;
  }
  return total / pairs.length;
}

const isFar = (a, b) => Math.abs(a.ox - b.ox) > SEARCH.farOffset
  || Math.abs(a.oy - b.oy) > SEARCH.farOffset
  || Math.abs(Math.log(a.scale / b.scale)) > SEARCH.farScale;

/**
 * @param framesLeft, framesRight  [{ gray, width, height }] del mismo instante (mismo orden)
 * @param aspectLeft, aspectRight  proporción de cada video
 * @param hooks  { onProgress(fraction), shouldStop() }
 * @returns { scale, ox, oy, score, margin, confident }
 */
export function searchAlignment(framesLeft, framesRight, aspectLeft, aspectRight, hooks = {}) {
  if (!framesLeft.length || framesLeft.length !== framesRight.length) throw new Error('Faltan cuadros para alinear.');
  const full = framesLeft.map((L, i) => [L, framesRight[i]]);
  const coarse = full.map(([L, R]) => [halve(L), halve(R)]);
  const stop = () => {
    if (hooks.shouldStop?.()) throw Object.assign(new Error('Cancelado'), { name: 'AbortError' });
  };

  // 1. Rejilla gruesa.
  const scales = [];
  for (let s = SEARCH.scaleMin; s <= SEARCH.scaleMax + 1e-9; s *= SEARCH.scaleStep) scales.push(s);
  const grid = [];
  scales.forEach((scale, index) => {
    stop();
    for (let oy = -SEARCH.oyRange; oy <= SEARCH.oyRange + 1e-9; oy += SEARCH.coarseStep) {
      for (let ox = -SEARCH.oxRange; ox <= SEARCH.oxRange + 1e-9; ox += SEARCH.coarseStep) {
        const candidate = { scale, ox, oy };
        candidate.score = meanScore(coarse, aspectLeft, aspectRight, candidate);
        grid.push(candidate);
      }
    }
    hooks.onProgress?.(((index + 1) / scales.length) * 0.7);
  });
  grid.sort((a, b) => b.score - a.score);

  // Mejores candidatos distintos entre sí (evita afinar cuatro veces el mismo pico).
  const seeds = [];
  for (const candidate of grid) {
    if (seeds.every((seed) => isFar(seed, candidate))) seeds.push(candidate);
    if (seeds.length >= SEARCH.topK) break;
  }

  // 2. Afinado a resolución completa, en dos pasadas.
  let best = { scale: 1, ox: 0, oy: 0, score: -1 };
  const refined = [];
  seeds.forEach((seed, index) => {
    stop();
    let center = { ...seed, score: meanScore(full, aspectLeft, aspectRight, seed) };
    for (const step of [0.01, 0.004]) {
      let local = center;
      for (let ds = -2; ds <= 2; ds += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const candidate = {
              scale: center.scale * (1 + ds * step),
              ox: center.ox + dx * step,
              oy: center.oy + dy * step,
            };
            candidate.score = meanScore(full, aspectLeft, aspectRight, candidate);
            if (candidate.score > local.score) local = candidate;
          }
        }
      }
      center = local;
    }
    refined.push(center);
    if (center.score > best.score) best = center;
    hooks.onProgress?.(0.7 + ((index + 1) / seeds.length) * 0.3);
  });

  // 3. Confianza: margen sobre el mejor candidato lejano, puntuado a la misma
  // resolución que el ganador (la rejilla gruesa puntúa más alto por ser más suave).
  let farBest = -1;
  for (const candidate of refined) {
    if (isFar(candidate, best) && candidate.score > farBest) farBest = candidate.score;
  }
  for (const candidate of grid.filter((c) => isFar(c, best)).slice(0, SEARCH.topK)) {
    farBest = Math.max(farBest, meanScore(full, aspectLeft, aspectRight, candidate));
  }
  const margin = best.score - farBest;
  return {
    scale: best.scale,
    ox: best.ox,
    oy: best.oy,
    score: best.score,
    margin,
    confident: best.score >= SEARCH.minScore && margin >= SEARCH.minMargin,
  };
}
