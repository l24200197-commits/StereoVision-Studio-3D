/**
 * sbsVideo.js — Módulo de video estereoscópico Side-by-Side.
 *
 * Un único elemento <video> alimenta una sola textura y las dos regiones
 * (ojo izquierdo y derecho) recortan mitades de ese mismo cuadro. Como las dos
 * perspectivas salen del mismo cuadro de video, comparten por construcción
 * tiempo, pausa, volumen y búsqueda (RN-14) y la calibración no puede
 * desincronizarlas.
 *
 * Este módulo conecta los controles de reproducción con el video y mantiene el
 * dibujo al ritmo de los cuadros mientras se reproduce.
 */
import { STATUS } from './store.js';
import { sbsViewParams } from './sbsImage.js';

const SKIP_SECONDS = 10;

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export const sbsVideoModule = {
  id: 'sbs-video',
  kind: 'video',
  layout: 'sbs',
  label: 'Video SBS',
  supportsVr: true,

  toViewParams: sbsViewParams,

  activate({ content, view, store, ui }) {
    const video = content.source;
    const t = ui.transport;
    const ac = new AbortController();
    const on = (target, type, handler) => target.addEventListener(type, handler, { signal: ac.signal });

    let running = false;
    let frameId = 0;
    let scrubbing = false;

    /* ---- Dibujo sincronizado con los cuadros del video ---- */
    function nextFrame() {
      if (!running) return;
      if (video.requestVideoFrameCallback) frameId = video.requestVideoFrameCallback(onFrame);
      else frameId = requestAnimationFrame(onFrame);
    }
    function onFrame() {
      if (!running) return;
      view.requestRender();
      updateTime();
      nextFrame();
    }
    function startDriver() {
      if (running) return;
      running = true;
      nextFrame();
    }
    function stopDriver() {
      running = false;
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameId);
      cancelAnimationFrame(frameId);
    }

    /* ---- Interfaz de transporte ---- */
    function updateTime() {
      const duration = video.duration || 0;
      t.time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
      if (!scrubbing && duration > 0) t.seek.value = String(Math.round((video.currentTime / duration) * 1000));
      t.seek.setAttribute('aria-valuetext', `${formatTime(video.currentTime)} de ${formatTime(duration)}`);
    }
    function updateVolumeUi() {
      t.volume.value = String(Math.round(video.volume * 100));
      t.mute.setAttribute('aria-pressed', String(video.muted));
      t.mute.querySelector('.label').textContent = video.muted || video.volume === 0 ? 'Silenciado' : 'Sonido';
    }
    function updatePlayUi() {
      const playing = !video.paused && !video.ended;
      t.play.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
      t.play.querySelector('.label').textContent = playing ? 'Pausar' : 'Reproducir';
      t.play.dataset.state = playing ? 'playing' : 'paused';
    }

    /* ---- Acciones ---- */
    function getStatus() {
      if (!video.paused && !video.ended) return STATUS.PLAYING;
      return video.currentTime > 0 ? STATUS.PAUSED : STATUS.READY;
    }
    async function play() {
      try {
        // Si quedó al final (aunque el navegador aún no marque "ended"), vuelve a empezar.
        if (video.ended || video.currentTime >= (video.duration || 0) - 0.05) video.currentTime = 0;
        await video.play(); // solo se llama desde un gesto del usuario (RN-18)
      } catch (error) {
        if (error?.name === 'AbortError') return;
        store.set({
          message: {
            kind: 'error',
            text: 'El navegador no permitió iniciar la reproducción. Toca de nuevo Reproducir; si sigue igual, prueba con otro MP4 (H.264 + AAC).',
          },
        });
      }
    }
    function pause() {
      video.pause();
    }
    function toggle() {
      return video.paused || video.ended ? play() : pause();
    }
    function seekBy(delta) {
      const duration = video.duration || 0;
      video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), duration);
    }

    on(t.play, 'click', toggle);
    on(t.back, 'click', () => seekBy(-SKIP_SECONDS));
    on(t.fwd, 'click', () => seekBy(SKIP_SECONDS));
    on(t.seek, 'pointerdown', () => { scrubbing = true; });
    on(t.seek, 'pointerup', () => { scrubbing = false; });
    on(t.seek, 'keydown', () => { scrubbing = false; });
    on(t.seek, 'input', () => {
      video.currentTime = (Number(t.seek.value) / 1000) * (video.duration || 0);
      updateTime();
    });
    on(t.volume, 'input', () => {
      video.volume = Number(t.volume.value) / 100;
      video.muted = video.volume === 0;
    });
    on(t.mute, 'click', () => { video.muted = !video.muted; });

    /* ---- Eventos reales del medio → estado de la aplicación ---- */
    const setStatus = (status) => {
      // Durante una importación nueva el estado "cargando" manda.
      if (store.get().status !== STATUS.LOADING) store.set({ status });
    };
    on(video, 'play', () => { startDriver(); updatePlayUi(); setStatus(STATUS.PLAYING); });
    on(video, 'pause', () => { stopDriver(); updatePlayUi(); view.requestRender(); setStatus(getStatus()); });
    on(video, 'ended', () => { stopDriver(); updatePlayUi(); updateTime(); setStatus(STATUS.PAUSED); });
    on(video, 'seeked', () => { view.requestRender(); updateTime(); });
    on(video, 'timeupdate', updateTime);
    on(video, 'durationchange', updateTime);
    on(video, 'volumechange', updateVolumeUi);
    on(video, 'error', () => {
      stopDriver();
      updatePlayUi();
      store.set({
        status: STATUS.ERROR,
        message: {
          kind: 'error',
          text: 'La reproducción falló a mitad del video. Importa el mismo archivo otra vez o elige otro MP4.',
        },
      });
    });

    /* ---- Arranque ---- */
    video.currentTime = 0;
    video.volume = 1;
    video.muted = false;
    t.seek.value = '0';
    updateTime();
    updateVolumeUi();
    updatePlayUi();
    view.setContent(content, this.layout);

    return {
      getStatus,
      play,
      pause,
      toggle,
      seekBy,
      deactivate() {
        stopDriver();
        ac.abort(); // quita todos los escuchas de este video y de la barra
        video.pause();
      },
    };
  },
};
