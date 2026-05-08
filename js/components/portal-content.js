/**
 * portal-content.js — Recorta el contenido del mundo (domo, cabeza, etc.) al
 * rectángulo del marcador usando clipping planes de Three.js.
 *
 * Por qué clipping planes y no stencil (cambio v0.9 → v1.0):
 *   En v0.9 implementamos stencil masking — la técnica de 8th Wall y Lens Studio.
 *   Falló en producción: con tracking-fade aplicando `material.transparent = true`
 *   al contenido durante el tween, el orden de render passes (opaque vs transparent)
 *   resultaba inconsistente en mobile Safari. El contenido a veces se renderizaba
 *   ANTES del mask, fallando el stencil test, y nada se dibujaba dentro del rectángulo.
 *
 *   Clipping planes son FRAGMENT-LEVEL: cada fragmento se evalúa contra los planos
 *   independientemente del orden de objetos. No hay forma de "perder" un test por
 *   orden de renderizado. Resultado visual idéntico, mucho más reliable.
 *
 * Arquitectura:
 *   1. Definimos 4 planos en marker-local space que forman un "tubo rectangular"
 *      del tamaño del marcador (x ∈ [-w/2, w/2], y ∈ [-h/2, h/2]).
 *   2. En cada frame transformamos los planos a world-space aplicando la
 *      matrixWorld de this.el (que sigue al marcador via MindAR → #target → #world).
 *   3. Cada material descendiente referencia el array `_worldPlanes` (MISMA
 *      referencia, no copia) — los updates in-place en tick() se propagan
 *      automáticamente sin reasignar.
 *   4. `renderer.localClippingEnabled = true` habilita per-material clipping
 *      (default false en three.js).
 *
 * Resultado: domo, cabeza y cualquier mesh dentro de #world solo se dibujan
 * dentro del rectángulo proyectado del marcador.
 */

const DEFAULTS = {
  width:  1.0,    // ancho del marcador (MindAR normaliza a 1.0)
  height: 1.42,   // alto del marcador (1492/1054)
};

AFRAME.registerComponent('portal-content', {
  schema: {
    width:  { type: 'number', default: DEFAULTS.width },
    height: { type: 'number', default: DEFAULTS.height },
  },

  init() {
    const hw = this.data.width  / 2;
    const hh = this.data.height / 2;

    // Planos en marker-local space.
    // Convención three.js: el lado positivo del plano (n·X + c > 0) se RECORTA;
    // el lado negativo se renderiza.
    this._localPlanes = [
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3( 1, 0, 0), new THREE.Vector3( hw, 0, 0)),  // recorta x > +hw
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-hw, 0, 0)),  // recorta x < -hw
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0,  1, 0), new THREE.Vector3(0,  hh, 0)),  // recorta y > +hh
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -hh, 0)),  // recorta y < -hh
    ];

    // Planos en world-space — se actualizan en tick() desde los locales.
    // Los materiales referencian este array (no copia) — cambios in-place se propagan.
    this._worldPlanes = this._localPlanes.map(p => p.clone());

    // Habilitar per-material clipping en el renderer (default false en three.js).
    const sceneEl = this.el.sceneEl;
    const enable = () => { sceneEl.renderer.localClippingEnabled = true; };
    if (sceneEl.hasLoaded) enable();
    else sceneEl.addEventListener('loaded', enable, { once: true });
  },

  tick() {
    // Actualizar planos world-space aplicando la matrixWorld del entity.
    this.el.object3D.updateMatrixWorld(true);
    const mw = this.el.object3D.matrixWorld;
    for (let i = 0; i < 4; i++) {
      this._worldPlanes[i].copy(this._localPlanes[i]).applyMatrix4(mw);
    }

    // Asegurar que todos los meshes descendientes tienen los clipping planes asignados.
    // El check `!== this._worldPlanes` evita reasignar (y disparar needsUpdate) si ya están.
    // Esto cubre meshes que se crean tarde (e.g. GLB de la cabeza al cargar).
    this.el.object3D.traverse(node => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(mat => {
        if (mat.clippingPlanes !== this._worldPlanes) {
          mat.clippingPlanes = this._worldPlanes;
          mat.clipShadows    = false;
          mat.needsUpdate    = true;
        }
      });
    });
  },
});
