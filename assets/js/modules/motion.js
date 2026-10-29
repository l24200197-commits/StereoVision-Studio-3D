/**
 * motion.js — Pequeñas ayudas de movimiento para la interfaz.
 *
 * Solo animan transform y opacity, respetan «reducir movimiento» y nunca
 * bloquean la aplicación: si el navegador no soporta la API, el cambio ocurre
 * al instante. El movimiento aquí confirma una acción o evita un salto brusco;
 * no se aplica a controles de uso continuo ni a la imagen que se está calibrando.
 */
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => Boolean(reducedQuery?.matches);

/** Aviso breve sobre un elemento cuyo contenido acaba de cambiar (WAAPI, interrumpible). */
export function flash(element) {
  if (!element.animate) return;
  const frames = prefersReducedMotion()
    ? [{ opacity: 0.4 }, { opacity: 1 }]
    : [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }];
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate(frames, { duration: 180, easing: EASE_OUT });
}

/** Aparición suave del visor cuando entra un contenido nuevo (evita el corte seco). */
export function reveal(element) {
  if (!element.animate) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: EASE_OUT });
}

/**
 * Ejecuta un cambio de DOM con una transición de vista (el visor se expande o
 * se recoge desde su sitio) cuando el navegador la ofrece. El cambio siempre se
 * aplica, con o sin animación.
 */
export function withViewTransition(update) {
  if (!document.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }
  try {
    document.startViewTransition(update);
  } catch {
    update();
  }
}
