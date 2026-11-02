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
 *
 * Trabajos largos (unir dos videos, estimar profundidad) corren fuera del hilo
 * principal, informan su avance en `state.task` y se pueden cancelar. Liberar
 * el archivo activo cancela su trabajo: nunca llega un resultado a otro archivo.
 */
import { STATUS } from './store.js';
import { defaultParams, controlOf } from './calibration.js';
import { analyzeStereo } from './stereoDetect.js';
import { estimateDepth } from './depthEstimate.js';
import { estimateAudioOffset } from './audioSync.js';
import { estimateAlignment } from './alignPair.js';
import { isAbort, throwIfAborted } from './tasks.js';
import { sharedFrame } from '../core/pairGeometry.js';
import { ImportError, validateFile, loadImage, loadVideo, extensionOf, tooLargeForGpu } from './fileImport.js';
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

/**
 * Izquierda/derecha por el nombre del archivo («der», «right», «_R»…); si no lo
 * dice, el primero es el izquierdo. «Intercambiar ojos» lo corrige.
 */
export function orderPair(a, b) {
  const isRight = (f) => /(^|[\s_.-])(der|derecho|derecha|right|r)([\s_.-]|$)/i.test(f.name.replace(/\.[^.]+$/, ''));
  return isRight(a) && !isRight(b) ? [b, a] : [a, b];
}

const SYNC_LIMIT = 30; // s; igual que el rango de «Sincronía» y la búsqueda por audio

/**
 * @param getProfile () => perfil de calidad vigente (core/deviceProfile.js)
 */
export function createStudio({ store, view, ui, calibration, getProfile }) {
  let active = null; // { module, content, controller, files, ... }
  let token = 0; // invalida importaciones que quedaron atrasadas
  let job = null; // { kind, controller } trabajo largo en curso

  /* ---------- Trabajos largos: progreso y cancelación ---------- */
  /**
   * @param onCancel  aviso que se muestra EN EL ACTO si el usuario cancela (el
   *                  cálculo en curso puede tardar un instante en detenerse).
   */
  function startJob(kind, label, onCancel) {
    abortJob();
    const controller = new AbortController();
    job = { kind, controller, onCancel };
    store.set({ task: { kind, label, progress: null } });
    return controller.signal;
  }

  /** Avance 0…1 (o null si no se puede medir); se pinta solo si cambia al menos un 1 %. */
  function reportJob(signal, progress, label) {
    if (job?.controller.signal !== signal) return;
    const task = store.get().task;
    const rounded = progress == null ? null : Math.round(progress * 100) / 100;
    if (task && task.progress === rounded && (label == null || task.label === label)) return;
    store.set({ task: { ...task, progress: rounded, label: label ?? task?.label } });
  }

  function endJob(signal) {
    if (job?.controller.signal !== signal) return;
    job = null;
    store.set({ task: null });
  }

  /** Detiene el trabajo en curso sin avisar (al cambiar de archivo o de módulo). */
  function abortJob() {
    if (!job) return null;
    const stopped = job;
    job = null;
    store.set({ task: null });
    stopped.controller.abort();
    return stopped;
  }

  /** Cancelación pedida por el usuario: se detiene y se confirma de inmediato. */
  function cancelTask() {
    abortJob()?.onCancel?.();
  }

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

  /** Mensaje del archivo activo (los de un archivo ya quitado se descartan). */
  function sayFor(owner, kind, text, action) {
    if (active === owner) store.set({ message: { kind, text, action } });
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
  async function runPairAuto() {
    const current = active;
    if (!current?.content.right || (current.pairJob && !current.pairJob.aborted)) return;
    const profile = getProfile();
    const seconds = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} s`;
    current.controller.pause();
    const signal = startJob('pair', 'Sincronizando los dos videos por su audio…', () => {
      sayFor(current, 'info', 'Unión automática cancelada. Ajusta «Sincronía» y «Tamaño del video derecho» a mano, o vuelve a intentarlo.', {
        label: 'Reintentar',
        run: runPairAuto,
      });
    });
    current.pairJob = signal; // una cancelación libera el turno al instante: «Reintentar» no espera al cálculo viejo

    try {
      let syncNote;
      let offset = store.get().params.sync ?? 0;
      try {
        const result = await estimateAudioOffset(current.files[0], current.files[1], {
          signal,
          maxBytes: profile.tier === 'saver' ? 400 * 1048576 : 1024 * 1048576,
          onProgress: (fraction, stage) => reportJob(signal, fraction * 0.5, `Sincronizando por audio: ${stage}…`),
        });
        offset = Math.min(SYNC_LIMIT, Math.max(-SYNC_LIMIT, Math.round(result.offset * 50) / 50));
        syncNote = result.confident
          ? `sincronizados por audio (el derecho va ${seconds(offset)})`
          : `sincronía dudosa (${seconds(offset)}): afínala con «Sincronía»`;
      } catch (error) {
        if (isAbort(error)) throw error;
        console.warn('[StereoVision] Sin sincronía por audio:', error);
        syncNote = error.code === 'too-large'
          ? 'los videos son demasiado grandes para analizar su audio aquí: ajusta «Sincronía» a mano con un aplauso o un movimiento rápido'
          : 'no se pudo leer el audio: ajusta «Sincronía» a mano con un aplauso o un movimiento rápido';
      }
      throwIfAborted(signal);
      if (active !== current) return;
      setParams({ sync: offset });

      let alignNote;
      try {
        const align = await estimateAlignment(current.content.source, current.content.right.source, offset, {
          signal,
          frames: profile.analysisThumbs,
          onProgress: (fraction) => reportJob(signal, 0.5 + fraction * 0.5, 'Igualando el tamaño y el encuadre de los dos videos…'),
        });
        throwIfAborted(signal);
        if (active !== current) return;
        if (align.confident) {
          const sizeR = Math.min(160, Math.max(60, Math.round(align.scale * 100)));
          const { content } = current;
          const frame = sharedFrame(content.width / content.height, content.right.width / content.right.height, sizeR / 100, align.ox, align.oy);
          setParams({ sizeR, rightX: align.ox, rightY: align.oy, ...frame });
          alignNote = `tamaño igualado (derecho al ${sizeR} %)`;
          if (frame.frameW < 0.995) alignNote += `; se recortó al cuadro que ven las dos cámaras (${Math.round(100 / frame.frameW)} %) para que no haya bordes negros`;
        } else {
          alignNote = 'no se encontró con seguridad el mismo encuadre: ajusta «Tamaño del video derecho»';
        }
      } catch (error) {
        if (isAbort(error)) throw error;
        console.warn('[StereoVision] Sin alineación automática:', error);
        alignNote = 'ajusta «Tamaño del video derecho» a mano';
      }
      if (active !== current) return;
      const { sync, sizeR, rightX, rightY, frameX, frameY, frameW } = store.get().params;
      current.pairAuto = { sync, sizeR, rightX, rightY, frameX, frameY, frameW };
      sayFor(current, 'ok', `Videos unidos: ${syncNote}; ${alignNote}. Pulsa Reproducir y entra al modo VR.`);
    } catch (error) {
      if (!isAbort(error)) throw error; // la cancelación ya se confirmó en startJob
    } finally {
      if (current.pairJob === signal) current.pairJob = null;
      endJob(signal);
    }
  }

  /* ---------- Profundidad estimada para fotos normales ---------- */
  /**
   * Estima (una vez por foto) el mapa de profundidad con IA en el dispositivo.
   * Mientras tanto se ve el relieve aproximado; si falla o se cancela, se queda
   * ese y el mensaje ofrece reintentar.
   */
  async function ensureDepth() {
    const current = active;
    if (!current || current.module.kind !== 'image' || current.depth || (current.depthJob && !current.depthJob.aborted)) return;
    const retry = () => ensureDepth();
    const signal = startJob('depth', 'Preparando la estimación de profundidad…', () => {
      sayFor(current, 'info', 'Estimación cancelada: se usa un relieve aproximado (abajo y al centro, cerca).', { label: 'Estimar profundidad', run: retry });
    });
    current.depthJob = signal;
    try {
      const map = await estimateDepth(current.content.source, {
        signal,
        inputPx: getProfile().depthInputPx,
        onProgress: (fraction, stage) => (stage === 'download'
          ? reportJob(signal, fraction, 'Descargando el modelo de profundidad (≈27 MB, solo la primera vez)…')
          : reportJob(signal, null, 'Estimando la profundidad en tu dispositivo…')),
      });
      throwIfAborted(signal);
      if (active !== current) return;
      current.depth = map;
      view.setDepthMap(map);
      if (store.get().params.source === '2d') {
        sayFor(current, 'ok', 'Profundidad estimada: lo cercano sale hacia ti y el fondo queda detrás. Es una estimación de la IA; ajusta «Profundidad» a tu gusto.');
      }
    } catch (error) {
      if (!isAbort(error)) {
        console.warn('[StereoVision] Sin mapa de profundidad:', error);
        sayFor(current, 'error', 'No se pudo estimar la profundidad (la primera vez se necesita conexión para descargar el modelo). Se usa un relieve aproximado.', { label: 'Reintentar', run: retry });
      }
    } finally {
      if (current.depthJob === signal) current.depthJob = null;
      endJob(signal);
    }
  }

  function resetParams() {
    const state = store.get();
    if (!active) return;
    const owner = active;
    const before = state.params;
    // Se conserva lo que trae el archivo (tipo de foto y la unión de dos videos).
    const params = { ...defaultParams(state.module), source: state.params.source, ...active.pairAuto };
    setParams(params);
    store.set({
      message: {
        kind: 'ok',
        text: 'Calibración restablecida a los valores iniciales.',
        action: {
          label: 'Deshacer',
          run: () => {
            if (active !== owner) return;
            setParams(before);
            store.set({ message: { kind: 'ok', text: 'Se recuperó la calibración anterior.' } });
          },
        },
      },
    });
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
    setParams({ panX: clamp(params.panX + dx), panY: clamp(params.panY + dy) });
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
    abortJob(); // un trabajo del archivo anterior no debe seguir gastando ni llegar al nuevo
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
        throw tooLargeForGpu(produced.file, content.width, content.height, view.maxTextureSize);
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
      const text = detected?.text ?? (module.kind === 'video'
        ? `«${produced.file.name}» está listo. Pulsa Reproducir para iniciar.`
        : `«${produced.file.name}» cargado. Ajusta la vista en «Calibra».`);
      store.set({
        status: controller.getStatus(),
        file: fileInfo(produced.file, content, produced.sample, produced.files),
        pending: null,
        message: { kind: 'ok', text: produced.note ? `${text} ${produced.note}` : text },
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
    if (state.module === 'sbs-video' && files.length >= 2) {
      const note = files.length > 2 ? `Se usaron los dos primeros de los ${files.length} videos elegidos.` : null;
      return importPair(...orderPair(files[0], files[1]), note);
    }
    const file = files[0];
    const note = files.length > 1 ? `Se importó solo «${file.name}»: este módulo trabaja con una imagen a la vez.` : null;
    return runImport(file?.name ?? 'archivo', async (module) => {
      await validateFile(file, module.kind, { maxTextureSize: view.maxTextureSize });
      const content = module.kind === 'image' ? await loadImage(file) : await loadVideo(file, ui.videoHolder);
      return { file, content, sample: false, note };
    });
  }

  function importPair(leftFile, rightFile, note = null) {
    return runImport(`${leftFile.name} + ${rightFile.name}`, async () => {
      await validateFile(leftFile, 'video');
      await validateFile(rightFile, 'video');
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
      return { file: leftFile, files: [leftFile, rightFile], content, sample: false, note };
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
      await validateFile(file, module.kind, { maxTextureSize: view.maxTextureSize });
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
  const seekBy = (seconds) => active?.controller.seekBy?.(seconds);
  const toggleMute = () => active?.controller.toggleMute?.();

  return {
    zoomBy,
    panBy,
    recenter,
    cancelTask,
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
    seekBy,
    toggleMute,
    /** Solo para depuración (?debug) y pruebas. */
    inspect: () => ({ active: Boolean(active), token, job: job?.kind ?? null, memory: view.memory, pixelRatio: view.pixelRatio }),
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
