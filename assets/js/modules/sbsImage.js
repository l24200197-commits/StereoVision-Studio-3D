/**
 * sbsImage.js — Módulo de imágenes estereoscópicas Side-by-Side (SBS).
 *
 * Una imagen SBS contiene dos perspectivas una junto a otra: la mitad izquierda
 * es para el ojo izquierdo y la derecha para el derecho (RN-11). El recorte lo
 * hace el visor; este módulo define el layout de dos regiones y traduce la
 * calibración (desplazamiento, alineación vertical, escala, intercambio de ojos).
 * También acepta Half-SBS (vistas comprimidas a la mitad del ancho) y fotos
 * normales, de las que el visor crea las dos vistas con un relieve simulado.
 */
export function sbsViewParams(params) {
  return {
    source: params.source, // 'sbs' | 'half' | '2d'
    composite: false,
    scale: params.scale / 100,
    shiftX: params.shiftX,
    alignY: params.source === '2d' ? 0 : params.alignY,
    depth: params.source === '2d' ? params.depth : 0,
    swap: params.swap,
    brightness: 0,
    contrast: 1,
    panX: params.panX,
    panY: params.panY,
    rightScale: (params.sizeR ?? 100) / 100,
    rightX: params.rightX ?? 0,
    rightY: params.rightY ?? 0,
    frame: [params.frameX ?? 0, params.frameY ?? 0, params.frameW ?? 1],
  };
}

export const sbsImageModule = {
  id: 'sbs-image',
  kind: 'image',
  layout: 'sbs',
  label: 'Imagen SBS',
  supportsVr: true,

  toViewParams: sbsViewParams,

  activate({ content, view }) {
    view.setContent(content, this.layout);
    return {
      getStatus: () => 'listo',
      pause() {},
      deactivate() {},
    };
  },
};
