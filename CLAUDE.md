<!-- SPECKIT START -->
Active feature: **001-ar-internal-world** (AR Internal World Inside Image Marker).
Read the implementation plan for technologies, project structure, runtime contracts, and quickstart:
- Plan: `specs/001-ar-internal-world/plan.md`
- Spec: `specs/001-ar-internal-world/spec.md`
- Research (decisions): `specs/001-ar-internal-world/research.md`
- Data model: `specs/001-ar-internal-world/data-model.md`
- Contracts: `specs/001-ar-internal-world/contracts/`
- Quickstart: `specs/001-ar-internal-world/quickstart.md`

Stack: A-Frame 1.5.0 + MindAR image-tracking 1.2.5 + vanilla HTML/CSS/JavaScript. No build step, no framework. Mobile WebAR (iOS Safari, Android Chrome). HTTPS required for camera at runtime.

**Versión actual: v2.0-8thwall** (en rama `8thwall-migration`) — Se muestra en `#version-badge`. La rama `develop` se queda en v1.4 (MindAR + IMU fusion) como fallback funcional. Constante `APP_VERSION` en `js/app.js`. **Incrementar con cada cambio desplegado**.

**Migración v1.4 → v2.0**: Reemplazo total de MindAR por **8th Wall open source** (Niantic abrió el código bajo MIT a inicios de 2026). 8th Wall trae SLAM/world tracking integrado, así que `imu-fusion.js` queda obsoleto. Stack ahora: A-Frame 1.5.0 + 8th Wall XR Engine + xrextras. Deploy sigue siendo drag-and-drop a Netlify (sin webpack), pero **el image target hay que recompilarlo** con `npx @8thwall/image-target-cli@latest` (ver `assets/targets/README.md`). Ver bug #13.

**Cambios cosméticos v1.3**: Paredes del chamber ocultas (`visible="false"` en HTML); cabeza más pequeña (`scale 0.35`), centrada verticalmente (`y=0.15`) y un poco más atrás (`z=-0.65`). La geometría del chamber sigue existiendo conceptualmente pero no renderiza — solo se ve la cabeza flotando frente al feed de cámara.

**Decisión arquitectónica clave (v1.1)**: Después de experimentar con domo + stencil masking (v0.9) y domo + clipping planes (v1.0) intentando replicar efectos tipo 8th Wall, se confirmó que **con MindAR puro la solución más estable es el chamber rectangular** porque su geometría coincide exactamente con el marcador y no requiere ningún hack de masking. Ver bug #10.

**Mejora v1.2 — IMU sensor fusion**: Añadido componente `imu-fusion` que lee giroscopio del dispositivo y predice la pose entre updates de MindAR (~30Hz → ~60Hz efectivos). NO es SLAM, pero reduce el lag perceptible cuando el usuario mueve el teléfono. Ver bug #11.
<!-- SPECKIT END -->

---

## Implementación — Estado actual y decisiones técnicas

### Estado del proyecto (2026-05-07)
La implementación está completa a nivel de código. Los assets físicos todavía son necesarios:
- `assets/targets/marker.mind` — compilar con el MindAR Image Target Compiler
- `assets/models/human_head.glb` — modelo GLB optimizado para web (≤ 25K tris, ≤ 5 MB)

Despliegue recomendado: **Netlify drag-and-drop** (arrastrar toda la carpeta del proyecto a la web de Netlify). Genera URL HTTPS gratuita, requerida para acceso a cámara.

---

### Arquitectura de componentes

#### Archivos principales
| Archivo | Responsabilidad |
|---|---|
| `index.html` | Escena A-Frame, jerarquía de entidades, overlays DOM |
| `css/styles.css` | Reset, overlays, spinner, hint |
| `js/app.js` | SessionState machine, asset coordinator, overlay manager |
| `js/components/chamber.js` | Componente A-Frame: construye 5 paredes de colores + rim naranja (re-activado en v1.1) |
| `js/components/imu-fusion.js` | Predicción de pose entre frames de MindAR usando giroscopio (v1.2) |
| `js/components/tracking-fade.js` | TrackingState machine, tweens fade-in/out |
| `js/debug-console.js` | Consola visual en pantalla para depuración en iPhone |
| ~~`js/components/dome.js`~~ | **DEPRECADO en v1.1** — el domo requería masking que no funcionaba bien con MindAR (ver bug #10). Archivo se conserva como referencia. |
| ~~`js/components/portal-content.js`~~ | **DEPRECADO en v1.1** — clipping planes para el domo, ya no necesarios con chamber. Archivo se conserva. |
| ~~`js/components/portal-mask.js`~~ | **DEPRECADO en v1.0** — stencil masking falló cross-browser. |
| ~~`js/components/jitter-smoother.js`~~ | **ELIMINADO en v0.5** — tenía un bug fundamental (ver bug #5) |

#### Jerarquía de entidades en la escena (v1.2)
```
#target (mindar-image-target)
  └── #imu-predict (imu-fusion) ← capa de predicción gyro entre frames de MindAR
        └── #fade-wrap (tracking-fade, visible=false)
              └── #world
                    ├── #chamber (chamber — 5 paredes de colores + rim naranja)
                    ├── #head (a-gltf-model)
                    ├── #ambient (a-light, ambient)
                    ├── #directional (a-light, directional)
                    └── #rim (a-light, point)
```
- El chamber (1.0 × 1.42 × 1.0) coincide exactamente con el rectángulo del marcador → no necesita masking.
- `#imu-predict` es passthrough cuando IMU fusion está dormida (sin permiso o sin sensor); aplica una rotación local entre updates de MindAR cuando está activa.
- tracking-fade walks ancestors buscando mindar-image-target → atravesar el nivel extra de `#imu-predict` no rompe la subscripción a targetFound/targetLost.

#### Máquinas de estado
- **SessionState** (en `app.js`): `INITIALIZING → AWAITING_MARKER → RUNNING / ERROR`
- **TrackingState** (en `tracking-fade.js`): `PENDING → DETECTED → LOST_GRACE → LOST`

#### Contratos de eventos (ver `contracts/runtime-events-contract.md`)
- `tracking-fade` es el **único** suscriptor de `targetFound` / `targetLost`
- `app.js` es el **único** propietario de SessionState
- `tracking-fade` emite `world-revealed` (primera vez) y `world-hidden`
- `app.js` emite `assets-ready` cuando el GLB termina de cargar

---

### Bugs resueltos y sus soluciones

#### 1. Loading screen eternamente visible en Netlify
- **Causa**: El evento `arReady` de MindAR no se dispara de forma fiable en producción (especialmente si `marker.mind` tarda en cargar).
- **Solución**: Usar `scene.addEventListener('loaded', ...)` de A-Frame como disparo principal para ocultar el loading. `arReady` se mantiene solo como suplemento. Ambos transicionan solo si el estado sigue siendo `INITIALIZING`.

#### 2. `ReferenceError: Can't find variable: AFRAME` en Safari iOS
- **Causa**: Los scripts CDN cross-origin con atributo `defer` no garantizan orden de ejecución en Safari iOS. Los scripts de componentes se ejecutaban antes de que AFRAME estuviera definido.
- **Solución**: Eliminar `defer` de los scripts de A-Frame y MindAR — cargan de forma bloqueante (síncronos), garantizando que `AFRAME` esté definido antes de cualquier componente. Los componentes locales y `app.js` mantienen `defer`.

#### 3. `THREE.WebGLRenderer: useLegacyLights deprecated`
- **Causa**: `physicallyCorrectLights: true` fue renombrado en Three.js r155+, versión que usa A-Frame 1.5.0.
- **Solución**: Eliminar `physicallyCorrectLights: true` del atributo `renderer` de `<a-scene>`.

#### 4. Pantalla negra — el feed de cámara no es visible
- **Causa A**: El atributo `embedded` en `<a-scene>` impide que A-Frame aplique su clase `a-fullscreen`, lo que rompe el posicionamiento del elemento `<video>` interno de MindAR.
- **Causa B**: La regla CSS global `canvas { width: 100% !important; height: 100% !important }` redimensionaba el canvas interno de detección de MindAR a dimensiones incorrectas, haciendo que el feed de vídeo no se viera.
- **Causa C**: A-Frame 1.5.0 aplica su componente `background` con `setClearColor(black, alpha=1)` opaco, sobreescribiendo el canvas transparente creado por `renderer="alpha: true"` y tapando el video de la cámara.
- **Causa D (raíz definitiva)**: MindAR 1.2.5 crea el elemento `<video>` con `z-index: -2` y lo añade al `<body>`. En el orden de pintado CSS, los elementos con z-index negativo se pintan POR ENCIMA del background del root (`<html>`) pero POR DEBAJO del background del `<body>`. Con `body { background: #000 }`, el body tapa el video. **Solución**: `body { background: transparent }` — solo `html` puede tener `background: #000`.
- **Solución completa**: (1) No `embedded` en `<a-scene>`, (2) no override de canvas CSS, (3) `background="transparent: true; generateEnvironment: false"` en `<a-scene>`, (4) `body { background: transparent }` en CSS.

#### 5. Contenido se desplaza del marcador al mover el celular (jitter-smoother bug)
- **Causa**: `jitter-smoother.js` leía `parent.object3D.position` — la posición LOCAL del `#target` (que en el espacio de la escena MindAR equivale a la posición del marcador en escena). Luego escribía ese valor como la posición LOCAL del hijo `#jitter-wrap` (relativa al padre `#target`). Esto apilaba la transformación dos veces: `posición_mundo = posición_marcador + rotación_marcador × posición_marcador_suavizada`. El contenido volaba fuera del marcador en cuanto el usuario movía el teléfono.
- **Solución**: Eliminar `jitter-smoother.js` completamente de la jerarquía de entidades y del HTML. MindAR ya aplica su propio suavizado interno al pose del target; un suavizador externo que relee la posición del padre es redundante y buggy.

#### 6. Jitter de la caja en reposo + lag de tamaño durante movimiento (v0.6 → v0.7)
- **Iteración v0.6 (incorrecta)**: Bajé `filterBeta` a `0.001` (vs default `1000`) pensando que más smoothing siempre ayuda. Resultado: la caja seguía al marcador con lag visible durante movimiento, su tamaño proyectado no coincidía con el marcador, y se perdió la ilusión de "caja metida dentro del marcador".
- **Análisis del filtro One-Euro**: La fórmula es `cutoff = filterMinCF + filterBeta × |velocidad|`.
  - `filterMinCF` solo actúa cuando velocidad ≈ 0 (marcador quieto).
  - `filterBeta` es el TÉRMINO ADAPTATIVO que sube el cutoff cuando hay movimiento, dejando pasar las altas frecuencias (= seguir al instante).
  - Bajar `filterBeta` mata la adaptación → el filtro queda "atorado" en modo smooth incluso cuando el marcador se mueve rápido → lag.
- **Solución v0.7 (correcta)**:
  - `filterMinCF: 0.00001` — 10× más bajo que default. Elimina jitter cuando el marcador está quieto.
  - `filterBeta: 5000` — 5× más alto que default. Sigue movimiento al instante, sin lag de posición/tamaño.
  - `warmupTolerance: 5` — default. Detección rápida.
  - `missTolerance: 10` — el doble del default. Tolera oclusiones breves sin parpadear.
- **Por qué la idea "fijar la caja al primer detect y no moverla más" NO funciona**: MindAR no es SLAM. Su sistema de coordenadas está anclado a la cámara (cámara siempre en origen). Congelar la pose del frame 0 dejaría la caja pegada a la pantalla, no al marcador, porque el marcador "se mueve" en coordenadas de cámara cuando el usuario mueve el teléfono. Para anclar contenido al espacio real haría falta WebXR o SLAM-based AR (ARKit/ARCore), tecnologías fuera del scope de este proyecto.
- **No usar** un suavizador A-Frame externo que lea pose del padre y la escriba al hijo (ver bug #5). Si en el futuro hace falta más smoothing, debe ser un componente que opere en world-space (sibling de `#target`, no descendiente).

#### 7. Caja de paredes "respira" contra los bordes del marcador (v0.8 — chamber → dome)
- **Causa**: Aunque v0.7 estabilizó la pose con el One-Euro tuneado, MindAR sigue teniendo un piso de ruido inherente (~1-2 px de error en la proyección de los corners del marcador). En geometría con aristas (chamber: 5 paredes + rim) ese ruido se manifiesta visualmente como las aristas "respirando" contra los bordes del marcador y desalineamientos puntuales del rim. La ilusión de portal se rompía durante el movimiento.
- **Solución v0.8**: Reemplazar el chamber por un domo texturizado (`js/components/dome.js`). Una superficie curva continua sin aristas no tiene bordes que delaten el micro-jitter — el ojo percibe el mundo como sólido aunque la pose tenga ruido. La geometría es un hemisferio default (`thetaLength: 90`) rotado `-90 0 0` para que el cuenco apunte hacia `-z`. Material: `side: back` + `shader: flat` con `assets/background.png` como textura. Radio `1.0` (un poco más grande que la semi-diagonal del marcador ≈0.87) para que toda el área del marcador proyecte sobre el interior del domo.
- **Aclaración técnica**: el domo SÍ sigue al marcador como hacía el chamber (es hijo de `#fade-wrap` → `#target`). El "no se mueve" que percibe el usuario es un efecto perceptual: sin aristas, el ojo no detecta los micro-movimientos de pose.
- **Importante para texturas**: la textura debe cargarse vía `<a-assets>` con un `<img>` para que A-Frame la precargue. Sin precarga, el material aparece sin textura durante un frame al hacer fade-in. La entrada en `<a-assets timeout="15000">` da margen a conexiones lentas sin colgar el loading.

#### 8. Domo se ve fuera del rectángulo del marcador + sensación de "se mueve mucho" (v0.9 — portal stencil masking)
- **Causa visual**: El domo (radius 1.0, diameter 2.0) tiene una silueta circular más grande que el marcador (1.0 × 1.42). Sin masking, la geometría del domo proyecta sobre la cámara MÁS ALLÁ del rectángulo del marcador, rompiendo la ilusión de "ventana al mundo interno". Los bordes circulares del domo flotando fuera del marcador delatan el jitter de pose.
- **Causa percibida del wobble**: MindAR es image tracking puro. La pose se recalcula cada frame con ruido inherente (~1-2 px). El filtro One-Euro v0.7 lo mitiga pero no lo elimina. 8th Wall logra mejor estabilidad porque combina image tracking con SLAM (world tracking) — tecnología fuera del scope de MindAR/proyecto.
- **Solución v0.9 — Portal stencil masking** (la misma técnica que 8th Wall y Lens Studio para portales AR):
  - **`portal-mask.js`**: crea un plano del tamaño exacto del marcador (1.0 × 1.42) con material `MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilFunc: AlwaysStencilFunc, stencilZPass: ReplaceStencilOp, stencilRef: 1 })` — invisible pero escribe `1` al stencil buffer. `renderOrder = -1` para dibujar PRIMERO en el frame.
  - **`portal-content.js`**: traversea descendientes de `#world` y configura cada material con `stencilWrite: true, stencilFunc: EqualStencilFunc, stencilRef: 1` — solo dibujan donde el stencil === 1.
  - Resultado: el contenido del mundo (domo + cabeza) solo es visible dentro del rectángulo proyectado del marcador. Como una "ventana" recortada con la forma exacta del marcador.
- **Por qué `#portal-mask` es HERMANO de `#fade-wrap`, no descendiente**: `tracking-fade._applyOpacity` setea `material.transparent = true` en TODOS los descendientes durante el tween. Si el mask fuera descendiente, su material pasaría al pase transparente — pero el mask DEBE renderizarse en el pase opaco (con renderOrder = -1) ANTES de que el contenido lea el stencil. Si el mask se renderiza después del contenido, el stencil aún no está escrito y el contenido NO se dibuja. Mantener el mask fuera de fade-wrap evita que tracking-fade lo toque.
- **Domo radius subido a 1.2** (de 1.0 en v0.8): con stencil masking activo, la silueta visible del domo es el rectángulo del marcador, NO el círculo del domo. Por tanto un radio mayor NO agranda lo que se ve — solo aleja la superficie visible de la cámara, reduciendo el parallax perceptible cuando hay micro-jitter de pose. Sensación más estable durante el movimiento.
- **Limitación honesta**: el portal completo (rectángulo + contenido) sigue moviéndose con la pose del marcador, incluyendo su jitter. Eso NO se puede eliminar con MindAR puro. Para estabilidad nivel ARKit/ARCore haría falta WebXR con world tracking o un servicio comercial como 8th Wall.

#### 9. Stencil masking falló en mobile Safari → reemplazado por clipping planes (v1.0)
- **Síntoma reportado**: Después de desplegar v0.9 en iPhone, el domo no aparecía dentro del rectángulo del marcador (ni dentro ni fuera — invisible o sin restricción).
- **Causa raíz**: tracking-fade aplica `material.transparent = true` a todos los materiales descendientes durante el tween de fade-in. Con transparent: true, los meshes pasan al pase TRANSPARENTE de three.js. El `#portal-mask` (sibling de #fade-wrap, opaco con `colorWrite: false`) se renderizaba en el pase OPACO. **En teoría** el orden global era correcto (opacas primero → mask escribe stencil → transparentes leen). En la práctica con A-Frame 1.5 + mobile Safari, había una inconsistencia: a veces el contenido se evaluaba contra un stencil aún no escrito (= 0), fallando el test, y nada se dibujaba.
- **Solución v1.0 — Clipping planes**: cambio a clipping planes (THREE.Plane + Material.clippingPlanes). Son fragment-level: cada fragmento se evalúa contra los planos independientemente del orden de objetos. No hay forma de "perder" un test por race condition de render passes. Resultado visual idéntico al portal stencil, mucho más reliable.
- **Implementación**:
  - `portal-content.js` define 4 planos en marker-local space que forman un tubo rectangular del tamaño del marcador.
  - En cada `tick()`, transforma los planos a world-space aplicando la matrixWorld de `this.el` (que sigue al marcador via #target → MindAR).
  - Cada material descendiente referencia el array `_worldPlanes` (misma referencia, no copia) — los updates in-place se propagan automáticamente sin reasignar.
  - `renderer.localClippingEnabled = true` habilita per-material clipping (default false).
- **No reintroducir stencil masking** en este proyecto sin antes probar exhaustivamente en mobile Safari + A-Frame 1.5 + transparent materials. La técnica funciona en muchos contextos, pero el combo específico de este proyecto la hace frágil.

#### 10. Volver al chamber tras experimentar con dome (v1.1) + comparativa MindAR vs 8th Wall
- **Decisión**: Después de tres iteraciones intentando que un domo (hemisferio texturizado) funcionara con masking (stencil v0.9 falló, clipping planes v1.0 se vio peor que el chamber original), volvemos al chamber rectangular como solución definitiva.
- **Por qué el chamber es superior con MindAR**: Su geometría rectangular (1.0 × 1.42 × 1.0) coincide EXACTAMENTE con el marcador. No hay silueta extra que tape, no hace falta masking, no hay riesgo de race conditions de render passes. La caja es geométricamente la opción correcta cuando el marcador es rectangular y no se tiene SLAM.
- **Por qué 8th Wall logra portales con domo y nosotros no**:
  - **8th Wall combina image tracking con SLAM** (world tracking). Tienen una librería propietaria que recupera la pose de la cámara contra el entorno real, no solo contra el marcador. Eso permite estabilizar contenido en el espacio incluso cuando el marcador no se ve perfectamente.
  - **8th Wall controla toda la pipeline de renderizado** — su engine es custom, no usan A-Frame. Pueden garantizar el orden exacto de render passes, hacer trucos de stencil que en A-Frame son frágiles.
  - **Su producto cuesta ~$3000/año** para licencia comercial. Tienen un equipo de ingenieros desde 2018 puliendo este pipeline.
  - **MindAR es gratis y open-source**, mantenido principalmente por una persona. Solo hace image tracking, no SLAM. La pose se recalcula cada frame desde cero, con jitter inherente que ningún filtro elimina del todo.
- **Para alcanzar calidad nivel 8th Wall** las opciones reales son: (a) comprar licencia 8th Wall, (b) WebXR con image tracking — solo Chrome Android, no Safari iOS, (c) ARKit/ARCore nativo (no es web). Con MindAR puro este es el techo de calidad alcanzable: chamber rectangular + filtro One-Euro tuneado (v0.7) + IMU fusion (v1.2).

#### 11. IMU sensor fusion para reducir lag perceptible (v1.2)
- **Problema**: Aún con filtro tuneado (v0.7) y chamber estable (v1.1), MindAR procesa frames de cámara a ~30Hz. La pantalla renderiza a 60Hz. La mitad de los frames muestran pose stale → lag visible al mover el teléfono rápido.
- **Solución**: Componente `imu-fusion` montado en una entidad `#imu-predict` entre `#target` y `#fade-wrap`. Lee `DeviceMotionEvent.rotationRate` (giroscopio del iPhone, ~60Hz) e integra la rotación angular en un quaternion acumulador. Entre updates de MindAR aplica la rotación inversa al quaternion local de `#imu-predict` → el contenido rota en sentido contrario al device, simulando que sigue anclado al marcador físico.
- **Ground-truth reset**: Cada tick compara `#target.matrix` con cache. Cuando MindAR refresca la pose (matrix cambia), el componente resetea el acumulador y la pose de MindAR es ground truth nueva. El gyro no acumula drift porque se re-anchora cada ~33ms.
- **Permisos en iOS 13+**: `DeviceMotionEvent.requestPermission()` requiere user gesture. La app muestra un botón "Activar tracking avanzado" arriba en el centro. Tras click, se pide permiso al sistema; si granted, `imu-fusion` se activa. Si denied o no hay sensor, app sigue funcionando sin fusion (passthrough).
- **Aproximación matemática**: La math estricta requiere conjugar la rotación gyro a frame local del target (`local = M⁻¹ · R⁻¹ · M`). Para rotaciones pequeñas entre frames de MindAR (típicamente <1°), esto se aproxima por `local ≈ R⁻¹` — error despreciable, mucho más simple. Si en el futuro se observa deriva visible para movimientos lentos sostenidos, se puede pasar a la conjugación completa.
- **Limitaciones honestas**: Solo predice ROTACIÓN, no traslación. El gyro de iPhones viejos puede ser ruidoso. Esto NO es SLAM — sin mapa del mundo, sin loop closure, sin anclaje persistente. Es una mejora medible sobre MindAR puro, NO un reemplazo de world tracking. La cinemática del marcador real (la pose física) sigue siendo lo que MindAR detecte.

#### 12. Cabeza "trasladándose" al mover el teléfono — bugs de math en imu-fusion (v1.4)
- **Síntoma**: Con permiso IMU concedido, al mover/rotar el teléfono la cabeza se desplazaba relativa al marcador (sliding) en vez de quedarse anclada.
- **Causa raíz #1 — Composición incorrecta del accumulator**: El gyro reporta velocidad angular en BODY frame (frame del dispositivo). Las rotaciones body-frame se componen post-multiplicando: `acc_new = acc_old · delta`. v1.2-v1.3 usaba `accumulatedQuat.premultiply(delta)` que es la convención WORLD-frame → drift de orientación creciente con cada muestra del gyro.
- **Causa raíz #2 — Falta de conjugación al aplicar la rotación**: Aplicaba `local = R⁻¹` directamente. Lo correcto matemáticamente es `local = M⁻¹ · R⁻¹ · M`, donde M = `#target.worldQuaternion`. Sin conjugación, la rotación quedaba expresada en frame LOCAL del marcador en vez de world/camera frame. Como la cabeza está a un offset del origen del marcador (z=-0.65), la rotación incorrecta hacía que la cabeza barriera un ARCO alrededor del origen del marcador en vez de quedarse anclada — eso es lo que el usuario percibía como "traslación".
- **Solución v1.4**: Cambiar `premultiply` → `multiply` en el accumulator, e implementar la conjugación completa en `tick()`. Buffers de quaternion pre-allocados para evitar GC.
- **Por qué nadie detectó el bug en v1.2**: Cuando MindAR refresca cada frame (matrix cambia siempre), el accumulator se resetea constantemente y nunca crece — los bugs no se manifiestan visiblemente. El bug se nota solo cuando el accumulator tiene tiempo de crecer (movimiento sostenido entre detecciones).
- **Lección**: Para componentes con math no-trivial (quaternions, conjugación, frame transformations), validar con un caso concreto antes de desplegar. Una sola línea de prueba "phone yaws right by 30°, head should stay over marker, not sweep an arc" habría detectado el bug de inmediato.

#### 13. Migración a 8th Wall open source (v2.0 — rama `8thwall-migration`)
- **Contexto**: Niantic anunció el cierre de la plataforma alojada de 8th Wall (Feb 28, 2026) PERO simultáneamente abrió el código bajo MIT en `github.com/8thwall/8thwall`. Image Targets, Face Effects y Sky Effects son MIT puro; el XR Engine (que incluye SLAM) es free-binary. Distribuído via jsDelivr CDN — no requiere build step si no usas webpack.
- **Reemplazos esenciales**:
  - `mind-ar` CDN script → `@8thwall/engine-binary` + `@8thwall/landing-page` + `@8thwall/xrextras` (todos via jsdelivr)
  - `mindar-image="..."` en `<a-scene>` → `xrweb="disableWorldTracking: true"` + `xrextras-runtime-error` + `xrextras-almost-there`
  - `mindar-image-target="targetIndex: 0"` en `#target` → `xrextras-named-image-target="name: marker"`
  - eventos `targetFound`/`targetLost` → `xrimagefound`/`xrimagelost`
  - eventos de scene `arReady`/`arError` → `realityready`/`xrerror`
  - inicialización: ahora hay un step `XR8.XrController.configure({ imageTargetData: [...] })` que carga el JSON del image target compilado por el CLI
- **`imu-fusion.js` queda obsoleto**: 8th Wall tiene sensor fusion + SLAM internamente, mucho mejor que nuestro complementary filter rudimentario. El componente sigue en disco como referencia de v1.x pero NO se carga en `index.html` de v2.0.
- **Image target hay que recompilar**: el formato `.mind` de MindAR no sirve. 8th Wall usa JSON. Compilar con `npx @8thwall/image-target-cli@latest` desde la raíz del proyecto. Genera `image-targets/marker.json`. **Sin este JSON, la app falla con "asset-error" al cargar.** Ver `assets/targets/README.md` para el flujo completo.
- **Sin webpack**: el ejemplo oficial usa webpack para bundlear el JSON via `require()`, pero no es obligatorio. Nuestra app.js hace `fetch('./image-targets/marker.json')` y pasa el resultado a `XR8.XrController.configure()`. Mantenemos el flujo drag-and-drop a Netlify del v1.x.
- **Coexistencia con v1.4**: la rama `develop` se queda en v1.4 funcional. Si v2.0 falla en producción, rollback es `git checkout develop`. Para volver a iterar 8th Wall: `git checkout 8thwall-migration`.

---

### Reglas críticas — NO romper

1. **No añadir `embedded` a `<a-scene>`** — Rompe el layout de video de MindAR. El fullscreen lo gestiona A-Frame automáticamente.
2. **No sobreescribir `canvas { width/height }` con `!important`** — Rompe el canvas de detección interno de MindAR.
3. **No añadir `defer` a los scripts de A-Frame o MindAR CDN** — Causa `ReferenceError: AFRAME` en Safari iOS.
4. **No suscribirse a `targetFound`/`targetLost` en ningún archivo que no sea `tracking-fade.js`** — Viola el contrato Single-Source-of-Truth.
5. **No usar `physicallyCorrectLights: true`** en el renderer — deprecated en Three.js r155+.
6. **HTTPS obligatorio** — `getUserMedia` no funciona en HTTP en ningún navegador moderno.
7. **Mantener `background="transparent: true; generateEnvironment: false"` en `<a-scene>`** — A-Frame 1.5.0 aplica su componente `background` con `setClearColor(black, alpha=1)` opaco *después* de que Three.js crea el canvas con alpha. Sin este atributo el canvas queda negro opaco y tapa el feed de cámara de MindAR.
8. **`body { background: transparent }` — NUNCA poner `background` en `body`** — MindAR 1.2.5 crea `<video style="z-index:-2">` appended to `<body>`. El background del body se pinta encima de elementos con z-index negativo, tapando el video. Solo `html` puede tener `background: #000`.
9. **Al hacer cualquier cambio, incrementar `APP_VERSION` en `js/app.js` y el texto del `#version-badge` en `index.html`**.
10. **La pared trasera del chamber requiere rotación `[0, 180, 0]`** — `side:back` renderiza la cara OPUESTA al normal. El normal default de `<a-plane>` es +Z; el viewer está en +Z relativo a la pared trasera. Sin la rotación, BackSide renderiza la cara que apunta AWAY del viewer → pared invisible.
11. **La cabeza usa `rotation="0 0 0"`** — el modelo GLB ya tiene la cara orientada hacia el viewer por defecto. Aplicar Y=180° voltea la cabeza hacia atrás.
12. **CHAMBER_SIZE height = 1492/1054 ≈ 1.42**
13. **NO re-introducir `jitter-smoother.js` en la jerarquía de entidades** — Tiene un bug fundamental: lee la posición scene-space del `#target` (padre) y la escribe como posición LOCAL del hijo, apilando la transformación dos veces. El contenido vuela fuera del marcador al mover el teléfono. MindAR ya aplica suavizado interno al pose del target.
14. **No alterar los parámetros del filtro One-Euro de MindAR sin probar en dispositivo** — `filterMinCF: 0.00001; filterBeta: 5000; warmupTolerance: 5; missTolerance: 10` es la configuración v0.7 (canónica del One-Euro: minCF muy bajo + beta muy alto = "estable cuando quieto, instantáneo cuando se mueve"). NO bajar `filterBeta` por debajo de `1000` — eso introduce lag perceptible durante movimiento y rompe la ilusión de portal (ver bug #6 v0.6).
15. **El domo usa `side: back` + `shader: flat`** — `side: back` hace visible el INTERIOR (lo que ve la cámara mirando dentro del cuenco). `shader: flat` evita que la iluminación de la escena modifique la textura — apropiado para fondos pre-iluminados como `background.png`. Si se cambia a `shader: standard`, la textura se vería oscurecida en zonas no iluminadas. La rotación `-90 0 0` orienta el hemisferio default (apunta a +y) para que apunte a -z (detrás del marcador) — sin esa rotación, el cuenco apuntaría hacia arriba y no cubriría el marcador.
16. **La textura del domo se carga vía `<a-assets>` con id `#dome-tex`** — el componente `dome` referencia esa id en `material.src`. Si se cambia el id en `<a-assets>`, también hay que actualizar `DEFAULTS.textureId` en `dome.js` o pasar el nuevo id por el atributo `dome="textureId: #nuevo-id"`.
17. **No reintroducir stencil masking sin probar exhaustivamente en mobile Safari** — En v0.9 implementamos stencil masking (técnica de 8th Wall) y falló en producción en iPhone aunque el orden de render passes era correcto en teoría. Ver bug #9. v1.0 usa clipping planes que son fragment-level y no tienen riesgo de race conditions con render passes.
18. **`portal-content` necesita `renderer.localClippingEnabled = true`** — Default de three.js es false. Sin esto, `material.clippingPlanes` se ignora silenciosamente y el contenido no se recorta. El componente lo activa en su init listening a scene 'loaded'.
19. **`#imu-predict` debe estar entre `#target` y `#fade-wrap`** — El componente `imu-fusion` lee `this.el.parentEl.object3D.matrix` (= `#target`'s matrix) para detectar updates de MindAR. Si se mueve fuera de esa posición jerárquica, el detector no funciona. tracking-fade ancestral-walks para encontrar mindar-image-target, así que atravesar `#imu-predict` no rompe la subscripción a `targetFound/targetLost`.
20. **`DeviceMotionEvent.requestPermission()` solo se puede llamar desde un user gesture** — En iOS 13+ es obligatorio. Por eso `app.js` muestra un botón "Activar tracking avanzado" y el `requestPermission` corre dentro del click handler. Llamarlo desde `init()` o cualquier código no-gesture FALLA silenciosamente (rejected promise) en iOS.
19. **Rotaciones de paredes del chamber con `side:back`** (DEPRECADO en v0.8, ver regla 15) — BackSide es visible desde el lado OPUESTO a donde apunta el normal. Regla: el normal debe apuntar HACIA el interior del chamber (hacia el centro), así BackSide lo ve la cámara desde afuera/frente. Piso y techo usan `[90, 0, 0]` (normal -Y, BackSide visible desde +Y). Usar `[-90, 0, 0]` en el piso (normal +Y, BackSide visible desde -Y) lo hace invisible. — El marcador `target.png` es portrait (1054×1492). MindAR normaliza width=1.0, por lo que height debe ser 1.42 para cubrir el marcador completo.

---

### Tunables (ajustar sin cirugía de código)
Todos definidos al inicio de `js/app.js` y expuestos en `window.__arWorld`:

| Variable | Valor | Efecto |
|---|---|---|
| `FADE_DURATION_MS` | 350 | Duración del fade-in/out en ms |
| `GRACE_WINDOW_MS` | 120 | Ventana de tolerancia antes del fade-out |
| `CHAMBER_SIZE` | 1×1.42×1 | Dimensiones del chamber: width=1.0 (marker width), height=1492/1054≈1.42 (marker portrait AR), depth=1.0. Pasa al componente `chamber` vía atributo HTML. |
| `HEAD_SCALE` | 0.35 | Escala uniforme del modelo GLB (reducido en v1.3) |

**Tunables de tracking** (en el atributo `mindar-image` de `<a-scene>` en `index.html`):

Fórmula del filtro One-Euro: `cutoff = filterMinCF + filterBeta × |velocidad|`

| Parámetro | Valor | Efecto |
|---|---|---|
| `filterMinCF` | 0.00001 | Cutoff base (cuando velocidad ≈ 0). Muy bajo = elimina jitter en reposo. Default MindAR: 0.0001 |
| `filterBeta` | 5000 | Coeficiente de velocidad — eleva el cutoff durante movimiento. Alto = sigue al instante, sin lag. Default: 1000 |
| `warmupTolerance` | 5 | Frames antes de declarar `targetFound`. Default: 5 |
| `missTolerance` | 10 | Frames antes de declarar `targetLost` — más alto = tolera más oclusiones breves. Default: 5 |

---

### Debug en iPhone
La aplicación incluye una consola visual en pantalla (`js/debug-console.js`):
- Carga sin `defer` (primer script del `<head>`) para capturar errores tempranos
- Botón flotante **[DBG]** en esquina inferior derecha — toca para abrir/cerrar
- Intercepta `console.log/info/warn/error`, `window.onerror`, `unhandledrejection`
- Botones: Copiar logs al portapapeles, Limpiar, Cerrar
