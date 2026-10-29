# Design — StereoVision Studio 3D

Mundo: **monitor de referencia de rodaje**. El Studio es el monitor; la imagen manda.

## Color (tokens en `assets/css/styles.css :root`)
- Grafito cálido: `--bg #0e0e0d`, `--panel #141413`, `--panel-2 #1b1b19`, `--raise #232320`; campo de imagen `--field #050505`.
- Filetes: `--line #2a2926`, `--line-strong #3b3a35`. Texto `--text #edece6`, secundario `--muted #a3a097`.
- Ojos: `--eye-l #ff4a3d` (izquierdo), `--eye-r #2fd8ea` (derecho). Solo significan ojos.
- `--peak #f5c84b`: selección de texto, caret y aviso al arrastrar un archivo (como el *focus peaking*).
- Estados: `--ok`, `--warn`, `--err`, `--vr`.
- **Color por paso (barras SMPTE):** `--c-module #f2cf4a` (1 Módulo), `--c-file #4fd08a` (2 Archivo), `--c-cal #e566cf` (3 Calibra), `--c-vr #7f8fff` (4 VR). Cada `.block[data-tone]` tiñe su fondo, número, acción principal, deslizadores y lecturas con `--tone`.
- `--smpte`: franja de barras sobre el encabezado y al pie del marco de la portada; su luz sube difuminada por el marco.
- El visor (`--field`) nunca se tiñe: el contenido 3D necesita un entorno neutro.
- Foco: anillo blanco de 2 px.

## Tipografía
- **Archivo** (eje `wdth`): interfaz a 100; rótulos OSD en mayúsculas condensadas (`wdth 75`, tracking .08–.12em); título de la portada a 800 / `wdth 112`.
- **Martian Mono**: solo medidas (valores de calibración, timecode, datos de archivo, formatos).

## Componentes
- **Líneas de encuadre** (`.framelines`): cuatro esquinas de 22 px en la portada y el visor.
- **OSD** (`.osd`): lecturas en las esquinas; en el visor dice la señal (Sin señal / Anaglifo / SBS).
- **Selector de entrada** (`.inputs`): una barra dividida por filetes; al apuntar se dibuja una línea inferior roja/cian.
- Paneles: secciones separadas por filetes, pasos 1–4 en casillas mono. Sin tarjetas anidadas.
- Deslizadores: pista de 2 px, cursor rectangular blanco.

## Movimiento
- Momento de autor: el título de la portada converge de un par rojo/cian a blanco (`--d`, `intro.js`); el puntero añade disparidad real, mostrada en el OSD.
- Continuidad: el marco de la portada se convierte en el visor (View Transition `stage`).
- Resto: solo confirmación (≤300 ms). `prefers-reduced-motion` conserva los fundidos y quita los desplazamientos.
