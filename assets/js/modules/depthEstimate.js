/**
 * depthEstimate.js — Profundidad estimada de una foto normal, en el dispositivo.
 *
 * Es una ESTIMACIÓN: un modelo de IA (Depth Anything V2, ver
 * workers/depthPipeline.js) deduce qué está cerca y qué lejos a partir de una
 * sola foto. No recupera la geometría real de la escena; puede equivocarse en
 * reflejos, cristales, cielos o figuras planas.
 *
 * La inferencia corre en un Worker persistente para no congelar la interfaz
 * (tarda segundos en un teléfono); si el navegador no admite Workers de módulo,
 * corre en el hilo principal. Al Worker solo se le pasa una copia reducida de
 * los píxeles; la foto no sale del dispositivo.
 */
import { abortError, throwIfAborted } from './tasks.js';

const WORKER_URL = new URL('../workers/depth.worker.js', import.meta.url);
const DEFAULT_INPUT_PX = 640; // lado mayor de la copia que se analiza

let worker = null; // { instance, ready: Promise<void> }
let workerUnavailable = typeof Worker === 'undefined';
let nextId = 1;

/** Copia reducida de la imagen en RGBA. */
function rasterize(image, maxSide) {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const k = Math.min(1, maxSide / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * k));
  const height = Math.max(1, Math.round(srcH * k));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data, width, height };
}

function startWorker() {
  const instance = new Worker(WORKER_URL, { type: 'module' });
  const ready = new Promise((resolve, reject) => {
    const onMessage = ({ data }) => {
      if (data.kind !== 'ready') return;
      instance.removeEventListener('message', onMessage);
      instance.removeEventListener('error', onError);
      resolve();
    };
    const onError = (event) => {
      event.preventDefault();
      reject(Object.assign(new Error('Worker no disponible'), { code: 'worker-unavailable' }));
    };
    instance.addEventListener('message', onMessage);
    instance.addEventListener('error', onError);
  });
  return { instance, ready };
}

function stopWorker() {
  worker?.instance.terminate();
  worker = null;
}

async function viaWorker(image, { onProgress, signal }) {
  worker ??= startWorker();
  const current = worker;
  try {
    await current.ready;
  } catch (error) {
    stopWorker();
    throw error;
  }
  throwIfAborted(signal);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      current.instance.removeEventListener('message', onMessage);
      current.instance.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.kind === 'progress') onProgress?.(data.value, data.stage);
      else if (data.kind === 'result') { cleanup(); resolve(data.value); }
      else if (data.kind === 'error') { cleanup(); reject(new Error(data.message)); }
    };
    const onError = (event) => {
      event.preventDefault();
      cleanup();
      stopWorker();
      reject(new Error(event.message || 'El cálculo de profundidad se detuvo.'));
    };
    // Cancelar detiene de verdad la descarga o la inferencia en curso.
    const onAbort = () => {
      cleanup();
      if (worker === current) stopWorker();
      reject(abortError());
    };
    current.instance.addEventListener('message', onMessage);
    current.instance.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    current.instance.postMessage({ id, image }, [image.data.buffer]);
  });
}

/**
 * @param image    HTMLImageElement ya decodificada
 * @param options  { onProgress(fraction, stage: 'download' | 'infer'), signal, inputPx }
 * @returns { data: Uint8Array, width, height, plane }  data va de arriba hacia abajo
 */
export async function estimateDepth(image, { onProgress, signal, inputPx = DEFAULT_INPUT_PX } = {}) {
  throwIfAborted(signal);
  if (!workerUnavailable) {
    try {
      return await viaWorker(rasterize(image, inputPx), { onProgress, signal });
    } catch (error) {
      if (error.code !== 'worker-unavailable') throw error;
      workerUnavailable = true;
    }
  }
  const { runDepth } = await import('../workers/depthPipeline.js');
  const result = await runDepth(rasterize(image, inputPx), { onProgress });
  throwIfAborted(signal);
  return result;
}
