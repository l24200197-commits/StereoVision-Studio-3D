import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossCorrelate, crossCorrelateDirect, nextPow2 } from '../../assets/js/core/fft.js';
import { rng } from './helpers.js';

test('nextPow2 redondea hacia arriba a potencia de dos', () => {
  assert.equal(nextPow2(1), 1);
  assert.equal(nextPow2(5), 8);
  assert.equal(nextPow2(1024), 1024);
  assert.equal(nextPow2(1025), 2048);
});

test('la correlación por FFT coincide con la directa (longitudes distintas)', () => {
  const random = rng(7);
  const a = Float32Array.from({ length: 731 }, () => random() - 0.5);
  const b = Float32Array.from({ length: 1290 }, () => random() - 0.5);
  const fast = crossCorrelate(a, b, 400);
  const slow = crossCorrelateDirect(a, b, 400);
  assert.equal(fast.length, slow.length);
  for (let i = 0; i < fast.length; i += 1) assert.ok(Math.abs(fast[i] - slow[i]) < 1e-3, `desfase ${i - 400}: ${fast[i]} ≠ ${slow[i]}`);
});

test('un pulso desplazado da el pico en el desfase correcto', () => {
  const a = new Float32Array(200);
  const b = new Float32Array(200);
  a[50] = 1;
  b[73] = 1; // aparece 23 muestras después
  const scores = crossCorrelate(a, b, 60);
  const best = scores.indexOf(Math.max(...scores)) - 60;
  assert.equal(best, 23);
});
