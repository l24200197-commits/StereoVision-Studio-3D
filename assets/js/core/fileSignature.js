/**
 * fileSignature.js — Reconoce un archivo por sus primeros bytes, no por su nombre.
 *
 * La extensión y el tipo MIME los elige quien nombra el archivo; los primeros
 * bytes («número mágico») dicen qué es en realidad. Además, de una imagen se
 * leen ancho y alto de la cabecera, ANTES de decodificarla: una imagen pequeña
 * en bytes puede ocupar gigabytes al abrirse (bomba de descompresión).
 * Sin DOM: corre en Node para las pruebas.
 */

const ascii = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));

/**
 * @param bytes Uint8Array con el inicio del archivo (≥ 16 bytes)
 * @returns { kind: 'image' | 'video' | 'other' | null, format: string | null }
 *          null = no se reconoce (se intentará decodificar de todos modos)
 */
export function sniff(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: 'image', format: 'jpeg' };
  if (bytes.length >= 8 && ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 0x89) return { kind: 'image', format: 'png' };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { kind: 'image', format: 'webp' };
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    // HEIC/AVIF también usan «ftyp», pero son imágenes que este Studio no abre.
    if (/^(heic|heix|hevc|mif1|msf1|avif|avis)$/.test(brand)) return { kind: 'other', format: brand };
    return { kind: 'video', format: brand === 'qt  ' ? 'mov' : 'mp4' };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { kind: 'other', format: 'webm' };
  if (bytes.length >= 6 && ascii(bytes, 0, 3) === 'GIF') return { kind: 'other', format: 'gif' };
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === '%PDF') return { kind: 'other', format: 'pdf' };
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return { kind: 'other', format: 'zip' };
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return { kind: 'other', format: 'bmp' };
  return { kind: null, format: null };
}

/**
 * Ancho y alto de una imagen JPEG, PNG o WebP leídos de su cabecera.
 * @returns { width, height } o null si no está en los bytes recibidos
 */
export function readImageSize(bytes, format) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (format === 'png') {
      if (ascii(bytes, 12, 4) !== 'IHDR') return null;
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (format === 'webp') {
      const chunk = ascii(bytes, 12, 4);
      if (chunk === 'VP8X') {
        const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width: w, height: h };
      }
      if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      if (chunk === 'VP8L') {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    if (format === 'jpeg') {
      // Recorre los segmentos hasta un marcador SOF (inicio de cuadro).
      let at = 2;
      while (at + 9 < bytes.length) {
        if (bytes[at] !== 0xff) return null;
        const marker = bytes[at + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
        if (marker === 0xff) { at += 1; continue; }
        const length = view.getUint16(at + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
        at += 2 + length;
      }
      return null;
    }
  } catch {
    return null; // cabecera truncada
  }
  return null;
}
