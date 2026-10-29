/**
 * store.js — Estado único de la aplicación y catálogo de estados.
 *
 * Responsabilidad: guardar el estado que comparten la interfaz, los módulos
 * multimedia y el modo VR, y avisar a quien se suscriba cuando cambia.
 * No toca el DOM ni WebGL.
 */

/** Estados del Studio (documentados en el README, sección "Estados"). */
export const STATUS = Object.freeze({
  EMPTY: 'sin-archivo',
  LOADING: 'cargando',
  READY: 'listo',
  PLAYING: 'reproduciendo',
  PAUSED: 'pausado',
  ERROR: 'error',
});

export const STATUS_LABEL = Object.freeze({
  [STATUS.EMPTY]: 'Sin archivo',
  [STATUS.LOADING]: 'Cargando',
  [STATUS.READY]: 'Listo',
  [STATUS.PLAYING]: 'Reproduciendo',
  [STATUS.PAUSED]: 'Pausado',
  [STATUS.ERROR]: 'Error',
});

/**
 * Estado inicial: ningún módulo elegido (RN-01) y ningún archivo activo.
 *
 * file    → datos del archivo activo (nombre, formato, tamaño, resolución…) o null
 * params  → parámetros de calibración vigentes del módulo activo
 * message → { kind: 'info' | 'ok' | 'error', text } o null
 * vr      → true mientras el modo VR está activo
 */
export function createInitialState() {
  return {
    module: null,
    status: STATUS.EMPTY,
    file: null,
    params: {},
    message: null,
    vr: false,
    fatal: false,
    pending: null, // nombre del archivo que se está preparando mientras status = cargando
  };
}

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  return {
    get: () => state,
    /** Acepta un objeto parcial o una función (estado) => parcial. */
    set(patch) {
      const partial = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...partial };
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
