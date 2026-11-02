/**
 * pairGeometry.js — Geometría de dos videos (uno por ojo) de cámaras distintas.
 *
 * El visor (stereoView.js), la búsqueda de alineación (alignSearch.js) y la
 * unión automática (studio.js) usan estas mismas fórmulas, así que lo que se
 * calcula es exactamente lo que se dibuja.
 */

/**
 * Recorte del video derecho, en UV (y hacia arriba), que corresponde al cuadro
 * completo del izquierdo.
 * @param aspectLeft, aspectRight  ancho / alto de cada video
 * @param scale  tamaño relativo de la escena en el derecho (1 = igual)
 * @param ox, oy desplazamiento del recorte en UV
 * @returns [x, y, ancho, alto]
 */
export function rightCrop(aspectLeft, aspectRight, scale, ox, oy) {
  const fw = aspectLeft / aspectRight / scale;
  const fh = 1 / scale;
  return [0.5 - fw / 2 + ox, 0.5 - fh / 2 + oy, fw, fh];
}

/**
 * Zona del cuadro izquierdo (0…1) que cubren LOS DOS videos ya igualados. Se
 * recorta a ella, conservando la proporción, para que ningún ojo vea bordes
 * negros que el otro no ve. Nunca recorta más de la mitad.
 * @returns { frameX, frameY, frameW }  frameW = ancho y alto relativos
 */
export function sharedFrame(aspectLeft, aspectRight, scale, ox, oy) {
  const [cx, cy, fw, fh] = rightCrop(aspectLeft, aspectRight, scale, ox, oy);
  const u0 = Math.max(0, -cx / fw);
  const u1 = Math.min(1, (1 - cx) / fw);
  const v0 = Math.max(0, -cy / fh);
  const v1 = Math.min(1, (1 - cy) / fh);
  const size = Math.max(0.5, Math.min(1, u1 - u0, v1 - v0));
  const place = (lo, hi) => Math.min(Math.max((lo + hi) / 2 - size / 2, 0), 1 - size);
  return { frameX: place(u0, u1), frameY: place(v0, v1), frameW: size };
}
