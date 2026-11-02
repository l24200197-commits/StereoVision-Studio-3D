/**
 * main.js — Inicialización de StereoVision Studio 3D.
 *
 * Solo arma las piezas y las conecta; las reglas viven en los módulos:
 *   store → estado · ui → pantalla · calibration → controles · studio → reglas
 *   stereoView → Three.js/WebGL · vrMode → visor VR · intro → portada
 *   stereoDetect → qué trae la foto · depthEstimate → profundidad con IA
 *   gestures → zoom, encuadre y teclado · vrWizard → gafas
 *   audioSync + alignPair → unir dos videos (sincronía y tamaño)
 *   tasks + workers/ → cálculos pesados fuera del hilo principal
 *   settings + core/deviceProfile → calidad según el equipo
 *
 * Todo corre en el navegador: no hay servidor, registro ni envío de archivos.
 */
import { createStore, createInitialState } from './modules/store.js';
import { createUi } from './modules/ui.js';
import { createCalibrationPanel, controlOf } from './modules/calibration.js';
import { StereoView } from './modules/stereoView.js';
import { createStudio, MODULES } from './modules/studio.js';
import { createVrMode } from './modules/vrMode.js';
import { createIntro } from './modules/intro.js';
import { attachGestures } from './modules/gestures.js';
import { createSettings } from './modules/settings.js';

function boot() {
  const ui = createUi();
  const store = createStore(createInitialState());

  let studio = null;
  let vr = null;
  const calibration = createCalibrationPanel(ui.els.calibration, {
    onChange: (key, value) => studio?.setParam(key, value),
  });

  const paint = (state) => ui.render(state, { modules: MODULES, calibration });
  store.subscribe(paint);

  // El visor necesita WebGL; si no existe, el Studio lo explica en lugar de fallar en silencio.
  let view = null;
  try {
    view = new StereoView(ui.els.canvas);
  } catch (error) {
    console.warn('[StereoVision] WebGL no disponible:', error);
    store.set({
      fatal: true,
      message: {
        kind: 'error',
        text: 'Este navegador o dispositivo no ofrece WebGL, necesario para el visor 3D. Prueba con Chrome, Edge, Firefox o Safari actualizados y con la aceleración por hardware activada.',
      },
    });
  }

  // Calidad según el equipo (o la elegida en Ajustes); también sin WebGL, para los efectos de la interfaz.
  const settings = createSettings({ view });

  const toggleStageFullscreen = async () => {
    try {
      if (document.fullscreenElement === ui.els.stage) await document.exitFullscreen();
      else if (!document.fullscreenElement) await ui.els.stage.requestFullscreen();
    } catch {
      store.set({ message: { kind: 'error', text: 'Este navegador no permitió poner el visor a pantalla completa.' } });
    }
  };

  ui.bind({
    onModule: (id) => studio?.selectModule(id),
    onFile: (file) => studio?.importFile(file),
    onSample: () => studio?.loadSample(),
    onClear: () => studio?.clearFile(),
    onReset: () => studio?.resetParams(),
    onVr: () => vr?.enter(),
    onVrPlay: () => studio?.togglePlayback(),
    onDownload: () => studio?.downloadResult(),
    onAddRight: (file) => studio?.addRightVideo(file),
    onCancelTask: () => studio?.cancelTask(),
    onDismissMessage: () => store.set({ message: null }),
    onZoom: (factor) => studio?.zoomBy(factor),
    onFit: () => studio?.recenter(),
    onStageFullscreen: toggleStageFullscreen,
  });

  if (view) {
    studio = createStudio({ store, view, ui, calibration, getProfile: () => settings.profile });
    vr = createVrMode({
      store,
      stage: ui.els.stage,
      view,
      exitButton: ui.els.vrExit,
      calibrateButton: ui.els.vrCalibrate,
      wizardRoot: ui.els.vrWizard,
      hintElement: ui.els.vrHint,
      returnFocus: ui.els.btnVr,
      // El paso «Tamaño» del asistente ajusta el zoom del archivo, viendo la imagen real.
      scale: {
        get: () => store.get().params.scale ?? 100,
        set: (value) => studio.setParam('scale', value),
        range: () => controlOf(store.get().module, 'scale') ?? { min: 50, max: 200 },
      },
    });
    attachGestures(ui.els.stage, { store, studio, onFullscreen: toggleStageFullscreen });

    // El canvas sigue el tamaño real del área de vista (Studio y VR).
    const fit = () => {
      const { width, height } = ui.els.stage.getBoundingClientRect();
      view.resize(width, height);
    };
    new ResizeObserver(fit).observe(ui.els.stage);
    fit();

    // Al pasar la ventana a otro monitor cambia la densidad de píxeles: se vuelve a aplicar el tope.
    const watchDensity = () => {
      matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
        view.setQuality(settings.profile);
        watchDensity();
      }, { once: true });
    };
    watchDensity();

    view.onContextLost = () => store.set({
      message: { kind: 'error', text: 'El navegador interrumpió momentáneamente la gráfica. Espera un instante: la vista se restaura sola.' },
    });
    view.onContextRestored = () => store.set({
      message: { kind: 'ok', text: 'La vista se restauró correctamente.' },
    });
  }

  // Última red de seguridad: un fallo inesperado se explica y no deja el Studio inutilizable.
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    console.warn('[StereoVision] Promesa rechazada sin atender:', event.reason);
    store.set({ message: { kind: 'error', text: 'Ocurrió un problema inesperado. El Studio sigue disponible: vuelve a intentarlo o importa otro archivo.' } });
  });

  paint(store.get());
  createIntro();

  // Herramientas de inspección para pruebas: se activan con ?debug en la URL.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__studio = { store, studio, view, vr, settings };
  }
}

boot();
