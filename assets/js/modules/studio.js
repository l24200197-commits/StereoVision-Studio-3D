/**
 * studio.js — Controlador del Studio: reglas de negocio de la sesión.
 *
 * Responsabilidad: coordinar módulo elegido, archivo activo, calibración y
 * liberación de recursos.
 *   RN-01  no se importa nada sin módulo elegido.
 *   RN-04  un archivo inválido produce un mensaje y el Studio sigue operando.
 *   RN-05  solo hay un archivo activo; al importar otro se libera el anterior.
 *   RN-08  cada archivo nuevo empieza con la calibración predeterminada.
 *   RN-09  los ajustes cambian la vista al instante, sin reimportar.
 *   RN-10  restablecer vuelve a los valores iniciales del módulo.
 *
 * Al importar una imagen se reconoce qué trae (anaglifo, par SBS o foto normal)
 * y se elige el «Tipo de foto»: así una foto que no es anaglifo se convierte en
 * anaglifo, y una foto normal en SBS para las gafas.
 */
import { STATUS } from './store.js';
import { defaultParams, controlOf } from './calibration.js';
import { analyzeStereo } from './stereoDetect.js';
import { ImportError, validateFile, loadImage, loadVideo, extensionOf } from './fileImport.js';
import { anaglyphModule } from './anaglyph.js';
import { sbsImageModule } from './sbsImage.js';
import { sbsVideoModule } from './sbsVideo.js';

export const MODULES = Object.freeze({
  [anaglyphModule.id]: anaglyphModule,
  [sbsImageModule.id]: sbsImageModule,
  [sbsVideoModule.id]: sbsVideoModule,
});

/** Muestras incluidas (rutas relativas: funcionan bajo el subdirectorio de GitHub Pages). */
const SAMPLES = Object.freeze({
  anaglyph: { url: './assets/media/anaglifo_muestra.jpg', name: 'anaglifo_muestra.jpg', type: 'image/jpeg' },
  'sbs-image': { url: './assets/media/sbs_muestra.jpg', name: 'sbs_muestra.jpg', type: 'image/jpeg' },
  'sbs-video': { url: './assets/media/sbs_muestra.mp4', name: 'sbs_muestra.mp4', type: 'video/mp4' },
});

export function createStudio({ store, view, ui, calibration }) {
  let active = null; // { module, content, controller }
  let token = 0; // invalida importaciones que quedaron atrasadas

  /* ---------- Calibración ---------- */
  function pushParamsToView() {
    const { module, params } = store.get();
    if (module) view.setParams(MODULES[module].toViewParams(params));
    view.requestRender();
  }

  function setParam(key, value) {
    const state = store.get();
    if (!active || !(key in state.params)) return;
    const params = { ...state.params, [key]: value };
    store.set({ params });
    calibration.sync(params);
    pushParamsToView();
  }

  function resetParams() {
    const state = store.get();
    if (!active) return;
    const params = defaultParams(state.module);
    store.set({ params, message: { kind: 'ok', text: 'Calibración restablecida a los valores iniciales.' } });
    calibration.sync(params);
    pushParamsToView();
  }

  /**
   * Elige el «Tipo de foto» según lo que trae la imagen y explica la decisión.
   * Si la detección falla, el usuario la corrige en el panel.
   */
  function detectSource(moduleId, content) {
    let result;
    try {
      result = analyzeStereo(content.source);
    } catch (error) {
      console.warn('[StereoVision] No se pudo analizar la imagen:', error);
      return null;
    }
    const fix = 'Si no es así, cámbialo en «Tipo de foto».';
    if (moduleId === 'anaglyph') {
      if (result.anaglyph) return { source: 'original', text: `Es un anaglifo: ponte los lentes rojo-cian y ajusta zoom, brillo y contraste. ${fix}` };
      if (result.sbs) return { source: 'sbs', text: `No es un anaglifo, pero trae dos vistas lado a lado: el Studio creó el anaglifo con ellas (3D real). Ajusta el desplazamiento hasta que se vea cómodo. ${fix}` };
      return { source: '2d', text: `No es un anaglifo: el Studio lo creó con un relieve simulado. Ponte los lentes rojo-cian y ajusta «Profundidad simulada» y el zoom. ${fix}` };
    }
    if (result.sbs) return { source: 'sbs', text: `Imagen SBS lista. Para las gafas, pulsa «Entrar al modo VR» y calibra los lentes. ${fix}` };
    return { source: '2d', text: `Esta foto no trae dos vistas: el Studio creó el par SBS con un relieve simulado. Ajusta «Profundidad simulada» y entra al modo VR. ${fix}` };
  }

  /* ---------- Encuadre con gestos (zoom y mover) ---------- */
  function zoomBy(factor) {
    const state = store.get();
    const control = state.module && controlOf(state.module, 'scale');
    if (!active || !control) return;
    const next = Math.min(control.max, Math.max(control.min, Math.round(state.params.scale * factor)));
    if (next !== state.params.scale) setParam('scale', next);
  }

  function panBy(dx, dy) {
    const { params } = store.get();
    if (!active) return;
    const clamp = (v) => Math.min(1, Math.max(-1, v));
    setParam('panX', clamp(params.panX + dx));
    setParam('panY', clamp(params.panY + dy));
  }

  function recenter() {
    const state = store.get();
    if (!active) return;
    const params = { ...state.params, panX: 0, panY: 0, scale: controlOf(state.module, 'scale').def };
    store.set({ params });
    calibration.sync(params);
    pushParamsToView();
  }

  /* ---------- Descarga del resultado ---------- */
  async function downloadResult() {
    const state = store.get();
    if (!active || active.module.kind !== 'image') return;
    try {
      const blob = await view.exportImage();
      const base = (state.file?.name ?? 'imagen').replace(/\.[^.]+$/, '');
      const suffix = state.module === 'anaglyph' ? 'anaglifo' : 'sbs';
      const outcome = await saveBlob(blob, `${base}_${suffix}.jpg`);
      if (outcome !== 'cancelled') {
        store.set({ message: { kind: 'ok', text: `Se generó «${base}_${suffix}.jpg» con tu calibración. El archivo original no cambió.` } });
      }
    } catch (error) {
      console.warn('[StereoVision] No se pudo exportar:', error);
      store.set({ message: { kind: 'error', text: 'No se pudo generar la imagen para descargar. Prueba con una imagen más pequeña.' } });
    }
  }

  /* ---------- Liberación de recursos (RN-05) ---------- */
  function releaseActive() {
    if (active) {
      active.controller.deactivate(); // quita escuchas y pausa el video
      view.clearContent(); // libera la textura de la GPU
      active.content.release(); // libera el video / la imagen y la URL temporal
      active = null;
    } else {
      view.clearContent();
    }
  }

  /* ---------- Módulos ---------- */
  function selectModule(id) {
    const state = store.get();
    if (!MODULES[id] || id === state.module || state.status === STATUS.LOADING) return;
    token += 1;
    releaseActive();

    const params = defaultParams(id);
    calibration.build(id, params);
    store.set({
      module: id,
      status: STATUS.EMPTY,
      file: null,
      pending: null,
      params,
      message: { kind: 'info', text: `Módulo «${MODULES[id].label}» elegido. Ahora importa un archivo o carga la muestra incluida.` },
    });
    pushParamsToView();
  }

  /* ---------- Importación ---------- */
  function fileInfo(file, content, sample) {
    const ext = extensionOf(file.name);
    return {
      name: file.name,
      format: (ext || file.type || 'desconocido').toUpperCase(),
      size: file.size,
      width: content.width,
      height: content.height,
      duration: content.kind === 'video' ? content.duration : null,
      sample,
    };
  }

  function describeError(error) {
    if (error instanceof ImportError) return error.message;
    console.warn('[StereoVision] Error inesperado al importar:', error);
    return 'Ocurrió un problema inesperado al abrir el archivo. El Studio sigue funcionando: prueba con otro archivo.';
  }

  /**
   * Flujo común de importación. `produce` devuelve { file, content, sample }.
   * Primero se libera lo anterior (así no conviven dos medios) y se pasa a
   * «cargando»; si algo falla se queda en «error» con una guía para continuar.
   */
  async function runImport(label, produce) {
    const state = store.get();
    if (!state.module || state.status === STATUS.LOADING) return;
    const module = MODULES[state.module];
    const mine = ++token;

    releaseActive();
    store.set({
      status: STATUS.LOADING,
      file: null,
      pending: label,
      params: defaultParams(module.id), // RN-08
      message: { kind: 'info', text: `Preparando «${label}»…` },
    });
    calibration.sync(store.get().params);

    let content = null;
    try {
      const produced = await produce(module);
      content = produced.content;
      if (mine !== token) { // llegó tarde: otro cambio ocurrió mientras tanto
        content.release();
        return;
      }
      if (Math.max(content.width, content.height) > view.maxTextureSize) {
        throw new ImportError(
          `«${produced.file.name}» mide ${content.width} × ${content.height} px y este dispositivo admite hasta ${view.maxTextureSize} px por lado. Reduce su tamaño e impórtalo de nuevo.`,
          'too-large',
        );
      }

      const detected = module.kind === 'image' ? detectSource(module.id, content) : null;
      if (detected) {
        const params = { ...store.get().params, source: detected.source };
        store.set({ params });
        calibration.sync(params);
      }

      pushParamsToView();
      const controller = module.activate({ content, view, store, ui });
      active = { module, content, controller };
      store.set({
        status: controller.getStatus(),
        file: fileInfo(produced.file, content, produced.sample),
        pending: null,
        message: {
          kind: 'ok',
          text: module.kind === 'video'
            ? `«${produced.file.name}» está listo. Pulsa Reproducir para iniciar.`
            : detected?.text ?? `«${produced.file.name}» cargado. Ajusta la vista en «Calibra».`,
        },
      });
    } catch (error) {
      content?.release();
      if (mine !== token) return;
      releaseActive();
      store.set({ status: STATUS.ERROR, file: null, pending: null, message: { kind: 'error', text: describeError(error) } });
    }
  }

  function importFile(file) {
    const state = store.get();
    if (!state.module) {
      store.set({
        message: { kind: 'error', text: 'Primero elige un módulo (Anaglifo, Imagen SBS o Video SBS) y después importa el archivo.' },
      });
      return Promise.resolve();
    }
    return runImport(file?.name ?? 'archivo', async (module) => {
      validateFile(file, module.kind);
      const content = module.kind === 'image' ? await loadImage(file) : await loadVideo(file, ui.videoHolder);
      return { file, content, sample: false };
    });
  }

  function loadSample() {
    const state = store.get();
    const sample = SAMPLES[state.module];
    if (!sample) return Promise.resolve();
    return runImport(sample.name, async (module) => {
      let blob;
      try {
        const response = await fetch(sample.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        blob = await response.blob();
      } catch {
        throw new ImportError('No se pudo cargar la muestra incluida. Revisa tu conexión o importa un archivo propio.', 'sample');
      }
      const file = new File([blob], sample.name, { type: sample.type });
      validateFile(file, module.kind);
      const content = module.kind === 'image' ? await loadImage(file) : await loadVideo(file, ui.videoHolder);
      return { file, content, sample: true };
    });
  }

  /** Quita el archivo activo y deja el módulo listo para otra importación. */
  function clearFile() {
    if (store.get().status === STATUS.LOADING) return;
    token += 1;
    releaseActive();
    const module = store.get().module;
    const params = module ? defaultParams(module) : {};
    calibration.sync(params);
    store.set({
      status: STATUS.EMPTY,
      file: null,
      pending: null,
      params,
      message: { kind: 'info', text: 'Archivo quitado. Importa otro para continuar.' },
    });
  }

  /* ---------- Reproducción (usada por el botón del visor VR) ---------- */
  function togglePlayback() {
    return active?.controller.toggle?.();
  }

  return {
    zoomBy,
    panBy,
    recenter,
    downloadResult,
    hasContent: () => Boolean(active),
    selectModule,
    importFile,
    loadSample,
    clearFile,
    setParam,
    resetParams,
    togglePlayback,
    /** Solo para depuración (?debug) y pruebas. */
    inspect: () => ({ active: Boolean(active), token, memory: view.memory }),
  };
}

/** En el teléfono abre «Compartir» (permite «Guardar imagen»); si no, descarga. */
async function saveBlob(blob, fileName) {
  const file = new File([blob], fileName, { type: 'image/jpeg' });
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return 'downloaded';
}
