# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Estudiantes, docentes y aficionados a la fotografía/video estéreo que quieren ver contenido 3D (anaglifo rojo-cian, imagen SBS, video SBS) en el navegador, en computadora o en el teléfono dentro de unas gafas tipo Cardboard. También el profesor que evalúa el proyecto escolar (ITICS, Tec de Pachuca).

## Product Purpose
Reunir en una sola página, sin instalar nada, la importación, la calibración (desplazamiento, alineación, escala, intercambio de ojos, brillo/contraste) y la visualización de contenido estereoscópico, incluyendo un modo VR para celular. Éxito: el usuario elige módulo, importa (o carga la muestra) y ve su contenido cómodo en segundos.

## Positioning
Tres formatos estéreo en un solo visor local, con calibración en vivo que no modifica el archivo; todo se procesa en el dispositivo.

## Operating Context
Pantalla de escritorio para calibrar; teléfono en horizontal dentro de gafas para VR. El contenido anaglifo exige un entorno visual neutro que no contamine los filtros rojo/cian.

## Capabilities and Constraints
- HTML + CSS + JS (módulos ES) + Three.js 0.180 por CDN; sin backend; publicado en GitHub Pages.
- Formatos: JPG/JPEG/PNG/WebP y MP4. Muestras en `assets/media/`.
- Los IDs y clases que usa `assets/js/modules/*.js` son contrato; no cambiarlos.
- Fuera de alcance: 2D→3D, exportar, giroscopio, SBS vertical, cuentas.

## Brand Commitments
- Nombre: StereoVision Studio 3D.
- El pie debe mostrar: José Alonso Godinez Franco · N.C. 24200197 · Instituto Tecnológico de Pachuca · ITICS, y el aviso de privacidad local.

## Evidence on Hand
Muestras propias en `assets/media/` (anaglifo, SBS imagen 1240×936, SBS video 6 s). No hay testimonios, métricas ni usuarios reales: no inventarlos.

## Product Principles
- La imagen manda: la interfaz no debe competir con el contenido 3D.
- Guiar sin bloquear: el orden módulo → archivo → calibrar → VR debe ser evidente.
- Honesto con lo que hace: calibrar no inventa profundidad.
- Todo local, todo explicado: errores claros y recuperables.

## Accessibility & Inclusion
Objetivos táctiles ≥44 px, foco visible, navegación por teclado, `prefers-reduced-motion`, textos en español.
