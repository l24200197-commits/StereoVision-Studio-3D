/**
 * analysis.worker.js — Worker de módulo para sincronía y alineación.
 *
 * Protocolo (ver tasks.js):
 *   worker → { kind: 'ready' }                 al cargar
 *   main   → { type, payload }                 una tarea por Worker
 *   worker → { kind: 'progress', value }       0…1, opcional
 *   worker → { kind: 'result', value } | { kind: 'error', message, name }
 * Cancelar = terminar el Worker desde el hilo principal.
 */
import { HANDLERS, transferablesOf } from './handlers.js';

self.addEventListener('message', async ({ data }) => {
  const handler = HANDLERS[data?.type];
  if (!handler) {
    self.postMessage({ kind: 'error', message: `Tarea desconocida: ${data?.type}`, name: 'TypeError' });
    return;
  }
  try {
    const value = await handler(data.payload, {
      onProgress: (fraction) => self.postMessage({ kind: 'progress', value: fraction }),
    });
    self.postMessage({ kind: 'result', value }, transferablesOf(value));
  } catch (error) {
    self.postMessage({ kind: 'error', message: error?.message ?? String(error), name: error?.name ?? 'Error' });
  }
});

self.postMessage({ kind: 'ready' });
