/**
 * audioCorrelation.js — Huella de golpes de sonido y desfase entre dos audios.
 *
 * Dos teléfonos que graban la misma escena escuchan los mismos sucesos (voces,
 * pasos, un aplauso) aunque empiecen a grabar en momentos distintos. Se resume
 * cada audio en una «huella» de subidas de energía cada 10 ms y se busca el
 * desfase en el que mejor coinciden. Sin DOM: corre en un Worker o en Node.
 *
 * Sentido del resultado (el que usa el Studio):
 *   tiempoDerecho = tiempoIzquierdo + offset
 */
import { crossCorrelate } from './fft.js';

export const ENVELOPE_RATE = 100; // huellas por segundo (10 ms, menos que un cuadro)
export const MAX_LAG_SECONDS = 30; // desfase máximo que se busca
const EXCLUSION_SECONDS = 0.3; // el «segundo mejor» se busca lejos del pico
const MIN_PEAK = 0.05;
const MIN_RATIO = 1.25;

/**
 * @param samples     audio mono (Float32Array)
 * @param sampleRate  muestras por segundo de `samples`
 * @returns Float32Array de media cero y norma 1 (o ceros si el audio es plano)
 */
export function onsetEnvelope(samples, sampleRate, rate = ENVELOPE_RATE) {
  const bin = Math.max(1, Math.round(sampleRate / rate));
  const bins = Math.floor(samples.length / bin);
  const onset = new Float32Array(bins);
  if (bins < 2) return onset;

  let previous = 0;
  let mean = 0;
  for (let i = 0; i < bins; i += 1) {
    let sum = 0;
    for (let j = i * bin, end = j + bin; j < end; j += 1) sum += samples[j] * samples[j];
    const energy = Math.log(1e-6 + sum / bin);
    if (i > 0) {
      onset[i] = Math.max(0, energy - previous);
      mean += onset[i];
    }
    previous = energy;
  }
  mean /= bins;
  let sq = 0;
  for (let i = 0; i < bins; i += 1) {
    onset[i] -= mean;
    sq += onset[i] * onset[i];
  }
  const norm = Math.sqrt(sq);
  if (norm < 1e-9) return onset.fill(0);
  for (let i = 0; i < bins; i += 1) onset[i] /= norm;
  return onset;
}

/**
 * Desfase con mejor coincidencia entre dos huellas.
 * Afina el pico con una parábola (precisión menor a 10 ms) y mide la confianza
 * comparándolo con el mejor candidato lejano: un pico que no destaca no se da
 * por bueno.
 */
export function estimateOffset(left, right, { rate = ENVELOPE_RATE, maxLagSeconds = MAX_LAG_SECONDS } = {}) {
  if (left.length < 2 || right.length < 2) throw new Error('Audio demasiado corto para sincronizar.');
  const maxLag = Math.max(1, Math.min(Math.round(maxLagSeconds * rate), Math.max(left.length, right.length) - 1));
  const scores = crossCorrelate(left, right, maxLag);

  let best = 0;
  for (let i = 1; i < scores.length; i += 1) if (scores[i] > scores[best]) best = i;

  let delta = 0;
  if (best > 0 && best < scores.length - 1) {
    const a = scores[best - 1];
    const b = scores[best];
    const c = scores[best + 1];
    const curvature = a - 2 * b + c;
    if (curvature < 0) delta = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curvature));
  }

  const exclusion = EXCLUSION_SECONDS * rate;
  let second = -Infinity;
  for (let i = 0; i < scores.length; i += 1) {
    if (Math.abs(i - best) > exclusion && scores[i] > second) second = scores[i];
  }
  const peak = scores[best];
  const ratio = second > 0 ? peak / second : Infinity;
  return {
    offset: (best - maxLag + delta) / rate,
    confident: peak > MIN_PEAK && ratio > MIN_RATIO,
    peak,
    ratio,
  };
}
