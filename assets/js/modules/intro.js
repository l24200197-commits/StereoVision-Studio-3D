/**
 * intro.js — Portada del Studio.
 *
 * Responsabilidad: mostrar la portada al abrir la página, dejar elegir el
 * módulo desde ahí y llevar al usuario al Studio. Elegir en la portada marca el
 * mismo radio del panel izquierdo, así que las reglas siguen en studio.js.
 *
 * El título demuestra la convergencia: dos copias roja y cian se separan y se
 * juntan como lo hace el «desplazamiento horizontal» de la calibración. El
 * indicador de la esquina muestra el desplazamiento real de esas dos copias.
 */
import { prefersReducedMotion, withViewTransition } from './motion.js';

const START_DISPARITY = 6; // % mostrado al iniciar la convergencia
const CONVERGE_MS = 1100;
const POINTER_DISPARITY = 1.6; // % máximo al mover el puntero

export function createIntro({ onEnter } = {}) {
  const intro = document.getElementById('intro');
  const studio = document.getElementById('studio');
  const title = intro.querySelector('.stereo-title');
  const readout = document.getElementById('intro-disparity');
  const tc = document.getElementById('intro-tc');
  const slates = [...intro.querySelectorAll('.input-slate')];

  let open = false;
  let disparity = 0; // en % del ancho del título
  let target = 0;
  let raf = 0;
  let tcTimer = 0;
  const openedAt = performance.now();

  const setDisparity = (value) => {
    disparity = value;
    title.style.setProperty('--d', value.toFixed(3));
    readout.textContent = `${value >= 0 ? '' : '−'}${Math.abs(value).toFixed(1)} %`;
  };

  /* Convergencia inicial y seguimiento suave del puntero. */
  function animateTo(value, duration) {
    cancelAnimationFrame(raf);
    const from = disparity;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisparity(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function onPointer(event) {
    if (event.pointerType !== 'mouse') return;
    const x = event.clientX / window.innerWidth - 0.5;
    target = Math.round(x * 2 * POINTER_DISPARITY * 10) / 10;
    animateTo(target, 420);
  }

  /* Timecode de monitor: tiempo desde que se abrió la página, a 24 cuadros. */
  function tickTimecode() {
    const elapsed = (performance.now() - openedAt) / 1000;
    const pad = (n) => String(Math.floor(n)).padStart(2, '0');
    tc.textContent = `${pad(elapsed / 3600)}:${pad((elapsed / 60) % 60)}:${pad(elapsed % 60)}:${pad((elapsed % 1) * 24)}`;
  }

  function show({ initial = false } = {}) {
    const update = () => {
      intro.hidden = false;
      studio.inert = true;
      document.body.classList.add('intro-open');
    };
    initial ? update() : withViewTransition(update);
    open = true;
    window.addEventListener('pointermove', onPointer);
    tickTimecode();
    tcTimer = setInterval(tickTimecode, 1000 / 24);

    if (prefersReducedMotion()) {
      setDisparity(0);
    } else {
      setDisparity(START_DISPARITY);
      // Un instante de pausa para que se lea la separación antes de converger.
      setTimeout(() => open && animateTo(0, CONVERGE_MS), initial ? 350 : 150);
    }
    // Al volver desde el Studio, el foco regresa a la entrada elegida (no al abrir la página).
    if (!initial) (slates.find((slate) => slate.dataset.active === 'true') ?? slates[0]).focus({ preventScroll: true });
  }

  function hide(focusTarget) {
    open = false;
    cancelAnimationFrame(raf);
    clearInterval(tcTimer);
    window.removeEventListener('pointermove', onPointer);
    withViewTransition(() => {
      intro.hidden = true;
      studio.inert = false;
      document.body.classList.remove('intro-open');
    });
    focusTarget?.focus({ preventScroll: true });
  }

  for (const slate of slates) {
    slate.addEventListener('click', () => {
      const radio = document.querySelector(`input[name="module"][value="${slate.dataset.module}"]`);
      if (radio && !radio.disabled && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      for (const other of slates) other.dataset.active = String(other === slate);
      hide(document.getElementById('btn-import'));
      onEnter?.(slate.dataset.module);
    });
  }
  document.getElementById('intro-skip').addEventListener('click', () => hide(document.querySelector('input[name="module"]')));
  document.getElementById('btn-home').addEventListener('click', () => show());
  window.addEventListener('keydown', (event) => {
    if (open && event.key === 'Escape') hide(document.querySelector('input[name="module"]'));
  });

  /* Accesos directos del visor vacío: reflejan y reenvían a los botones reales del panel. */
  for (const proxy of document.querySelectorAll('[data-proxy]')) {
    const real = document.getElementById(proxy.dataset.proxy);
    const sync = () => { proxy.disabled = real.disabled; };
    new MutationObserver(sync).observe(real, { attributes: true, attributeFilter: ['disabled'] });
    sync();
    proxy.addEventListener('click', () => real.click());
  }

  show({ initial: true });
  return { show, hide };
}
