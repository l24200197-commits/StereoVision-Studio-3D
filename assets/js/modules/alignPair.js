/**
 * alignPair.js — Iguala el tamaño y el encuadre de dos videos de teléfonos distintos.
 *
 * Cada teléfono tiene su propio zoom, resolución y forma de cuadro. Se toman
 * miniaturas de los dos videos en varios instantes comunes (según la sincronía)
 * y un Worker busca qué porción del derecho coincide con el cuadro izquierdo
 * (core/alignSearch.js). Varios instantes evitan que un cuadro borroso o
 * repetitivo dé una alineación falsa. El resultado son los números que usa el
 * visor para recortar el derecho:
 *   scale  tamaño relativo (1 = misma altura de escena)
 *   ox, oy desplazamiento del recorte en coordenadas de textura (UV)
 */
import { runTask, throwIfAborted } from './tasks.js';

const LEFT_W = 64; // ancho de la miniatura de referencia
const RIGHT_W = 160; // ancho de la miniatura donde se busca (más campo: puede tener otro zoom)
const SEEK_TIMEOUT_MS = 3000;

export { rightCrop } from '../core/pairGeometry.js';

/** Lleva el video a `time` y espera a que el cuadro esté listo. */
function seek(video, time) {
  if (Math.abs(video.currentTime - time) < 1e-3 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    const timer = setTimeout(done, SEEK_TIMEOUT_MS);
    video.addEventListener('seeked', done);
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

/**
 * Instantes del izquierdo en los que los dos videos tienen imagen.
 * @param offset tiempoDerecho = tiempoIzquierdo + offset
 */
export function commonInstants(durationLeft, durationRight, offset, count) {
  const start = Math.max(0, -offset);
  const end = Math.min(durationLeft, durationRight - offset);
  if (!(end > start)) return [];
  return Array.from({ length: count }, (_, k) => start + ((k + 1) / (count + 1)) * (end - start));
}

/**
 * @param left, right  <video> ya cargados
 * @param offset       tiempoDerecho = tiempoIzquierdo + offset
 * @param options      { signal, onProgress(fraction), frames }
 */
export async function estimateAlignment(left, right, offset, { signal, onProgress, frames = 3 } = {}) {
  const times = commonInstants(left.duration || 0, right.duration || 0, offset, frames);
  if (!times.length) throw new Error('Los dos videos no coinciden en el tiempo con esta sincronía.');
  const restoreLeft = left.currentTime;

  const framesLeft = [];
  const framesRight = [];
  try {
    for (const [index, t] of times.entries()) {
      throwIfAborted(signal);
      await Promise.all([seek(left, t), seek(right, t + offset)]);
      framesLeft.push(grayThumb(left, LEFT_W));
      framesRight.push(grayThumb(right, RIGHT_W));
      onProgress?.(((index + 1) / times.length) * 0.3);
    }
  } finally {
    // Vuelve a donde estaba; el derecho lo reacomoda sbsVideo.js al terminar el «seeked».
    await Promise.all([seek(left, restoreLeft), seek(right, Math.max(0, restoreLeft + offset))]);
  }

  const transfer = [...framesLeft, ...framesRight].map((frame) => frame.gray.buffer);
  return runTask('align', {
    framesLeft,
    framesRight,
    aspectLeft: left.videoWidth / left.videoHeight,
    aspectRight: right.videoWidth / right.videoHeight,
  }, {
    signal,
    transfer,
    onProgress: (fraction) => onProgress?.(0.3 + fraction * 0.7),
  });
}
