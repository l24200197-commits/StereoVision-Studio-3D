/**
 * audioSync.js — Encuentra el desfase entre dos videos grabados a la vez.
 *
 * Reparto del trabajo:
 *   · hilo principal: leer el archivo y decodificar su audio (la API de audio
 *     del navegador solo existe aquí; decodifica de forma asíncrona y nativa),
 *     y mezclarlo a mono a 16 kHz para gastar poca memoria;
 *   · Worker: huella de golpes y correlación cruzada por FFT
 *     (core/audioCorrelation.js).
 * Los dos audios se decodifican uno tras otro (no a la vez) para no duplicar el
 * pico de memoria, y la huella de cada archivo se guarda: «Unir de nuevo» no
 * vuelve a decodificar. Todo ocurre en el dispositivo.
 *
 * Devuelve offset en segundos con el sentido que usa el Studio:
 *   tiempoDerecho = tiempoIzquierdo + offset
 */
import { runTask, throwIfAborted } from './tasks.js';

const DECODE_RATE = 16000; // suficiente para golpes de 10 ms; ¼ de memoria que 44.1 kHz
const MAX_SECONDS = 300; // se analizan como mucho los primeros 5 min de cada audio
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;

export class SyncError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

const envelopes = new WeakMap(); // File → Promise<Float32Array>

function offlineContext() {
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Ctx) throw new SyncError('Este navegador no decodifica audio.', 'unsupported');
  try {
    return new Ctx(1, DECODE_RATE, DECODE_RATE);
  } catch {
    return new Ctx(1, 44100, 44100); // Safari antiguos solo aceptan frecuencias «de audio»
  }
}

function decodeAudio(ctx, data) {
  return new Promise((resolve, reject) => {
    // Forma con callbacks: también funciona en Safari antiguos.
    const fail = () => reject(new SyncError('El video no trae una pista de audio legible.', 'no-audio'));
    try {
      const promise = ctx.decodeAudioData(data, resolve, fail);
      promise?.catch?.(fail);
    } catch {
      fail();
    }
  });
}

async function decodeMono(file, maxBytes) {
  if (file.size > maxBytes) {
    throw new SyncError(
      `«${file.name}» es demasiado grande para analizar su audio en este dispositivo (${Math.round(file.size / 1048576)} MB).`,
      'too-large',
    );
  }
  const data = await file.arrayBuffer();
  const buffer = await decodeAudio(offlineContext(), data);
  const length = Math.min(buffer.length, Math.round(buffer.sampleRate * MAX_SECONDS));
  const samples = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c += 1) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) samples[i] += channel[i] / channels;
  }
  return { samples, sampleRate: buffer.sampleRate };
}

/**
 * Huella de un archivo; se calcula una vez y se reutiliza. No depende de la
 * cancelación: la decodificación del navegador no se puede interrumpir, así que
 * si el usuario cancela se termina en segundo plano y queda lista para un
 * reintento (quien llama comprueba su señal al recibirla).
 */
function envelopeOf(file, maxBytes) {
  let pending = envelopes.get(file);
  if (!pending) {
    pending = (async () => {
      const { samples, sampleRate } = await decodeMono(file, maxBytes);
      return runTask('envelope', { samples, sampleRate }, { transfer: [samples.buffer] });
    })();
    envelopes.set(file, pending);
    pending.catch(() => envelopes.delete(file)); // un fallo permite reintentar
  }
  return pending;
}

/**
 * @param options { signal, onProgress(fraction, etapa), maxBytes }
 * @returns {{ offset: number, confident: boolean, peak: number, ratio: number }}
 *          o lanza SyncError si algún video no trae audio
 */
export async function estimateAudioOffset(fileLeft, fileRight, { signal, onProgress, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  throwIfAborted(signal);
  onProgress?.(0, 'audio izquierdo');
  const left = await envelopeOf(fileLeft, maxBytes);
  throwIfAborted(signal);
  onProgress?.(0.45, 'audio derecho');
  const right = await envelopeOf(fileRight, maxBytes);
  throwIfAborted(signal);
  onProgress?.(0.9, 'comparando');
  // Se envían copias: las huellas originales quedan guardadas para reintentos.
  const result = await runTask('offset', { left: left.slice(), right: right.slice() }, { signal });
  onProgress?.(1, 'listo');
  return result;
}
