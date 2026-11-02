import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createInitialState, STATUS } from '../../assets/js/modules/store.js';
import { defaultParams, controlOf, CALIBRATION } from '../../assets/js/modules/calibration.js';
import { anaglyphModule } from '../../assets/js/modules/anaglyph.js';
import { sbsViewParams } from '../../assets/js/modules/sbsImage.js';
import { formatTime } from '../../assets/js/modules/sbsVideo.js';
import { orderPair } from '../../assets/js/modules/studio.js';
import { commonInstants } from '../../assets/js/modules/alignPair.js';

test('estado inicial: sin módulo, sin archivo, sin trabajo', () => {
  const state = createInitialState();
  assert.equal(state.module, null);
  assert.equal(state.status, STATUS.EMPTY);
  assert.equal(state.task, null);
});

test('el store notifica cambios y permite desuscribirse', () => {
  const store = createStore(createInitialState());
  const seen = [];
  const off = store.subscribe((s) => seen.push(s.status));
  store.set({ status: STATUS.LOADING });
  store.set((s) => ({ status: s.status === STATUS.LOADING ? STATUS.READY : STATUS.ERROR }));
  off();
  store.set({ status: STATUS.ERROR });
  assert.deepEqual(seen, [STATUS.LOADING, STATUS.READY]);
});

test('cada módulo tiene valores iniciales dentro de sus rangos', () => {
  for (const moduleId of Object.keys(CALIBRATION)) {
    const params = defaultParams(moduleId);
    for (const control of CALIBRATION[moduleId]) {
      if (control.type === 'action') continue;
      assert.ok(control.key in params, `${moduleId}.${control.key}`);
      if (control.type === 'range') assert.ok(params[control.key] >= control.min && params[control.key] <= control.max);
    }
    assert.equal(params.panX, 0);
  }
  assert.equal(controlOf('anaglyph', 'scale').max, 300);
  assert.equal(controlOf('sbs-video', 'sync').max, 30);
  assert.equal(controlOf('anaglyph', 'nada'), null);
});

test('anaglifo original: la calibración no inventa disparidad', () => {
  const view = anaglyphModule.toViewParams({ ...defaultParams('anaglyph'), shiftX: 5, swap: true });
  assert.equal(view.composite, false);
  assert.equal(view.shiftX, 0);
  assert.equal(view.swap, false);
});

test('anaglifo creado desde par SBS: desplazamiento, alineación e intercambio pasan al visor', () => {
  const view = anaglyphModule.toViewParams({ ...defaultParams('anaglyph'), source: 'sbs', shiftX: 2, alignY: -1, swap: true });
  assert.deepEqual([view.composite, view.shiftX, view.alignY, view.swap], [true, 2, -1, true]);
});

test('SBS: foto normal ignora la alineación vertical; zoom en fracción', () => {
  const view = sbsViewParams({ ...defaultParams('sbs-image'), source: '2d', alignY: 4, scale: 150 });
  assert.equal(view.alignY, 0);
  assert.equal(view.scale, 1.5);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65.9), '1:05');
  assert.equal(formatTime(NaN), '0:00');
});

test('orden de dos videos por el nombre', () => {
  const f = (name) => ({ name });
  assert.deepEqual(orderPair(f('clip_R.mp4'), f('clip_L.mp4')).map((x) => x.name), ['clip_L.mp4', 'clip_R.mp4']);
  assert.deepEqual(orderPair(f('derecha.mp4'), f('izq.mp4')).map((x) => x.name), ['izq.mp4', 'derecha.mp4']);
  assert.deepEqual(orderPair(f('a.mp4'), f('b.mp4')).map((x) => x.name), ['a.mp4', 'b.mp4']);
  assert.deepEqual(orderPair(f('marco.mp4'), f('b.mp4')).map((x) => x.name), ['marco.mp4', 'b.mp4']); // «r» suelta no dentro de palabra
});

test('instantes comunes de dos videos según la sincronía', () => {
  assert.deepEqual(commonInstants(10, 10, 0, 1), [5]);
  const times = commonInstants(10, 8, 3, 3); // derecho = izquierdo + 3 → el izquierdo solo sirve hasta 5 s
  assert.ok(times.every((t) => t > 0 && t < 5));
  assert.deepEqual(commonInstants(5, 5, 9, 2), []); // no se solapan
});
