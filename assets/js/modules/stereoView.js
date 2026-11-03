/**
 * stereoView.js — Visor Three.js que dibuja una o dos vistas en un mismo canvas.
 *
 * Responsabilidad: convertir un archivo ya decodificado (imagen o video) en una
 * textura y presentarla por regiones de pantalla:
 *   · layout "single": una sola región (anaglifo).
 *   · layout "sbs":    dos regiones horizontales, una por ojo. La región
 *                      izquierda recorta una mitad de la textura y la derecha la
 *                      otra (RN-11); "Intercambiar ojos" invierte ese recorte
 *                      (RN-12).
 * Mantiene la relación de aspecto con márgenes en lugar de deformar (RN-13) y
 * aplica la calibración solo a lo que se dibuja (RN-07, RN-09).
 * Además puede componer un anaglifo a partir de un par SBS o de una foto
 * normal, crear las dos vistas SBS de una foto normal y exportar el resultado.
 *
 * Es la única pieza que habla con WebGL; el resto de módulos le piden cambios.
 *
 * Gasto de GPU: dibuja solo cuando algo cambia (requestRender agrupa por
 * cuadro), sube un cuadro de video solo cuando el video avanzó y aplica el
 * perfil de calidad (deviceProfile.js) sin tocar la geometría estéreo.
 */
import * as THREE from 'three';
import { rightCrop } from '../core/pairGeometry.js';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Cada región muestrea hasta dos vistas (A y B) de la misma textura:
//   uCrop*   qué porción de la textura es esa vista (x, y, ancho, alto en UV)
//   uShift*  desplazamiento de calibración dentro de la vista (anaglifo compuesto)
//   uSynth*  disparidad del relieve simulado para fotos normales (0 = ninguna)
//   uComposite = 1 → anaglifo rojo-cian: rojo de A, verde y azul de B.
// uTexel evita que el filtrado lineal mezcle píxeles de la otra mitad en el borde.
const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec4 uCropA;
  uniform vec4 uCropB;
  uniform vec2 uShiftA;
  uniform vec2 uShiftB;
  uniform float uSynthA;
  uniform float uSynthB;
  uniform float uComposite;
  uniform sampler2D uDepth;
  uniform float uHasDepth;
  uniform float uPlane;
  uniform vec2 uTexel;
  uniform float uBrightness;
  uniform float uContrast;
  varying vec2 vUv;

  // Cuánto se acerca cada punto (0 = plano de la pantalla, positivo = sale).
  // Con mapa de profundidad (IA, en el dispositivo) es profundidad RELATIVA
  // estimada, no distancia física; sin él, un relieve aproximado.
  float nearness(vec2 e) {
    if (uHasDepth > 0.5) return texture2D(uDepth, vec2(e.x, 1.0 - e.y)).r - uPlane;
    float ground = 0.5 - e.y;
    float subject = 0.32 - length((e - vec2(0.5, 0.45)) * vec2(1.0, 1.25));
    return 0.65 * ground + 0.35 * subject;
  }

  // Margen que impide leer la otra mitad del archivo: medio texel a resolución
  // completa y más cuando, al alejar, se muestrea un nivel de mipmap más grueso.
  vec2 seamMargin(vec2 t) {
    vec2 footprint = fwidth(t) / max(uTexel, vec2(1e-6));
    return 0.5 * uTexel * max(1.0, max(footprint.x, footprint.y));
  }

  vec3 sampleView(vec2 uv, vec4 crop, vec2 shift, float synth) {
    vec2 e = uv + shift;
    // No convertir las coordenadas fuera del cuadro en muestras del borde:
    // conservar una máscara evita estirar píxeles de los límites.
    float inside = step(0.0, e.x) * step(e.x, 1.0) * step(0.0, e.y) * step(e.y, 1.0);
    if (synth != 0.0) {
      // Reproyección iterativa de una sola vista. Es síntesis aproximada y puede
      // dejar oclusiones; la máscara las hace explícitas en vez de duplicar bordes.
      float sx = e.x;
      for (int i = 0; i < 4; i++) {
        float bounded = clamp(sx, 0.0, 1.0);
        sx = e.x + synth * nearness(vec2(bounded, e.y));
      }
      e.x = sx;
    }
    inside *= step(0.0, e.x) * step(e.x, 1.0) * step(0.0, e.y) * step(e.y, 1.0);
    e = clamp(e, 0.0, 1.0);
    vec2 t = crop.xy + e * crop.zw;
    // Un recorte puede salirse del video (dos teléfonos con cuadros distintos): ahí, negro.
    inside *= step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0);
    vec2 margin = min(seamMargin(t), crop.zw * 0.49);
    t = clamp(t, crop.xy + margin, crop.xy + crop.zw - margin);
    return texture2D(uMap, t).rgb * inside;
  }

  void main() {
    vec3 color = sampleView(vUv, uCropA, uShiftA, uSynthA);
    if (uComposite > 0.5) {
      // Mezcla Dubois (rojo-cian): reparte el color entre los dos filtros para
      // que cada ojo reciba su vista con menos fantasmas que el rojo/cian puro.
      vec3 b = sampleView(vUv, uCropB, uShiftB, uSynthB);
      mat3 left = mat3(0.456, -0.040, -0.015, 0.500, -0.038, -0.021, 0.176, -0.016, -0.005);
      mat3 right = mat3(-0.043, 0.378, -0.072, -0.088, 0.734, -0.113, -0.002, -0.018, 1.226);
      color = left * color + right * b;
    }
    color = (color - 0.5) * uContrast + 0.5 + uBrightness;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

const DEFAULT_VIEW_PARAMS = Object.freeze({
  source: 'pass', // 'pass' | 'sbs' | 'half' | '2d': qué trae el archivo
  composite: false, // true: componer anaglifo rojo-cian en una sola región
  scale: 1, // factor sobre el ajuste "contain"
  shiftX: 0, // % del ancho de la región, repartido entre los dos ojos
  alignY: 0, // % del alto de la región, repartido entre los dos ojos
  depth: 0, // 0 … 100: intensidad del relieve simulado (solo 'source: 2d')
  swap: false,
  brightness: 0, // -0.5 … 0.5
  contrast: 1,
  panX: 0, // encuadre compartido, en fracción de la región
  panY: 0,
  rightScale: 1, // dos videos: tamaño relativo del derecho (ver alignPair.js)
  rightX: 0, // dos videos: desplazamiento del recorte del derecho (UV)
  rightY: 0,
  frame: [0, 0, 1], // dos videos: cuadro común (x, y, tamaño) dentro del izquierdo
});

const EYE_GAP_PX = 2; // separación visible entre regiones en el Studio
const MAX_SYNTH = 0.025; // disparidad conservadora (2.5% del ancho); limita artefactos de reproyección
const CLEAR_COLOR = 0x050505;
const DEFAULT_QUALITY = Object.freeze({ pixelRatioCap: 2, mipmaps: true, exportMaxPx: 8192 });

function createEyeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uMap: { value: null },
      uCropA: { value: new THREE.Vector4(0, 0, 1, 1) },
      uCropB: { value: new THREE.Vector4(0, 0, 1, 1) },
      uShiftA: { value: new THREE.Vector2(0, 0) },
      uShiftB: { value: new THREE.Vector2(0, 0) },
      uSynthA: { value: 0 },
      uSynthB: { value: 0 },
      uComposite: { value: 0 },
      uDepth: { value: null },
      uHasDepth: { value: 0 },
      uPlane: { value: 0.35 },
      uTexel: { value: new THREE.Vector2(0, 0) },
      uBrightness: { value: 0 },
      uContrast: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export class StereoView {
  constructor(canvas) {
    this.canvas = canvas;
    // Lanza una excepción si el navegador no ofrece WebGL; main.js la atiende.
    // Sin antialias: solo se dibujan rectángulos alineados con la pantalla, así que
    // el MSAA no mejoraría nada y costaría memoria de GPU en cada región.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default' });
    this.renderer.setClearColor(CLEAR_COLOR, 1);
    this.quality = { ...DEFAULT_QUALITY };
    this._applyPixelRatio();

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 5;

    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.materials = [createEyeMaterial(), createEyeMaterial()];
    this.meshes = this.materials.map((material) => new THREE.Mesh(this.geometry, material));
    this.scene.add(...this.meshes);

    this.width = 1;
    this.height = 1;
    this.content = null;
    this.texture = null;
    this.layout = 'single';
    this.params = { ...DEFAULT_VIEW_PARAMS };
    this.lens = { x: 0, y: 0 }; // separación de lentes de las gafas (solo en VR)
    this._raf = 0;

    this.onContextLost = null;
    this.onContextRestored = null;
    this._listeners = new AbortController();
    const { signal } = this._listeners;
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      cancelAnimationFrame(this._raf);
      this._raf = 0;
      this.onContextLost?.();
    }, { signal });
    // Three.js recrea su estado al restaurar; se vuelven a subir todas las texturas.
    canvas.addEventListener('webglcontextrestored', () => {
      for (const texture of [this.texture, this.textureR, this.depthTexture]) if (texture) texture.needsUpdate = true;
      this.requestRender();
      this.onContextRestored?.();
    }, { signal });
  }

  /** Aplica un perfil de calidad (deviceProfile.js) al instante. */
  setQuality({ pixelRatioCap, mipmaps, exportMaxPx }) {
    const remake = mipmaps !== this.quality.mipmaps && this.content?.kind === 'image';
    this.quality = { pixelRatioCap, mipmaps, exportMaxPx };
    this._applyPixelRatio();
    if (remake) this._buildTextures(); // cambiar mipmaps exige reservar la textura de nuevo
    this.resize(this.width, this.height);
  }

  /** Densidad de píxeles del lienzo: la de la pantalla, con el tope del perfil. */
  _applyPixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatioCap));
  }

  get maxTextureSize() {
    return this.renderer.capabilities.maxTextureSize;
  }

  /** Datos de memoria de GPU; útil para comprobar que se liberan recursos (?debug). */
  get memory() {
    return { ...this.renderer.info.memory };
  }

  get pixelRatio() {
    return this.renderer.getPixelRatio();
  }

  /**
   * Muestra un contenido nuevo. Quien llama ya liberó el anterior con clearContent().
   * @param content { kind, source, width, height }
   * @param layout  'single' | 'sbs'
   */
  setContent(content, layout) {
    this.clearContent(false);
    this.content = content;
    this.layout = layout;
    this._buildTextures();
    this.requestRender();
  }

  /**
   * Crea las texturas del contenido activo. Para video se usa VideoTexture:
   * Three.js no puede reservar la textura de un <video> con una Texture normal
   * porque width/height del elemento valen 0. Las imágenes llevan mipmaps
   * (según el perfil) para verse suaves al alejarlas; el video no, porque
   * regenerarlos en cada cuadro cuesta más de lo que aporta.
   */
  _buildTextures() {
    this._disposeMediaTextures();
    const content = this.content;
    if (!content) return;
    const makeTexture = (source) => {
      const video = content.kind === 'video';
      const texture = video ? new THREE.VideoTexture(source) : new THREE.Texture(source);
      const mipmaps = !video && this.quality.mipmaps;
      texture.colorSpace = THREE.NoColorSpace; // se muestra tal cual, sin conversión
      texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = mipmaps;
      texture.needsUpdate = true;
      return texture;
    };
    this.texture = makeTexture(content.source);
    // Dos videos (uno por ojo): el segundo tiene su propia textura.
    this.textureR = content.right ? makeTexture(content.right.source) : null;
    this._frameTime = [-1, -1];
    for (const material of this.materials) {
      material.uniforms.uMap.value = this.texture;
      material.uniforms.uTexel.value.set(1 / content.width, 1 / content.height);
    }
  }

  _disposeMediaTextures() {
    this.texture?.dispose();
    this.textureR?.dispose();
    this.texture = null;
    this.textureR = null;
    for (const material of this.materials) material.uniforms.uMap.value = null;
  }

  /**
   * Sube el cuadro actual de un video a la GPU solo si cambió (al reproducir o
   * buscar). En pausa, mover un deslizador redibuja sin volver a subir el cuadro.
   */
  _syncVideoFrame(texture, video, slot) {
    if (!texture || video.readyState < 2) return;
    if (video.currentTime !== this._frameTime[slot]) {
      this._frameTime[slot] = video.currentTime;
      texture.needsUpdate = true;
    }
  }

  /**
   * Mapa de profundidad de la foto activa (ver depthEstimate.js) o null para
   * volver al relieve aproximado.
   */
  setDepthMap(map) {
    this.depthTexture?.dispose();
    this.depthTexture = null;
    if (map) {
      const texture = new THREE.DataTexture(map.data, map.width, map.height, THREE.RedFormat, THREE.UnsignedByteType);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.unpackAlignment = 1; // filas de un byte por píxel: sin relleno
      texture.needsUpdate = true;
      this.depthTexture = texture;
    }
    for (const material of this.materials) {
      material.uniforms.uDepth.value = this.depthTexture;
      material.uniforms.uHasDepth.value = this.depthTexture ? 1 : 0;
      material.uniforms.uPlane.value = map?.plane ?? 0.35;
    }
    this.requestRender();
  }

  /** Libera las texturas (archivo y profundidad) y deja el canvas limpio. */
  clearContent(redraw = true) {
    this.setDepthMap(null);
    this._disposeMediaTextures();
    this.content = null;
    if (redraw) this.renderNow();
  }

  setParams(params) {
    this.params = { ...DEFAULT_VIEW_PARAMS, ...params };
  }

  /** Corrección de las gafas (en % de la región): mueve cada ojo hacia su lente. */
  setLens(lens) {
    this.lens = { x: lens?.x ?? 0, y: lens?.y ?? 0 };
    this.requestRender();
  }

  resize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.renderer.setSize(this.width, this.height, false);
    this.requestRender();
  }

  /** Agrupa varias peticiones en un solo dibujo por cuadro de pantalla. */
  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.renderNow();
    });
  }

  renderNow() {
    this._draw({ target: null, width: this.width, height: this.height, gap: true, lens: this.lens });
  }

  /**
   * Dibuja el contenido en pantalla o, para la descarga, en un render target.
   * Con render target, viewport y tijera se fijan en el propio target.
   */
  _draw({ target, width, height, gap, lens }) {
    const { renderer, camera, scene } = this;
    renderer.setRenderTarget(target);
    if (target) target.scissorTest = false;
    renderer.setScissorTest(false);
    if (!target) renderer.setViewport(0, 0, width, height);
    renderer.clear();
    if (!this.content) {
      renderer.setRenderTarget(null);
      return;
    }

    const { source: media, kind, width: srcW, height: srcH } = this.content;
    const pair = this.textureR ? this.content.right : null;
    if (kind === 'video') {
      this._syncVideoFrame(this.texture, media, 0);
      if (pair) this._syncVideoFrame(this.textureR, pair.source, 1);
    }

    const p = this.params;
    const isSbs = this.layout === 'sbs';
    const regions = isSbs ? this._eyeRegions(width, height, gap) : [{ x: 0, y: 0, w: width, h: height }];
    const twoViews = p.source === 'sbs' || p.source === 'half'; // el archivo trae las dos vistas
    // Ancho de UNA vista: SBS completo = media textura; Half-SBS se estira al ancho entero.
    const eyeW = p.source === 'sbs' ? srcW / 2 : srcW;
    const cropOf = (leftHalf) => (twoViews ? [leftHalf ? 0 : 0.5, 0, 0.5, 1] : [0, 0, 1, 1]);
    const synth = (p.depth / 100) * MAX_SYNTH * (p.swap ? -1 : 1);

    regions.forEach((region, index) => {
      const material = this.materials[index];
      const mesh = this.meshes[index];
      const u = material.uniforms;
      const direction = index === 0 ? -1 : 1;

      u.uShiftA.value.set(0, 0);
      u.uShiftB.value.set(0, 0);
      u.uSynthB.value = 0;
      u.uMap.value = this.texture;
      u.uTexel.value.set(1 / srcW, 1 / srcH);
      if (isSbs && pair) {
        // Dos videos: cada ojo ve el suyo; el derecho se recorta para igualar al izquierdo.
        // El cuadro común recorta los dos por igual; el derecho además se iguala al izquierdo.
        const usesRight = (index === 1) !== p.swap;
        const [fx, fy, fs] = p.frame;
        if (usesRight) {
          const [cx, cy, fw, fh] = rightCrop(srcW / srcH, pair.width / pair.height, p.rightScale, p.rightX, p.rightY);
          u.uMap.value = this.textureR;
          u.uTexel.value.set(1 / pair.width, 1 / pair.height);
          u.uCropA.value.set(cx + fx * fw, cy + fy * fh, fs * fw, fs * fh);
        } else {
          u.uCropA.value.set(fx, fy, fs, fs);
        }
        u.uSynthA.value = 0;
        u.uComposite.value = 0;
      } else if (isSbs) {
        // Una vista por región: izquierda = mitad izquierda, salvo "Intercambiar ojos" (RN-11, RN-12).
        u.uCropA.value.set(...cropOf((index === 0) !== p.swap));
        u.uSynthA.value = p.source === '2d' ? direction * synth : 0;
        u.uComposite.value = 0;
      } else if (p.composite) {
        // Anaglifo creado: rojo = vista izquierda, cian = vista derecha.
        u.uCropA.value.set(...cropOf(!p.swap));
        u.uCropB.value.set(...cropOf(p.swap));
        u.uShiftA.value.set(p.shiftX / 200, p.alignY / 200);
        u.uShiftB.value.set(-p.shiftX / 200, -p.alignY / 200);
        u.uSynthA.value = p.source === '2d' ? -synth : 0;
        u.uSynthB.value = p.source === '2d' ? synth : 0;
        u.uComposite.value = 1;
      } else {
        u.uCropA.value.set(0, 0, 1, 1);
        u.uSynthA.value = 0;
        u.uComposite.value = 0;
      }
      u.uBrightness.value = p.brightness;
      u.uContrast.value = p.contrast;

      // Ajuste "contain": conserva la proporción y deja márgenes si hace falta.
      const fit = Math.min(region.w / eyeW, region.h / srcH) * p.scale;
      mesh.scale.set(eyeW * fit, srcH * fit, 1);

      // Encuadre compartido + desplazamiento digital de ventana (cada ojo, la mitad, en sentidos opuestos)
      // + corrección de las gafas.
      let x = p.panX * region.w;
      let y = -p.panY * region.h;
      if (isSbs) {
        x += direction * (((p.shiftX + lens.x) / 100) * region.w) / 2;
        y += direction * (((p.alignY + lens.y) / 100) * region.h) / 2;
      }
      mesh.position.set(x, y, 0);

      camera.left = -region.w / 2;
      camera.right = region.w / 2;
      camera.top = region.h / 2;
      camera.bottom = -region.h / 2;
      camera.updateProjectionMatrix();

      this.meshes.forEach((other) => { other.visible = other === mesh; });
      if (target) {
        target.viewport.set(region.x, region.y, region.w, region.h);
        target.scissor.set(region.x, region.y, region.w, region.h);
        target.scissorTest = true;
        renderer.setRenderTarget(target);
      } else {
        renderer.setViewport(region.x, region.y, region.w, region.h);
        renderer.setScissor(region.x, region.y, region.w, region.h);
        renderer.setScissorTest(true);
      }
      renderer.render(scene, camera);
    });
    renderer.setScissorTest(false);
    renderer.setRenderTarget(null);
  }

  /**
   * Genera un JPG con lo que se ve (calibración incluida) a la resolución del
   * archivo: un anaglifo o un SBS completo listo para las gafas.
   */
  async exportImage() {
    if (!this.content || this.content.kind !== 'image') throw new Error('No hay imagen para exportar.');
    const p = this.params;
    const eyeW = p.source === 'sbs' ? this.content.width / 2 : this.content.width;
    let width = this.layout === 'sbs' ? eyeW * 2 : eyeW;
    let height = this.content.height;
    const limit = Math.min(this.quality.exportMaxPx, this.renderer.capabilities.maxTextureSize);
    const shrink = Math.min(1, limit / width, limit / height);
    width = Math.max(2, Math.round(width * shrink / 2) * 2);
    height = Math.max(1, Math.round(height * shrink));

    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
    const pixels = new Uint8Array(width * height * 4);
    try {
      this.renderer.setClearColor(0x000000, 1);
      this._draw({ target, width, height, gap: false, lens: { x: 0, y: 0 } });
      this.renderer.setClearColor(CLEAR_COLOR, 1);
      // La lectura asíncrona no detiene la página mientras la GPU termina (WebGL 2).
      if (this.renderer.readRenderTargetPixelsAsync) {
        await this.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, pixels);
      } else {
        this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      }
    } finally {
      this.renderer.setClearColor(CLEAR_COLOR, 1);
      target.dispose();
      this.requestRender();
    }

    // WebGL lee de abajo hacia arriba: se invierten las filas.
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(width, height);
    const row = width * 4;
    for (let y = 0; y < height; y += 1) {
      image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    }
    ctx.putImageData(image, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), 'image/jpeg', 0.92);
    });
  }

  _eyeRegions(width, height, gap) {
    const space = gap && width > 400 ? EYE_GAP_PX : 0;
    const w = Math.floor((width - space) / 2);
    return [
      { x: 0, y: 0, w, h: height },
      { x: width - w, y: 0, w, h: height },
    ];
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._listeners.abort();
    this.clearContent(false);
    this.geometry.dispose();
    this.materials.forEach((material) => material.dispose());
    this.renderer.dispose();
  }
}
