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
 */
import * as THREE from 'three';

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
  // Con mapa de profundidad (IA, en el dispositivo) es la profundidad real de la
  // foto; sin él, un relieve aproximado: abajo y al centro cerca, arriba lejos.
  float nearness(vec2 e) {
    if (uHasDepth > 0.5) return texture2D(uDepth, vec2(e.x, 1.0 - e.y)).r - uPlane;
    float ground = 0.5 - e.y;
    float subject = 0.32 - length((e - vec2(0.5, 0.45)) * vec2(1.0, 1.25));
    return 0.65 * ground + 0.35 * subject;
  }

  vec3 sampleView(vec2 uv, vec4 crop, vec2 shift, float synth) {
    vec2 e = uv + shift;
    float inside = step(0.0, e.x) * step(e.x, 1.0) * step(0.0, e.y) * step(e.y, 1.0);
    if (synth != 0.0) {
      // Busca de qué punto de la foto viene este píxel (x_origen = x + s·d(x_origen)):
      // unas iteraciones bastan y evitan que los bordes del sujeto se dupliquen.
      float sx = e.x;
      for (int i = 0; i < 4; i++) sx = e.x + synth * nearness(vec2(clamp(sx, 0.0, 1.0), e.y));
      e.x = sx;
    }
    e = clamp(e, 0.0, 1.0);
    vec2 t = crop.xy + e * crop.zw;
    t = clamp(t, crop.xy + 0.5 * uTexel, crop.xy + crop.zw - 0.5 * uTexel);
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
});

const EYE_GAP_PX = 2; // separación visible entre regiones en el Studio
const MAX_SYNTH = 0.035; // disparidad máxima del relieve aproximado (fracción del ancho)
const MAX_SYNTH_DEPTH = 0.035; // con mapa de profundidad real: disparidad cómoda a 50 %
const EXPORT_MAX_PX = 8192; // límite seguro de canvas en teléfonos

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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x050505, 1);

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
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (this.texture) this.texture.needsUpdate = true;
      this.requestRender();
      this.onContextRestored?.();
    });
  }

  get maxTextureSize() {
    return this.renderer.capabilities.maxTextureSize;
  }

  /** Datos de memoria de GPU; útil para comprobar que se liberan recursos (?debug). */
  get memory() {
    return { ...this.renderer.info.memory };
  }

  /**
   * Muestra un contenido nuevo. Quien llama ya liberó el anterior con clearContent().
   * @param content { kind, source, width, height }
   * @param layout  'single' | 'sbs'
   */
  setContent(content, layout) {
    this.clearContent(false);

    // Para video se usa VideoTexture: Three.js no puede reservar la textura de un
    // <video> con una Texture normal porque width/height del elemento valen 0.
    const texture = content.kind === 'video'
      ? new THREE.VideoTexture(content.source)
      : new THREE.Texture(content.source);
    texture.colorSpace = THREE.NoColorSpace; // se muestra tal cual, sin conversión
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    this.texture = texture;
    this.content = content;
    this.layout = layout;
    for (const material of this.materials) {
      material.uniforms.uMap.value = texture;
      material.uniforms.uTexel.value.set(1 / content.width, 1 / content.height);
    }
    this.requestRender();
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

  /** Libera la textura y deja el canvas limpio. */
  clearContent(redraw = true) {
    this.setDepthMap(null);
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    for (const material of this.materials) material.uniforms.uMap.value = null;
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
    // El video necesita volver a subirse a la GPU en cada dibujo para mostrar el cuadro actual.
    if (kind === 'video' && media.readyState >= 2) this.texture.needsUpdate = true;

    const p = this.params;
    const isSbs = this.layout === 'sbs';
    const regions = isSbs ? this._eyeRegions(width, height, gap) : [{ x: 0, y: 0, w: width, h: height }];
    const twoViews = p.source === 'sbs' || p.source === 'half'; // el archivo trae las dos vistas
    // Ancho de UNA vista: SBS completo = media textura; Half-SBS se estira al ancho entero.
    const eyeW = p.source === 'sbs' ? srcW / 2 : srcW;
    const cropOf = (leftHalf) => (twoViews ? [leftHalf ? 0 : 0.5, 0, 0.5, 1] : [0, 0, 1, 1]);
    const maxSynth = this.depthTexture ? MAX_SYNTH_DEPTH : MAX_SYNTH;
    const synth = (p.depth / 100) * maxSynth * (p.swap ? -1 : 1);

    regions.forEach((region, index) => {
      const material = this.materials[index];
      const mesh = this.meshes[index];
      const u = material.uniforms;
      const direction = index === 0 ? -1 : 1;

      u.uShiftA.value.set(0, 0);
      u.uShiftB.value.set(0, 0);
      u.uSynthB.value = 0;
      if (isSbs) {
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
    const limit = Math.min(EXPORT_MAX_PX, this.renderer.capabilities.maxTextureSize);
    const shrink = Math.min(1, limit / width, limit / height);
    width = Math.max(2, Math.round(width * shrink / 2) * 2);
    height = Math.max(1, Math.round(height * shrink));

    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
    const pixels = new Uint8Array(width * height * 4);
    try {
      this.renderer.setClearColor(0x000000, 1);
      this._draw({ target, width, height, gap: false, lens: { x: 0, y: 0 } });
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    } finally {
      this.renderer.setClearColor(0x050505, 1);
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
    this.clearContent(false);
    this.geometry.dispose();
    this.materials.forEach((material) => material.dispose());
    this.renderer.dispose();
  }
}
