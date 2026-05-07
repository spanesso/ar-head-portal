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

**Versión actual: v0.5** — Se muestra en `#version-badge` (esquina inferior izquierda). Constante `APP_VERSION` en `js/app.js`. **Incrementar con cada cambio desplegado** antes de hacer deploy.
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
| `js/components/chamber.js` | Componente A-Frame: construye 5 planos + rim naranja |
| `js/components/tracking-fade.js` | TrackingState machine, tweens fade-in/out |
| `js/debug-console.js` | Consola visual en pantalla para depuración en iPhone |
| ~~`js/components/jitter-smoother.js`~~ | **ELIMINADO en v0.5** — tenía un bug fundamental (ver bug #5) |

#### Jerarquía de entidades en la escena
```
#target (mindar-image-target)
  └── #fade-wrap (tracking-fade, visible=false)
        └── #world
              ├── #chamber (chamber component)
              ├── #head (a-gltf-model)
              ├── #ambient (a-light, ambient)
              ├── #directional (a-light, directional)
              └── #rim (a-light, point)
```

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
14. **Rotaciones de paredes del chamber con `side:back`** — BackSide es visible desde el lado OPUESTO a donde apunta el normal. Regla: el normal debe apuntar HACIA el interior del chamber (hacia el centro), así BackSide lo ve la cámara desde afuera/frente. Piso y techo usan `[90, 0, 0]` (normal -Y, BackSide visible desde +Y). Usar `[-90, 0, 0]` en el piso (normal +Y, BackSide visible desde -Y) lo hace invisible. — El marcador `target.png` es portrait (1054×1492). MindAR normaliza width=1.0, por lo que height debe ser 1.42 para cubrir el marcador completo.

---

### Tunables (ajustar sin cirugía de código)
Todos definidos al inicio de `js/app.js` y expuestos en `window.__arWorld`:

| Variable | Valor | Efecto |
|---|---|---|
| `FADE_DURATION_MS` | 350 | Duración del fade-in/out en ms |
| `GRACE_WINDOW_MS` | 120 | Ventana de tolerancia antes del fade-out |
| `CHAMBER_SIZE` | 1×1.42×1 | Dimensiones: width=1.0 (marker width), height=1492/1054≈1.42 (marker portrait AR), depth=1.0 |
| `HEAD_SCALE` | 0.4 | Escala uniforme del modelo GLB |

---

### Debug en iPhone
La aplicación incluye una consola visual en pantalla (`js/debug-console.js`):
- Carga sin `defer` (primer script del `<head>`) para capturar errores tempranos
- Botón flotante **[DBG]** en esquina inferior derecha — toca para abrir/cerrar
- Intercepta `console.log/info/warn/error`, `window.onerror`, `unhandledrejection`
- Botones: Copiar logs al portapapeles, Limpiar, Cerrar
