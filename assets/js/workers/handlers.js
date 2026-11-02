/**
 * handlers.js — Tareas de cálculo intensivo que corren fuera del hilo principal.
 *
 * El mismo código lo usan el Worker (analysis.worker.js) y, si el navegador no
 * admite Workers de módulo, el hilo principal (tasks.js). Cada tarea recibe
 * datos ya extraídos del DOM (audio mono, miniaturas en gris) y devuelve
 * números o arreglos: nada de esto sale del dispositivo.
 */
import { onsetEnvelope, estimateOffset } from '../core/audioCorrelation.js';
import { searchAlignment } from '../core/alignSearch.js';

export const HANDLERS = Object.freeze({
  /** { samples: Float32Array, sampleRate } → Float32Array (huella de golpes) */
  envelope: ({ samples, sampleRate }) => onsetEnvelope(samples, sampleRate),
  /** { left, right: Float32Array } → { offset, confident, peak, ratio } */
  offset: ({ left, right }) => estimateOffset(left, right),
  /** { framesLeft, framesRight, aspectLeft, aspectRight } → { scale, ox, oy, score, margin, confident } */
  align: ({ framesLeft, framesRight, aspectLeft, aspectRight }, hooks) => (
    searchAlignment(framesLeft, framesRight, aspectLeft, aspectRight, hooks)
  ),
});

/** Búferes de un resultado que pueden transferirse sin copiarse. */
export function transferablesOf(value) {
  if (ArrayBuffer.isView(value)) return [value.buffer];
  return [];
}
