/**
 * gestures.js — Zoom y encuadre directos sobre el visor.
 *
 * Ratón: rueda = zoom, arrastrar = mover, doble clic = centrar.
 * Táctil: pellizcar = zoom, arrastrar en horizontal = mover, doble toque = centrar
 * (el desplazamiento vertical de la página sigue funcionando: touch-action pan-y).
 * Teclado (con el visor enfocado): + / − zoom, flechas = mover (Mayús: más
 * rápido), 0 = centrar, F = pantalla completa, espacio/K = reproducir o
 * pausar, J/L = ∓10 s, M = silencio. Así nada depende de un ratón o de un dedo.
 * Solo actúa con un archivo cargado y fuera del modo VR; en VR el toque es de
 * los controles y del asistente de las gafas.
 */
const KEY_ZOOM = 1.1;
const KEY_PAN = 0.02; // fracción de la región por pulsación
export function attachGestures(stage, { store, studio, onFullscreen }) {
  const pointers = new Map(); // pointerId → { x, y }
  let pinchDistance = 0;
  let lastTap = 0;

  const usable = () => studio.hasContent() && !store.get().vr;

  /** Tamaño de una región de ojo: el encuadre se mide en fracciones de ella. */
  function regionSize() {
    const { width, height } = stage.getBoundingClientRect();
    return { w: stage.dataset.layout === 'sbs' ? width / 2 : width, h: height };
  }

  function distance() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  stage.addEventListener('wheel', (event) => {
    if (!usable()) return;
    event.preventDefault();
    studio.zoomBy(Math.exp(-event.deltaY * 0.0015));
  }, { passive: false });

  stage.addEventListener('pointerdown', (event) => {
    if (!usable() || event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture?.(event.pointerId);
    if (pointers.size === 2) pinchDistance = distance();
    stage.classList.add('is-grabbing');

    // Doble toque en táctil (en ratón se usa dblclick).
    if (event.pointerType !== 'mouse' && pointers.size === 1) {
      const now = performance.now();
      if (now - lastTap < 300) studio.recenter();
      lastTap = now;
    }
  });

  stage.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous || !usable()) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, current);

    if (pointers.size >= 2) {
      const next = distance();
      if (pinchDistance > 0) studio.zoomBy(next / pinchDistance);
      pinchDistance = next;
      return;
    }
    const { w, h } = regionSize();
    studio.panBy((current.x - previous.x) / w, (current.y - previous.y) / h);
  });

  const release = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (pointers.size === 0) stage.classList.remove('is-grabbing');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener('dblclick', (event) => {
    if (usable() && !event.target.closest('button')) studio.recenter();
  });

  stage.addEventListener('keydown', (event) => {
    // Solo cuando el foco está en el propio visor: los botones internos conservan su teclado.
    if (event.target !== stage || !usable() || event.altKey || event.ctrlKey || event.metaKey) return;
    const pan = event.shiftKey ? KEY_PAN * 5 : KEY_PAN;
    const actions = {
      '+': () => studio.zoomBy(KEY_ZOOM),
      '=': () => studio.zoomBy(KEY_ZOOM),
      '-': () => studio.zoomBy(1 / KEY_ZOOM),
      '_': () => studio.zoomBy(1 / KEY_ZOOM),
      0: () => studio.recenter(),
      ArrowLeft: () => studio.panBy(-pan, 0),
      ArrowRight: () => studio.panBy(pan, 0),
      ArrowUp: () => studio.panBy(0, -pan),
      ArrowDown: () => studio.panBy(0, pan),
      f: () => onFullscreen?.(),
      ' ': () => studio.togglePlayback(),
      k: () => studio.togglePlayback(),
      j: () => studio.seekBy(-10),
      l: () => studio.seekBy(10),
      m: () => studio.toggleMute(),
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  // El visor indica cuándo admite gestos (cursor y ayuda en pantalla).
  store.subscribe((state) => stage.classList.toggle('has-file', Boolean(state.file) && !state.vr));
}
