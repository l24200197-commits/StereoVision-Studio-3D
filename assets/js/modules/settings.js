/**
 * settings.js — Preferencias del Studio y diálogos de Ajustes y Atajos.
 *
 * Guarda en este navegador solo dos cosas: la calidad elegida y (vrWizard.js)
 * la calibración de las gafas. Ningún archivo ni dato del usuario.
 * La calidad se traduce a un perfil (core/deviceProfile.js) que se aplica al
 * visor al instante y, en «Ahorro», apaga efectos decorativos de la interfaz.
 */
import { QUALITY_PREFS, resolveProfile, browserSignals } from '../core/deviceProfile.js';
import { loadLens, forgetLens } from './vrWizard.js';

const STORAGE_KEY = 'svs3d.quality';
const CONFIRM_MS = 4000;

function readPref() {
  try {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('quality'); // ?quality=saver para probar en un equipo potente
    if (QUALITY_PREFS.includes(fromUrl)) return fromUrl;
    const saved = localStorage.getItem(STORAGE_KEY);
    return QUALITY_PREFS.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function writePref(pref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

const TIER_NAME = Object.freeze({ high: 'Alta', saver: 'Ahorro' });

/**
 * @param view  StereoView o null (sin WebGL)
 * @param onProfile(profile) se llama cada vez que cambia el perfil
 */
export function createSettings({ view, onProfile }) {
  const dialog = document.getElementById('dlg-settings');
  const shortcuts = document.getElementById('dlg-shortcuts');
  const radios = [...dialog.querySelectorAll('input[name="quality"]')];
  const qualityNote = document.getElementById('quality-note');
  const lensNote = document.getElementById('lens-note');
  const forget = document.getElementById('btn-forget-lens');
  const signals = browserSignals(view?.maxTextureSize);

  let profile = resolveProfile(readPref(), signals);

  function apply() {
    view?.setQuality(profile);
    document.body.classList.toggle('is-lite', profile.lite);
    onProfile?.(profile);
  }

  function renderDialog() {
    for (const radio of radios) radio.checked = radio.value === profile.pref;
    const auto = profile.pref === 'auto'
      ? `Automática eligió «${TIER_NAME[profile.estimate.tier]}» (${profile.estimate.reason}).`
      : `Elegiste «${TIER_NAME[profile.tier]}». La estimación para este equipo es «${TIER_NAME[profile.estimate.tier]}» (${profile.estimate.reason}).`;
    const ratio = view ? ` Densidad del lienzo: ${view.pixelRatio.toFixed(2)}×; exportación hasta ${profile.exportMaxPx} px.` : '';
    qualityNote.textContent = auto + ratio;
    const lens = loadLens();
    lensNote.textContent = lens.saved
      ? `Guardada en este navegador: separación ${lens.x.toFixed(1)} %, altura ${lens.y.toFixed(1)} %.`
      : 'Todavía no hay una calibración guardada. El asistente aparece la primera vez que entras al modo VR.';
    forget.disabled = !lens.saved;
    forget.textContent = 'Olvidar la calibración de las gafas';
    delete forget.dataset.confirm;
  }

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      writePref(radio.value);
      profile = resolveProfile(radio.value, signals);
      apply();
      renderDialog();
    });
  }

  // Borrar la calibración de las gafas pide una segunda pulsación: se hizo con las gafas puestas.
  let confirmTimer = 0;
  forget.addEventListener('click', () => {
    if (forget.dataset.confirm !== 'true') {
      forget.dataset.confirm = 'true';
      forget.textContent = 'Pulsa otra vez para confirmar';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(renderDialog, CONFIRM_MS);
      return;
    }
    clearTimeout(confirmTimer);
    forgetLens();
    renderDialog();
    lensNote.textContent = 'Calibración olvidada. El asistente aparecerá la próxima vez que entres al modo VR.';
  });

  const open = (target) => {
    if (target === dialog) renderDialog();
    target.showModal();
  };
  document.getElementById('btn-settings').addEventListener('click', () => open(dialog));
  document.getElementById('btn-shortcuts').addEventListener('click', () => open(shortcuts));
  // Clic fuera del recuadro cierra el diálogo.
  for (const target of [dialog, shortcuts]) {
    target.addEventListener('click', (event) => { if (event.target === target) target.close(); });
  }

  apply();
  return { get profile() { return profile; } };
}
