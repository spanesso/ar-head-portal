/**
 * portal-mask.js — Plano stencil que define el área visible del "portal" del marcador.
 *
 * Forma parte del sistema de portal stencil masking que limita el renderizado del
 * mundo (domo, cabeza) al rectángulo proyectado del marcador. Es la misma técnica
 * que usan 8th Wall, Lens Studio y otras plataformas profesionales de AR para
 * efectos de "portal" o "ventana al mundo".
 *
 * Funcionamiento:
 *   1. Este componente crea una geometría plana del tamaño del marcador (default
 *      1.0 × 1.42). El material está configurado para escribir `stencilRef` (default 1)
 *      al stencil buffer donde se dibuja, pero NO escribe color ni profundidad
 *      (es invisible para la cámara).
 *   2. renderOrder = -1 → se dibuja PRIMERO en el frame, antes de cualquier
 *      contenido del mundo.
 *   3. El componente complementario `portal-content` configura todos los materiales
 *      descendientes para que SOLO dibujen donde stencil === stencilRef.
 *
 * Resultado: la cámara solo ve el contenido del mundo DENTRO del rectángulo
 * proyectado del marcador. Como si el marcador tuviera "paredes transparentes"
 * que no dejan ver más allá de su área (la metáfora del usuario en v0.9).
 *
 * IMPORTANTE: Posicionar este componente como hermano de `#fade-wrap` (NO descendiente),
 * para que el tween de tracking-fade que setea `material.transparent = true` NO afecte
 * al material del mask. El mask debe permanecer en el pase opaco con renderOrder = -1
 * para escribir stencil ANTES de que el pase transparente renderice domo y cabeza durante
 * el fade.
 *
 * Requiere que el WebGLRenderer tenga stencil: true (default en A-Frame 1.5.0).
 */

const DEFAULTS = {
  width:      1.0,    // ancho del marcador en unidades MindAR (MindAR normaliza width = 1.0)
  height:     1.42,   // alto del marcador (1492/1054 — aspect ratio portrait)
  stencilRef: 1,      // valor stencil a escribir/leer (1..255)
};

AFRAME.registerComponent('portal-mask', {
  schema: {
    width:      { type: 'number', default: DEFAULTS.width },
    height:     { type: 'number', default: DEFAULTS.height },
    stencilRef: { type: 'number', default: DEFAULTS.stencilRef },
  },

  init() {
    const { width, height, stencilRef } = this.data;

    const geom = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      colorWrite:    false,                    // material invisible
      depthWrite:    false,                    // no obstruye depth-test del contenido
      stencilWrite:  true,
      stencilRef:    stencilRef,
      stencilFunc:   THREE.AlwaysStencilFunc,  // siempre pasa el test
      stencilFail:   THREE.KeepStencilOp,
      stencilZFail:  THREE.KeepStencilOp,
      stencilZPass:  THREE.ReplaceStencilOp,   // escribe stencilRef al pasar
      side:          THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = -1;
    this.el.setObject3D('mesh', mesh);
  },

  remove() {
    this.el.removeObject3D('mesh');
  },
});
