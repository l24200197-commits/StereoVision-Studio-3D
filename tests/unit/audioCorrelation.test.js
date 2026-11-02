import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onsetEnvelope, estimateOffset } from '../../assets/js/core/audioCorrelation.js';
import { rng } from './helpers.js';

const RATE = 16000;

/** Escena sonora: golpes cortos en instantes aleatorios sobre ruido de fondo. */
function scene(seconds, events, random, noise = 0.01) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = (random() - 0.5) * noise;
  for (const t of events) {
    const start = Math.round(t * RATE);
    for (let k = 0; k < 800 && start + k < out.length; k += 1) out[start + k] += Math.sin(k * 0.3) * Math.exp(-k / 150);
  }
  return out;
}

/** Recorte de la escena a partir de `from` segundos (lo que graba un teléfono que empezó después). */
const recording = (signal, from, seconds) => signal.slice(Math.round(from * RATE), Math.round((from + seconds) * RATE));

function makeEvents(random, count, span) {
  return Array.from({ length: count }, () => random() * span).sort((a, b) => a - b);
}

test('la huella tiene media cero y norma 1', () => {
  const random = rng(3);
  const env = onsetEnvelope(scene(5, makeEvents(random, 12, 5), random), RATE);
  assert.equal(env.length, 500);
  const mean = env.reduce((s, v) => s + v, 0) / env.length;
  const norm = Math.sqrt(env.reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(mean) < 1e-6);
  assert.ok(Math.abs(norm - 1) < 1e-4);
});

test('un audio en silencio da una huella nula (sin NaN)', () => {
  const env = onsetEnvelope(new Float32Array(RATE * 2), RATE);
  assert.ok(env.every((v) => v === 0));
});

for (const [label, leftStart, rightStart] of [['derecho empezó antes', 4.0, 2.63], ['derecho empezó después', 1.0, 3.47]]) {
  test(`encuentra el desfase con precisión de 20 ms (${label})`, () => {
    const random = rng(11);
    const world = scene(60, makeEvents(random, 40, 60), random);
    const left = onsetEnvelope(recording(world, leftStart, 40), RATE);
    const right = onsetEnvelope(recording(world, rightStart, 40), RATE);
    const result = estimateOffset(left, right);
    // Un suceso en el instante T del mundo: izquierdo lo oye en T − leftStart, derecho en T − rightStart.
    const expected = leftStart - rightStart;
    assert.ok(Math.abs(result.offset - expected) < 0.02, `offset ${result.offset} esperado ${expected}`);
    assert.equal(result.confident, true);
  });
}

test('dos grabaciones sin relación no se dan por sincronizadas', () => {
  const random = rng(5);
  const a = onsetEnvelope(scene(30, makeEvents(random, 30, 30), random), RATE);
  const b = onsetEnvelope(scene(30, makeEvents(random, 30, 30), random), RATE);
  assert.equal(estimateOffset(a, b).confident, false);
});

test('audio demasiado corto lanza un error explicable', () => {
  assert.throws(() => estimateOffset(new Float32Array(1), new Float32Array(10)), /corto/);
});
