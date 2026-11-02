/**
 * deviceProfile.js — Degradación progresiva según la capacidad del equipo.
 *
 * Con las señales que da el navegador (memoria, núcleos, tamaño máximo de
 * textura, ahorro de datos) se estima un perfil y, con él, cuánto se gasta en
 * cosas que NO cambian la geometría estéreo:
 *   · densidad de píxeles del lienzo (nitidez en pantallas muy densas),
 *   · mipmaps de imágenes (suavidad al alejar; +33 % de memoria de GPU),
 *   · tamaño máximo de exportación y de la copia que analiza la IA,
 *   · efectos decorativos de la interfaz.
 * Nunca cambia recortes, desplazamientos ni la resolución de la textura del
 * archivo: la precisión estereoscópica es la misma en todos los perfiles.
 *
 * Preferencia del usuario: 'auto' (estimar), 'high' o 'saver'.
 */

export const QUALITY_PREFS = Object.freeze(['auto', 'high', 'saver']);

const PROFILES = Object.freeze({
  high: { tier: 'high', pixelRatioCap: 2, mipmaps: true, exportMaxPx: 8192, depthInputPx: 640, analysisThumbs: 3, lite: false },
  saver: { tier: 'saver', pixelRatioCap: 1.25, mipmaps: false, exportMaxPx: 4096, depthInputPx: 448, analysisThumbs: 2, lite: true },
});

/**
 * @param signals { deviceMemory?, hardwareConcurrency?, maxTextureSize?, saveData? }
 * @returns 'high' | 'saver' y el motivo, para mostrarlo al usuario
 */
export function estimateTier({ deviceMemory, hardwareConcurrency, maxTextureSize, saveData } = {}) {
  if (saveData) return { tier: 'saver', reason: 'el navegador pide ahorrar datos' };
  if (Number.isFinite(deviceMemory) && deviceMemory <= 2) return { tier: 'saver', reason: `memoria del equipo: ${deviceMemory} GB` };
  if (Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 2) return { tier: 'saver', reason: `${hardwareConcurrency} núcleos de procesador` };
  if (Number.isFinite(maxTextureSize) && maxTextureSize < 4096) return { tier: 'saver', reason: `textura máxima de ${maxTextureSize} px` };
  return { tier: 'high', reason: 'capacidad suficiente' };
}

export function resolveProfile(pref, signals) {
  const estimate = estimateTier(signals);
  const tier = pref === 'high' || pref === 'saver' ? pref : estimate.tier;
  const exportMaxPx = Math.min(PROFILES[tier].exportMaxPx, signals?.maxTextureSize || Infinity);
  return { ...PROFILES[tier], exportMaxPx, pref: QUALITY_PREFS.includes(pref) ? pref : 'auto', estimate };
}

/** Señales del navegador actual (en Node, las que existan). */
export function browserSignals(maxTextureSize) {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  return {
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    saveData: Boolean(nav.connection?.saveData),
    maxTextureSize,
  };
}
