import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeAwareBlur, normalizeDepthMap, finishDepthMap } from '../../assets/js/core/depthPost.js';

test('el suavizado edge-aware conserva un borde fuerte de profundidad', () => {
  const w = 24; const h = 16;
  const input = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) input[y * w + x] = x < w / 2 ? 24 : 230;
  }
  const output = edgeAwareBlur(input, w, h, 3, 18);
  assert.ok(output[8 * w + 10] < 45, 'el lado oscuro no debe contaminarse');
  assert.ok(output[8 * w + 13] > 210, 'el lado claro no debe contaminarse');
});

test('normalización robusta expande el rango sin alterar un mapa uniforme', () => {
  const flat = new Uint8Array(100).fill(117);
  assert.ok(normalizeDepthMap(flat).every((value) => value === 117));
  const varied = Uint8Array.from({ length: 100 }, (_, i) => 60 + i);
  const normalized = normalizeDepthMap(varied);
  assert.equal(normalized[0], 0);
  assert.equal(normalized[99], 255);
});

test('finishDepthMap rechaza dimensiones inconsistentes', () => {
  assert.throws(() => finishDepthMap(new Uint8Array(8), 3, 3), RangeError);
});
