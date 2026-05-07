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
| `js/components/jitter-smoother.js` | Suavizado exponencial de jitter de tracking |
| `js/components/tracking-fade.js` | TrackingState machine, tweens fade-in/out |
| `js/debug-console.js` | Consola visual en pantalla para depuración en iPhone |

#### Jerarquía de entidades en la escena
```
#target (mindar-image-target)
  └── #jitter-wrap (jitter-smoother)
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
- **Solución**: Eliminar el atributo `embedded` de `<a-scene>`. Eliminar las reglas CSS que sobreescriban dimensiones de `canvas` o posición de `a-scene`. A-Frame maneja el fullscreen con su propia clase `a-fullscreen`.

---

### Reglas críticas — NO romper

1. **No añadir `embedded` a `<a-scene>`** — Rompe el layout de video de MindAR. El fullscreen lo gestiona A-Frame automáticamente.
2. **No sobreescribir `canvas { width/height }` con `!important`** — Rompe el canvas de detección interno de MindAR.
3. **No añadir `defer` a los scripts de A-Frame o MindAR CDN** — Causa `ReferenceError: AFRAME` en Safari iOS.
4. **No suscribirse a `targetFound`/`targetLost` en ningún archivo que no sea `tracking-fade.js`** — Viola el contrato Single-Source-of-Truth.
5. **No usar `physicallyCorrectLights: true`** en el renderer — deprecated en Three.js r155+.
6. **HTTPS obligatorio** — `getUserMedia` no funciona en HTTP en ningún navegador moderno.

---

### Tunables (ajustar sin cirugía de código)
Todos definidos al inicio de `js/app.js` y expuestos en `window.__arWorld`:

| Variable | Valor | Efecto |
|---|---|---|
| `FADE_DURATION_MS` | 350 | Duración del fade-in/out en ms |
| `GRACE_WINDOW_MS` | 120 | Ventana de tolerancia antes del fade-out |
| `JITTER_ALPHA` | 0.3 | Suavizado de jitter (menor = más suave) |
| `CHAMBER_SIZE` | 1×1×1 | Dimensiones de la cámara en metros |
| `HEAD_SCALE` | 0.4 | Escala uniforme del modelo GLB |

---

### Debug en iPhone
La aplicación incluye una consola visual en pantalla (`js/debug-console.js`):
- Carga sin `defer` (primer script del `<head>`) para capturar errores tempranos
- Botón flotante **[DBG]** en esquina inferior derecha — toca para abrir/cerrar
- Intercepta `console.log/info/warn/error`, `window.onerror`, `unhandledrejection`
- Botones: Copiar logs al portapapeles, Limpiar, Cerrar
