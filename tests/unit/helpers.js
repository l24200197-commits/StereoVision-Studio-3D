/** Generador pseudoaleatorio reproducible (mulberry32): las pruebas dan siempre el mismo resultado. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Archivo de prueba con la misma interfaz que File (name, size, type, slice) sin reservar `size` bytes. */
export function fakeFile(name, bytes, { size = bytes.length, type = '' } = {}) {
  return {
    name,
    size,
    type,
    slice: (start, end) => new Blob([bytes.slice(start, end)]),
  };
}
