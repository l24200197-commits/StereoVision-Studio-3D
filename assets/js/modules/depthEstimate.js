/**
 * depthEstimate.js — Profundidad real de una foto normal, calculada en el dispositivo.
 *
 * Usa Depth Anything V2 (small, cuantizado, ≈27 MB) con transformers.js. El
 * modelo se descarga una sola vez desde Hugging Face y el navegador lo guarda en
 * caché; la foto NUNCA sale del dispositivo: la inferencia corre aquí (WASM).
 *
 * Devuelve un mapa en escala de grises (blanco = cerca) y el plano de pantalla
 * sugerido: lo que está más cerca que ese plano sale de la pantalla.
 * Si algo falla (sin internet, navegador viejo), quien llama usa el relieve
 * aproximado del shader.
 */
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1/dist/transformers.min.js';
const MODEL_ID = 'onnx-community/depth-anything-v2-small';
const INPUT_MAX = 640; // lado mayor de la copia que se analiza

let pipelinePromise = null;

function loadPipeline(onProgress) {
  pipelinePromise ??= (async () => {
    const { pipeline, env } = await import(TRANSFORMERS_URL);
    env.allowLocalModels = false;
    return pipeline('depth-estimation', MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (event) => {
        if (event.status === 'progress' && event.total) onProgress?.(event.loaded / event.total);
      },
    });
  })().catch((error) => {
    pipelinePromise = null; // permite reintentar más tarde
    throw error;
  });
  return pipelinePromise;
}

/**
 * @param image  HTMLImageElement ya decodificada
 * @returns { data: Uint8Array, width, height, plane }  data va de arriba hacia abajo
 */
export async function estimateDepth(image, { onProgress } = {}) {
  const pipe = await loadPipeline(onProgress);
  const { RawImage } = await import(TRANSFORMERS_URL);

  const srcW = image.naturalWidth;
  const srcH = image.naturalHeight;
  const k = Math.min(1, INPUT_MAX / Math.max(srcW, srcH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * k);
  canvas.height = Math.round(srcH * k);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

  const { depth } = await pipe(RawImage.fromCanvas(canvas));
  const gray = depth.channels === 1 ? depth : depth.grayscale();
  // Se suaviza un poco el mapa: los bordes duros del sujeto rompen la imagen al desplazarla.
  const data = smooth(new Uint8Array(gray.data), gray.width, gray.height, 3);

  // Plano de pantalla: la profundidad media (percentil 50), así el
  // sujeto sale hacia el espectador y el fondo queda detrás.
  const histogram = new Uint32Array(256);
  for (const value of data) histogram[value] += 1;
  let seen = 0;
  let plane = 0.35;
  for (let v = 0; v < 256; v += 1) {
    seen += histogram[v];
    if (seen >= data.length * 0.5) { plane = v / 255; break; }
  }
  return { data, width: gray.width, height: gray.height, plane };
}

/** Desenfoque de caja separable (dos pasadas) de radio r. */
function smooth(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0; let n = 0;
      for (let d = -r; d <= r; d += 1) {
        const xx = x + d;
        if (xx >= 0 && xx < w) { sum += src[y * w + xx]; n += 1; }
      }
      tmp[y * w + x] = sum / n;
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
