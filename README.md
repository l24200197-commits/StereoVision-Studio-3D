# StereoVision Studio 3D

Studio web para **importar, calibrar y visualizar** contenido estereoscópico: imágenes anaglifo rojo-cian, imágenes Side-by-Side (SBS) y videos SBS, con un **modo VR** para celular (gafas tipo Cardboard).
Todo corre en el navegador: HTML + CSS + JavaScript (módulos ES) + [Three.js](https://threejs.org/). No hay backend, registro ni base de datos, y ningún archivo sale del dispositivo.

- **Sitio publicado (GitHub Pages):** `https://l24200197-commits.github.io/StereoVision-Studio-3D/`
- **Repositorio:** `https://github.com/l24200197-commits/StereoVision-Studio-3D`
- **Autor:** José Alonso Godinez Franco · N.C. 24200197 · Instituto Tecnológico de Pachuca · ITICS

---

## 1. Problema que resuelve y quién usa cada modalidad

Ver contenido 3D suele exigir programas distintos para cada formato (visores de anaglifo, reproductores SBS, apps de VR) y casi ninguno permite **ajustar la imagen para que sea cómoda** en el dispositivo y los ojos de cada persona. StereoVision Studio 3D reúne las tres modalidades en una sola página, sin instalar nada, y permite corregir la presentación (desplazamiento, alineación, escala, intercambio de ojos) antes de usarla con lentes o gafas.

| Modalidad | Quién la usa | Para qué |
|---|---|---|
| **Anaglifo rojo-cian** | Estudiantes, docentes, divulgación, revistas/libros 3D | Verlo con lentes de cartón rojo-cian en cualquier pantalla, sin hardware especial |
| **Imagen SBS** | Fotógrafos estéreo, quienes capturan con dos cámaras o apps 3D | Revisar el par izquierdo/derecho y calibrarlo para gafas o visores |
| **Video SBS** | Creadores de video 3D, usuarios de gafas VR para celular | Reproducir y calibrar un video 3D lado a lado antes de ponerse las gafas |

### Anaglifo vs. SBS

- **Anaglifo:** las dos perspectivas ya vienen **mezcladas en una sola imagen** (un ojo en el canal rojo, el otro en verde+azul). Los filtros de los lentes hacen la separación; el Studio solo muestra la imagen completa, por eso no tiene sentido «intercambiar ojos» ni recortar mitades.
- **SBS (Side-by-Side):** el archivo trae **dos imágenes completas, una junto a otra**: la mitad izquierda es para el ojo izquierdo y la derecha para el derecho. El Studio **recorta cada mitad** y la dibuja en su propia región de pantalla (RN-11); no basta con duplicar una imagen plana.

### Conceptos que se mantienen separados

Calibrar **no inventa profundidad ni modifica el archivo**. Son tres cosas distintas:
- **IPD física:** distancia entre los ojos de la persona; no se mide aquí.
- **Disparidad original:** la diferencia entre las dos perspectivas que ya trae el archivo; no se altera.
- **Desplazamiento digital de ventana:** lo único que ajusta el Studio, moviendo las dos vistas en sentidos opuestos para acomodar la escena a la comodidad visual. Se limita a ±10 % para no forzar visión doble.

### Alcance

**Sí hace:** importar JPG/JPEG/PNG/WebP y MP4 locales; validar y mostrar errores claros; reconocer si una foto es anaglifo, par SBS o foto normal; **crear un anaglifo** desde un par SBS (3D real) o desde una foto normal (profundidad estimada con IA en el dispositivo); **crear un par SBS para gafas** desde una foto normal; en Video, **generar el otro ojo** de un video normal o **unir dos videos** (uno por ojo, de teléfonos distintos) sincronizándolos por audio e igualando tamaño y encuadre; aceptar Half-SBS; anaglifo con zoom, brillo y contraste; SBS con desplazamiento horizontal, alineación vertical, escala e intercambio de ojos; reproducción de video SBS con controles; modo VR táctil con asistente para calibrar los lentes de las gafas; zoom y encuadre con rueda, arrastre o pellizco; descargar el anaglifo o el SBS resultante en JPG; liberar recursos al cambiar de archivo.

**No hace (fuera de alcance):** recuperar la profundidad real de una foto 2D. Con una sola foto, la IA solo *estima* qué está cerca y qué lejos; el resultado es convincente en escenas comunes pero puede equivocarse en reflejos, cristales, cielos o figuras planas, y nunca equivale a un par estéreo capturado con dos cámaras (en video y sin conexión se usa un relieve aproximado: abajo y al centro cerca, arriba lejos). Tampoco hace: convertir un anaglifo en SBS, exportar video, transcodificar video, seguimiento de cabeza/giroscopio, SBS vertical (arriba/abajo) u «over-under», cuentas de usuario o almacenamiento en servidor.

---

## 2. Cómo usarlo

1. **Elige el módulo** (Anaglifo, Imagen SBS o Video SBS). Hasta entonces la importación está deshabilitada (RN-01).
2. **Importa** un archivo con «Importar archivo…», arrastrándolo al visor, o prueba con **«Cargar muestra»**. El Studio reconoce qué trae la foto y elige el **Tipo de foto**:
   - En **Anaglifo**: si ya es anaglifo se muestra tal cual; si es un par SBS, se compone el anaglifo con sus dos vistas; si es una foto normal, se estima su profundidad con IA (Depth Anything V2, en el dispositivo; el modelo de ≈27 MB se descarga una vez) y se crea la otra vista. El anaglifo creado usa la mezcla Dubois para reducir fantasmas.
   - En **Imagen SBS**: si es SBS se reparte una mitad por ojo; si es una foto normal, se crean las dos vistas para las gafas. Half-SBS se elige a mano.
   - En **Video SBS**: un video SBS se reparte por ojo; un video normal genera el otro ojo (relieve aproximado). Para un 3D real, **selecciona dos videos a la vez** (o usa «Agregar video del ojo derecho»): el Studio los **sincroniza con su audio** (busca los mismos sonidos en ambos), **iguala tamaño y posición** comparando un cuadro de cada uno y **recorta al cuadro que ven las dos cámaras** para que no haya bordes negros. Durante la reproducción el derecho sigue al izquierdo y corrige la deriva. Se afina con «Sincronía» y «Tamaño del video derecho», o con «Sincronizar y alinear automáticamente». Si el nombre del archivo dice «der»/«right», va al ojo derecho; si no, el primero es el izquierdo («Intercambiar ojos» lo corrige). Consejo: graba con los dos teléfonos en la misma orientación, a la altura de los ojos y separados unos 6–7 cm, y da un aplauso al inicio.
   - Si la detección se equivoca, cámbialo en «Tipo de foto».
3. **Calibra** en el panel derecho; los cambios se ven al instante. Sobre el visor: rueda o pellizco = zoom, arrastrar = mover, doble clic/toque = centrar. **Restablecer** devuelve todo a los valores iniciales. **Descargar** genera un JPG nuevo (anaglifo o SBS) con la calibración aplicada; el original no cambia.
4. En SBS pulsa **«Entrar al modo VR»** y coloca el teléfono en horizontal dentro de las gafas. La primera vez aparece el **asistente de las gafas**: cada ojo ve una línea dentro de un círculo; toca el tercio izquierdo para restar, el derecho para sumar (mantén pulsado para avanzar rápido) y el centro para pasar de **Separación** a **Altura** y a **Tamaño** (este último se hace viendo tu foto o video). Está bien cuando ves una sola cruz «+». Se guarda en el teléfono; para repetirlo **mantén pulsada la pantalla** o usa **«Calibrar gafas»**. En iPhone, Safari no permite pantalla completa: usa Compartir → «Agregar a inicio» y abre el Studio desde ese icono. Sal con **«Salir de VR»** o `Esc`.

5. **Herramientas transversales**
   - **Barra del visor** (abajo, sobre la imagen): reproducir/pausar (video), alejar, nivel de zoom, acercar, centrar y visor a pantalla completa.
   - **Atajos de teclado** (botón del teclado arriba a la derecha): con el visor enfocado, `+`/`−` zoom, flechas para mover (`Mayús` = más rápido), `0` centrar, `F` pantalla completa, `Espacio`/`K` reproducir, `J`/`L` ∓10 s, `M` silencio.
   - **Ayuda contextual**: cada ajuste tiene un botón `?` que despliega su explicación, y un botón ↺ que aparece solo cuando ese ajuste cambió, para devolverlo a su valor inicial.
   - **Restablecer** todo se puede **deshacer** desde el aviso que aparece debajo del visor.
   - **Trabajos largos** (unir dos videos, estimar profundidad) muestran su avance real en una barra con **Cancelar**; si se cancela o falla, el aviso ofrece **Reintentar**.
   - **Ajustes** (engrane): calidad del visor (Automática / Alta / Ahorro), olvidar la calibración guardada de las gafas (pide confirmación) y resumen de privacidad.

Rangos de calibración:

| Módulo | Control | Rango | Inicial |
|---|---|---|---|
| Anaglifo | Tipo de foto | Ya es anaglifo / Par SBS / Foto normal | según detección |
| Anaglifo | Zoom / Brillo / Contraste | 50–300 % / −50…50 / 50–200 % | 100 % / 0 / 100 % |
| Anaglifo creado | Desplazamiento / Alineación (par SBS) / Intercambiar ojos | −10…10 % | 0 |
| SBS imagen y video | Tipo de foto | SBS completo / Half-SBS / Foto normal | según detección (video: SBS) |
| Foto normal (anaglifo o SBS) | Profundidad | 0–100 % | 50 % |
| Dos videos | Sincronía / Tamaño del video derecho | −30…30 s (paso 0.02) / 60–160 % | automáticos (audio e imagen) |
| Modo VR (gafas) | Separación / Altura de lentes | −25…25 % / −10…10 % | guardado en el teléfono |
| SBS imagen y video | Desplazamiento horizontal / Alineación vertical | −10…10 % (paso 0.1) | 0 |
| SBS imagen y video | Zoom | 50–200 % | 100 % |
| SBS imagen y video | Intercambiar ojos | sí/no | no |

### Muestras incluidas (`assets/media/`)

Generadas a partir de una fotografía estereoscópica propia (par izquierdo/derecho):
`anaglifo_muestra.jpg` (canal rojo del ojo izquierdo, verde/azul del derecho), `sbs_muestra.jpg` (1240×936) y `sbs_muestra.mp4` (H.264 + AAC, 6 s, 1240×936, con un acercamiento lento idéntico en ambas vistas para que la profundidad la den las dos perspectivas).

---

## 3. Ejecutar localmente (siempre por HTTP, no `file://`)

Los módulos ES, los Workers y `fetch` requieren un origen HTTP. La aplicación **no necesita compilación ni dependencias**: basta servir la carpeta.

- **Con Node (recomendado, imita GitHub Pages):** `npm start` → `http://localhost:8000/StereoVision-Studio-3D/`. Sirve el sitio bajo el mismo subdirectorio que Pages, con tipos MIME correctos y peticiones por rangos (`scripts/serve.mjs`, sin dependencias).
- **Python:** `python3 -m http.server 8000` dentro de esta carpeta y abrir `http://localhost:8000/`.
- **VS Code:** extensión *Live Server* → *Open with Live Server*.

Para probar desde el teléfono en la misma red Wi-Fi, abre `http://IP-DE-TU-PC:PUERTO/`. Pantalla completa, bloqueo de orientación y Wake Lock exigen HTTPS: la prueba final en teléfono se hace en la URL de GitHub Pages.

Opciones de URL: `?debug` expone `window.__studio` (estado, visor, memoria de GPU, perfil); `?quality=saver` o `?quality=high` fuerzan un perfil de calidad.

### Pruebas

```bash
npm install          # solo instala herramientas de prueba (Playwright y axe-core); el sitio no las usa
npx playwright install chromium   # opcional: solo si no tienes Google Chrome instalado
npm test             # comprobaciones estáticas + unitarias + navegador
npm run test:unit    # solo unitarias (Node, sin navegador, < 1 s)
npm run test:e2e     # solo navegador
```

Las pruebas de navegador usan **Google Chrome** instalado porque decodifica H.264 como los navegadores reales. Con `PW_CHANNEL=chromium` usan el Chromium de Playwright (sin H.264: las pruebas de video se omiten solas). Con `OFFLINE=1` se omiten las de profundidad con IA (necesitan descargar el modelo).

## 4. Publicar en GitHub Pages

```bash
git add .
git commit -m "StereoVision Studio 3D"
git push origin main
```

Primera vez: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch `main` / carpeta `/ (root)`**. El sitio queda en `https://l24200197-commits.github.io/StereoVision-Studio-3D/`.

- `index.html` debe estar en la **raíz**; todas las rutas son **relativas** (`./assets/...`), así que funcionan bajo el subdirectorio de Pages (RN-20). `npm run check` lo verifica.
- `package.json`, `scripts/` y `tests/` se publican pero el sitio no los usa; `node_modules/` está en `.gitignore`.
- Si actualizas Three.js o editas el `importmap` de `index.html`, ejecuta `npm run csp-hash` (recalcula el hash de la política de seguridad) y actualiza los hashes `integrity` del importmap.

## 5. Arquitectura

```
StereoVision-Studio-3D/
├── index.html                 Estructura de la interfaz, CSP e importmap (sin lógica)
├── manifest.webmanifest       Abrir a pantalla completa desde la pantalla de inicio
├── package.json               Solo scripts y dependencias de PRUEBA (el sitio no las usa)
├── scripts/                   serve.mjs (servidor local tipo Pages), check.mjs, csp-hash.mjs
├── tests/unit/                Pruebas de Node (lógica pura)
├── tests/e2e/                 Pruebas de navegador (Playwright + axe-core)
└── assets/
    ├── css/styles.css         Estilos, diseño responsivo, modo VR, movimiento, perfil «Ahorro»
    ├── img/ · media/          Icono y muestras ligeras
    └── js/
        ├── main.js            Arranque: crea y conecta las piezas
        ├── core/              Lógica PURA, sin DOM (se prueba en Node y corre en Workers)
        │   ├── fft.js               FFT radix-2 y correlación cruzada
        │   ├── audioCorrelation.js  Huella de golpes de sonido y desfase con confianza
        │   ├── alignSearch.js       Búsqueda gruesa→fina de escala/desplazamiento con confianza
        │   ├── pairGeometry.js      Recorte del video derecho y cuadro común (una sola fórmula)
        │   ├── depthPost.js         Suavizado del mapa de profundidad y plano de pantalla
        │   ├── fileSignature.js     Firma binaria y dimensiones de cabecera (JPEG/PNG/WebP)
        │   └── deviceProfile.js     Perfil de calidad según el equipo
        ├── workers/           Cálculo fuera del hilo principal
        │   ├── analysis.worker.js   Sincronía y alineación (un Worker por tarea: cancelar = terminar)
        │   ├── handlers.js          Tareas compartidas por el Worker y la alternativa en el hilo principal
        │   ├── depth.worker.js      IA de profundidad (Worker persistente: el modelo se carga una vez)
        │   └── depthPipeline.js     Depth Anything V2 con transformers.js
        └── modules/           Piezas con DOM / WebGL
            store · ui · studio · fileImport · calibration · stereoView · anaglyph · sbsImage · sbsVideo
            vrMode · vrWizard · intro · gestures · motion · stereoDetect · audioSync · alignPair
            depthEstimate · tasks (Workers con progreso y cancelación) · settings (Ajustes y Atajos)
```

Principios: la lógica de cálculo vive en `core/` (sin DOM, probada en Node); lo pesado corre en `workers/`; `stereoView.js` es la única pieza que habla con WebGL; `studio.js` es la única que decide reglas de sesión; `ui.js` solo pinta el estado.

### Responsabilidad de cada módulo

| Módulo | Responsabilidad |
|---|---|
| `main.js` | Solo arranca: crea store, UI, ajustes, visor, calibración, studio y VR, y los conecta. Atiende la falta de WebGL. |
| `store.js` | Estado único (módulo, estado, archivo, parámetros, mensaje con acción opcional, trabajo en curso, VR) y suscripción. No toca DOM ni WebGL. |
| `ui.js` | Pinta el estado: píldora, archivo, avisos (con tipo dicho en texto e icono de forma distinta), barra de trabajo, barra del visor, etiqueta accesible del lienzo. Sin reglas de negocio. |
| `studio.js` | Reglas RN-01/04/05/08/09/10; trabajos largos con progreso y cancelación (`startJob`/`cancelTask`); deshacer al restablecer; un trabajo nunca entrega su resultado a otro archivo. |
| `fileImport.js` | Valida extensión, tamaño (80 MB imagen / 4 GB video), **firma binaria** y **dimensiones de cabecera** (≤ 100 MP y ≤ textura máxima) antes de decodificar; devuelve un contenido con `release()`. |
| `calibration.js` | Parámetros por módulo, valores iniciales y panel con ayuda desplegable y restablecer por ajuste. |
| `stereoView.js` | Visor Three.js: recorte por ojo, anaglifo Dubois, vistas desde foto normal, ajuste «contain», mipmaps con margen de costura, subida de cuadros de video solo si cambian, perfil de calidad, restauración del contexto WebGL, exportación con lectura asíncrona. |
| `tasks.js` | Ejecuta una tarea en un Worker de módulo; envía los datos solo cuando el Worker confirma que cargó; si el navegador no admite Workers de módulo, la corre en el hilo principal. |
| `audioSync.js` | Decodifica el audio a 16 kHz mono (¼ de memoria que 44.1 kHz), un archivo tras otro, y guarda la huella para reintentos; la correlación corre en el Worker. |
| `alignPair.js` | Toma miniaturas de varios instantes comunes de los dos videos y delega la búsqueda al Worker. |
| `depthEstimate.js` | Rasteriza una copia reducida de la foto y la envía al Worker de IA; cancelar termina el Worker. |
| `settings.js` | Preferencia de calidad, diálogos de Ajustes y Atajos, olvidar la calibración de las gafas. |
| `gestures.js` | Rueda/pellizco = zoom, arrastrar = mover, doble clic/toque = centrar y **atajos de teclado** del visor. |
| `vrMode.js` / `vrWizard.js` | Visor VR (pantalla completa, orientación, Wake Lock, foco) y asistente de las gafas. |
| `anaglyph.js` / `sbsImage.js` / `sbsVideo.js` | Descriptor de cada modalidad y su activación; `sbsVideo.js` conecta transporte y sincroniza el segundo video. |
| `stereoDetect.js` · `intro.js` · `motion.js` | Detección del tipo de imagen · portada · animaciones puntuales que respetan «reducir movimiento». |

### Rendimiento

| Tarea | Antes | Ahora |
|---|---|---|
| Sincronía por audio | Correlación directa en el hilo principal (±20 s × 2 min ≈ 48 M operaciones), decodificación de ambos audios a 44.1 kHz **a la vez** | FFT en un Worker (O(N log N); misma salida, verificada contra la versión directa), ±30 s sobre 5 min, refinado parabólico (< 10 ms), audio a 16 kHz y **uno tras otro**; huella guardada: «Unir de nuevo» no vuelve a decodificar |
| Alineación de dos videos | Rejilla completa sobre un único cuadro en el hilo principal | Rejilla gruesa a media resolución + afinado de los 4 mejores picos distintos, en un Worker, sobre varios instantes; confianza = puntuación **y** margen sobre el mejor candidato lejano |
| Profundidad con IA | Inferencia WASM en el hilo principal (la página se congelaba segundos) | Worker persistente; progreso de descarga sumando todos los archivos del modelo; cancelación real |
| Video en pausa | Cada redibujo (p. ej. mover un deslizador) volvía a subir el cuadro completo a la GPU | Solo se sube si el cuadro cambió |
| Imágenes alejadas | Filtrado lineal (parpadeo/moiré al reducir fotos grandes) | Mipmaps, con un margen de costura que crece con el nivel de mipmap para no mezclar los dos ojos |
| Lienzo | MSAA activado (inútil para rectángulos alineados) | Sin MSAA; densidad de píxeles con tope según perfil |
| Exportación | Lectura síncrona de píxeles | Lectura asíncrona (WebGL 2) |

**Degradación progresiva:** `core/deviceProfile.js` estima el perfil con memoria del equipo, núcleos, textura máxima y «ahorro de datos». El perfil **Ahorro** baja la densidad del lienzo (≤ 1.25×), quita mipmaps, limita la exportación a 4096 px, reduce la copia que analiza la IA y apaga efectos decorativos (desenfoques, transiciones de vista). **Nunca** cambia recortes, desplazamientos ni la resolución con que se lee el archivo: la precisión estereoscópica es la misma. El usuario puede elegir Alta o Ahorro en Ajustes.

### Seguridad y privacidad

- **Procesamiento local:** imágenes, videos y audio se leen con `URL.createObjectURL` y se procesan en el navegador; las URL temporales se revocan al liberar (verificado por prueba: creadas = revocadas). Ninguna petición lleva datos del usuario (verificado por prueba: 0 peticiones con cuerpo durante la estimación de profundidad).
- **Modelo de IA:** solo se *descarga* (≈27 MB, una vez, desde Hugging Face vía transformers.js en jsDelivr); la inferencia corre en el Worker sobre una copia reducida de los píxeles.
- **Content Security Policy** (meta en `index.html`): solo scripts propios y de jsDelivr, el `importmap` autorizado por hash, `wasm-unsafe-eval` para el modelo, conexiones solo a jsDelivr y Hugging Face, `object-src 'none'`, `form-action 'none'`. Las pruebas fallan ante cualquier violación.
- **Integridad (SRI)** de Three.js en el importmap (navegadores que la admiten) y `referrer` desactivado hacia los CDN.
- **Validación de archivos:** extensión + MIME + **firma binaria** (un PDF o ZIP renombrado a `.jpg` se rechaza) + límites de tamaño + dimensiones leídas de la cabecera antes de decodificar (protege de «bombas de descompresión»).
- **XSS:** todo texto que viene de un archivo (nombre) se escribe con `textContent`; el único `innerHTML` construye controles a partir de constantes del código.
- **Almacenamiento local:** solo `svs3d.lens` (calibración de las gafas) y `svs3d.quality` (calidad); se pueden borrar desde Ajustes.

### Accesibilidad

Navegación completa con teclado (portada, módulos, importación, calibración, visor con atajos, transporte, diálogos nativos `<dialog>` con foco atrapado y `Esc`); foco visible; el foco se mueve al Studio al salir de la portada y vuelve al botón de VR al salir del visor; etiquetas accesibles que contienen el texto visible (WCAG 2.5.3); valores de deslizadores anunciados con unidad (`aria-valuetext`); avisos en región `status` con su tipo dicho en palabras («Error:», «Aviso:», «Listo:») e icono de forma distinta (no solo color); objetivos táctiles ≥ 44 px en táctil (área sensible ampliada en los botones pequeños); `prefers-reduced-motion` y `forced-colors` atendidos; lectura de las ayudas por `aria-describedby` aunque estén plegadas.

### Compatibilidad

| Entorno | Estado |
|---|---|
| Chrome / Edge escritorio | Probado automáticamente (Chrome 1440×900) |
| Android (Chrome) | Emulado (Pixel 7, táctil, vertical y horizontal); **falta prueba física** |
| Safari macOS / iOS, Firefox | **No probados** en este entorno. El código evita APIs exclusivas y tiene alternativas: Workers de módulo (Safari ≥ 15, Firefox ≥ 114; si no, cálculo en el hilo principal), `requestVideoFrameCallback` opcional, pantalla completa opcional (iPhone: «Agregar a inicio»), `OfflineAudioContext` con frecuencia de respaldo para Safari antiguos. WebGL 2 es obligatorio (Three.js r180). |

### Cómo se logra el efecto estereoscópico

- **SBS:** la textura completa se comparte entre dos mallas. Cada región usa un recorte distinto (`uCropOffset = 0` u `0.5`, `uCropScale = 0.5`). **Intercambiar ojos** invierte esos recortes (RN-12), no solo la etiqueta; los rótulos «Ojo izquierdo · mitad derecha» reflejan la asignación real.
- **Video:** un único elemento `<video>` (con `playsinline`) alimenta una `VideoTexture`; ambas regiones dibujan **el mismo cuadro**, así que tiempo, pausa, volumen y búsqueda son comunes por construcción (RN-14).
- **Calibración:** solo mueve/escala las mallas dentro de su región o ajusta uniformes del shader. El archivo original no cambia (RN-07).

### Estados

`Sin archivo` → (importar) → `Cargando` → `Listo` ⇄ `Reproduciendo` ⇄ `Pausado` (solo video) · `Error` · y la marca **Modo VR** sobre cualquiera de ellos.

- Cambiar de módulo o quitar el archivo vuelve a `Sin archivo`, detiene y elimina el `<video>`, libera la textura y revoca la URL temporal.
- Un archivo inválido deja `Error` con un mensaje de qué pasó y cómo continuar; el Studio sigue operativo.
- Sin archivo, los controles de calibración, restablecer y VR están deshabilitados y se explica por qué.

### Reglas de negocio → implementación

| RN | Dónde se cumple |
|---|---|
| 01 | Importar/muestra deshabilitados hasta elegir módulo (`ui.js`, `studio.js`) |
| 02, 03, 04 | `fileImport.js` (formato, 0 bytes, decodificación, tiempo de espera de video) + mensajes en `studio.js` |
| 05 | `studio.releaseActive()` antes de cada importación |
| 06 | `ui.renderTools()` / `renderTransport()` |
| 07, 09 | Calibración solo sobre mallas/uniformes; `setParam()` redibuja sin reimportar |
| 08, 10 | `defaultParams()` al importar y en Restablecer |
| 11, 12 | Recortes por ojo en `stereoView.renderNow()` |
| 13 | Ajuste «contain» (márgenes, sin deformar) |
| 14 | Un `<video>` + una textura para ambos ojos |
| 15, 16 | `body.vr-active` + mismo canvas/estado (`vrMode.js`, `styles.css`) |
| 17 | Botones de ≥44 px, aviso de vertical, sugerencia de uso al entrar |
| 18 | `video.play()` solo desde un clic/toque; `playsinline` |
| 19 | Sin servidor: `URL.createObjectURL`, nada se envía |
| 20 | Rutas relativas; probado bajo un subdirectorio |

---

## 6. Pruebas

### 6.1 Pruebas automatizadas (resultados reales de esta versión)

Ejecución de `npm test` en macOS con Google Chrome (WebGL por SwiftShader), sitio servido en `/StereoVision-Studio-3D/`:

- **Comprobaciones estáticas** (`npm run check`): sintaxis de 32 archivos JS, hash CSP del importmap, sin marcadores pendientes, rutas relativas → **correcto**.
- **Unitarias** (`node --test`): **46 de 46 aprobadas** — FFT frente a correlación directa; desfase de audio recuperado con error < 20 ms en ambos sentidos; audios sin relación marcados como «no confiables»; alineación que recupera escala 1.18 y desplazamiento (±0.012) entre cámaras 16:9 y 4:3; pared lisa y escenas distintas sin falsa confianza; cancelación de la búsqueda; firmas y dimensiones de JPEG/PNG/WebP (VP8, VP8L, VP8X); validación (vacío, sin archivo, extensión, PDF disfrazado, bytes basura, módulo equivocado, tamaño, megapíxeles, textura máxima); perfiles de calidad; estado, calibración, orden de pares, instantes comunes.
- **Navegador** (Playwright): **29 de 29 aprobadas** (25 en paralelo + 4 pesadas en serie). Cada prueba falla además si hay errores de consola, excepciones, violaciones de CSP o respuestas HTTP ≥ 400.

| # | Escenario | Prueba |
|---|---|---|
| 1 | Importar imagen válida | detección de tipo, datos del archivo, VR habilitado, etiqueta del lienzo |
| 2 | Importar imagen inválida | `.txt`, PDF renombrado a `.jpg`, JPEG dañado → error claro y recuperación con la muestra |
| 3 | Archivo vacío | mensaje «está vacío» |
| 4 | Archivo demasiado grande | 81 MB en bytes y PNG de 20000×20000 px rechazados antes de decodificar |
| 5–6 | Cambiar de archivo y de módulo repetidamente | ≤ 1 textura y ≤ 1 `<video>` en todo momento; 0 al cambiar de módulo; URLs temporales creadas = revocadas |
| 7 | Restablecer calibración | valores iniciales, **Deshacer**, restablecer un solo ajuste |
| 8 | Exportar | descarga real de `*_anaglifo.jpg` (JPEG válido), original sin cambios; brillo modifica la exportación y Restablecer la devuelve igual |
| – | Ojos | par sintético rojo/azul: cada ojo recibe su mitad e «Intercambiar ojos» intercambia el contenido exportado |
| 9–10 | Reproducir / pausar | estado, avance, imagen congelada en pausa, silencio, −10 s |
| 11 | Sincronizar dos videos | dos MP4 grabados en el navegador con desfase de 1.2 s y zoom 1.2× → Sincronía −1.2 s (±0.15) y tamaño 120 % (±4) |
| 12 | Cancelar procesamiento | unión de videos y estimación de profundidad: aviso inmediato, sin resultados tardíos, **Reintentar** funciona |
| 13 | Entrar y salir de VR | asistente de gafas (toque y teclado), calibración guardada, archivo y parámetros intactos, aviso en vertical, salida táctil, video en VR |
| 14 | Teclado | portada→Studio→muestra solo con teclado, foco visible, atajos del visor, barra del visor, diálogos con `Esc` |
| 15 | Equipo limitado | memoria 1 GB y 2 núcleos simulados → perfil Ahorro, densidad ≤ 1.25× aun con pantalla 3×, exportación a resolución completa del archivo; el usuario puede volver a Alta |
| – | Robustez | pérdida y restauración del contexto WebGL; pellizco y arrastre táctiles; sin desplazamiento horizontal en móvil; objetivos táctiles ≥ 44 px |
| – | IA y privacidad | profundidad estimada en el Worker; solo se contacta al sitio, jsDelivr y Hugging Face; 0 peticiones con cuerpo |
| – | Accesibilidad (axe-core, WCAG 2.2 A/AA) | portada, Studio vacío/con archivo/con error, Studio de video y ambos diálogos: **0 infracciones** |

Nota honesta: las dos pruebas que **graban** videos sintéticos con MediaRecorder dependen del reloj del equipo; con muchas pruebas en paralelo, la grabación a veces salía sin imagen o desfasada, por eso corren en serie (8 de 8 repeticiones aprobadas en serie).

### 6.2 Matriz de pruebas en tus dispositivos — **COMPLETAR**

Estas pruebas requieren lentes, gafas y teléfono reales y **solo tú puedes hacerlas**. Llena la tabla con lo que observes.

| ID | Dispositivo / navegador | Archivo y módulo | Ajustes aplicados | Resultado visual | ¿Pasó? |
|---|---|---|---|---|---|
| P-02 | _por completar_ | `anaglifo_muestra.jpg` · Anaglifo | _por completar_ | _¿se ve la profundidad con lentes rojo-cian?_ | ☐ |
| P-03 | _por completar_ | `sbs_muestra.jpg` · Imagen SBS | _por completar_ | _¿izquierda/derecha correctas?_ | ☐ |
| P-04/05 | _por completar_ | `sbs_muestra.mp4` · Video SBS | _por completar_ | _¿reproduce en el teléfono? ¿audio?_ | ☐ |
| P-08 | _por completar_ | Imagen y video SBS en gafas | _por completar_ | _separación cómoda, sin mareo_ | ☐ |
| P-09 | Escritorio y teléfono | URL HTTPS de Pages | — | _abre sin errores (Console/Network)_ | ☐ |

> Si sientes mareo, fatiga o visión doble persistente, detén la prueba de inmediato.

### 6.3 Incidencias reales encontradas durante el desarrollo

1. **El video SBS se dibujaba en negro.** Con una `Texture` normal, Three.js toma el tamaño de `video.width/height` (que valen 0) y falla al reservar la textura (`glTexStorage2D: dimensions must be greater than zero`). **Solución:** usar `THREE.VideoTexture`, que no reserva almacenamiento fijo, y comprobar el resultado comparando el cuadro dibujado con el cuadro del video.
2. **Reproducir tras llegar al final terminaba al instante.** Al adelantar hasta el final con el video en pausa, el navegador aún no marca `ended`, por lo que `play()` no reiniciaba y el video se detenía enseguida. **Solución:** en `sbsVideo.play()` se considera «al final» cuando `currentTime ≥ duración − 0.05 s`, y se reinicia desde 0.
3. **El asistente de las gafas no respondía al tocar (versión 2).** Entrar al VR lanzaba una *View Transition* a la vez que la pantalla completa; Chrome dejaba la transición activa y todos los toques llegaban a la raíz del documento. **Solución:** entrar y salir del VR sin transición de vista (prueba 13).
4. **No se podía reintentar la profundidad.** Tras un fallo, el aviso pedía «elegir otra vez Foto normal», pero elegir la opción ya marcada no dispara ningún evento. **Solución:** el aviso trae un botón **Reintentar**.
5. **Cancelar y reintentar al instante se anulaba solo.** La caché de audio guardaba una promesa ligada a la señal ya cancelada. **Solución:** la caché no depende de la cancelación y cada ejecución tiene su propia señal (prueba 12).
6. **En teléfono, al cargar un archivo el resultado quedaba fuera de pantalla** (el visor está arriba de los botones). **Solución:** el visor se desplaza a la vista al cargar.
7. **El foco se perdía al salir de la portada** (se enfocaba un botón todavía inerte durante la transición). **Solución:** el foco se mueve cuando la transición ya aplicó el cambio.
8. _Añade aquí al menos una incidencia que encuentres en tu teléfono o con los lentes y cómo la resolviste._

### 6.4 Limitaciones de las pruebas

- No hay dispositivos físicos: **la comodidad visual con lentes rojo-cian o gafas, iPhone/Safari, Firefox y Android real no se probaron**; la matriz 6.2 sigue pendiente.
- WebGL corre por software (SwiftShader); el rendimiento de GPU real no se midió.
- Lectores de pantalla (VoiceOver, NVDA, TalkBack) no se probaron; axe-core cubre solo las reglas automatizables.
- Pantalla completa, bloqueo de orientación y Wake Lock no se pueden verificar en un navegador automatizado.

### 6.5 Registro de calibración — **COMPLETAR**

| Contenido | Módulo | Ajustes que dejaron la vista más cómoda | Dispositivo | Observaciones |
|---|---|---|---|---|
| Anaglifo | Anaglifo | _escala/brillo/contraste_ | _…_ | _…_ |
| Imagen SBS | Imagen SBS | _desplazamiento / alineación / escala / swap_ | _…_ | _…_ |
| Video SBS | Video SBS | _desplazamiento / escala_ | _…_ | _…_ |

---

## 7. Conclusiones (borrador — edítalas con tu experiencia)

- Separar el recorte por ojo (shader), el estado, la interfaz y las reglas de sesión hizo que cada requisito se pudiera probar de forma independiente; `main.js` quedó solo como arranque.
- Usar **un único `<video>`** como fuente de las dos vistas fue la forma más simple de garantizar sincronía; calibrar solo cambia la presentación y no puede desincronizar.
- Validar antes y después de decodificar, y **liberar siempre** el contenido anterior, evita errores acumulados y fugas de memoria al alternar formatos.
- La calibración limitada a ±10 % protege la comodidad visual: el ajuste digital no sustituye una buena captura estéreo.
- Limitaciones: el MP4 debe ser compatible con el navegador (H.264 + AAC es lo más seguro); en iOS el control de volumen del sistema prevalece sobre el deslizador; pantalla completa y bloqueo de orientación dependen del navegador, por eso el visor tiene alternativa dentro de la página.
- _Añade aquí qué aprendiste con las gafas reales y qué mejorarías._

---

## 8. Créditos

Three.js (MIT) · transformers.js (Apache-2.0) y Depth Anything V2 small (Apache-2.0) para la profundidad estimada · Pruebas: Playwright (Apache-2.0), axe-core (MPL-2.0) · Material estereoscópico de muestra: fotografía propia del autor · Diseño y código: José Alonso Godinez Franco.
