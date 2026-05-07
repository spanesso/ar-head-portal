# Phase 0 Research: AR Internal World Inside Image Marker

**Feature**: 001-ar-internal-world
**Date**: 2026-05-07
**Status**: All NEEDS CLARIFICATION resolved — ready for Phase 1.

This document records the technical decisions taken to satisfy the spec under the user-mandated stack (A-Frame + MindAR + vanilla JS/HTML/CSS). Every decision lists the chosen path, the rationale, and the alternatives considered.

---

## R1 — A-Frame + MindAR integration pattern

**Decision**: Use the **MindAR `mindar-image-aframe` build** loaded via CDN, declared on `<a-scene>` with `mindar-image="imageTargetSrc: ./assets/targets/marker.mind; uiLoading: no; uiError: no; uiScanning: no"` and one `<a-entity mindar-image-target="targetIndex: 0">` containing the world.

**Rationale**:

- This is the officially supported integration point between MindAR and A-Frame; it provides target-pose updates per frame, dispatches `targetFound` / `targetLost` events on the target entity, and handles camera lifecycle.
- Disabling MindAR's built-in `uiLoading` / `uiError` / `uiScanning` chrome lets us own the onboarding/error UI per FR-023, FR-025, FR-026, FR-027 without a fight against MindAR's overlay.
- Children of `<a-entity mindar-image-target>` inherit the target's pose automatically, satisfying FR-002 and FR-013 (world rigidly anchored to the marker, never to the camera) with zero per-frame application code.

**Alternatives considered**:

- **MindAR three.js build** + a hand-written renderer: rejected because the spec mandates A-Frame and there is no benefit to bypassing it.
- **AR.js**: rejected — image tracking is feature-tracking-based in MindAR (more robust on real-world prints) versus AR.js's NFT/marker workflow, and the user's spec explicitly named MindAR.
- **Eight Wall / Zappar**: rejected — proprietary, paid, and not in the user's mandated stack.

---

## R2 — Inward-facing chamber construction

**Decision**: Build the chamber as **six `<a-plane>` entities** parented to a single `<a-entity id="chamber">` group, each plane positioned and rotated so its surface normal points *inward*. Each plane uses a material with `side: back` (back-face rendering) so that the *visible* face is the one facing the chamber interior. The chamber group is parented under the `mindar-image-target` entity.

**Rationale**:

- Inward-facing planes are the simplest, lowest-poly geometry that produces the desired hollow interior — six tris × 2 = 12 triangles total versus a full inverse-hull box.
- `side: back` is supported in A-Frame via the underlying three.js `BackSide` material flag (`material="side: back"`), and is the documented way to render a "look-from-inside" shape.
- Six planes rather than a single inverted box let us color each face independently per FR-007 without a multi-material box workaround.
- Implementing this as a single A-Frame component (`chamber`) with a `schema` (size, depth, colors) keeps the geometry data-driven and avoids inline duplication.

**Alternatives considered**:

- **Single `<a-box>` with `material="side: back"`**: rejected — coloring six faces independently then requires either six separate materials (cube-mapped) or texture atlas, both more complex than six planes.
- **Inverse-hull (scaled negative-X box)**: rejected — produces identical visual but with twice the triangle count (12 inward-visible + 12 culled outward) and creates depth-write quirks at the outer hull.
- **Custom three.js BufferGeometry with inverted normals**: rejected — over-engineered for a 6-face room, and bypasses A-Frame's declarative ergonomics.

---

## R3 — Coordinate frame, chamber pose, and "front opening" interpretation

**Decision**:

- MindAR places the image target with the marker on the local X-Y plane and +Z pointing **out of the marker toward the camera**.
- The chamber sits **behind the marker plane**: the front opening is at local z = 0 (coplanar with the marker), and the chamber extends into −Z. The back wall is at z = −depth.
- Chamber dimensions (initial values, tunable in implementation): width = 1.0 (X), height = 1.0 (Y), depth = 1.0 (Z). The "1.5 × 1.5 × 1.5" suggestion in the user input is a guideline; final values are calibrated against the printed marker size during integration.
- The "front opening" is **not a closed wall** — it is the aperture through which the user views the chamber. Orange color appears on a **thin inward-facing rim/frame** around the opening edge (a 6th plane configured as an inset frame), satisfying FR-007 without occluding the view (per spec Assumptions).
- Color → face mapping (inward-facing surface):
  - +X face (right wall) → **red**
  - −X face (left wall) → **green**
  - +Y face (ceiling) → **blue**
  - −Y face (floor) → **yellow**
  - +Z face (back wall, deepest from camera, at z = −depth) → **purple**
    - *Note: spec text labels "back wall" as "+Z" in the user's coordinate intuition; in MindAR's frame the deepest wall is at −Z. The `chamber` component maps the user-spec face label to the geometric pose; the **purple color appears on the wall furthest from the viewer**, which is the spec's intent regardless of axis convention.*
  - Front-opening rim → **orange**

**Rationale**:

- Putting the front opening flush with the marker plane (z = 0) makes the marker physically *act* as the mouth of the chamber — central to the "looking inside" psychological effect (FR-006, FR-013, SC-005).
- Extending the chamber into −Z (away from camera) is the natural depth direction for the user's contained-world metaphor and matches how MindAR's coordinate frame expresses "behind the marker."
- Treating the front opening as a thin inward rim (not a closed wall) preserves the orange color signal from the spec without occluding the chamber from the camera.
- Chamber depth ≥ width gives strong perspective foreshortening — critical for parallax legibility (FR-011, FR-012, SC-003).

**Alternatives considered**:

- **Chamber centered at z = 0 (half in front of marker, half behind)**: rejected — produces "object embedded in marker" feel, breaks the contained-world metaphor.
- **Closed front wall (orange) with the user looking through a transparent material**: rejected — adds a fragile rendering layer (transparent + back-face) that fights depth sort and breaks the "I am looking inside" sensation.
- **Stencil-masked portal effect** (only render world inside marker silhouette): rejected for v1 — spec doesn't require it, A-Frame stencil support requires custom shader work, and the rigid marker-anchored geometry alone delivers the effect on standard mobile-display fields of view.

---

## R4 — Head GLB loading and placement

**Decision**: Use `<a-gltf-model src="./assets/models/human_head.glb">` parented to the chamber group. Position at `(0, 0, -depth/2)` in chamber-local space (geometric center). Scale by a `chamber-relative` factor (initial `0.4`) chosen so the head occupies roughly the central third of the chamber volume. Listen for the `model-loaded` event on the entity to drive the global "world ready" state in `app.js`.

**Rationale**:

- `<a-gltf-model>` is the standard A-Frame primitive for GLB; uses the built-in three.js GLTFLoader.
- Parenting under the chamber group means the head inherits the chamber's pose, which inherits the marker's pose — single source of truth for world transform (FR-013).
- Centering at chamber midpoint satisfies FR-009; sub-1.0 scale ensures the head fits comfortably with margin to all walls.
- Hooking `model-loaded` lets the app withhold the fade-in until the head is actually ready, satisfying FR-026 ("MUST NOT render the world until those assets are ready").

**Alternatives considered**:

- **Manual three.js GLTFLoader call**: rejected — adds boilerplate and event plumbing already done by A-Frame.
- **Embedded base64 GLB**: rejected — bloats `index.html`, breaks browser caching of the model.
- **Streaming partial-load placeholder**: rejected — adds complexity, not required by spec.

---

## R5 — Lighting setup

**Decision**: Three lights, all parented under the `mindar-image-target` so they move with the world (rather than the camera):

- One **ambient light** (`<a-light type="ambient" color="#ffffff" intensity="0.45">`).
- One **directional light** pointing inward toward the head from the front-upper-right of the chamber (`<a-light type="directional" position="0.5 0.8 0.2" intensity="0.9" target="#head">`).
- One **point-light rim accent** behind the head, near the back wall, intensity tuned low (`<a-light type="point" position="0 0.3 -depth+0.1" intensity="0.4" color="#a060ff">`) — only enabled when the device passes a coarse perf check (skip on devices reporting `navigator.hardwareConcurrency <= 4` is one cheap heuristic; default-on otherwise). This honors FR-017's "SHOULD" qualifier without making rim light a hard requirement.

**Rationale**:

- Ambient + directional satisfies FR-015's mandatory minimum.
- Anchoring lights to the marker's frame (not the world frame) keeps shading consistent as the user moves — head reads as belonging to the chamber regardless of viewing angle (FR-016).
- Rim accent reinforces silhouette of head against purple back wall, deepening the dimensional read (FR-017, SC-005).
- No shadow casting in v1 — real-time mobile shadows are a perf hit and the spec only says "if possible." Revisit only if profiling shows headroom.

**Alternatives considered**:

- **HDR environment lighting**: rejected — image-based lighting requires a cube map asset, more bytes on the wire, and material conversion to PBR; overkill for v1.
- **Lights anchored to the world (camera-relative)**: rejected — produces sliding shadow direction as the user moves, breaking the contained-world metaphor.
- **Fragment-shader fake rim light**: rejected — custom shader work outside A-Frame's declarative path, harder to maintain.

---

## R6 — Tracking jitter smoothing

**Decision**: Implement a small A-Frame component `jitter-smoother` that listens to per-frame target updates and applies a **low-pass damping filter** on position (lerp toward incoming pose with α ≈ 0.3 per frame at 60 Hz) and a **slerp damping** on quaternion rotation (α ≈ 0.3). Component is attached to a child wrapper inside the `mindar-image-target` so MindAR's authoritative pose flows to the wrapper, the smoother filters, and the chamber + head sit under the wrapper.

**Rationale**:

- A simple temporal low-pass filter is enough to suppress per-frame MindAR jitter on a stationary marker without introducing perceivable lag for natural user motion (FR-005).
- Critically damped lerp/slerp is well-understood, parameterless beyond α, and frame-rate independent enough at the target FPS range. (If frame-rate variance becomes an issue, switch α to be `1 - exp(-k * dt)` form — a one-line change.)
- Implementing as a component (not in `app.js`) keeps the smoothing surgically scoped and reusable.

**Alternatives considered**:

- **One-Euro filter**: rejected for v1 — overkill; pure lerp is sufficient for the motion profile of held-by-hand viewing.
- **Kalman filter on marker pose**: rejected — over-engineered, adds matrix math no other part of the project uses.
- **No smoothing**: rejected — MindAR raw output exhibits visible per-frame jitter on stationary markers, which would violate SC-002.

---

## R7 — Reveal / disappearance / flicker stabilization

**Decision**: Use an A-Frame component `tracking-fade` attached to the world wrapper. On `targetFound`: tween chamber-group `material.opacity` from 0 → 1 over **350 ms** and set `visible = true` at the start. On `targetLost`: start a **120 ms grace timer**; if the target is not re-found within the grace window, tween opacity 1 → 0 over 350 ms and set `visible = false` at the end. If `targetFound` fires within the grace window, cancel the fade-out. All chamber materials are configured `transparent: true` so opacity drives visibility smoothly.

**Rationale**:

- The grace window (~120 ms) absorbs sub-half-frame tracking flickers that would otherwise strobe the world (FR-020, SC-010), without introducing an annoying linger when the user genuinely leaves the marker.
- 350 ms fade is long enough to feel intentional, short enough to feel responsive (FR-018, FR-019, SC-004).
- Component scope keeps fade orchestration out of the bootstrap and reusable across world children.

**Alternatives considered**:

- **Hard show/hide** without fade: rejected — direct violation of FR-018, FR-019, FR-020.
- **CSS transitions on a DOM overlay**: rejected — mismatched coordinate systems with A-Frame; can't fade individual chamber faces consistently.
- **Hysteresis on target confidence value**: rejected for v1 — MindAR doesn't expose a public confidence API on every build version; grace-timer pattern works without depending on internal events.

---

## R8 — Onboarding, permission, loading, and error UI

**Decision**: All non-3D UI (loading state, permission-denied state, browser-incompatible state, asset-load-error state, "aim at marker" hint) is rendered as **HTML overlays** layered above the A-Frame canvas via fixed-position CSS, with show/hide driven by class toggles from `app.js`. UI states are mutually exclusive and managed by a single `SessionState` enum in `app.js`.

**Rationale**:

- DOM overlays are far simpler than in-3D UI for static text + retry buttons, and benefit from native accessibility.
- A central state machine in `app.js` (not scattered across components) makes FR-023, FR-025, FR-026, FR-027 easy to verify and prevents conflicting overlays from showing simultaneously.
- The permission flow itself is handled by the browser when MindAR calls `getUserMedia`; the app's job is to detect the resulting state (granted / denied) and surface the appropriate overlay.

**Alternatives considered**:

- **Use MindAR's built-in `uiLoading`/`uiError`/`uiScanning`**: rejected — those overlays are not directly customizable to match the spec's required messages and visual treatment.
- **In-3D billboarded text panels**: rejected — billboarding the hint would conflict with the no-billboard rule for chamber elements (FR-014); having two billboard policies is needless complexity.

---

## R9 — Asset delivery: marker target file (`.mind`) and head model (`.glb`)

**Decision**:

- **`marker.mind`** is **pre-compiled** outside the build using MindAR's official online image-target compiler (part of the `mind-ar-js` documentation/tooling). The source image used to generate the compiled target is the same image the user prints. The `.mind` file is committed under `assets/targets/`.
- **`human_head.glb`** is **pre-authored** and committed under `assets/models/`. The implementation assumes a properly oriented head (Y-up, facing −Z, origin at the head's geometric center) and applies a single uniform scale at runtime if needed. If the model lacks centered origin, we add a fixed positional offset in the `chamber` component config rather than re-authoring the model.

**Rationale**:

- Compiling at runtime (in-browser) is unnecessary cost — the marker is fixed for v1; baking the target offline saves users the wait and aligns with the spec's "marker target file pre-compiled" assumption.
- Both assets are listed in the spec's Assumptions as delivered inputs, not generated artifacts.
- A well-known target file format produced by the official MindAR tool minimizes integration risk versus a custom format.

**Alternatives considered**:

- **In-browser compilation of marker on first load**: rejected — adds initialization latency and uses MindAR APIs not needed for the v1 use case.
- **Hosted model on a CDN**: rejected for v1 — adds an external dependency, complicates offline-after-first-load behavior and CORS handling.
- **Procedural head geometry**: rejected — the spec specifically calls for a GLB human head; procedural alternatives would not satisfy SC-005 (perception of a real inhabitant).

---

## R10 — Library versions and CDN sources

**Decision**:

- **A-Frame**: pin to a specific `1.5.x` minor version via CDN (e.g. `https://aframe.io/releases/1.5.0/aframe.min.js`). 1.5.x is the stable release line at time of writing (2026-05) compatible with current MindAR builds.
- **MindAR image-aframe build**: pin to a specific recent `1.2.x` release of `mindar-image-aframe.prod.js` via the project's official CDN distribution (jsDelivr-served `mind-ar` package, prod bundle).
- Both `<script>` tags use `defer` so they parse before A-Frame's scene initializes, and integrity-pinning (SRI) is **not** added in v1 (MindAR releases occasionally change minified hashes and SRI-mismatch breaks the page silently — revisit when a CD pipeline locks the dep set).

**Rationale**:

- Pinning a specific minor version avoids surprise breakage when MindAR/A-Frame releases land.
- CDN delivery keeps the project zero-build, consistent with "no installation, no app store, no plug-in."
- The README will document the pinned versions and how to bump.

**Alternatives considered**:

- **npm + bundler (Vite/esbuild)**: rejected — introduces a build step the spec rules out.
- **Self-hosted copies**: acceptable as a follow-up, but for v1 CDN is the lowest-friction path.
- **Latest unpinned (`@latest`)**: rejected — the experience would silently break the day either library cuts a breaking release.

---

## R11 — Local development server (HTTPS requirement for camera)

**Decision**: The README documents two supported local dev paths:

1. **Easiest: `npx http-server -S -C cert.pem -K key.pem` (or any equivalent HTTPS static server) using `mkcert`-generated certificates** — works on `https://<lan-ip>:8080` so a phone on the same Wi-Fi can load it.
2. **Tunneled: `ngrok http 8080` over a plain `http-server` on port 8080** — gives an HTTPS URL the phone can reach without certificate setup.

`localhost` is not useful for mobile testing because the phone is not on `localhost`. iOS Safari and Android Chrome require HTTPS for `getUserMedia` on non-localhost origins.

**Rationale**:

- Camera access on mobile browsers requires a secure context. Without HTTPS the experience cannot start, and that surface is explicitly user-facing per FR-022.
- Two paths are documented because some users have firewalls/policies blocking ngrok and others find mkcert easier.
- No production hosting decisions are made here — the spec's scope is local dev + on-device QA in v1.

**Alternatives considered**:

- **Document only `localhost`**: rejected — useless for the actual test target (a phone).
- **Live-Server / VS Code extensions**: acceptable but vary by editor; README sticks to CLI tools available everywhere.
- **GitHub Pages / Netlify deploy**: out of scope for v1; addable later in any production hosting follow-up.

---

## R12 — Performance budget and degradation strategy

**Decision**: Implementation honors the following budget. Each item is observable from the browser without a profiler.

| Budget item | Target |
|---|---|
| Triangle count for chamber + lights + head | ≤ 30 K triangles total (head dominates; chamber is 12 tris) |
| Texture footprint | Head model textures ≤ 2 MB total decoded; no chamber textures (flat colors only) |
| Draw calls | ≤ ~12 per frame (six chamber faces, head meshes, optional rim light) |
| Active lights | Default 2 (ambient + directional). Rim light gated on a coarse capability heuristic. |
| Shadow casting | Disabled v1 |
| Postprocessing | Disabled v1 |
| Frame rate | ≥ 30 FPS sustained on a current mid-range mobile device (SC-007) |

If on-device QA reveals frame-rate failure on the lowest target device:

1. Disable rim light unconditionally.
2. Reduce head model texture resolution.
3. Reduce head polygon count (LOD swap with a lower-poly variant).

These steps are mechanical asset/config swaps, not code rewrites — keeps the perf path low-risk.

**Rationale**:

- The chamber itself is essentially free (12 tris, untextured); the only expensive asset is the head GLB. Optimizing the head is the only real lever for performance.
- Avoiding shadows and postprocessing is the single biggest mobile perf win for this kind of scene.

**Alternatives considered**:

- **Aggressive LOD with multiple GLBs**: rejected for v1 — single optimized GLB is enough; multi-LOD adds asset management overhead.
- **WebGL2-only optimizations**: rejected — A-Frame autoselects; explicit WebGL2 paths add fragility.

---

## Summary of resolved unknowns

| Spec area | Resolved decision |
|---|---|
| MindAR/A-Frame integration shape | R1: `mindar-image-aframe` + `mindar-image-target` entity |
| Chamber geometry | R2: six inward-facing planes, `material.side: back`, in a `chamber` A-Frame component |
| Coordinate frame & "front opening" semantics | R3: chamber extends into −Z behind marker; orange = inward rim of opening |
| Head model loading & placement | R4: `<a-gltf-model>`, centered in chamber, gated on `model-loaded` |
| Lighting | R5: ambient + directional + optional rim; world-anchored |
| Jitter smoothing | R6: `jitter-smoother` component with lerp/slerp damping |
| Fade-in/out + flicker tolerance | R7: `tracking-fade` component with grace timer |
| Onboarding/permission/error UI | R8: HTML overlays + central state machine |
| Asset delivery | R9: pre-compiled `.mind`, pre-authored `.glb` |
| Library versions | R10: pinned A-Frame 1.5.x + MindAR 1.2.x via CDN |
| Local dev HTTPS | R11: README covers `mkcert` and `ngrok` paths |
| Performance budget | R12: ≤30K tris, no shadows, no postprocessing, rim-light gated |

**No NEEDS CLARIFICATION markers remain.** Ready for Phase 1.
