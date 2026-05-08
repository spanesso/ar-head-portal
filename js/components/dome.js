/**
 * dome.js — A-Frame component que construye un hemisferio texturizado como
 * "mundo" detrás del marcador. Reemplaza al chamber (v0.7 y anteriores).
 *
 * Por qué un domo en vez de paredes:
 *   La caja de 5 paredes tenía aristas visibles. Cualquier micro-jitter en la
 *   estimación de pose de MindAR hacía que las aristas se vieran "respirar"
 *   contra los bordes del marcador. Una superficie curva continua no tiene
 *   aristas que delaten el jitter — el ojo percibe el mundo como sólido y fluido.
 *
 * Geometría:
 *   Hemisferio centrado en el origen del marcador, radio un poco más grande
 *   que la semi-diagonal del marcador (≈0.87) para que toda la superficie del
 *   marcador proyecte sobre el interior del domo. El "cuenco" se extiende hacia
 *   −z (detrás del marcador); la apertura (ecuador) está en el plano xy = plano
 *   del marcador.
 *
 * Material:
 *   side: back   → la cámara ve el INTERIOR del domo (no el exterior).
 *   shader: flat → la textura se ve tal cual, sin afectarse por la iluminación
 *                  de la escena (apropiado para fondos pre-iluminados).
 *
 * Construcción:
 *   Hemisferio default de Three.js (theta 0..90°, "tapa superior" centrada en +y)
 *   rotado −90° en X. La rotación mapea (x,y,z) → (x,z,−y):
 *     - Polo norte original (0, R, 0) → (0, 0, −R) — fondo del cuenco. ✓
 *     - Ecuador original (plano xz, y=0) → plano xy (z=0) — plano del marcador. ✓
 *
 * Fade-in/out: tracking-fade.js traversea descendientes y ajusta opacity en
 * todos los materiales; el material del domo participa del fade automáticamente.
 */

const DEFAULTS = {
  radius:     1.0,           // semi-diagonal del marcador ≈0.87 → 1.0 = "un poco más grande"
  textureId:  '#dome-tex',   // id del <img> en <a-assets>
  segmentsW:  64,            // longitud — más segmentos = curva más suave
  segmentsH:  32,            // latitud
};

AFRAME.registerComponent('dome', {
  schema: {
    radius:    { type: 'number', default: DEFAULTS.radius },
    textureId: { type: 'string', default: DEFAULTS.textureId },
    segmentsW: { type: 'number', default: DEFAULTS.segmentsW },
    segmentsH: { type: 'number', default: DEFAULTS.segmentsH },
  },

  init() {
    this._build();
  },

  update(oldData) {
    if (Object.keys(this.schema).some(k => this.data[k] !== oldData[k])) {
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      this._build();
    }
  },

  _build() {
    const { radius, textureId, segmentsW, segmentsH } = this.data;

    const dome = document.createElement('a-entity');

    dome.setAttribute('geometry', [
      'primitive: sphere',
      `radius: ${radius}`,
      `segmentsWidth: ${segmentsW}`,
      `segmentsHeight: ${segmentsH}`,
      'thetaStart: 0',
      'thetaLength: 90',  // grados — hemisferio superior (luego se rota a -z)
    ].join('; '));

    dome.setAttribute('material', [
      `src: ${textureId}`,
      'side: back',
      'transparent: true',
      'opacity: 0',
      'shader: flat',
    ].join('; '));

    // Rotación −90° en X → el cuenco apunta hacia −z (detrás del marcador).
    dome.setAttribute('rotation', '-90 0 0');
    dome.setAttribute('position', '0 0 0');

    this.el.appendChild(dome);
  },
});
