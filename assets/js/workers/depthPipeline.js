/**
 * depthPipeline.js — Depth Anything V2 (small, cuantizado q8) con transformers.js.
 *
 * Lo usa depth.worker.js y, si el navegador no admite Workers de módulo, el
 * hilo principal. Solo se DESCARGA el modelo (≈27 MB, desde Hugging Face, una
 * vez; el navegador lo guarda en caché). La foto nunca se envía: la inferencia
 * corre aquí, en WebAssembly, sobre los píxeles que se le pasan.
 */
import { finishDepthMap } from '../core/depthPost.js';

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1/dist/transformers.min.js';
export const MODEL_ID = 'onnx-community/depth-anything-v2-small';

let libraryPromise = null;
let pipelinePromise = null;

function loadLibrary() {
  libraryPromise ??= import(TRANSFORMERS_URL).catch((error) => {
    libraryPromise = null;
    throw error;
  });
  return libraryPromise;
}

/** Progreso de descarga sumando todos los archivos del modelo (no solo el último). */
function downloadTracker(onProgress) {
  const files = new Map();
  return (event) => {
    if (event.status !== 'progress' || !event.total) return;
    files.set(event.file, [event.loaded, event.total]);
    let loaded = 0;
    let total = 0;
    for (const [l, t] of files.values()) { loaded += l; total += t; }
    onProgress?.(loaded / total, 'download');
  };
}

function loadPipeline(onProgress) {
  pipelinePromise ??= (async () => {
    const { pipeline, env } = await loadLibrary();
    env.allowLocalModels = false;
    return pipeline('depth-estimation', MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: downloadTracker(onProgress),
    });
  })().catch((error) => {
    pipelinePromise = null; // permite reintentar más tarde
    throw error;
  });
  return pipelinePromise;
}

/**
 * @param image { data: Uint8ClampedArray RGBA, width, height }
 * @returns { data: Uint8Array, width, height, plane } con filas de arriba hacia abajo
 */
export async function runDepth(image, { onProgress } = {}) {
  const pipe = await loadPipeline(onProgress);
  const { RawImage } = await loadLibrary();
  onProgress?.(1, 'infer');
  const { depth } = await pipe(new RawImage(image.data, image.width, image.height, 4));
  const gray = depth.channels === 1 ? depth : depth.grayscale();
  return finishDepthMap(new Uint8Array(gray.data), gray.width, gray.height);
}
