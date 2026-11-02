/**
 * depth.worker.js — Worker persistente para la profundidad con IA.
 *
 * Se mantiene vivo entre fotos para no recargar el modelo. Protocolo:
 *   worker → { kind: 'ready' }
 *   main   → { id, image: { data, width, height } }
 *   worker → { id, kind: 'progress', value, stage } … { id, kind: 'result', value } | { id, kind: 'error', message }
 * Cancelar = terminar el Worker (depthEstimate.js crea otro la próxima vez).
 */
import { runDepth } from './depthPipeline.js';

self.addEventListener('message', async ({ data }) => {
  const { id, image } = data;
  try {
    const value = await runDepth(image, {
      onProgress: (fraction, stage) => self.postMessage({ id, kind: 'progress', value: fraction, stage }),
    });
    self.postMessage({ id, kind: 'result', value }, [value.data.buffer]);
  } catch (error) {
    self.postMessage({ id, kind: 'error', message: error?.message ?? String(error) });
  }
});

self.postMessage({ kind: 'ready' });
