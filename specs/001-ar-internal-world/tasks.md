---
description: "Task list for AR Internal World Inside Image Marker"
---

# Tasks: AR Internal World Inside Image Marker

**Feature**: 001-ar-internal-world
**Input**: Design documents from `/specs/001-ar-internal-world/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: NOT requested in spec. The spec calls for manual on-device QA against the quickstart.md checklist; no automated test framework is justified for v1 (vanilla static site, single-page WebAR). Test tasks are therefore omitted from this list.

**Organization**: Tasks are grouped by user story so each story can be independently implemented and demoed. User Story 1 alone is the **MVP**: marker detection reveals the world inside.

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: Different file, no dependency on incomplete tasks → safe to run in parallel.
- **[Story]**: User story this task belongs to (US1, US2, US3, US4); no label on Setup / Foundational / Polish phases.
- File paths are project-relative (repository root).

## Path Conventions

Plan-defined static-site layout (no `src/` or `tests/` — vanilla web app, no build step):

```
project-root/
├── index.html
├── css/styles.css
├── js/app.js
├── js/components/{chamber.js, tracking-fade.js, jitter-smoother.js}
├── assets/{models/human_head.glb, targets/marker.mind}
├── docs/app_reference.png
└── README.md
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project skeleton — directory tree, run/setup docs, asset placeholder paths.

- [x] T001 Create the project directory tree at the repository root: `css/`, `js/`, `js/components/`, `assets/models/`, `assets/targets/` (per `specs/001-ar-internal-world/plan.md` § Project Structure)
- [x] T002 [P] Create `README.md` at repository root with: project summary, prerequisites, two local-dev paths (mkcert + http-server, ngrok), how to compile a marker target, and a pointer to `specs/001-ar-internal-world/quickstart.md` for QA checklist (use content from `specs/001-ar-internal-world/quickstart.md` §§ 1, 3, 4, 5)
- [x] T003 [P] Add `.gitkeep` files to `assets/models/` and `assets/targets/` so empty asset directories are tracked until the GLB and `.mind` files are delivered (the assets themselves are out of scope for this feature per `specs/001-ar-internal-world/contracts/assets-contract.md` §§ 1, 2)

**Checkpoint**: Empty but valid project tree. README documents how to run.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: HTML/CSS/JS scaffolding and A-Frame + MindAR scene wiring that ALL user stories depend on. No user story can begin before this phase is complete.

**⚠️ CRITICAL**: No US1/US2/US3/US4 work can start until T009 is done.

- [x] T004 Create `index.html` with HTML5 doctype, `<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`, mobile-friendly `<meta name="apple-mobile-web-app-capable" content="yes">`, and a `<body>` containing only an empty `<a-scene>` placeholder + a `<div id="overlays">` placeholder. Pin A-Frame **1.5.0** and MindAR image-aframe **1.2.x** (`mindar-image-aframe.prod.js`) via CDN `<script>` tags in `<head>` with `defer` attribute (per `specs/001-ar-internal-world/research.md` R10)
- [x] T005 [P] Create `css/styles.css` with: full-bleed body (`margin: 0; overflow: hidden; position: fixed; inset: 0`), `<a-scene>` covers viewport, base styles for `#overlays` (fixed, full-screen, pointer-events: none on container; pointer-events: auto on individual overlays), and an `.overlay--hidden` class that hides via `display: none`. No overlay-specific styles yet (added in US4)
- [x] T006 [P] Create `js/app.js` skeleton with: top-level `const`s for tunables (`FADE_DURATION_MS = 350`, `GRACE_WINDOW_MS = 120`, `JITTER_ALPHA = 0.3`, `CHAMBER_SIZE = { width: 1.0, height: 1.0, depth: 1.0 }`, `HEAD_SCALE = 0.4`), a `SessionState` enum (`INITIALIZING`, `AWAITING_PERMISSION`, `AWAITING_MARKER`, `RUNNING`, `ERROR`), an `AssetLoadState` enum (`PENDING`, `LOADED`, `ERROR`), a stubbed `setSessionState(next)` dispatcher, and a stubbed `bootstrap()` IIFE that runs on `DOMContentLoaded`. Reference this from `<script src="./js/app.js" defer></script>` at end of `<body>` in `index.html`
- [x] T007 In `index.html` `<body>`, replace the empty `<a-scene>` with `<a-scene mindar-image="imageTargetSrc: ./assets/targets/marker.mind; uiLoading: no; uiError: no; uiScanning: no; autoStart: true" color-space="sRGB" renderer="colorManagement: true; physicallyCorrectLights: true" embedded vr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false">` with an `<a-camera position="0 0 0" look-controls="enabled: false">` child (per `specs/001-ar-internal-world/research.md` R1). Disabling MindAR's built-in UI is required because we own the overlay flow (`specs/001-ar-internal-world/research.md` R8)
- [x] T008 In `index.html`, inside the `<a-scene>`, add the marker target entity hierarchy: `<a-entity id="target" mindar-image-target="targetIndex: 0">` containing the empty wrapper chain `<a-entity id="jitter-wrap"><a-entity id="fade-wrap"><a-entity id="world"></a-entity></a-entity></a-entity>`. The `#world` group is empty for now; chamber, head, and lights are mounted into it by US1 tasks. (Hierarchy required by `specs/001-ar-internal-world/data-model.md` § Cross-Entity Invariants and `specs/001-ar-internal-world/research.md` R6)
- [x] T009 In `js/app.js` `bootstrap()`, wire the foundational MindAR system events on `<a-scene>`: subscribe to `arReady` (transitions `SessionState` from `INITIALIZING` → `AWAITING_MARKER`) and `arError` (transitions to `ERROR` and stores the error reason on a module-level variable for US4 to classify). Implementations of permission-denied vs. browser-incompatible classification stay stubbed until US4 (per `specs/001-ar-internal-world/contracts/runtime-events-contract.md` §§ 1, 4)

**Checkpoint**: Loading the page on HTTPS opens an empty scene that requests camera permission via the standard browser flow; MindAR initializes; no world is yet rendered.

---

## Phase 3: User Story 1 - Discover the Internal World on Marker Detection (Priority: P1) 🎯 MVP

**Goal**: When the user points the camera at the marker, the colored hollow chamber and centered head appear inside the marker. Renders correctly with inward-facing colored faces and a visible centered head model. (No fade transitions yet, no jitter smoothing, no overlays — those come in later stories.)

**Independent Test**: Load the page on a phone over HTTPS, grant camera permission, point the camera at the printed marker. Within ~2 seconds, the colored interior chamber + centered head appear inside the marker boundary. Each colored face is in the correct position per the spec mapping (right=red, left=green, ceiling=blue, floor=yellow, back=purple, front-opening rim=orange). The head sits at chamber center and faces the viewer.

**Maps to spec**: User Story 1; FR-001, FR-002, FR-006, FR-007, FR-008, FR-009, FR-010, FR-013, FR-015, FR-016, FR-021, FR-022, FR-026; SC-001, SC-005, SC-006.

### Implementation for User Story 1

- [x] T010 [P] [US1] Create `js/components/chamber.js` registering an A-Frame component named `chamber` with schema `{ width: number=1.0, height: number=1.0, depth: number=1.0, frontOpeningRimWidth: number=0.04, colorRight: '#FF3333', colorLeft: '#33C26B', colorCeiling: '#3580FF', colorFloor: '#FFC93C', colorBack: '#7A36C0', colorRim: '#FF7A1F' }`. In `init()`, build five inward-facing `<a-plane>` children (right, left, ceiling, floor, back) using the canonical position/rotation mapping in `specs/001-ar-internal-world/data-model.md` § ChamberSurface (chamber extends into −Z; each plane uses `material="side: back; color: <hex>; transparent: true; opacity: 1"`). Then build the four-segment orange rim at z=0 framing the front opening (per `specs/001-ar-internal-world/research.md` R3). Reference the script from `index.html` via `<script src="./js/components/chamber.js" defer></script>` placed BEFORE `js/app.js`'s `<script>` tag
- [x] T011 [US1] In `index.html`, mount the chamber inside `#world`: `<a-entity id="chamber" chamber="width: 1.0; height: 1.0; depth: 1.0"></a-entity>`. Position is the chamber-component's responsibility — entity itself sits at `position="0 0 0"` of `#world`. Depends on T010
- [x] T012 [P] [US1] In `index.html`, inside `#world`, add the head GLB entity: `<a-gltf-model id="head" src="./assets/models/human_head.glb" position="0 0 -0.5" rotation="0 180 0" scale="0.4 0.4 0.4"></a-gltf-model>`. Position is the chamber midpoint (chamber depth = 1.0, so −depth/2 = −0.5). Rotation flips the head 180° so the face points toward the front opening. Per `specs/001-ar-internal-world/data-model.md` § HeadModel
- [x] T013 [P] [US1] In `index.html`, inside `#world`, add minimum lighting per `specs/001-ar-internal-world/research.md` R5 / `specs/001-ar-internal-world/data-model.md` § LightingRig: `<a-light id="ambient" type="ambient" color="#ffffff" intensity="0.45"></a-light>` and `<a-light id="directional" type="directional" position="0.5 0.8 0.2" intensity="0.9" target="#head"></a-light>`. (Rim light is added in US2.) Lights inside `#world` so they move with the marker
- [x] T014 [US1] In `js/app.js`, implement an asset-loading coordinator: track an internal `assetStates` map (head GLB starts `PENDING`); on `<a-gltf-model id="head">` `model-loaded` event, mark the head `LOADED` and emit a custom event `assets-ready` on `document`; on `model-error`, mark `ERROR`, store a reason string, and dispatch a custom `asset-error` event with `{ assetId: 'head', errorMessage }` detail. (Wires `specs/001-ar-internal-world/contracts/runtime-events-contract.md` §§ 1, 2 — `model-loaded` consumer and `assets-ready` / `asset-error` emitters)
- [x] T015 [US1] In `js/app.js`, on the `<a-entity id="target">` `targetFound` event, set `#world` visibility on (no fade yet — direct `setAttribute('visible', true)`) once `assets-ready` has fired. Set `SessionState` to `RUNNING` on the first such reveal. On `targetLost`, set `#world` visibility off (no fade-out yet). Mark this implementation **temporary** with a TODO referring to US3 — US3 replaces this direct subscription with the `tracking-fade` component (per `specs/001-ar-internal-world/contracts/runtime-events-contract.md` § 3, single-source-of-truth invariant — only the temporary US1 path or the eventual US3 component subscribes, never both)

**Checkpoint** (US1 / MVP): Marker detection ⇒ world appears inside marker (chamber + head + basic lighting). Visible across iOS Safari and Android Chrome over HTTPS. Hard-cut visibility (no fade) is acceptable here; transitions are US3.

---

## Phase 4: User Story 2 - Explore the Miniature World via Parallax (Priority: P1)

**Goal**: When the user moves the device or marker, the world exhibits realistic perspective parallax — side walls slide past the head, the back wall recedes, head occludes background, no flatness. Stable on a stationary marker (no jitter).

**Independent Test**: With the world visible (US1), the user tilts the device left/right, up/down, moves it closer/farther, and rotates the marker. The interior surfaces foreshorten and reveal correctly per the perspective view; the head occludes the back wall from oblique angles; the chamber stays rigidly anchored to the marker; held still, the world does not visibly jitter for ≥30 seconds.

**Maps to spec**: User Story 2; FR-005, FR-011, FR-012, FR-013, FR-014, FR-016, FR-017, FR-024, FR-029; SC-002, SC-003, SC-007.

### Implementation for User Story 2

- [x] T016 [P] [US2] Create `js/components/jitter-smoother.js` registering an A-Frame component named `jitter-smoother`. The component reads its parent's (the `mindar-image-target` ancestor's) `object3D` world position/quaternion each tick, and applies a frame-rate-aware low-pass filter (`α = 1 - exp(-k * dt)` form, where `k` derives from `JITTER_ALPHA`) to its own `object3D.position` (lerp) and `object3D.quaternion` (slerp). Component is mounted on a child wrapper (`#jitter-wrap`) so the smoothed pose flows to the chamber/head subtree. Per `specs/001-ar-internal-world/research.md` R6 / `specs/001-ar-internal-world/data-model.md` § Cross-Entity Invariant 1. Reference the script from `index.html` via `<script src="./js/components/jitter-smoother.js" defer></script>` BEFORE `js/app.js`
- [x] T017 [US2] In `index.html`, attach the smoother: change `<a-entity id="jitter-wrap">` to `<a-entity id="jitter-wrap" jitter-smoother>`. (The wrapper hierarchy was set up in T008; this just activates the component.) Depends on T016
- [x] T018 [P] [US2] In `index.html`, inside `#world`, add the optional rim accent point light: `<a-light id="rim" type="point" position="0 0.3 -0.9" intensity="0.4" color="#a060ff"></a-light>`. Then in `js/app.js` `bootstrap()`, add a coarse perf gate: if `(navigator.hardwareConcurrency ?? 8) <= 4` set `document.querySelector('#rim').setAttribute('visible', false)`. Per `specs/001-ar-internal-world/research.md` R5
- [x] T019 [P] [US2] In `index.html`, ensure the `<a-scene>` `renderer` attribute set in T007 also includes `antialias: true; logarithmicDepthBuffer: false; alpha: true; precision: high` for clean depth/transparency rendering (per `specs/001-ar-internal-world/research.md` R5/R12). Verify the chamber inward-facing planes do not double-write depth incorrectly (already mitigated by `material.side: back` from T010)
- [x] T020 [P] [US2] In `js/components/chamber.js`, expose a small `tunables` block (chamber width/height/depth, rim width) at the top of the file as `const DEFAULTS = { ... }`, with depth set so the chamber depth is at least equal to width (default `1.0` keeps depth = width; calibrate up during on-device QA if perspective feels weak). Document that depth ≥ width is the parallax knob (per `specs/001-ar-internal-world/research.md` R3 rationale)
- [ ] T021 [US2] On-device parallax verification pass: run `quickstart.md` § 7 manual QA item "Parallax (US2)" on iOS Safari and Android Chrome. If parallax feels weak, raise chamber depth from 1.0 toward 1.4–1.5 in T011's `<a-entity id="chamber" chamber="...">` attribute and update head `position` Z accordingly to `−depth/2`. No code changes outside `index.html` attributes. Documents calibrated values back into `specs/001-ar-internal-world/quickstart.md` § 8 (Tunable defaults)

**Checkpoint** (US2): Held still on the marker, the world is stable (no visible jitter for ≥30s, SC-002). Moved through natural angles, the world produces visible perspective parallax (SC-003) and feels volumetric. Cinematic lighting reads on the head. Frame rate stable on the test device.

---

## Phase 5: User Story 3 - Tracking Loss and Re-Acquisition (Priority: P2)

**Goal**: World fades in smoothly on first detection (replacing US1's hard-cut), fades out cleanly on tracking loss, and absorbs short tracking flickers via a grace timer instead of strobing.

**Independent Test**: With US1+US2 working, deliberately move the camera away from the marker — the world fades out cleanly within ~1 second. Move the camera back — the world fades in within ~2 seconds. Cover and uncover the marker rapidly 5+ times within 15 seconds — the world does not strobe.

**Maps to spec**: User Story 3; FR-003, FR-004, FR-018, FR-019, FR-020; SC-004, SC-010.

### Implementation for User Story 3

- [x] T022 [P] [US3] Create `js/components/tracking-fade.js` registering an A-Frame component named `tracking-fade`. The component implements the `TrackingState` machine (`PENDING`, `DETECTED`, `LOST_GRACE`, `LOST`) per `specs/001-ar-internal-world/data-model.md` § TrackingState. It subscribes to `targetFound` and `targetLost` on its closest `mindar-image-target` ancestor (NOT directly on its own entity). On `targetFound`: cancel any pending fade-out, set `visible: true`, and tween the wrapper's child materials' `opacity` from current → 1 over `FADE_DURATION_MS`. On `targetLost`: start a `GRACE_WINDOW_MS` timer; if a `targetFound` arrives before it expires, cancel; otherwise tween opacity → 0 and set `visible: false` on completion. Tweens use `THREE.MathUtils` or a simple `requestAnimationFrame` loop and MUST be cancellable mid-flight without opacity discontinuity. Emit `world-revealed` (on first reveal completion) and `world-hidden` (on every fade-out completion) custom events on the component's `el`. Per `specs/001-ar-internal-world/research.md` R7 / `specs/001-ar-internal-world/contracts/runtime-events-contract.md` §§ 1, 2, 3. Reference the script from `index.html` via `<script src="./js/components/tracking-fade.js" defer></script>` BEFORE `js/app.js`
- [x] T023 [US3] In `index.html`, attach the fade orchestrator: change `<a-entity id="fade-wrap">` to `<a-entity id="fade-wrap" tracking-fade visible="false">`. Depends on T022
- [x] T024 [US3] In `js/components/chamber.js`, set every chamber surface plane's material to `transparent: true; opacity: 0` initially (so the fade-in tween is visible). The existing `material.side: back` stays. The tracking-fade component will sweep opacity on the rim segments and the five closed walls together by traversing children of `#fade-wrap` — confirm the traversal hits every chamber plane. Update `specs/001-ar-internal-world/data-model.md` § ChamberSurface defaults if behavior differs in practice (initial opacity 0, transparent true)
- [x] T025 [US3] In `js/app.js`, **remove the temporary direct `targetFound`/`targetLost` subscription added in T015** (single-source-of-truth — only `tracking-fade` subscribes per `specs/001-ar-internal-world/contracts/runtime-events-contract.md` § 3). Replace with: subscribe to the `world-revealed` event on `#fade-wrap` and transition `SessionState` `AWAITING_MARKER` → `RUNNING` on first fire
- [x] T026 [US3] In `js/app.js` (or in `tracking-fade`'s init), gate the fade-in: `tracking-fade` MUST NOT start an opacity tween until the `assets-ready` event (from T014) has fired. Implementation: tracking-fade reads a module-level `assetsReady` boolean from `js/app.js` (export via `window.__app` or a small shared module) and queues a deferred fade-in if `targetFound` arrives before assets are ready
- [ ] T027 [US3] On-device flicker tolerance verification: run `quickstart.md` § 7 manual QA items "Fade in", "Fade out", "Re-acquisition", "Flicker tolerance" on iOS Safari and Android Chrome. If the grace window feels too short or long, adjust `GRACE_WINDOW_MS` constant in `js/app.js` (range 100–200 ms is the practical band)

**Checkpoint** (US3): Smooth 350 ms fade-in on first detection. Smooth 350 ms fade-out within ~1 s of marker leaving frame. Rapid in/out sequences do not strobe; the grace window absorbs them. SC-004 and SC-010 pass.

---

## Phase 6: User Story 4 - First-Run Onboarding and Permission Handling (Priority: P3)

**Goal**: Initial loading state, camera permission flow, browser-incompatibility messaging, asset-load error messaging, and "aim at the marker" hint until the marker is detected.

**Independent Test**: First-time user opens the page → loading overlay appears → camera permission prompt fires → on grant, hint "Point the camera at the marker" appears and stays visible until first detection, then disappears. On permission denial, a clear retry message appears. With `human_head.glb` temporarily renamed, the asset-error overlay appears.

**Maps to spec**: User Story 4; FR-022, FR-023, FR-025, FR-026, FR-027; SC-008, SC-009.

### Implementation for User Story 4

- [x] T028 [P] [US4] In `index.html`, populate `<div id="overlays">` with the five overlay elements (each starts hidden via the `.overlay--hidden` class added in T005):
  - `<div id="overlay-loading" class="overlay overlay--hidden"><p>Loading…</p></div>`
  - `<div id="overlay-permission-denied" class="overlay overlay--hidden"><h2>Camera access required</h2><p>This experience needs your camera to detect the marker. Please allow camera access and retry.</p><button id="btn-retry">Retry</button></div>`
  - `<div id="overlay-browser-incompatible" class="overlay overlay--hidden"><h2>Unsupported browser</h2><p>Open this page in Safari (iOS) or Chrome (Android) on a phone.</p></div>`
  - `<div id="overlay-asset-error" class="overlay overlay--hidden"><h2>Couldn't load assets</h2><p>One or more required files failed to load. Please check your connection and reload.</p><button id="btn-reload">Reload</button></div>`
  - `<div id="hint-aim" class="hint hint--hidden"><p>Point the camera at the marker</p></div>`
  Per `specs/001-ar-internal-world/research.md` R8 / `specs/001-ar-internal-world/data-model.md` § SessionState
- [x] T029 [P] [US4] In `css/styles.css`, add styles for `.overlay` (full-screen flex-centered semi-transparent backdrop, large readable typography, generous padding, retry/reload button styling), `.overlay--hidden` (display: none — already added in T005, verify), `.hint` (bottom-center pill / banner positioned above safe area on mobile, semi-transparent background, animated fade in), `.hint--hidden` (display: none). Use `safe-area-inset-bottom` env() padding for iOS notch
- [x] T030 [US4] In `js/app.js`, implement an `applyOverlayState()` function — pure function from `SessionState` (and a `markerEverDetected` boolean) to which overlay class is shown. Mapping:
  - `INITIALIZING` → `#overlay-loading` shown, hint hidden
  - `AWAITING_PERMISSION` → no overlay (browser owns the prompt), hint hidden
  - `AWAITING_MARKER` → no overlay, `#hint-aim` shown
  - `RUNNING` → no overlay, hint hidden
  - `ERROR` → one of `#overlay-permission-denied`, `#overlay-browser-incompatible`, `#overlay-asset-error` based on the stored error reason; hint hidden
  Call `applyOverlayState()` from inside `setSessionState()` (added in T006) so overlay state is always coherent with session state. Enforces the "overlay exclusivity" invariant from `specs/001-ar-internal-world/data-model.md` § Cross-Entity Invariants 4
- [x] T031 [US4] In `js/app.js`, classify `arError` events (T009 stub): inspect the event detail / error reason string; if it indicates permission-denied (e.g. `NotAllowedError`, `PermissionDeniedError`, message contains "permission" / "denied"), store reason `permission-denied`; if no camera available or `getUserMedia` not supported, store `browser-incompatible`; if marker target file failed, store `asset-error`. Then transition to `ERROR` state. `applyOverlayState()` reads the reason to pick the right overlay
- [x] T032 [US4] In `js/app.js` `bootstrap()`, before initializing MindAR (or in a synchronous pre-flight): if `!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia` → store reason `browser-incompatible` and call `setSessionState(ERROR)`. Skip MindAR init in that case (MindAR's own error would be less specific)
- [x] T033 [US4] In `js/app.js`, also subscribe to the `asset-error` custom event (emitted by T014's coordinator when the GLB fails) and transition to `ERROR` with reason `asset-error`. Wire the asset-loading coordinator to also recognize an explicit `model-error` event from the head GLB entity if A-Frame dispatches it (it does)
- [x] T034 [US4] Wire the overlay buttons in `js/app.js`: `#btn-retry` and `#btn-reload` both call `window.location.reload()`. Attach handlers in `bootstrap()` after the DOM is ready
- [ ] T035 [US4] First-run / hint behavior verification: run `quickstart.md` § 7 manual QA items "Camera permission denied", "Asset error", "Aim-at-marker hint", "Loading state" on iOS Safari and Android Chrome

**Checkpoint** (US4): All non-3D UI states work correctly and exclusively. SC-008, SC-009 pass. Spec FR-022, FR-023, FR-025, FR-026, FR-027 satisfied.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final pass — perf audit, cross-platform sanity, asset version pinning, visual fidelity check vs. reference image, README finalization.

- [ ] T036 [P] Run the full `specs/001-ar-internal-world/quickstart.md` § 7 manual QA checklist on a current iOS Safari device. Record any failing items as follow-up issues
- [ ] T037 [P] Run the full `specs/001-ar-internal-world/quickstart.md` § 7 manual QA checklist on a current Android Chrome device. Record any failing items as follow-up issues
- [ ] T038 [P] Performance audit on a mid-range mobile device per `specs/001-ar-internal-world/research.md` R12 budget: measure FPS during natural viewing motion. If < 30 FPS, follow the documented degradation steps in research.md R12 (disable rim light unconditionally → reduce head texture → reduce head poly count). Document final settings in `README.md`
- [ ] T039 [P] Visual fidelity comparison: side-by-side review of the running experience vs. `docs/app_reference.png`. Adjust chamber color hex values in `js/components/chamber.js` `DEFAULTS` if any face reads visibly different from the reference (within the spec's color names — red/green/blue/yellow/purple/orange — but tunable in saturation/luminance)
- [ ] T040 [P] Update `README.md` with the troubleshooting table from `specs/001-ar-internal-world/quickstart.md` § 9 and the tunable defaults table from § 8, so the project root README is self-contained for new contributors
- [ ] T041 Final library version pinning audit in `index.html`: confirm A-Frame URL is `https://aframe.io/releases/1.5.0/aframe.min.js` (or current equivalent stable 1.5.x release) and MindAR URL pins a specific patch version of `mindar-image-aframe.prod.js` (no `@latest`). Document the pinned versions in `README.md`. Per `specs/001-ar-internal-world/research.md` R10
- [ ] T042 Verification pass against `specs/001-ar-internal-world/spec.md` Functional Requirements list (FR-001 through FR-029): walk every FR, confirm a corresponding implementation task touched it, and tick it off in a comment block at the top of `tasks.md` (or in PR description)
- [ ] T043 Verification pass against `specs/001-ar-internal-world/spec.md` Success Criteria (SC-001 through SC-010): manually confirm each SC's measurable threshold is met on the test device set

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 → T002, T003 (T002 and T003 can run in parallel after T001)
- **Foundational (Phase 2)**: Depends on Setup. T004 → T005, T006 (parallel) → T007, T008, T009 (sequential, all touch `index.html` or `app.js`)
- **User Story 1 (Phase 3)**: Depends on Foundational. The MVP increment.
- **User Story 2 (Phase 4)**: Depends on Foundational. Can start in parallel with US1 once Foundational is done, but practically benefits from US1 being visible (T021 verification needs T015's reveal working).
- **User Story 3 (Phase 5)**: Depends on Foundational. Replaces US1's temporary direct subscription (T015) — must run after T015 exists.
- **User Story 4 (Phase 6)**: Depends on Foundational. Independent of US1/US2/US3 internals (only consumes events and SessionState).
- **Polish (Phase 7)**: Depends on US1 + US2 + US3 + US4 being substantially complete.

### User Story Dependencies

- **US1 (P1, MVP)**: Depends only on Foundational. No cross-story dependencies.
- **US2 (P1)**: Depends only on Foundational; T021 (verification) wants the world to be visible, so practically needs T015 (US1) reveal in place.
- **US3 (P2)**: Depends on Foundational AND on the temporary US1 reveal (T015) existing — T025 explicitly removes T015's subscription. If US3 is done before US1, T015 is skipped and T025 becomes a no-op.
- **US4 (P3)**: Depends only on Foundational. Independent of US1/US2/US3.

### Within Each User Story

- Components defined before they're mounted in `index.html` (e.g. T010 before T011; T016 before T017; T022 before T023).
- Asset-loading coordinator (T014) before asset-gated reveal (T015, T026).
- `applyOverlayState()` (T030) before any state-handler that calls it (T031, T032, T033).
- Verification tasks (T021, T027, T035) come last within their phase.

### Parallel Opportunities

- **Setup**: T002, T003 in parallel after T001.
- **Foundational**: T005 (CSS) and T006 (app.js skeleton) in parallel after T004; T007, T008, T009 are sequential (all touch `index.html` / `app.js`).
- **US1**: T010 (chamber.js), T012 (head GLB entity in HTML), T013 (lights in HTML) can be parallel with each other AFTER T010's component is loadable; T011 mounts the chamber and depends on T010; T014 (asset coordinator) is parallel with the HTML mounts; T015 depends on T014.
- **US2**: T016 (jitter-smoother.js), T018 (rim light), T019 (renderer attrs), T020 (chamber tunables) are parallel; T017 mounts the smoother and depends on T016.
- **US3**: T022 (tracking-fade.js) is independent; T023 mounts it; T024 (chamber.js material flip) is parallel with T022; T025 / T026 depend on T022 + T023 + T014.
- **US4**: T028 (HTML overlays) and T029 (CSS overlays) parallel; T030 (applyOverlayState) depends on the DOM being declared (T028) and SessionState dispatcher (T006).
- **Polish**: T036–T040 are parallel (different files / different platforms).

---

## Parallel Example: User Story 1

```text
# After Foundational (T009) is complete, three parallel work fronts in US1:

# Front A — chamber component
T010 [P] [US1] Create js/components/chamber.js (build inward planes + rim)

# Front B — HTML scene additions (head + lights)
T012 [P] [US1] Add <a-gltf-model id="head"> in index.html
T013 [P] [US1] Add <a-light type="ambient"> + <a-light type="directional"> in index.html

# Front C — asset coordinator
T014 [US1] Implement asset-loading coordinator in js/app.js

# Then sequential:
T011 [US1] Mount <a-entity chamber> in index.html  (depends on T010)
T015 [US1] Wire targetFound/targetLost to visibility (depends on T014)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup — T001, T002, T003.
2. Phase 2 Foundational — T004 → T005 / T006 (parallel) → T007 → T008 → T009.
3. Phase 3 US1 — T010, T012, T013 (parallel) → T011 → T014 → T015.
4. **STOP and validate**: load on phone, point at marker, world appears inside marker. SC-001 passes.
5. Demo as MVP.

This is the smallest cut that delivers the contained-world reveal. No fade, no overlays, no jitter smoother — just the core visual moment of the spec.

### Incremental Delivery

1. MVP (US1) → demo: marker → world appears.
2. + US2 → demo: world feels volumetric, parallax visible, no jitter on stationary marker.
3. + US3 → demo: smooth fade-in / fade-out, flicker-tolerant.
4. + US4 → demo: clean first-run flow, error states, hint overlay.
5. + Polish → ship.

Each increment is independently shippable and demoable.

### Parallel Team Strategy

After Foundational (T009) is complete, three developers can fan out:

- Dev A: US1 (T010 → T015) — owns `js/components/chamber.js` and chamber/head HTML entities.
- Dev B: US3 (T022 → T027) — owns `js/components/tracking-fade.js`. Coordinate with Dev A on T015/T025 handover (the temporary subscription).
- Dev C: US4 (T028 → T035) — owns DOM overlay HTML/CSS and `js/app.js` overlay manager.

US2 (T016 → T021) is best done by Dev A or shared, since it touches `js/components/jitter-smoother.js` and chamber tunables — orthogonal to Dev B's tracking-fade and Dev C's overlays.

---

## Notes

- Tests are not included in this plan because the spec calls for manual on-device QA (`quickstart.md` § 7). If automated visual-regression tests become desired later, they can be added as a follow-up phase without disturbing this list.
- All `[P]` tasks touch different files (or different sections of `index.html` declared once and never modified again). Sequential tasks within a phase generally share a file — e.g. T007/T008/T009 all touch the `<a-scene>` declaration in `index.html`.
- The single-source-of-truth invariant from `specs/001-ar-internal-world/contracts/runtime-events-contract.md` § 3 is the most fragile design constraint. T015 and T025 are the two places it can be violated; the explicit "remove T015's subscription" wording in T025 is there to prevent the bug where both `app.js` and `tracking-fade` subscribe to `targetFound`.
- Commit after each task or logical group. Stop at any checkpoint to validate the current story independently.
- Avoid: vague tasks, same-file conflicts unmarked as sequential, cross-story coupling that breaks story independence.
