/**
 * vrMode.js — Modo Viewer/VR móvil (gafas tipo Cardboard).
 *
 * Responsabilidad: pasar del Studio a un visor limpio de pantalla completa y
 * volver (RN-15, RN-16). No toca el contenido ni la calibración: el mismo
 * canvas y los mismos parámetros siguen activos; solo cambia el marco de la
 * página (la clase `vr-active` la aplica ui.js a partir de `state.vr`).
 *
 * Las funciones del navegador que pueden fallar o no existir (pantalla
 * completa, bloqueo de orientación, Wake Lock) se piden con try/catch. Si
 * alguna no está disponible, el visor sigue siendo funcional dentro de la
 * página: ocupa toda la ventana y avisa cuando el teléfono está en vertical
 * (RN-17, paso 19 del examen).
 *
 * La separación de los lentes se calibra con las gafas puestas (vrWizard.js),
 * se guarda en el navegador y solo se aplica mientras el VR está activo.
 */
import { withViewTransition } from './motion.js';
import { createVrWizard, loadLens } from './vrWizard.js';

const HIDE_CONTROLS_MS = 4000;
const HINT_MS = 6000;
const LONG_PRESS_MS = 650;

export function createVrMode({ store, stage, view, exitButton, calibrateButton, wizardRoot, hintElement, scale }) {
  let wakeLock = null;
  let enteredFullscreen = false;
  let hideTimer = 0;
  let hintTimer = 0;
  let lens = loadLens();

  const wizard = createVrWizard({
    root: wizardRoot,
    stage,
    lens,
    onChange: (value) => view.setLens(value),
    scale,
    onFinish: () => {
      lens.saved = true;
      showHint('Calibración guardada. Para repetirla, mantén pulsada la pantalla o usa «Calibrar gafas».');
    },
  });
  function openWizard() {
    hideControls();
    hintElement.hidden = true;
    wizard.open();
  }

  /* ---------- Controles táctiles que se ocultan solos ---------- */
  function showControls() {
    stage.classList.add('vr-ui');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => stage.classList.remove('vr-ui'), HIDE_CONTROLS_MS);
  }
  function hideControls() {
    clearTimeout(hideTimer);
    stage.classList.remove('vr-ui');
  }
  function showHint(text) {
    hintElement.textContent = text;
    hintElement.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintElement.hidden = true; }, HINT_MS);
  }

  /* ---------- Capacidades opcionales del navegador ---------- */
  async function requestFullscreen() {
    const root = document.documentElement;
    if (!root.requestFullscreen) return false;
    try {
      await root.requestFullscreen({ navigationUI: 'hide' });
      enteredFullscreen = true;
      return true;
    } catch {
      return false;
    }
  }
  async function lockLandscape() {
    try {
      await screen.orientation.lock('landscape');
      return true;
    } catch {
      return false; // iOS y escritorio no lo permiten: queda el aviso en pantalla
    }
  }
  async function acquireWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }
  async function releaseWakeLock() {
    try {
      await wakeLock?.release();
    } catch {
      /* nada que liberar */
    }
    wakeLock = null;
  }

  /* ---------- Entrar y salir ---------- */
  async function enter() {
    if (store.get().vr) return;
    withViewTransition(() => store.set({ vr: true }));
    showControls();

    const [fullscreen, locked] = await Promise.all([requestFullscreen(), lockLandscape()]);
    acquireWakeLock();

    lens = Object.assign(lens, loadLens());
    view.setLens(lens);

    const notes = ['Gira el teléfono a horizontal y colócalo en las gafas. Toca la pantalla para ver los controles; mantén pulsado para calibrar las gafas.'];
    const standalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
    if (!fullscreen && !standalone) {
      notes.push(/iPhone|iPad/.test(navigator.userAgent)
        ? 'En iPhone, para quitar las barras de Safari: Compartir → «Agregar a inicio» y abre el Studio desde ese icono.'
        : 'Este navegador no permite pantalla completa; el visor ocupa toda la ventana.');
    }
    else if (!locked) notes.push('Si la pantalla no gira sola, activa la rotación automática del teléfono.');
    showHint(notes.join(' '));
    // La primera vez, el asistente de las gafas aparece solo.
    if (!lens.saved) setTimeout(() => store.get().vr && !wizard.isOpen() && openWizard(), 900);
  }

  async function exit() {
    if (!store.get().vr) return;
    withViewTransition(() => store.set({ vr: false })); // el contenido y los parámetros no se tocan (RN-16)
    wizard.close();
    view.setLens({ x: 0, y: 0 });
    hideControls();
    hintElement.hidden = true;
    clearTimeout(hintTimer);

    const wasFullscreen = enteredFullscreen;
    enteredFullscreen = false;
    try {
      screen.orientation.unlock();
    } catch {
      /* sin bloqueo que quitar */
    }
    if (wasFullscreen && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ya había salido */
      }
    }
    releaseWakeLock();
  }

  /* ---------- Escuchas ---------- */
  exitButton.addEventListener('click', exit);
  calibrateButton.addEventListener('click', openWizard);

  // Tocar muestra los controles; mantener pulsado (con las gafas puestas) abre el asistente.
  let pressTimer = 0;
  stage.addEventListener('pointerdown', (event) => {
    if (!store.get().vr || event.target.closest('button') || wizard.isOpen()) return;
    showControls();
    clearTimeout(pressTimer);
    pressTimer = setTimeout(openWizard, LONG_PRESS_MS);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    stage.addEventListener(type, () => clearTimeout(pressTimer));
  }
  stage.addEventListener('focusin', () => store.get().vr && showControls());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && store.get().vr) exit();
  });

  // Salir de pantalla completa con el gesto del sistema equivale a salir del VR.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && enteredFullscreen && store.get().vr) exit();
  });

  // El Wake Lock se pierde al ocultar la pestaña; se pide de nuevo al volver.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.get().vr && !wakeLock) acquireWakeLock();
  });

  return { enter, exit, isActive: () => store.get().vr };
}
