/**
 * anaglyph.js — Módulo de imágenes anaglifo rojo-cian.
 *
 * Un anaglifo trae las dos perspectivas mezcladas en una sola imagen (el canal
 * rojo para un ojo y el cian para el otro); los lentes hacen la separación.
 * Si la foto importada NO es anaglifo, el visor lo compone en vivo:
 *   · «Par SBS»:     rojo de la mitad izquierda + verde/azul de la derecha (3D real).
 *   · «Foto normal»: dos vistas creadas con un relieve simulado.
 * Siempre se dibuja en una sola región; no hay modo VR (no hay vistas separadas).
 */
export const anaglyphModule = {
  id: 'anaglyph',
  kind: 'image',
  layout: 'single',
  label: 'Anaglifo rojo-cian',
  supportsVr: false,

  /** Convierte los parámetros del panel (unidades de usuario) a los del visor. */
  toViewParams(params) {
    const created = params.source !== 'original';
    return {
      source: created ? params.source : 'pass',
      composite: created,
      scale: params.scale / 100,
      brightness: params.brightness / 100,
      contrast: params.contrast / 100,
      shiftX: created ? params.shiftX : 0,
      alignY: params.source === 'sbs' ? params.alignY : 0,
      depth: params.source === '2d' ? params.depth : 0,
      swap: created && params.swap,
      panX: params.panX,
      panY: params.panY,
    };
  },

  activate({ content, view }) {
    view.setContent(content, this.layout);
    return {
      getStatus: () => 'listo',
      pause() {},
      deactivate() {},
    };
  },
};
