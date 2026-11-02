/**
 * fileImport.js — Selección, validación y decodificación de archivos locales.
 *
 * Responsabilidad: comprobar formato (RN-03), confirmar que el navegador puede
 * decodificar el archivo (RN-02) y devolver un "contenido" con un método
 * release() que libera todo lo que se reservó (RN-05). Los archivos nunca salen
 * del dispositivo: se leen con URL.createObjectURL (RN-19).
 *
 * La validación no confía solo en el nombre: lee los primeros bytes (firma) y,
 * en imágenes, el ancho y alto de la cabecera ANTES de decodificar, para
 * rechazar a tiempo archivos disfrazados o imágenes que agotarían la memoria.
 */
import { sniff, readImageSize } from '../core/fileSignature.js';

export const FORMATS = Object.freeze({
  image: {
    label: 'JPG, PNG o WebP',
    exts: ['jpg', 'jpeg', 'png', 'webp'],
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  },
  video: {
    label: 'MP4',
    exts: ['mp4'],
    mimes: ['video/mp4'],
    accept: '.mp4,video/mp4',
  },
});

/** Límites: por encima, el navegador de un teléfono se queda sin memoria al abrirlo. */
export const LIMITS = Object.freeze({
  imageBytes: 80 * 1024 * 1024,
  videoBytes: 4 * 1024 * 1024 * 1024,
  imagePixels: 100e6, // 100 megapíxeles ≈ 400 MB decodificados
});

const VIDEO_LOAD_TIMEOUT_MS = 20000;
const HEADER_BYTES = 256 * 1024; // un JPEG con miniatura EXIF puede llevar su tamaño lejos del inicio

export class ImportError extends Error {
  constructor(message, code = 'import') {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function kindOf(file) {
  const ext = extensionOf(file.name);
  const type = (file.type || '').toLowerCase();
  if (FORMATS.image.exts.includes(ext) || FORMATS.image.mimes.includes(type)) return 'image';
  if (FORMATS.video.exts.includes(ext) || FORMATS.video.mimes.includes(type)) return 'video';
  return null;
}

const NAMES = Object.freeze({
  webm: 'un video WebM', gif: 'una imagen GIF', pdf: 'un documento PDF', zip: 'un archivo comprimido',
  bmp: 'una imagen BMP', heic: 'una foto HEIC', heix: 'una foto HEIC', hevc: 'una foto HEIC', mif1: 'una foto HEIC',
  msf1: 'una foto HEIC', avif: 'una imagen AVIF', avis: 'una imagen AVIF',
});

/**
 * Comprueba nombre, tamaño y contenido del archivo. Lanza ImportError con un
 * mensaje que explica qué pasó y cómo continuar (RN-04).
 * @param options { maxTextureSize } para rechazar imágenes que la GPU no admite
 * @returns { format, width?, height? } lo que se supo sin decodificar
 */
export async function validateFile(file, expectedKind, { maxTextureSize = Infinity } = {}) {
  if (!file) throw new ImportError('No se recibió ningún archivo. Vuelve a seleccionarlo.', 'empty');

  if (file.size === 0) {
    throw new ImportError(
      `«${file.name}» está vacío (0 bytes). Elige otro archivo ${FORMATS[expectedKind].label}.`,
      'empty-file',
    );
  }

  const kind = kindOf(file);
  if (!kind) {
    throw new ImportError(
      `«${file.name}» no es un formato admitido. Este módulo acepta ${FORMATS[expectedKind].label}.`,
      'format',
    );
  }
  if (kind !== expectedKind) throw mismatch(file, kind, expectedKind);

  const limit = expectedKind === 'image' ? LIMITS.imageBytes : LIMITS.videoBytes;
  if (file.size > limit) {
    throw new ImportError(
      `«${file.name}» pesa ${formatBytes(file.size)} y el límite para ${expectedKind === 'image' ? 'imágenes' : 'videos'} es ${formatBytes(limit)}. Reduce su tamaño o su resolución e impórtalo de nuevo.`,
      'too-large',
    );
  }

  // El contenido manda sobre el nombre: un .jpg que en realidad es un PDF se rechaza aquí.
  const head = new Uint8Array(await file.slice(0, expectedKind === 'image' ? HEADER_BYTES : 64).arrayBuffer());
  const signature = sniff(head);
  if (signature.kind === 'other') {
    throw new ImportError(
      `«${file.name}» en realidad es ${NAMES[signature.format] ?? 'un formato distinto'}, aunque su nombre diga otra cosa. Este módulo acepta ${FORMATS[expectedKind].label}.`,
      'format',
    );
  }
  if (signature.kind && signature.kind !== expectedKind) throw mismatch(file, signature.kind, expectedKind);
  if (expectedKind === 'image' && !signature.kind) {
    throw new ImportError(
      `«${file.name}» no tiene el contenido de una imagen ${FORMATS.image.label}: puede estar dañado o tener otra extensión.`,
      'decode',
    );
  }

  const size = signature.kind === 'image' ? readImageSize(head, signature.format) : null;
  if (size) {
    if (size.width * size.height > LIMITS.imagePixels) {
      throw new ImportError(
        `«${file.name}» mide ${size.width} × ${size.height} px (${Math.round((size.width * size.height) / 1e6)} MP); el máximo es ${LIMITS.imagePixels / 1e6} MP. Reduce su resolución e impórtala de nuevo.`,
        'too-large',
      );
    }
    if (Math.max(size.width, size.height) > maxTextureSize) throw tooLargeForGpu(file, size.width, size.height, maxTextureSize);
  }
  return { format: signature.format, ...(size ?? {}) };
}

function mismatch(file, kind, expectedKind) {
  const wanted = expectedKind === 'image' ? 'una imagen' : 'un video MP4';
  const other = kind === 'image' ? 'una imagen' : 'un video';
  const hint = kind === 'image' ? 'Cambia al módulo Anaglifo o Imagen SBS.' : 'Cambia al módulo Video SBS.';
  return new ImportError(`«${file.name}» es ${other}, pero este módulo necesita ${wanted}. ${hint}`, 'module-mismatch');
}

export function tooLargeForGpu(file, width, height, maxTextureSize) {
  return new ImportError(
    `«${file.name}» mide ${width} × ${height} px y este dispositivo admite hasta ${maxTextureSize} px por lado. Reduce su tamaño e impórtalo de nuevo.`,
    'too-large',
  );
}

/** Decodifica una imagen y devuelve su contenido. */
export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';

  const fail = () => {
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
    return new ImportError(
      `No se pudo decodificar «${file.name}». El archivo puede estar dañado o no ser una imagen válida. Prueba con otra imagen ${FORMATS.image.label}.`,
      'decode',
    );
  };

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    if (image.decode) await image.decode().catch(() => {});
  } catch {
    throw fail();
  }
  if (!image.naturalWidth || !image.naturalHeight) throw fail();

  return {
    kind: 'image',
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release() {
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      URL.revokeObjectURL(url);
    },
  };
}

/**
 * Prepara un video. Espera a tener al menos un cuadro decodificado, de modo que
 * la textura pueda crearse sin advertencias de WebGL.
 * @param holder elemento del DOM donde vive el <video> (nunca visible)
 */
export async function loadVideo(file, holder) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true; // RN-18: reproducir dentro de la página en iOS
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.muted = false;
  holder.append(video);

  const release = () => {
    video.pause();
    video.removeAttribute('src');
    video.load(); // suelta el decodificador
    video.remove();
    URL.revokeObjectURL(url);
  };

  const fail = (reason) => {
    release();
    return new ImportError(
      `No se pudo reproducir «${file.name}»${reason ? ` (${reason})` : ''}. Usa un MP4 con video H.264 y audio AAC, que es el más compatible, y vuelve a importarlo.`,
      'decode',
    );
  };

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tiempo de espera agotado')), VIDEO_LOAD_TIMEOUT_MS);
      video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener(
        'error',
        () => { clearTimeout(timer); reject(new Error('el navegador no admite este códec')); },
        { once: true },
      );
      video.src = url;
      video.load();
    });
  } catch (err) {
    throw fail(err.message);
  }

  if (!video.videoWidth || !video.videoHeight) throw fail('no contiene imagen decodificable');
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw fail('duración no válida');

  return {
    kind: 'video',
    source: video,
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration,
    release,
  };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export { extensionOf };
