/**
 * ui.js — Capa de interfaz: referencias al DOM y pintado del estado.
 *
 * Responsabilidad: leer el estado de la aplicación y reflejarlo en pantalla
 * (estado, módulo, información del archivo, mensajes, habilitación de
 * controles). También traduce los eventos del DOM en llamadas a los manejadores
 * que le entrega main.js. No contiene reglas de negocio: solo decide qué se ve.
 */
import { STATUS, STATUS_LABEL } from './store.js';
import { FORMATS, formatBytes } from './fileImport.js';
import { formatTime } from './sbsVideo.js';
import { flash, reveal } from './motion.js';

/** Textos propios de cada módulo (lo que espera y cómo se usa). */
const MODULE_COPY = Object.freeze({
  anaglyph: {
    title: 'Anaglifo rojo-cian',
    description: 'Imagen en JPG, PNG o WebP para ver con lentes rojo-cian. Si tu foto no es anaglifo (un par SBS o una foto normal), el Studio lo crea.',
    emptyTitle: 'Anaglifo listo para importar',
    emptyText: 'Importa un anaglifo, un par SBS o una foto normal, o arrástrala aquí. Si no es anaglifo, el Studio lo crea. El filtro rojo va en el ojo izquierdo.',
    kindLabel: 'imagen',
  },
  'sbs-image': {
    title: 'Imagen SBS',
    description: 'Imagen Side-by-Side en JPG, PNG o WebP (mitad izquierda para el ojo izquierdo y derecha para el derecho), Half-SBS o una foto normal, de la que el Studio crea el par para las gafas.',
    emptyTitle: 'Imagen SBS lista para importar',
    emptyText: 'Importa una imagen SBS o una foto normal, o arrástrala aquí. Después entra al modo VR y coloca el teléfono en las gafas.',
    kindLabel: 'imagen',
  },
  'sbs-video': {
    title: 'Video SBS',
    description: 'Video MP4 Side-by-Side. Recomendado: video H.264 y audio AAC, que es lo que mejor reproducen los teléfonos.',
    emptyTitle: 'Video SBS listo para importar',
    emptyText: 'Importa un MP4 con las dos perspectivas lado a lado, o arrástralo aquí. La reproducción comienza al pulsar Reproducir.',
    kindLabel: 'video MP4',
  },
});

const $ = (id) => document.getElementById(id);

export function createUi() {
  const els = {
    body: document.body,
    statusPill: $('status-pill'),
    statusText: $('status-text'),
    moduleChip: $('module-chip'),
    moduleRadios: [...document.querySelectorAll('input[name="module"]')],
    moduleDesc: $('module-desc'),
    fileInput: $('file-input'),
    btnImport: $('btn-import'),
    btnSample: $('btn-sample'),
    btnClear: $('btn-clear'),
    importHint: $('import-hint'),
    fileInfo: $('file-info'),
    fiName: $('fi-name'),
    fiFormat: $('fi-format'),
    fiSize: $('fi-size'),
    fiRes: $('fi-res'),
    fiDurationRow: $('fi-duration-row'),
    fiDuration: $('fi-duration'),
    fiSource: $('fi-source'),
    fiEmpty: $('file-empty'),
    stage: $('stage'),
    canvas: $('view-canvas'),
    stageEmpty: $('stage-empty'),
    stageEmptyTitle: $('stage-empty-title'),
    stageEmptyText: $('stage-empty-text'),
    stageLoading: $('stage-loading'),
    stageLoadingText: $('stage-loading-text'),
    eyeLeft: $('eye-label-left'),
    eyeRight: $('eye-label-right'),
    message: $('message'),
    calibration: $('calibration'),
    calEmpty: $('cal-empty'),
    btnReset: $('btn-reset'),
    btnVr: $('btn-vr'),
    vrNote: $('vr-note'),
    vrExit: $('vr-exit'),
    vrPlay: $('vr-play'),
    vrHint: $('vr-hint'),
    vrCalibrate: $('vr-calibrate'),
    vrWizard: $('vr-wizard'),
    btnDownload: $('btn-download'),
    videoHolder: $('video-holder'),
  };

  const transport = {
    root: $('transport'),
    play: $('t-play'),
    back: $('t-back'),
    fwd: $('t-fwd'),
    seek: $('t-seek'),
    time: $('t-time'),
    mute: $('t-mute'),
    volume: $('t-volume'),
  };

  /* ---------- Eventos del DOM → manejadores de main.js ---------- */
  function bind(handlers) {
    for (const radio of els.moduleRadios) {
      radio.addEventListener('change', () => radio.checked && handlers.onModule(radio.value));
    }
    els.btnImport.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files?.[0];
      els.fileInput.value = ''; // permite volver a elegir el mismo archivo
      if (file) handlers.onFile(file);
    });
    els.btnSample.addEventListener('click', handlers.onSample);
    els.btnClear.addEventListener('click', handlers.onClear);
    els.btnReset.addEventListener('click', handlers.onReset);
    els.btnVr.addEventListener('click', handlers.onVr);
    els.vrPlay.addEventListener('click', handlers.onVrPlay);
    els.btnDownload.addEventListener('click', handlers.onDownload);

    // Arrastrar y soltar sobre el visor.
    const stage = els.stage;
    let depth = 0;
    stage.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      depth += 1;
      stage.classList.add('is-dragover');
    });
    stage.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    });
    stage.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) stage.classList.remove('is-dragover');
    });
    stage.addEventListener('drop', (event) => {
      event.preventDefault();
      depth = 0;
      stage.classList.remove('is-dragover');
      const file = event.dataTransfer?.files?.[0];
      if (file) handlers.onFile(file);
    });
    // Un archivo soltado fuera del visor no debe abrirse en la pestaña.
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());
  }

  /* ---------- Pintado del estado ---------- */
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  /** Rótulo de ojo: el detalle de la mitad se oculta en pantallas angostas (CSS). */
  function setEyeLabel(el, eye, half) {
    if (el.dataset.eye === eye && el.dataset.half === half) return;
    el.dataset.eye = eye;
    el.dataset.half = half;
    const detail = document.createElement('span');
    detail.className = 'eye-half';
    detail.textContent = ` · ${half}`;
    el.replaceChildren(eye, detail);
  }

  function renderStatus(state) {
    const label = STATUS_LABEL[state.status];
    setText(els.statusText, state.vr ? `Modo VR · ${label}` : label);
    els.statusPill.dataset.status = state.vr ? 'vr' : state.status;
  }

  function renderModule(state, modules) {
    const copy = MODULE_COPY[state.module];
    setText(els.moduleChip, copy ? copy.title : 'Sin módulo');
    els.moduleChip.dataset.empty = copy ? 'false' : 'true';
    for (const radio of els.moduleRadios) {
      radio.checked = radio.value === state.module;
      radio.disabled = state.status === STATUS.LOADING || state.vr || state.fatal;
    }
    setText(els.moduleDesc, copy ? copy.description : 'Elige primero qué tipo de contenido vas a ver. Después podrás importar el archivo.');

    const kind = state.module ? modules[state.module].kind : null;
    els.fileInput.accept = kind ? FORMATS[kind].accept : '';
  }

  function renderImport(state, modules) {
    const hasModule = Boolean(state.module);
    const busy = state.status === STATUS.LOADING;
    const canImport = hasModule && !busy && !state.fatal && !state.vr;
    els.btnImport.disabled = !canImport;
    els.btnSample.disabled = !canImport;
    els.btnClear.disabled = !(state.file && !busy && !state.vr);

    const copy = MODULE_COPY[state.module];
    setText(
      els.importHint,
      !hasModule
        ? 'Paso 1: elige un módulo para habilitar la importación.'
        : busy
          ? 'Preparando el archivo…'
          : `Selecciona un ${copy.kindLabel} de tu dispositivo (${FORMATS[modules[state.module].kind].label}). No se envía a ningún servidor.`,
    );
  }

  let shownFile = null;
  function renderFile(state) {
    const file = state.file;
    if (file !== shownFile && file) reveal(els.canvas);
    shownFile = file;
    els.fileInfo.hidden = !file;
    els.fiEmpty.hidden = Boolean(file);
    if (!file) return;
    setText(els.fiName, file.name);
    setText(els.fiFormat, file.format);
    setText(els.fiSize, formatBytes(file.size));
    setText(els.fiRes, `${file.width} × ${file.height} px`);
    els.fiDurationRow.hidden = file.duration == null;
    if (file.duration != null) setText(els.fiDuration, formatTime(file.duration));
    setText(els.fiSource, file.sample ? 'Muestra incluida en el Studio' : 'Archivo local del dispositivo');
  }

  function renderStage(state, modules) {
    const hasFile = Boolean(state.file);
    const busy = state.status === STATUS.LOADING;
    const copy = MODULE_COPY[state.module];
    const module = state.module ? modules[state.module] : null;

    els.stageLoading.hidden = !busy;
    if (busy) setText(els.stageLoadingText, state.pending ? `Preparando «${state.pending}»…` : 'Preparando el archivo…');

    els.stageEmpty.hidden = hasFile || busy;
    if (!hasFile && !busy) {
      if (state.fatal) {
        setText(els.stageEmptyTitle, 'El visor 3D no está disponible');
        setText(els.stageEmptyText, state.message?.text ?? 'Este navegador no ofrece WebGL.');
      } else if (!state.module) {
        setText(els.stageEmptyTitle, 'Bienvenido a StereoVision Studio 3D');
        setText(els.stageEmptyText, 'Paso 1: elige un módulo en el panel izquierdo (Anaglifo, Imagen SBS o Video SBS). Paso 2: importa tu archivo.');
      } else if (state.status === STATUS.ERROR) {
        setText(els.stageEmptyTitle, 'No se pudo abrir el archivo');
        setText(els.stageEmptyText, 'El Studio sigue funcionando. Importa otro archivo, usa la muestra incluida o cambia de módulo.');
      } else {
        setText(els.stageEmptyTitle, copy.emptyTitle);
        setText(els.stageEmptyText, copy.emptyText);
      }
    }

    // Rótulos por ojo: reflejan la asignación real de mitades (RN-11, RN-12).
    const showEyes = hasFile && module?.layout === 'sbs' && !state.vr;
    els.eyeLeft.hidden = !showEyes;
    els.eyeRight.hidden = !showEyes;
    if (showEyes) {
      const swapped = Boolean(state.params.swap);
      setEyeLabel(els.eyeLeft, 'Ojo izquierdo', `mitad ${swapped ? 'derecha' : 'izquierda'}`);
      setEyeLabel(els.eyeRight, 'Ojo derecho', `mitad ${swapped ? 'izquierda' : 'derecha'}`);
      els.eyeLeft.classList.toggle('is-swapped', swapped);
      els.eyeRight.classList.toggle('is-swapped', swapped);
    }
    els.stage.dataset.layout = module?.layout ?? 'none';
  }

  function renderTransport(state) {
    const isVideo = state.module === 'sbs-video';
    const usable = isVideo && Boolean(state.file) && state.status !== STATUS.LOADING && state.status !== STATUS.ERROR;
    transport.root.hidden = !isVideo;
    for (const key of ['play', 'back', 'fwd', 'seek', 'mute', 'volume']) transport[key].disabled = !usable;
    if (!usable) {
      transport.seek.value = '0';
      setText(transport.time, '0:00 / 0:00');
      transport.play.dataset.state = 'paused';
      setText(transport.play.querySelector('.label'), 'Reproducir');
    }

    // Botón de reproducción del visor VR: solo para video.
    els.vrPlay.hidden = !(isVideo && state.vr);
    const playing = state.status === STATUS.PLAYING;
    els.vrPlay.dataset.state = playing ? 'playing' : 'paused';
    els.vrPlay.setAttribute('aria-label', playing ? 'Pausar video' : 'Reproducir video');
    setText(els.vrPlay.querySelector('.label'), playing ? 'Pausar' : 'Reproducir');
  }

  function renderTools(state, modules, calibration) {
    const hasFile = Boolean(state.file) && state.status !== STATUS.LOADING;
    calibration.setEnabled(hasFile);
    els.calEmpty.hidden = hasFile;
    els.calibration.hidden = !state.module;
    els.btnReset.disabled = !hasFile;

    // Descarga: el anaglifo creado o el SBS listo para las gafas (solo imágenes).
    const isImage = state.module === 'anaglyph' || state.module === 'sbs-image';
    els.btnDownload.hidden = !isImage;
    els.btnDownload.disabled = !hasFile;
    setText(els.btnDownload.querySelector('.label'), state.module === 'anaglyph' ? 'Descargar anaglifo JPG' : 'Descargar SBS JPG');

    const module = state.module ? modules[state.module] : null;
    const canVr = hasFile && module?.supportsVr && !state.fatal;
    els.btnVr.disabled = !canVr;
    setText(
      els.vrNote,
      !state.module
        ? 'El modo VR se habilita con una imagen SBS o un video SBS importado.'
        : module && !module.supportsVr
          ? 'El anaglifo se ve con lentes rojo-cian; el modo VR es para contenido SBS (una vista por ojo).'
          : !hasFile
            ? 'Importa un archivo para habilitar el modo VR.'
            : 'Coloca el teléfono en horizontal dentro de las gafas. Para salir, toca la pantalla y usa «Salir de VR».',
    );
  }

  function renderMessage(state) {
    const message = state.message;
    const text = message?.text ?? '';
    const changed = els.message.textContent !== text;
    setText(els.message, text);
    if (changed && text) flash(els.message);
    els.message.dataset.kind = message?.kind ?? 'none';
    els.message.hidden = !message;
  }

  function render(state, { modules, calibration }) {
    els.body.classList.toggle('vr-active', state.vr);
    els.body.classList.toggle('is-fatal', state.fatal);
    renderStatus(state);
    renderModule(state, modules);
    renderImport(state, modules);
    renderFile(state);
    renderStage(state, modules);
    renderTransport(state);
    renderTools(state, modules, calibration);
    renderMessage(state);
  }

  return { els, transport, videoHolder: els.videoHolder, bind, render };
}
