/**
 * audioSync.js — Encuentra el desfase entre dos videos grabados a la vez.
 *
 * Dos teléfonos que graban la misma escena escuchan los mismos sonidos (voces,
 * pasos, un aplauso) aunque hayan empezado a grabar en momentos distintos. Se
 * compara la «huella» de golpes de sonido de cada audio y se busca el desfase
 * en el que mejor coinciden. Todo se decodifica en el dispositivo.
 *
 * Devuelve offset en segundos con el sentido que usa el Studio:
 *   tiempoDerecho = tiempoIzquierdo + offset
 */
const RATE = 100; // huellas por segundo (resolución de 10 ms, menos que un cuadro)
const MAX_SECONDS = 120; // solo se analizan los primeros 2 min de cada audio
const MAX_LAG_SECONDS = 20; // desfase máximo que se busca

async function decode(file) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('Este navegador no decodifica audio.');
  const ctx = new Ctx(1, 44100, 44100);
  const data = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    // Forma con callbacks: también funciona en Safari antiguos.
    ctx.decodeAudioData(data, resolve, () => reject(new Error('Sin pista de audio legible.')));
  });
}

/** Huella de golpes: subidas de energía cada 10 ms, normalizadas. */
function onsetEnvelope(buffer) {
  const bin = Math.max(1, Math.round(buffer.sampleRate / RATE));
  const length = Math.min(buffer.length, buffer.sampleRate * MAX_SECONDS);
  const bins = Math.floor(length / bin);
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));

  const energy = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) {
    let sum = 0;
    for (let j = i * bin, end = j + bin; j < end; j += 1) {
      let v = 0;
      for (const ch of channels) v += ch[j];
      sum += v * v;
    }
    energy[i] = Math.log(1e-6 + sum / bin);
  }
  const onset = new Float32Array(bins);
  let mean = 0;
  for (let i = 1; i < bins; i += 1) {
    onset[i] = Math.max(0, energy[i] - energy[i - 1]);
    mean += onset[i];
  }
  mean /= bins || 1;
  let sq = 0;
  for (let i = 0; i < bins; i += 1) {
    onset[i] -= mean;
    sq += onset[i] * onset[i];
  }
  const norm = Math.sqrt(sq) || 1;
  for (let i = 0; i < bins; i += 1) onset[i] /= norm;
  return onset;
}

/**
 * @returns {{ offset: number, confident: boolean }} o lanza si algún video no trae audio.
 */
export async function estimateAudioOffset(fileLeft, fileRight) {
  const [a, b] = await Promise.all([decode(fileLeft), decode(fileRight)]);
  const left = onsetEnvelope(a);
  const right = onsetEnvelope(b);

  const maxLag = Math.min(MAX_LAG_SECONDS * RATE, Math.max(left.length, right.length) - 1);
  const scores = new Float32Array(2 * maxLag + 1);
  // Correlación cruzada: un suceso en izquierda[i] aparece en derecha[i + lag].
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    const from = Math.max(0, -lag);
    const to = Math.min(left.length, right.length - lag);
    for (let i = from; i < to; i += 1) sum += left[i] * right[i + lag];
    scores[lag + maxLag] = sum;
  }

  let best = 0;
  for (let i = 1; i < scores.length; i += 1) if (scores[i] > scores[best]) best = i;
  // Confianza: el pico debe destacar sobre el segundo mejor lejos de él (±0.3 s).
  let second = -Infinity;
  for (let i = 0; i < scores.length; i += 1) {
    if (Math.abs(i - best) > 0.3 * RATE && scores[i] > second) second = scores[i];
  }
  const peak = scores[best];
  const confident = peak > 0.05 && peak > second * 1.25;
  return { offset: (best - maxLag) / RATE, confident };
}
