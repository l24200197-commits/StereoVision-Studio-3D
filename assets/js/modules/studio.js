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
 *
 * En Video se pueden importar dos videos (uno por ojo, p. ej. de dos teléfonos):
 * se sincronizan con su audio y se igualan tamaño y encuadre automáticamente.
 */
import { STATUS } from './store.js';
import { defaultParams, controlOf } from './calibration.js';
import { analyzeStereo } from './stereoDetect.js';
import { estimateDepth } from './depthEstimate.js';
import { estimateAudioOffset } from './audioSync.js';
import { estimateAlignment } from './alignPair.js';
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
    if (key === 'autoPair') {
      runPairAuto();
      return;
    }
    if (!active || !(key in state.params)) return;
    setParams({ [key]: value });
    if (key === 'source' && value === '2d') ensureDepth();
  }

  /** Cambia varios parámetros a la vez y avisa al visor y al módulo activo. */
  function setParams(patch) {
    const params = { ...store.get().params, ...patch };
    store.set({ params });
    calibration.sync(params);
    pushParamsToView();
    for (const key of Object.keys(patch)) active?.controller.onParams?.(key);
  }

  /* ---------- Dos videos: sincronía por audio y alineación por imagen ---------- */
  /**
   * Zona del cuadro (0…1) que cubren LOS DOS videos ya igualados. Se recorta a
   * ella, conservando la proporción, para que ningún ojo vea bordes negros que
   * el otro no ve. Devuelve el recorte { frameX, frameY, frameW } (frameW = alto
   * y ancho relativos).
   */
  function sharedFrame(content, scale, ox, oy) {
    const fw = (content.width / content.height) / (content.right.width / content.right.height) / scale;
    const fh = 1 / scale;
    const cx = 0.5 - fw / 2 + ox;
    const cy = 0.5 - fh / 2 + oy;
    const u0 = Math.max(0, -cx / fw);
    const u1 = Math.min(1, (1 - cx) / fw);
    const v0 = Math.max(0, -cy / fh);
    const v1 = Math.min(1, (1 - cy) / fh);
    const size = Math.max(0.5, Math.min(1, u1 - u0, v1 - v0)); // nunca recorta más de la mitad
    const place = (lo, hi) => Math.min(Math.max((lo + hi) / 2 - size / 2, 0), 1 - size);
    return { frameX: place(u0, u1), frameY: place(v0, v1), frameW: size };
  }

  async function runPairAuto() {
    const current = active;
    if (!current?.content.right || current.pairBusy) return;
    current.pairBusy = true;
    const say = (kind, text) => active === current && store.set({ message: { kind, text } });
    const seconds = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} s`;
    current.controller.pause();

    try {
      say('info', 'Uniendo los dos videos: buscando la sincronía con el audio…');
      let syncNote;
      let offset = store.get().params.sync ?? 0;
      try {
        const result = await estimateAudioOffset(current.files[0], current.files[1]);
        offset = Math.min(10, Math.max(-10, Math.round(result.offset * 50) / 50));
        syncNote = result.confident
          ? `sincronizados por audio (el derecho va ${seconds(offset)})`
          : `sincronía dudosa (${seconds(offset)}): afínala con «Sincronía»`;
      } catch (error) {
        console.warn('[StereoVision] Sin sincronía por audio:', error);
        syncNote = 'no se pudo leer el audio: ajusta «Sincronía» a mano con un aplauso o un movimiento rápido';
      }
      if (active !== current) return;
      setParams({ sync: offset });

      say('info', 'Igualando el tamaño y el encuadre de los dos videos…');
      let alignNote;
      try {
        const align = await estimateAlignment(current.content.source, current.content.right.source, offset);
        if (active !== current) return;
        if (align.confident) {
          const sizeR = Math.min(160, Math.max(60, Math.round(align.scale * 100)));
          const frame = sharedFrame(current.content, sizeR / 100, align.ox, align.oy);
          setParams({ sizeR, rightX: align.ox, rightY: align.oy, ...frame });
          alignNote = `tamaño igualado (derecho al ${sizeR} %)`;
          if (frame.frameW < 0.995) alignNote += `; se recortó al cuadro que ven las dos cámaras (${Math.round(100 / frame.frameW)} %) para que no haya bordes negros`;
        } else {
          alignNote = 'no se encontró el mismo encuadre: ajusta «Tamaño del video derecho»';
        }
      } catch (error) {
        console.warn('[StereoVision] Sin alineación automática:', error);
        alignNote = 'ajusta «Tamaño del video derecho» a mano';
      }
      if (active !== current) return;
      const { sync, sizeR, rightX, rightY, frameX, frameY, frameW } = store.get().params;
      current.pairAuto = { sync, sizeR, rightX, rightY, frameX, frameY, frameW };
      say('ok', `Videos unidos: ${syncNote}; ${alignNote}. Pulsa Reproducir y entra al modo VR.`);
    } finally {
      current.pairBusy = false;
    }
  }

  /* ---------- Profundidad real para fotos normales ---------- */
  /**
   * Calcula (una vez por foto) el mapa de profundidad con IA en el dispositivo.
   * Mientras tanto se ve el relieve aproximado; si falla, se queda ese.
   */
  async function ensureDepth() {
    const current = active;
    if (!current || current.module.kind !== 'image' || current.depth) return;
    if (current.depthPending) return;
    current.depthPending = true;
    const say = (kind, text) => active === current && store.set({ message: { kind, text } });
    say('info', 'Calculando la profundidad real de la foto con IA, en tu dispositivo… (la primera vez se descarga el modelo, ≈27 MB)');
    let lastShown = -1;
    try {
      const map = await estimateDepth(current.content.source, {
        onProgress: (fraction) => {
          const pct = Math.round(fraction * 100);
          if (pct >= lastShown + 10) {
            lastShown = pct;
            say('info', `Descargando el modelo de profundidad: ${pct} % (solo la primera vez). Tu foto no sale del dispositivo.`);
          }
        },
      });
      if (active !== current) return;
      current.depth = map;
      view.setDepthMap(map);
      say('ok', 'Profundidad lista: el sujeto sale hacia ti y el fondo queda detrás. Ajusta «Profundidad» a tu gusto.');
    } catch (error) {
      console.warn('[StereoVision] Sin mapa de profundidad:', error);
      say('error', 'No se pudo calcular la profundidad real (revisa tu conexión la primera vez). Se usa un relieve aproximado; puedes reintentar eligiendo otra vez «Foto normal».');
    } finally {
      current.depthPending = false;
    }
  }

  function resetParams() {
    const state = store.get();
    if (!active) return;
    // Se conserva lo que trae el archivo (tipo de foto y la unión de dos videos).
    const params = { ...defaultParams(state.module), source: state.params.source, ...active.pairAuto };
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
      return { source: '2d', text: `No es un anaglifo: el Studio lo crea estimando la profundidad de la foto. Ponte los lentes rojo-cian y ajusta «Profundidad» y el zoom. ${fix}` };
    }
    if (result.sbs) return { source: 'sbs', text: `Imagen SBS lista. Para las gafas, pulsa «Entrar al modo VR» y calibra los lentes. ${fix}` };
    return { source: '2d', text: `Esta foto no trae dos vistas: el Studio crea el par SBS estimando su profundidad. Ajusta «Profundidad» y entra al modo VR. ${fix}` };
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
  function fileInfo(file, content, sample, files) {
    const ext = extensionOf(file.name);
    const pair = files?.length === 2 && content.right;
    return {
      name: pair ? `${files[0].name} (izq.) + ${files[1].name} (der.)` : file.name,
      format: (ext || file.type || 'desconocido').toUpperCase(),
      size: pair ? files[0].size + files[1].size : file.size,
      width: content.width,
      height: content.height,
      resolution: pair ? `${content.width} × ${content.height} + ${content.right.width} × ${content.right.height} px` : null,
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

      let detected = null;
      if (content.right) detected = { source: 'pair', text: null };
      else if (module.kind === 'image') detected = detectSource(module.id, content);
      else detected = await detectVideoSource(content);
      if (mine !== token) {
        content.release();
        return;
      }
      if (detected) {
        const params = { ...store.get().params, source: detected.source };
        store.set({ params });
        calibration.sync(params);
      }

      pushParamsToView();
      const controller = module.activate({ content, view, store, ui });
      active = { module, content, controller, files: produced.files ?? [produced.file] };
      if (detected?.source === '2d' && module.kind === 'image') queueMicrotask(ensureDepth);
      if (content.right) queueMicrotask(runPairAuto);
      store.set({
        status: controller.getStatus(),
        file: fileInfo(produced.file, content, produced.sample, produced.files),
        pending: null,
        message: {
          kind: 'ok',
          text: detected?.text ?? (module.kind === 'video'
            ? `«${produced.file.name}» está listo. Pulsa Reproducir para iniciar.`
            : `«${produced.file.name}» cargado. Ajusta la vista en «Calibra».`),
        },
      });
    } catch (error) {
      content?.release();
      if (mine !== token) return;
      releaseActive();
      store.set({ status: STATUS.ERROR, file: null, pending: null, message: { kind: 'error', text: describeError(error) } });
    }
  }

  /** Acepta un archivo o una lista; en Video, dos archivos se unen en un par. */
  function importFile(input) {
    const state = store.get();
    if (!state.module) {
      store.set({
        message: { kind: 'error', text: 'Primero elige un módulo (Anaglifo, Imagen SBS o Video SBS) y después importa el archivo.' },
      });
      return Promise.resolve();
    }
    const files = input instanceof File ? [input] : [...(input ?? [])];
    if (state.module === 'sbs-video' && files.length >= 2) return importPair(...orderPair(files[0], files[1]));
    const file = files[0];
    return runImport(file?.name ?? 'archivo', async (module) => {
      validateFile(file, module.kind);
      const content = module.kind === 'image' ? await loadImage(file) : await loadVideo(file, ui.videoHolder);
      return { file, content, sample: false };
    });
  }

  /**
   * Izquierda/derecha por el nombre del archivo («der», «right», «_R»…); si no lo
   * dice, el primero es el izquierdo. «Intercambiar ojos» lo corrige.
   */
  function orderPair(a, b) {
    const isRight = (f) => /(^|[\s_.-])(der|derecho|derecha|right|r)([\s_.-]|$)/i.test(f.name.replace(/\.[^.]+$/, ''));
    return isRight(a) && !isRight(b) ? [b, a] : [a, b];
  }

  function importPair(leftFile, rightFile) {
    return runImport(`${leftFile.name} + ${rightFile.name}`, async () => {
      validateFile(leftFile, 'video');
      validateFile(rightFile, 'video');
      const left = await loadVideo(leftFile, ui.videoHolder);
      let right;
      try {
        right = await loadVideo(rightFile, ui.videoHolder);
      } catch (error) {
        left.release();
        throw error;
      }
      const content = {
        kind: 'video',
        source: left.source,
        width: left.width,
        height: left.height,
        duration: left.duration,
        right: { source: right.source, width: right.width, height: right.height, duration: right.duration },
        release() {
          left.release();
          right.release();
        },
      };
      return { file: leftFile, files: [leftFile, rightFile], content, sample: false };
    });
  }

  /** Con un video ya cargado, agrega el del ojo derecho y los une. */
  function addRightVideo(file) {
    const current = active;
    if (!current || current.module.id !== 'sbs-video' || current.content.right) return Promise.resolve();
    return importPair(current.files[0], file);
  }

  /** ¿El video trae dos vistas? Se mira un cuadro cerca del inicio (el primero suele ser negro). */
  async function detectVideoSource(content) {
    const video = content.source;
    const seek = (time) => new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
      video.currentTime = time;
    });
    let result;
    try {
      await seek(Math.min(1, (content.duration || 0) / 3));
      result = analyzeStereo(video);
    } catch (error) {
      console.warn('[StereoVision] No se pudo analizar el video:', error);
      return null;
    } finally {
      await seek(0);
    }
    const fix = 'Si no es así, cámbialo en «Tipo de foto».';
    if (result.sbs) return { source: 'sbs', text: `Video SBS listo. Pulsa Reproducir y entra al modo VR. ${fix}` };
    return {
      source: '2d',
      text: `Este video no trae dos vistas: el Studio genera la del otro ojo. Para un 3D real, usa «Agregar video del ojo derecho» con un video grabado a la vez desde otro teléfono. ${fix}`,
    };
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
    addRightVideo,
    hasContent: () => Boolean(active),
    hasPair: () => Boolean(active?.content.right),
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
