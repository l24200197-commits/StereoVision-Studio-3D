/**
 * tasks.js — Ejecuta cálculos intensivos en un Worker, con progreso y cancelación.
 *
 * Cada tarea usa un Worker propio: cancelar lo termina en el acto (no espera a
 * que el cálculo acabe) y no deja estado a medias. Los datos solo se envían
 * cuando el Worker confirma que cargó; así, si el navegador no admite Workers
 * de módulo, la misma tarea corre en el hilo principal con los datos intactos.
 */
const WORKER_URL = new URL('../workers/analysis.worker.js', import.meta.url);

let workersUnavailable = typeof Worker === 'undefined';

export function abortError() {
  return new DOMException('Operación cancelada.', 'AbortError');
}

export const isAbort = (error) => error?.name === 'AbortError';

/** Lanza AbortError si la señal ya se canceló. */
export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

async function runInline(type, payload, { signal, onProgress }) {
  const { HANDLERS } = await import('../workers/handlers.js');
  throwIfAborted(signal);
  const result = await HANDLERS[type](payload, { onProgress, shouldStop: () => Boolean(signal?.aborted) });
  throwIfAborted(signal);
  return result;
}

/**
 * @param type     nombre de la tarea (ver workers/handlers.js)
 * @param payload  datos de entrada
 * @param options  { signal, onProgress(fraction), transfer: ArrayBuffer[] }
 */
export function runTask(type, payload, { signal, onProgress, transfer = [] } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (workersUnavailable) return runInline(type, payload, { signal, onProgress });

  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(WORKER_URL, { type: 'module' });
    } catch {
      workersUnavailable = true;
      runInline(type, payload, { signal, onProgress }).then(resolve, reject);
      return;
    }
    let ready = false;
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.addEventListener('message', ({ data }) => {
      if (data.kind === 'ready') {
        ready = true;
        worker.postMessage({ type, payload }, transfer);
      } else if (data.kind === 'progress') {
        onProgress?.(data.value);
      } else if (data.kind === 'result') {
        finish();
        resolve(data.value);
      } else if (data.kind === 'error') {
        finish();
        reject(Object.assign(new Error(data.message), { name: data.name }));
      }
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      finish();
      if (ready) {
        reject(new Error(event.message || 'Falló el cálculo en segundo plano.'));
        return;
      }
      // El Worker ni siquiera cargó (navegador sin Workers de módulo): se calcula aquí.
      workersUnavailable = true;
      runInline(type, payload, { signal, onProgress }).then(resolve, reject);
    });
  });
}
