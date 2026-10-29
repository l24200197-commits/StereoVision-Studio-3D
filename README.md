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

**No hace (fuera de alcance):** garantizar la profundidad exacta de una foto 2D (se estima con IA; en video y sin conexión se usa un relieve aproximado: abajo y al centro cerca, arriba lejos), convertir un anaglifo en SBS, exportar video, transcodificar video, seguimiento de cabeza/giroscopio, SBS vertical (arriba/abajo) u «over-under», cuentas de usuario o almacenamiento en servidor.

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

Rangos de calibración:

| Módulo | Control | Rango | Inicial |
|---|---|---|---|
| Anaglifo | Tipo de foto | Ya es anaglifo / Par SBS / Foto normal | según detección |
| Anaglifo | Zoom / Brillo / Contraste | 50–300 % / −50…50 / 50–200 % | 100 % / 0 / 100 % |
| Anaglifo creado | Desplazamiento / Alineación (par SBS) / Intercambiar ojos | −10…10 % | 0 |
| SBS imagen y video | Tipo de foto | SBS completo / Half-SBS / Foto normal | según detección (video: SBS) |
| Foto normal (anaglifo o SBS) | Profundidad | 0–100 % | 50 % |
| Dos videos | Sincronía / Tamaño del video derecho | −10…10 s (paso 0.02) / 60–160 % | automáticos (audio e imagen) |
| Modo VR (gafas) | Separación / Altura de lentes | −25…25 % / −10…10 % | guardado en el teléfono |
| SBS imagen y video | Desplazamiento horizontal / Alineación vertical | −10…10 % (paso 0.1) | 0 |
| SBS imagen y video | Zoom | 50–200 % | 100 % |
| SBS imagen y video | Intercambiar ojos | sí/no | no |

### Muestras incluidas (`assets/media/`)

Generadas a partir de una fotografía estereoscópica propia (par izquierdo/derecho):
`anaglifo_muestra.jpg` (canal rojo del ojo izquierdo, verde/azul del derecho), `sbs_muestra.jpg` (1240×936) y `sbs_muestra.mp4` (H.264 + AAC, 6 s, 1240×936, con un acercamiento lento idéntico en ambas vistas para que la profundidad la den las dos perspectivas).

---

## 3. Ejecutar localmente (siempre por HTTP, no `file://`)

Los módulos ES y `fetch` requieren un origen HTTP.

- **VS Code:** extensión *Live Server* → clic derecho en `index.html` → *Open with Live Server*.
- **Python:** `python3 -m http.server 8000` dentro de esta carpeta y abrir `http://localhost:8000/`.

Para probar desde el teléfono en la misma red Wi-Fi, abre `http://IP-DE-TU-PC:PUERTO/`. Algunas funciones móviles (pantalla completa, Wake Lock) exigen HTTPS, por lo que la prueba final se hace en la URL de GitHub Pages.

Modo de inspección opcional: añade `?debug` a la URL para exponer `window.__studio` (estado, visor, memoria de GPU) en la consola.

## 4. Publicar en GitHub Pages

```bash
cd StereoVision-Studio-3D            # la carpeta que contiene index.html
git init                              # solo si aún no es repositorio (¡evita carpetas .git anidadas!)
git add .
git commit -m "StereoVision Studio 3D"
git branch -M main
git remote add origin https://github.com/l24200197-commits/StereoVision-Studio-3D.git
git push -u origin main
```

Después: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch `main` / carpeta `/ (root)`**. El sitio queda en `https://l24200197-commits.github.io/StereoVision-Studio-3D/`.
`index.html` debe estar en la **raíz del repositorio**. Todas las rutas del proyecto son **relativas** (`./assets/...`), por lo que funcionan bajo el subdirectorio de Pages (RN-20). La única dependencia externa es Three.js por CDN (versión fija 0.180.0).

---

## 5. Arquitectura

```
StereoVision-Studio-3D/
├── index.html                 Estructura de la interfaz (sin lógica)
├── README.md
├── assets/
│   ├── css/styles.css         Estilos, diseño responsivo, modo VR y movimiento
│   ├── img/favicon.svg        Icono
│   ├── media/                 Muestras ligeras (anaglifo, SBS imagen, SBS video)
│   └── js/
│       ├── main.js            Inicialización: crea y conecta las piezas
│       └── modules/
│           ├── store.js       Estado único y catálogo de estados
│           ├── ui.js          Lee el estado y actualiza la pantalla; eventos del DOM
│           ├── studio.js      Reglas de sesión: módulo, importación, sustitución, reinicio
│           ├── fileImport.js  Selección, validación (RN-02/03/04) y decodificación
│           ├── calibration.js Parámetros, valores iniciales y panel de controles
│           ├── stereoView.js  Visor Three.js: recorte por ojo, aspecto, desplazamiento
│           ├── anaglyph.js    Módulo anaglifo (una región, brillo/contraste)
│           ├── sbsImage.js    Módulo imagen SBS (dos regiones, calibración)
│           ├── sbsVideo.js    Módulo video SBS (un <video>, controles de reproducción)
│           ├── vrMode.js      Modo VR: pantalla completa, orientación, controles táctiles
│           └── motion.js      Utilidades de animación (respetan «reducir movimiento»)
```

### Responsabilidad de cada módulo

| Módulo | Responsabilidad |
|---|---|
| `main.js` | Solo arranca: crea store, UI, visor, calibración, studio y VR, y los conecta. Atiende la falta de WebGL. |
| `store.js` | Guarda el estado (módulo, estado, archivo, parámetros, mensaje, VR) y avisa a quien se suscribe. No toca DOM ni WebGL. |
| `ui.js` | Pinta el estado (píldora de estado, información del archivo, mensajes, habilitación de controles, rótulos por ojo). Sin reglas de negocio. |
| `studio.js` | Reglas RN-01/04/05/08/09/10: un solo archivo activo, liberar el anterior, restablecer calibración al importar, token para ignorar importaciones atrasadas. |
| `fileImport.js` | Valida formato/tamaño/compatibilidad con el módulo; decodifica imagen o video; devuelve un contenido con `release()` que libera todo. |
| `calibration.js` | Define parámetros por módulo, sus valores iniciales y construye los controles con indicadores sincronizados. |
| `stereoView.js` | Única pieza que habla con WebGL. Un `ShaderMaterial` por región recorta la vista que le toca, compone el anaglifo rojo-cian (rojo de la vista izquierda, verde/azul de la derecha) o crea vistas desde una foto normal desplazando píxeles según un relieve aproximado; viewport/scissor por región; ajuste «contain»; exporta a JPG con un render target. |
| `anaglyph.js` / `sbsImage.js` / `sbsVideo.js` | Descriptor de cada modalidad (layout, ¿admite VR?, conversión de parámetros) y su activación. `sbsVideo.js` además conecta play/pausa/búsqueda/volumen con el `<video>`. |
| `vrMode.js` | Entrar/salir del visor limpio; pantalla completa, bloqueo horizontal y Wake Lock con alternativa dentro de la página si el navegador no los permite. |
| `stereoDetect.js` | Analiza una copia reducida de la imagen: correlación rojo↔verde (anaglifo) y mitad izquierda↔derecha, con control de simetría en espejo (SBS). |
| `depthEstimate.js` | Profundidad de una foto normal con Depth Anything V2 (transformers.js, WASM), calculada en el dispositivo; suaviza el mapa y elige el plano de pantalla. |
| `audioSync.js` | Desfase entre dos videos: huella de golpes de sonido cada 10 ms y correlación cruzada (±20 s), con medida de confianza. |
| `alignPair.js` | Escala y posición del video derecho respecto del izquierdo, buscando la mejor correlación entre un cuadro de cada uno. |
| `gestures.js` | Rueda/pellizco = zoom, arrastrar = mover, doble clic/toque = centrar, sobre el visor. |
| `vrWizard.js` | Asistente de las gafas (miras por ojo, tercios de pantalla); guarda la separación de lentes en `localStorage`. |
| `intro.js` | Portada: convergencia del título, selección de módulo y transición al Studio. |
| `motion.js` | Animaciones puntuales (aviso, aparición del visor, transición de vista al entrar/salir de VR). |

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

### 6.1 Pruebas automatizadas de escritorio (Chromium, simulando GitHub Pages en un subdirectorio)

Ejecutadas con Playwright sobre el sitio servido en `/StereoVision-Studio-3D/`. Comparan capturas del visor píxel a píxel. Resultado: **más de 130 comprobaciones aprobadas, 0 fallidas, 0 errores de consola, 0 respuestas 4xx**. _(Nota: Chromium de pruebas no decodifica H.264; el video se probó con una copia VP9 en MP4. El MP4 H.264 incluido debe comprobarse en tu teléfono.)_

| ID | Qué se verificó | Resultado |
|---|---|---|
| P-01 | Sin contenido: Studio visible, importar/calibración/restablecer/VR inactivos, instrucciones, consola limpia | ✅ |
| P-02 | Anaglifo visible; escala, brillo y contraste cambian la vista; Restablecer devuelve la imagen idéntica | ✅ |
| P-03 | SBS: región izquierda = mitad izquierda del archivo y derecha = mitad derecha; desplazamiento, alineación y escala cambian la vista; intercambio de ojos intercambia el contenido real; sin estiramiento a 3 proporciones; imagen sintética propia (izquierda roja/derecha azul) | ✅ |
| P-04 | Video: reproducir, pausar (imagen congelada), búsqueda, ±10 s, volumen, silencio, tiempo/duración, volver a reproducir desde el final | ✅ |
| P-05 | Desplazamiento y escala durante la reproducción: mismo `<video>`, sin recarga, ambas regiones del mismo cuadro | ✅ |
| P-06 | 7 cambios consecutivos imagen↔video + reimportaciones: ≤1 textura, ≤1 video, URLs temporales revocadas, la página no se recarga | ✅ |
| P-07 | Negativas: `.txt`, `.pdf`, JPG vacío, JPG corrupto, MP4 corrupto, video en módulo de imagen e imagen en módulo de video → mensaje claro, sin controles activos, y recuperación importando un archivo válido | ✅ |
| P-08 | VR (móvil emulado, horizontal y vertical): editor oculto, dos regiones, parámetros y archivo conservados, salida táctil, controles que se ocultan/reaparecen, `Esc`, reproducción desde VR, aviso en vertical | ✅ |
| P-09 | Todas las rutas bajo el subdirectorio, sin 404 ni rutas absolutas | ✅ (en simulación; **confirma en tu URL real**) |

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
3. _Añade aquí al menos una incidencia que encuentres en tu teléfono o con los lentes y cómo la resolviste._

### 6.4 Registro de calibración — **COMPLETAR**

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

Three.js (MIT) · Material estereoscópico de muestra: fotografía propia del autor · Diseño y código: José Alonso Godinez Franco.
