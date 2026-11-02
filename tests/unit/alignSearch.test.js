import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchAlignment, scoreCrop, halve } from '../../assets/js/core/alignSearch.js';
import { rightCrop } from '../../assets/js/core/pairGeometry.js';
import { rng } from './helpers.js';

/** Escena continua: manchas gaussianas en posiciones aleatorias (u, v en coordenadas del cuadro izquierdo). */
function world(seed) {
  const random = rng(seed);
  const blobs = Array.from({ length: 28 }, () => ({ u: random() * 1.6 - 0.3, v: random() * 1.6 - 0.3, r: 0.03 + random() * 0.08, a: random() * 200 - 60 }));
  return (u, v) => {
    let value = 90;
    for (const b of blobs) value += b.a * Math.exp(-(((u - b.u) ** 2) + ((v - b.v) ** 2)) / (b.r * b.r));
    return value;
  };
}

/** Miniatura del cuadro izquierdo (v hacia arriba, como UV). */
function leftThumb(f, width, aspect) {
  const height = Math.round(width / aspect);
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) gray[y * width + x] = f((x + 0.5) / width, 1 - (y + 0.5) / height);
  }
  return { gray, width, height };
}

/** Miniatura del derecho: su recorte `crop` (UV) muestra exactamente el cuadro izquierdo. */
function rightThumb(f, width, aspect, crop) {
  const [cx, cy, cw, ch] = crop;
  const height = Math.round(width / aspect);
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tx = (x + 0.5) / width;
      const ty = 1 - (y + 0.5) / height;
      gray[y * width + x] = f((tx - cx) / cw, (ty - cy) / ch);
    }
  }
  return { gray, width, height };
}

test('recupera escala y desplazamiento de un segundo teléfono con otro zoom y otra proporción', () => {
  const aspectL = 16 / 9;
  const aspectR = 4 / 3;
  const truth = { scale: 1.18, ox: 0.05, oy: -0.03 };
  const crop = rightCrop(aspectL, aspectR, truth.scale, truth.ox, truth.oy);
  const frames = [3, 4].map((seed) => world(seed));
  const L = frames.map((f) => leftThumb(f, 64, aspectL));
  const R = frames.map((f) => rightThumb(f, 160, aspectR, crop));
  const result = searchAlignment(L, R, aspectL, aspectR);
  assert.ok(Math.abs(result.scale - truth.scale) < 0.03, `escala ${result.scale}`);
  assert.ok(Math.abs(result.ox - truth.ox) < 0.012, `ox ${result.ox}`);
  assert.ok(Math.abs(result.oy - truth.oy) < 0.012, `oy ${result.oy}`);
  assert.equal(result.confident, true, `score ${result.score} margen ${result.margin}`);
});

test('una pared lisa no produce una alineación «segura»', () => {
  const flat = () => 120;
  const L = [leftThumb(flat, 64, 16 / 9)];
  const R = [leftThumb(flat, 160, 16 / 9)];
  assert.equal(searchAlignment(L, R, 16 / 9, 16 / 9).confident, false);
});

test('dos escenas distintas no se dan por alineadas', () => {
  const L = [leftThumb(world(21), 64, 16 / 9)];
  const R = [leftThumb(world(99), 160, 16 / 9)];
  assert.equal(searchAlignment(L, R, 16 / 9, 16 / 9).confident, false);
});

test('informa el progreso y permite detener la búsqueda', () => {
  const f = world(8);
  const L = [leftThumb(f, 64, 16 / 9)];
  const R = [leftThumb(f, 160, 16 / 9)];
  const seen = [];
  let calls = 0;
  assert.throws(
    () => searchAlignment(L, R, 16 / 9, 16 / 9, { onProgress: (p) => seen.push(p), shouldStop: () => ++calls > 3 }),
    (error) => error.name === 'AbortError',
  );
  assert.ok(seen.length >= 2 && seen.every((p, i) => i === 0 || p >= seen[i - 1]));
});

test('scoreCrop: idéntico = 1; recorte fuera del cuadro = −1', () => {
  const f = world(2);
  const L = leftThumb(f, 32, 1);
  assert.ok(scoreCrop(L, L, [0, 0, 1, 1]) > 0.999);
  assert.equal(scoreCrop(L, L, [2, 2, 1, 1]), -1);
  assert.equal(halve(L).width, 16);
});
