/**
 * calibration.js — Parámetros de calibración y su panel de controles.
 *
 * Responsabilidad: definir qué parámetros existen en cada módulo, sus valores
 * predeterminados (RN-08, RN-10) y construir los controles que los editan.
 * Los parámetros solo describen cómo se MUESTRA el contenido; nunca modifican
 * el archivo original (RN-07). La descarga genera un archivo nuevo aparte.
 *
 * Un control puede declarar `when(params)`: solo se muestra cuando aplica
 * (por ejemplo, «Profundidad simulada» solo existe para una foto normal).
 */

const SHIFT = {
  key: 'shiftX',
  type: 'range',
  label: 'Desplazamiento horizontal',
  min: -10,
  max: 10,
  step: 0.1,
  def: 0,
  unit: '%',
  signed: true,
  hint: 'Mueve las dos vistas en sentidos opuestos. Positivo aleja la escena, negativo la acerca. Los límites evitan forzar la visión doble.',
};

const ALIGN = {
  key: 'alignY',
  type: 'range',
  label: 'Alineación vertical',
  min: -10,
  max: 10,
  step: 0.1,
  def: 0,
  unit: '%',
  signed: true,
  hint: 'Sube una vista y baja la otra para corregir diferencias de altura entre los dos ojos.',
};

const DEPTH = {
  key: 'depth',
  type: 'range',
  label: 'Profundidad',
  min: 0,
  max: 100,
  step: 1,
  def: 50,
  unit: '%',
  hint: 'Una foto normal no trae dos vistas: el Studio estima con IA, en tu dispositivo, qué está cerca y qué lejos, y crea la otra vista. Súbela para que el sujeto resalte más.',
  when: (p) => p.source === '2d',
};

const SBS_CONTROLS = [
  {
    key: 'source',
    type: 'choice',
    label: 'Tipo de foto',
    def: 'sbs',
    options: [['sbs', 'SBS completo'], ['half', 'Half-SBS'], ['2d', 'Foto normal']],
    hint: 'Half-SBS: las dos vistas vienen comprimidas a la mitad del ancho. Foto normal: el Studio crea las dos vistas para las gafas.',
  },
  SHIFT,
  { ...ALIGN, when: (p) => p.source !== '2d' },
  DEPTH,
  {
    key: 'scale',
    type: 'range',
    label: 'Zoom',
    min: 50,
    max: 200,
    step: 1,
    def: 100,
    unit: '%',
    hint: 'Acerca o aleja ambas vistas por igual. También: rueda del ratón o pellizco, y arrastra para mover.',
  },
  {
    key: 'swap',
    type: 'toggle',
    label: 'Intercambiar ojos',
    def: false,
    hint: 'Entrega la mitad derecha al ojo izquierdo y la izquierda al derecho.',
  },
];

/* Video: uno (SBS, Half-SBS o normal) o dos videos, uno por ojo. */
const isPair = (p) => p.source === 'pair';
const VIDEO_CONTROLS = [
  {
    ...SBS_CONTROLS[0],
    options: [['sbs', 'SBS completo'], ['half', 'Half-SBS'], ['2d', 'Video normal']],
    hint: 'Video normal: el Studio genera la vista del otro ojo. Para un 3D real, agrega un segundo video grabado desde otro teléfono.',
    when: (p) => !isPair(p),
  },
  {
    key: 'sync',
    type: 'range',
    label: 'Sincronía',
    min: -10,
    max: 10,
    step: 0.02,
    def: 0,
    unit: 's',
    signed: true,
    hint: 'Atrasa o adelanta el video derecho. Se calcula solo con el audio; afínalo si un movimiento rápido no coincide en los dos ojos.',
    when: isPair,
  },
  {
    key: 'sizeR',
    type: 'range',
    label: 'Tamaño del video derecho',
    min: 60,
    max: 160,
    step: 1,
    def: 100,
    unit: '%',
    hint: 'Iguala el zoom de los dos teléfonos: la escena debe verse del mismo tamaño en ambos ojos.',
    when: isPair,
  },
  {
    key: 'autoPair',
    type: 'action',
    label: 'Unir de nuevo',
    text: 'Sincronizar y alinear automáticamente',
    hint: 'Vuelve a calcular la sincronía (audio) y el tamaño y la posición (imagen).',
    when: isPair,
  },
  SHIFT,
  { ...ALIGN, when: (p) => p.source !== '2d' },
  { ...DEPTH, hint: 'El video no trae dos vistas: se genera la otra con un relieve aproximado (abajo y al centro, cerca). Súbela poco a poco.' },
  SBS_CONTROLS[4],
  SBS_CONTROLS[5],
];

export const CALIBRATION = Object.freeze({
  anaglyph: [
    {
      key: 'source',
      type: 'choice',
      label: 'Tipo de foto',
      def: 'original',
      options: [['original', 'Ya es anaglifo'], ['sbs', 'Par SBS'], ['2d', 'Foto normal']],
      hint: 'Si tu foto no es anaglifo, el Studio lo crea: desde un par SBS (3D real) o desde una foto normal (profundidad estimada con IA).',
    },
    {
      key: 'scale',
      type: 'range',
      label: 'Zoom',
      min: 50,
      max: 300,
      step: 1,
      def: 100,
      unit: '%',
      hint: 'Acerca o aleja la imagen sin cambiar su proporción. También: rueda del ratón o pellizco, y arrastra para mover.',
    },
    { ...SHIFT, when: (p) => p.source !== 'original' },
    { ...ALIGN, when: (p) => p.source === 'sbs' },
    DEPTH,
    {
      key: 'swap',
      type: 'toggle',
      label: 'Intercambiar ojos',
      def: false,
      hint: 'Cambia qué vista recibe el filtro rojo. Úsalo si la profundidad se ve al revés.',
      when: (p) => p.source !== 'original',
    },
    {
      key: 'brightness',
      type: 'range',
      label: 'Brillo',
      min: -50,
      max: 50,
      step: 1,
      def: 0,
      unit: '',
      signed: true,
      hint: 'Suma o resta luz a todos los canales por igual.',
    },
    {
      key: 'contrast',
      type: 'range',
      label: 'Contraste',
      min: 50,
      max: 200,
      step: 1,
      def: 100,
      unit: '%',
      hint: 'Separa más o menos los tonos claros de los oscuros.',
    },
  ],
  'sbs-image': SBS_CONTROLS,
  'sbs-video': VIDEO_CONTROLS,
});

/** Valores predeterminados de un módulo (usados al importar y al restablecer). */
export function defaultParams(moduleId) {
  const params = { panX: 0, panY: 0 }; // encuadre: lo mueven los gestos sobre el visor
  // Dos videos: recorte del derecho y cuadro común de ambos (los calcula la unión automática).
  if (moduleId === 'sbs-video') Object.assign(params, { rightX: 0, rightY: 0, frameX: 0, frameY: 0, frameW: 1 });
  for (const control of CALIBRATION[moduleId] ?? []) if (control.type !== 'action') params[control.key] = control.def;
  return params;
}

/** Definición de un control (rangos para los gestos de zoom). */
export function controlOf(moduleId, key) {
  return CALIBRATION[moduleId]?.find((control) => control.key === key) ?? null;
}

function formatValue(control, value) {
  const decimals = control.step < 0.1 ? 2 : control.step < 1 ? 1 : 0;
  const number = Number(value).toFixed(decimals);
  const sign = control.signed && Number(value) > 0 ? '+' : '';
  return `${sign}${number}${control.unit ? ` ${control.unit}` : ''}`;
}

/**
 * Panel de controles de calibración.
 * @param root     contenedor donde se dibujan los controles
 * @param handlers { onChange(key, value) }
 */
export function createCalibrationPanel(root, { onChange }) {
  const refs = new Map(); // key → { control, row, input(s), output }

  function build(moduleId, params) {
    root.replaceChildren();
    refs.clear();

    for (const control of CALIBRATION[moduleId] ?? []) {
      const row = document.createElement('div');
      row.className = 'ctl';
      const id = `cal-${control.key}`;
      const hintId = `${id}-hint`;

      if (control.type === 'range') {
        row.innerHTML = `
          <div class="ctl-head">
            <label for="${id}">${control.label}</label>
            <output for="${id}" class="ctl-value"></output>
          </div>
          <input id="${id}" type="range" min="${control.min}" max="${control.max}"
                 step="${control.step}" aria-describedby="${hintId}">
          <p id="${hintId}" class="ctl-hint">${control.hint}</p>`;
        const input = row.querySelector('input');
        const output = row.querySelector('output');
        input.addEventListener('input', () => onChange(control.key, Number(input.value)));
        refs.set(control.key, { control, row, input, output });
      } else if (control.type === 'action') {
        row.innerHTML = `
          <button type="button" class="btn btn-action" id="${id}" aria-describedby="${hintId}">${control.text}</button>
          <p id="${hintId}" class="ctl-hint">${control.hint}</p>`;
        const input = row.querySelector('button');
        input.addEventListener('click', () => onChange(control.key, true));
        refs.set(control.key, { control, row, input });
      } else if (control.type === 'choice') {
        const labelId = `${id}-label`;
        row.innerHTML = `
          <div class="ctl-head">
            <span class="ctl-label" id="${labelId}">${control.label}</span>
          </div>
          <div class="seg" role="radiogroup" aria-labelledby="${labelId}" aria-describedby="${hintId}">
            ${control.options.map(([value, text]) => `
              <label class="seg-opt">
                <input type="radio" name="${id}" value="${value}">
                <span>${text}</span>
              </label>`).join('')}
          </div>
          <p id="${hintId}" class="ctl-hint">${control.hint}</p>`;
        const inputs = [...row.querySelectorAll('input')];
        for (const input of inputs) {
          input.addEventListener('change', () => input.checked && onChange(control.key, input.value));
        }
        refs.set(control.key, { control, row, inputs });
      } else {
        row.innerHTML = `
          <div class="ctl-head">
            <label for="${id}">${control.label}</label>
            <output for="${id}" class="ctl-value"></output>
          </div>
          <label class="switch">
            <input id="${id}" type="checkbox" role="switch" aria-describedby="${hintId}">
            <span class="switch-track" aria-hidden="true"></span>
            <span class="switch-text">Activar</span>
          </label>
          <p id="${hintId}" class="ctl-hint">${control.hint}</p>`;
        const input = row.querySelector('input');
        const output = row.querySelector('output');
        input.addEventListener('change', () => onChange(control.key, input.checked));
        refs.set(control.key, { control, row, input, output });
      }
      root.append(row);
    }
    sync(params);
  }

  /** Refleja los parámetros vigentes en cada control, su indicador y su visibilidad. */
  function sync(params) {
    for (const { control, row, input, inputs, output } of refs.values()) {
      row.hidden = Boolean(control.when && !control.when(params));
      const value = params[control.key];
      if (control.type === 'action') continue;
      if (control.type === 'range') {
        if (Number(input.value) !== value) input.value = String(value);
        output.textContent = formatValue(control, value);
      } else if (control.type === 'choice') {
        for (const option of inputs) option.checked = option.value === value;
      } else {
        input.checked = Boolean(value);
        output.textContent = value ? 'Activado' : 'Desactivado';
      }
    }
  }

  function setEnabled(enabled) {
    for (const { input, inputs } of refs.values()) {
      for (const el of inputs ?? [input]) el.disabled = !enabled;
    }
    root.classList.toggle('is-disabled', !enabled);
  }

  return { build, sync, setEnabled };
}
