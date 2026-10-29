/**
 * vrWizard.js — Calibración de las gafas, con el teléfono ya puesto en ellas.
 *
 * Cada ojo ve una mira: una línea vertical a la izquierda y una horizontal a la
 * derecha, dentro de un círculo. Cuando las dos vistas caen frente a los lentes,
 * el cerebro las fusiona en una sola cruz «+».
 * La pantalla se divide en tercios: izquierda = menos, derecha = más (mantén
 * pulsado para avanzar rápido), centro = siguiente paso.
 *
 * Ajusta la separación y la altura de los lentes, que dependen del teléfono y
 * de las gafas, no de la foto: por eso se guardan en el navegador y se aplican a
 * todo lo que se vea en VR, sin tocar la calibración del archivo.
 */
const STORAGE_KEY = 'svs3d.lens';
const STEPS = [
  { key: 'x', title: 'Separación', hint: 'Junta las dos líneas en una sola cruz +', step: 0.2, min: -25, max: 25 },
  { key: 'y', title: 'Altura', hint: 'Si la cruz se ve escalonada, nivélala', step: 0.2, min: -10, max: 10 },
];
const HOLD_DELAY = 420; // ms antes de repetir al mantener pulsado
const REPEAT_EVERY = 60; // ms entre repeticiones

export function loadLens() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return { x: saved.x, y: saved.y, saved: true };
  } catch {
    /* almacenamiento no disponible */
  }
  return { x: 0, y: 0, saved: false };
}

function saveLens(lens) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: lens.x, y: lens.y }));
  } catch {
    /* sin almacenamiento: la calibración vale para esta sesión */
  }
}

export function createVrWizard({ root, stage, lens, onChange, onFinish }) {
  const eyes = [...root.querySelectorAll('.wz-eye')];
  let active = false;
  let index = 0;
  let holdTimer = 0;
  let repeatTimer = 0;

  function layout() {
    const { width, height } = stage.getBoundingClientRect();
    const half = width / 2;
    // Mismo cálculo que stereoView: cada ojo se mueve la mitad, en sentidos opuestos.
    eyes.forEach((el, i) => {
      const direction = i === 0 ? -1 : 1;
      el.style.setProperty('--dx', `${(direction * (lens.x / 100) * half) / 2}px`);
      el.style.setProperty('--dy', `${(-direction * (lens.y / 100) * height) / 2}px`);
    });
  }

  function render() {
    const step = STEPS[index];
    const value = lens[step.key];
    const last = index === STEPS.length - 1;
    for (const el of eyes) {
      el.querySelector('.wz-step').textContent = `${index + 1}/${STEPS.length} · ${step.title}`;
      el.querySelector('.wz-value').textContent = `${value > 0 ? '+' : ''}${value.toFixed(1)} %`;
      el.querySelector('.wz-hint').textContent = step.hint;
      el.querySelector('.wz-next').textContent = last ? 'centro: listo' : 'centro: siguiente';
    }
    layout();
  }

  function adjust(sign) {
    const step = STEPS[index];
    const next = Math.round((lens[step.key] + sign * step.step) * 10) / 10;
    lens[step.key] = Math.min(step.max, Math.max(step.min, next));
    onChange({ x: lens.x, y: lens.y });
    render();
  }

  function next() {
    if (index < STEPS.length - 1) {
      index += 1;
      render();
      return;
    }
    close();
    saveLens(lens);
    onFinish?.({ x: lens.x, y: lens.y });
  }

  function stopRepeat() {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
  }

  function open() {
    active = true;
    index = 0;
    root.hidden = false;
    render();
  }

  function close() {
    active = false;
    stopRepeat();
    root.hidden = true;
  }

  root.addEventListener('pointerdown', (event) => {
    if (!active) return;
    event.stopPropagation();
    event.preventDefault();
    const { left, width } = root.getBoundingClientRect();
    const third = (event.clientX - left) / width;
    if (third > 1 / 3 && third < 2 / 3) {
      next();
      return;
    }
    const sign = third <= 1 / 3 ? -1 : 1;
    adjust(sign);
    holdTimer = setTimeout(() => { repeatTimer = setInterval(() => adjust(sign), REPEAT_EVERY); }, HOLD_DELAY);
  });
  root.addEventListener('pointerup', stopRepeat);
  root.addEventListener('pointercancel', stopRepeat);
  root.addEventListener('pointerleave', stopRepeat);

  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') adjust(-1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') adjust(1);
    else if (event.key === 'Enter' || event.key === ' ') next();
    else return;
    event.preventDefault();
  });

  new ResizeObserver(() => active && layout()).observe(stage);

  return { open, close, isOpen: () => active };
}
