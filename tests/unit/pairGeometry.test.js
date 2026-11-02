import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rightCrop, sharedFrame } from '../../assets/js/core/pairGeometry.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('dos videos iguales: el recorte es el cuadro completo y no se recorta nada', () => {
  assert.deepEqual(rightCrop(16 / 9, 16 / 9, 1, 0, 0), [0, 0, 1, 1]);
  assert.deepEqual(sharedFrame(16 / 9, 16 / 9, 1, 0, 0), { frameX: 0, frameY: 0, frameW: 1 });
});

test('el derecho más ancho (4:3 frente a 16:9) recorta franjas laterales centradas', () => {
  const [x, y, w, h] = rightCrop(4 / 3, 16 / 9, 1, 0, 0);
  assert.ok(close(w, 0.75) && close(h, 1) && close(x, 0.125) && close(y, 0));
});

test('si el derecho no cubre todo el cuadro, se recorta lo común conservando la proporción', () => {
  // Escala < 1: el derecho ve la escena más pequeña → su recorte se sale y deja bordes.
  const frame = sharedFrame(16 / 9, 16 / 9, 0.9, 0.02, 0);
  assert.ok(frame.frameW < 1 && frame.frameW >= 0.5);
  assert.ok(frame.frameX >= 0 && frame.frameX + frame.frameW <= 1);
  assert.ok(frame.frameY >= 0 && frame.frameY + frame.frameW <= 1);
});

test('nunca recorta más de la mitad', () => {
  assert.equal(sharedFrame(16 / 9, 16 / 9, 0.3, 0.4, 0.4).frameW, 0.5);
});
