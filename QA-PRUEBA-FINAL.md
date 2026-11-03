# Informe QA — StereoVision Studio 3D

**Resultado:** APROBADO PARCIALMENTE — no declarar liberación final completa todavía.

## Correcciones aplicadas

1. `assets/js/core/depthPost.js`
   - Se añadió suavizado bilateral separable aproximado para preservar discontinuidades de profundidad mejor que el blur de caja uniforme.
   - Se añadió normalización robusta por percentiles 2–98, con preservación de mapas planos.
   - Se añadió validación de dimensiones al procesamiento.
   - La profundidad se documenta como estimación relativa, no como distancia física.
2. `assets/js/modules/stereoView.js`
   - Se ajustó la máscara de validez antes/después de la reproyección para no rellenar coordenadas fuera del cuadro con píxeles del borde.
   - Se limitó el margen de muestreo a menos de la mitad del recorte para evitar clamp invertido.
   - Se redujo la disparidad máxima sintetizada de 3.5% a 2.5% del ancho para moderar artefactos.
   - Se corrigió un comentario técnico que describía la profundidad de IA como física/real.
3. `assets/js/workers/depthPipeline.js` y `README.md`
   - Se actualizaron las descripciones para reflejar la profundidad relativa filtrada/normalizada y sus límites.
4. `tests/unit/depthPostEnhanced.test.js`
   - Se agregaron pruebas para preservación de bordes, normalización, mapas uniformes y dimensiones inconsistentes.

## Evidencia de verificación en esta ejecución

- `npm run check`: PASS — sintaxis en 32 archivos JS, hash CSP del importmap y rutas relativas correctos.
- `npm run test:unit`: PASS — 49/49 pruebas, 0 fallos.
- `npm run test:e2e`: BLOCKED — el paquete Playwright presente en el ZIP no ofrece el comando `test` (dependencias instaladas inválidas/incompletas). `npm ci` no terminó en este entorno por timeout.
- Validación visual de navegador/WebGL y shader compilado: NO EJECUTADA en esta sesión.

## Riesgos / criterios todavía abiertos

- La síntesis desde una sola fotografía sigue siendo reproyección aproximada; no recupera superficies ocultas ni equivale a una captura estéreo de dos cámaras.
- La máscara de salida mitiga píxeles fuera del cuadro, pero no realiza inpainting de oclusiones; pueden quedar zonas negras o huecos dependiendo de la escena.
- El resultado visual con lentes rojo-cian debe verificarse en navegador/WebGL real y con un set de imágenes patrón.
- La suite E2E debe reinstalarse en un entorno con Playwright y navegador compatibles, y ejecutarse antes de declarar release 10/10.

## Dictamen

Las verificaciones estáticas y unitarias están aprobadas. La liberación final queda **condicionada** a E2E y QA visual real; no sería honesto declarar la aplicación “perfecta” con esos controles pendientes.
