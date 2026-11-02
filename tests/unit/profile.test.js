import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTier, resolveProfile } from '../../assets/js/core/deviceProfile.js';
import { boxBlur, quantile, finishDepthMap } from '../../assets/js/core/depthPost.js';
import { runTask } from '../../assets/js/modules/tasks.js';

test('equipo con poca memoria o pocos núcleos → perfil Ahorro con motivo', () => {
  assert.equal(estimateTier({ deviceMemory: 2 }).tier, 'saver');
  assert.equal(estimateTier({ hardwareConcurrency: 2 }).tier, 'saver');
  assert.equal(estimateTier({ saveData: true }).tier, 'saver');
  assert.equal(estimateTier({ maxTextureSize: 2048 }).tier, 'saver');
  assert.equal(estimateTier({ deviceMemory: 8, hardwareConcurrency: 8, maxTextureSize: 16384 }).tier, 'high');
  assert.match(estimateTier({ deviceMemory: 1 }).reason, /memoria/);
});

test('la preferencia del usuario manda sobre la estimación; la exportación respeta la GPU', () => {
  const weak = { deviceMemory: 1, maxTextureSize: 4096 };
  assert.equal(resolveProfile('high', weak).tier, 'high');
  assert.equal(resolveProfile('high', weak).exportMaxPx, 4096);
  assert.equal(resolveProfile('auto', weak).tier, 'saver');
  assert.equal(resolveProfile('cualquiera', {}).pref, 'auto');
});

test('Ahorro reduce costo visual, no la geometría: mismos campos, menos píxeles', () => {
  const high = resolveProfile('high', {});
  const saver = resolveProfile('saver', {});
  assert.ok(saver.pixelRatioCap < high.pixelRatioCap);
  assert.ok(saver.exportMaxPx < high.exportMaxPx);
  assert.equal(saver.mipmaps, false);
});

test('mapa de profundidad: un mapa uniforme sigue uniforme y su plano es su valor', () => {
  const flat = new Uint8Array(40 * 30).fill(128);
  assert.ok(boxBlur(flat, 40, 30, 3).every((v) => v === 128));
  const map = finishDepthMap(flat, 40, 30);
  assert.equal(map.plane, 128 / 255);
  assert.equal(map.data.length, 1200);
});

test('cuantil de la mediana', () => {
  const data = Uint8Array.from({ length: 101 }, (_, i) => i);
  assert.equal(quantile(data, 0.5), 50 / 255);
});

test('las tareas corren también sin Workers y se pueden cancelar antes de empezar', async () => {
  const env = await runTask('envelope', { samples: new Float32Array(16000), sampleRate: 16000 });
  assert.equal(env.length, 100);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runTask('envelope', { samples: new Float32Array(10), sampleRate: 16000 }, { signal: controller.signal }), { name: 'AbortError' });
});
