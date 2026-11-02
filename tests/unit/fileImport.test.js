import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sniff, readImageSize } from '../../assets/js/core/fileSignature.js';
import { validateFile, ImportError, LIMITS, formatBytes } from '../../assets/js/modules/fileImport.js';
import { fakeFile } from './helpers.js';

const media = (name) => readFile(new URL(`../../assets/media/${name}`, import.meta.url));

function pngHeader(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function webpHeader(kind, width, height) {
  const bytes = new Uint8Array(40);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode(kind), 12);
  const view = new DataView(bytes.buffer);
  if (kind === 'VP8X') {
    const w = width - 1;
    const h = height - 1;
    bytes.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24);
  } else if (kind === 'VP8 ') {
    bytes.set([0x9d, 0x01, 0x2a], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  } else {
    bytes[20] = 0x2f;
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  }
  return bytes;
}

test('reconoce formatos por su firma, no por el nombre', async () => {
  assert.deepEqual(sniff(await media('sbs_muestra.jpg')), { kind: 'image', format: 'jpeg' });
  assert.equal(sniff(await media('sbs_muestra.mp4')).kind, 'video');
  assert.deepEqual(sniff(pngHeader(10, 10)), { kind: 'image', format: 'png' });
  assert.deepEqual(sniff(new TextEncoder().encode('%PDF-1.7 ...')), { kind: 'other', format: 'pdf' });
  assert.deepEqual(sniff(new TextEncoder().encode('GIF89a......')), { kind: 'other', format: 'gif' });
  const heic = new Uint8Array(16);
  heic.set(new TextEncoder().encode('ftypheic'), 4);
  assert.equal(sniff(heic).kind, 'other');
  assert.deepEqual(sniff(new Uint8Array(16)), { kind: null, format: null });
});

test('lee ancho y alto de la cabecera sin decodificar (JPEG, PNG, WebP)', async () => {
  assert.deepEqual(readImageSize(await media('sbs_muestra.jpg'), 'jpeg'), { width: 1240, height: 936 });
  assert.deepEqual(readImageSize(pngHeader(4000, 3000), 'png'), { width: 4000, height: 3000 });
  assert.deepEqual(readImageSize(webpHeader('VP8X', 5000, 2500), 'webp'), { width: 5000, height: 2500 });
  assert.deepEqual(readImageSize(webpHeader('VP8 ', 640, 480), 'webp'), { width: 640, height: 480 });
  assert.deepEqual(readImageSize(webpHeader('VP8L', 1024, 768), 'webp'), { width: 1024, height: 768 });
  assert.equal(readImageSize(new Uint8Array([0xff, 0xd8, 0xff]), 'jpeg'), null); // truncado
});

const rejects = (promise, code) => assert.rejects(promise, (error) => error instanceof ImportError && error.code === code);

test('importar una imagen válida devuelve formato y tamaño', async () => {
  const bytes = await media('sbs_muestra.jpg');
  const info = await validateFile(fakeFile('foto.jpg', bytes, { type: 'image/jpeg' }), 'image');
  assert.deepEqual(info, { format: 'jpeg', width: 1240, height: 936 });
});

test('archivo vacío → error claro', () => rejects(validateFile(fakeFile('vacio.jpg', new Uint8Array(0)), 'image'), 'empty-file'));

test('sin archivo → error claro', () => rejects(validateFile(null, 'image'), 'empty'));

test('extensión no admitida → error de formato', () => rejects(validateFile(fakeFile('notas.txt', new Uint8Array([1, 2, 3])), 'image'), 'format'));

test('un PDF renombrado a .jpg se detecta por su contenido', () => (
  rejects(validateFile(fakeFile('foto.jpg', new TextEncoder().encode('%PDF-1.4 hola')), 'image'), 'format')
));

test('una imagen con bytes basura no se intenta abrir', () => (
  rejects(validateFile(fakeFile('foto.png', new Uint8Array(64).fill(7)), 'image'), 'decode')
));

test('video en el módulo de imagen (y al revés) → indica el módulo correcto', async () => {
  await rejects(validateFile(fakeFile('clip.mp4', await media('sbs_muestra.mp4')), 'image'), 'module-mismatch');
  await rejects(validateFile(fakeFile('foto.jpg', await media('sbs_muestra.jpg')), 'video'), 'module-mismatch');
  // Una imagen disfrazada de .mp4 también se detecta.
  await rejects(validateFile(fakeFile('clip.mp4', await media('sbs_muestra.jpg')), 'video'), 'module-mismatch');
});

test('archivo demasiado grande en bytes → error con el límite', async () => {
  const bytes = await media('sbs_muestra.jpg');
  await assert.rejects(
    validateFile(fakeFile('enorme.jpg', bytes, { size: LIMITS.imageBytes + 1 }), 'image'),
    (error) => error.code === 'too-large' && /límite/.test(error.message),
  );
});

test('imagen con demasiados megapíxeles (bomba de descompresión) → se rechaza antes de decodificar', () => (
  rejects(validateFile(fakeFile('bomba.png', pngHeader(20000, 20000)), 'image'), 'too-large')
));

test('imagen más grande que la textura máxima de la GPU → se rechaza con el límite del equipo', async () => {
  await assert.rejects(
    validateFile(fakeFile('ancha.png', pngHeader(9000, 1000)), 'image', { maxTextureSize: 8192 }),
    (error) => error.code === 'too-large' && /8192/.test(error.message),
  );
});

test('formatBytes usa la unidad adecuada', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1048576), '5.00 MB');
  assert.equal(formatBytes(3 * 1024 ** 3), '3.00 GB');
});
