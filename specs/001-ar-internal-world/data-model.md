# Data Model: AR Internal World Inside Image Marker

**Feature**: 001-ar-internal-world
**Date**: 2026-05-07
**Note**: This is a stateless WebAR application — there is no database, no persistence, no remote schema. The "data model" here describes the **runtime entities** the application creates and the **state machines** that drive their behavior. These models translate the spec's Key Entities and Functional Requirements into implementation-level structures the source code can reference.

---

## Runtime Entities

### 1. ImageMarker

The physical printed image the camera tracks; bound at runtime to a single MindAR image-target slot.

| Field | Type | Description / Validation |
|---|---|---|
| `targetIndex` | integer | Index assigned by MindAR when registering the target. v1 uses **`0`** (single target). |
| `targetSrc` | string (URL) | Path to the compiled `.mind` file. v1: `./assets/targets/marker.mind`. Must be reachable as a same-origin or CORS-permissive resource. |
| `localFrame` | implicit | The marker plane is the X–Y plane in the target's local coordinate frame; +Z points out of the marker toward the camera. Not stored explicitly — provided by MindAR. |
| `state` | enum `TrackingState` | See state machine below. |

**Validation rules:**

- `targetSrc` must resolve to a successfully-loaded MindAR target — failure raises a session-level error (FR-027).
- Only one `ImageMarker` instance is active per session (spec assumption: single-marker, single-user).

---

### 2. InternalWorld

The composite scene revealed inside the marker. It is a **conceptual aggregate**, implemented as the entity tree rooted at a wrapper inside `<a-entity mindar-image-target>`.

| Field | Type | Description |
|---|---|---|
| `chamber` | `Chamber` | The hollow color-coded volume (see entity 3). |
| `headModel` | `HeadModel` | The centered focal asset (see entity 4). |
| `lighting` | `LightingRig` | The light sources illuminating the world (see entity 5). |
| `opacity` | float ∈ [0, 1] | Driven by the `tracking-fade` component; 0 = world hidden, 1 = world fully visible. |
| `visible` | boolean | A-Frame visibility flag. False when world is fully faded out. |

**Relationships:**

- `InternalWorld` is parented to the `mindar-image-target` entity (so it inherits the marker's pose) via a `jitter-smoother` wrapper (so it inherits a smoothed pose).
- `chamber`, `headModel`, and `lighting` are siblings under the world wrapper.

**Validation rules:**

- `opacity` and `visible` MUST stay consistent: if `opacity == 0` then `visible == false`; if `opacity > 0` then `visible == true`.
- The world MUST NOT render until both `chamber` is built and `headModel` reports `model-loaded` (FR-026).

---

### 3. Chamber

The hollow rectangular volume composed of six inward-facing surfaces.

| Field | Type | Description / Default |
|---|---|---|
| `width` | float (meters) | Chamber X-extent. Default `1.0`. |
| `height` | float (meters) | Chamber Y-extent. Default `1.0`. |
| `depth` | float (meters) | Chamber Z-extent (into −Z). Default `1.0`. |
| `surfaces` | array of `ChamberSurface` × 6 | Exactly six entries; one per face. |
| `frontOpeningRimWidth` | float (meters) | Visible width of the orange inward-facing rim around the opening. Default `0.04`. |

**Validation rules:**

- Exactly 6 surfaces; missing or duplicated faces raise a build error.
- All surface normals MUST point toward the chamber's geometric center.
- Default depth is configurable but should be ≥ width to preserve perspective foreshortening (FR-011, R3 rationale).

---

### 4. ChamberSurface

One of the six interior faces of the chamber.

| Field | Type | Description |
|---|---|---|
| `role` | enum `SurfaceRole` | `RIGHT`, `LEFT`, `CEILING`, `FLOOR`, `BACK`, `FRONT_OPENING_RIM` |
| `color` | string (hex) | Per spec FR-007. See mapping table. |
| `position` | vec3 (meters) | Local-space position of the plane center. |
| `rotation` | vec3 (degrees) | Local-space Euler rotation; chosen so that the back face of the plane is what the camera sees from inside (i.e. inward-facing visible surface). |
| `width` / `height` | float (meters) | Plane dimensions, derived from `Chamber` extents. |
| `materialSide` | enum | Always `back` (so back-face renders, matching three.js `BackSide`). |
| `opacity` | float ∈ [0, 1] | Inherited via the world's fade (the `tracking-fade` component sweeps this). |
| `transparent` | boolean | Always `true` so opacity drives visibility smoothly. |

**Color → role mapping (canonical):**

| `role` | `color` | Plane center (relative to chamber local origin at front-opening center) | Inward normal direction |
|---|---|---|---|
| `RIGHT` | red `#FF3333` | `( +width/2, 0, −depth/2 )` | `−X` |
| `LEFT` | green `#33C26B` | `( −width/2, 0, −depth/2 )` | `+X` |
| `CEILING` | blue `#3580FF` | `( 0, +height/2, −depth/2 )` | `−Y` |
| `FLOOR` | yellow `#FFC93C` | `( 0, −height/2, −depth/2 )` | `+Y` |
| `BACK` | purple `#7A36C0` | `( 0, 0, −depth )` | `+Z` |
| `FRONT_OPENING_RIM` | orange `#FF7A1F` | `( 0, 0, 0 )`, four-segment rim around opening | inward (toward chamber center, i.e. `−Z` for the rim segments at the opening plane) |

**Validation rules:**

- Each `role` appears exactly once across the six surfaces.
- `color` is the user-spec semantic mapping — exact hex values are tunable in implementation for visual readability but the *named color* must be unambiguous.
- The `FRONT_OPENING_RIM` role is implemented as a thin frame (four short rectangles forming the inset edge), not as a closed wall (R3).

---

### 5. HeadModel

The 3D human head asset loaded from a GLB file.

| Field | Type | Description |
|---|---|---|
| `src` | string (URL) | Path to the GLB. v1: `./assets/models/human_head.glb`. |
| `position` | vec3 (meters) | Default `( 0, 0, −depth/2 )` — chamber geometric center. |
| `rotation` | vec3 (degrees) | Default `( 0, 180, 0 )` — face oriented toward the front opening (toward the viewer). Adjustable if the source GLB is authored facing a different direction. |
| `scale` | float (uniform) | Default `0.4`. Tunable so the head occupies ~the central third of the chamber. |
| `loadState` | enum `AssetLoadState` | `PENDING`, `LOADED`, `ERROR`. Drives world visibility gating. |

**Validation rules:**

- The world MUST NOT begin its fade-in until `loadState == LOADED` (FR-026).
- If `loadState == ERROR`, `SessionState` transitions to `ERROR` and the asset-load-error overlay is shown (FR-027).
- The head's geometric center should sit at chamber center; if the GLB origin is off-center, the implementation applies a one-time positional offset (preferred over re-authoring the model).

---

### 6. LightingRig

The set of light sources illuminating the chamber and head.

| Field | Type | Description |
|---|---|---|
| `ambient` | `Light` | Always present. Default: `color: #ffffff`, `intensity: 0.45`. |
| `directional` | `Light` | Always present. Default: `color: #ffffff`, `intensity: 0.9`, `position: (0.5, 0.8, 0.2)` (front-upper-right of chamber, world-local). |
| `rimAccent` | `Light` \| null | Optional point light behind the head; intensity `0.4`, color tuned to enhance silhouette against purple back wall. Null if disabled by perf gating. |

**Validation rules:**

- Ambient and directional are non-optional (FR-015); their absence raises a build error.
- Rim accent is enabled by default and disabled only via the perf-gating heuristic (R5).

---

### 7. SessionState (Top-Level State Machine)

The top-level UX state of the experience. Owned by `app.js`. Drives which DOM overlay (if any) is shown and whether the A-Frame scene is allowed to render the world.

#### States

| State | Meaning |
|---|---|
| `INITIALIZING` | Page just loaded; libraries booting; assets begin loading. |
| `AWAITING_PERMISSION` | Camera permission prompt is up; user has not yet decided. |
| `AWAITING_MARKER` | Permission granted, MindAR running, no marker detected yet. The "aim at the marker" hint is visible (FR-025). |
| `RUNNING` | Marker has been detected at least once; world is rendering and reacting to tracking. |
| `ERROR` | A non-recoverable error has occurred (permission denied, browser incompatible, asset load failure). |

#### Transitions

```
INITIALIZING ──[lib loaded; permission requested]──▶ AWAITING_PERMISSION
INITIALIZING ──[asset load fails]──▶ ERROR
INITIALIZING ──[browser incompatible / no getUserMedia]──▶ ERROR

AWAITING_PERMISSION ──[user grants permission]──▶ AWAITING_MARKER
AWAITING_PERMISSION ──[user denies permission]──▶ ERROR

AWAITING_MARKER ──[targetFound fires for the first time]──▶ RUNNING
AWAITING_MARKER ──[asset load fails late]──▶ ERROR

RUNNING ──[stays in RUNNING regardless of subsequent targetFound/targetLost — handled by TrackingState]──▶ RUNNING
RUNNING ──[fatal renderer error]──▶ ERROR

ERROR is terminal for the session; user must reload to retry.
```

**Rules:**

- Overlay visibility is a pure function of `SessionState`. No two overlays are ever shown simultaneously (R8).
- `SessionState` and `TrackingState` are independent — once the session is `RUNNING`, the chamber's reveal/hide is governed entirely by `TrackingState`.

---

### 8. TrackingState (Per-Frame Marker State Machine)

Owned by the `tracking-fade` component on the world wrapper. Drives chamber/head visibility via the fade orchestration.

#### States

| State | Meaning |
|---|---|
| `PENDING` | MindAR has not yet emitted a `targetFound` since the session began. (Initial state; mirrors `SessionState == AWAITING_MARKER`.) |
| `DETECTED` | Marker is currently being tracked; world is fading-in or fully visible. |
| `LOST_GRACE` | A `targetLost` just fired but the grace window (~120 ms) has not elapsed. World is still visible at full opacity (no fade-out yet). |
| `LOST` | Grace window elapsed without re-acquisition. World is fading-out or fully hidden. |

#### Transitions

```
PENDING   ──[targetFound]──▶ DETECTED         (start fade-in)
DETECTED  ──[targetLost]──▶ LOST_GRACE        (start grace timer)
LOST_GRACE ──[targetFound before timer expires]──▶ DETECTED   (cancel grace; world stays visible)
LOST_GRACE ──[grace timer expires]──▶ LOST    (start fade-out)
LOST      ──[targetFound]──▶ DETECTED         (start fade-in from current opacity)
```

**Rules (mapped to FRs):**

- Fade-in duration: 350 ms (FR-018).
- Fade-out duration: 350 ms (FR-019).
- Grace window: ~120 ms (FR-020, SC-010).
- All fade tweens MUST be cancellable mid-flight; a new `targetFound` during a fade-out cancels the fade and starts a fade-in from the current opacity (no opacity discontinuity).
- The world's `visible` flag is `true` whenever `opacity > 0`, and is set to `false` only after a fade-out completes.

---

### 9. AssetLoadState (Per-Asset Loading State Machine)

Trivial three-state machine attached to each loadable asset (head GLB, marker target file).

| State | Meaning |
|---|---|
| `PENDING` | Fetch in progress. |
| `LOADED` | Fetch complete and asset usable. |
| `ERROR` | Fetch failed or asset corrupt. |

**Rules:**

- The world's fade-in MUST NOT start until *all* tracked assets are `LOADED`.
- Any asset transitioning to `ERROR` transitions `SessionState` to `ERROR`.

---

## Cross-Entity Invariants

These invariants tie multiple entities together and must hold at all times:

1. **Pose anchoring**: `Chamber.position`, `HeadModel.position`, and `LightingRig` lights are all expressed in the local frame of the world wrapper, which is itself a child of `mindar-image-target`. There is no code path where any of these three are reparented to a camera-relative or world-fixed frame. (Enforces FR-002, FR-013, FR-014.)
2. **Visibility coherence**: The world's `opacity` and `visible` flag are always coherent with `TrackingState`: PENDING ⇒ opacity 0; DETECTED (after fade-in) ⇒ opacity 1; LOST (after fade-out) ⇒ opacity 0. Intermediate states are tween-driven.
3. **Single source of truth for tracking events**: Only the `tracking-fade` component subscribes to `targetFound` / `targetLost`. Other components and `app.js` observe state through `tracking-fade`'s public events (`world-revealed`, `world-hidden`) rather than re-subscribing. (Avoids race conditions where multiple subscribers each manage opacity independently.)
4. **Overlay exclusivity**: At most one DOM overlay (loading, permission-denied, browser-incompatible, asset-error, aim-at-marker hint) is visible at a time. Overlay visibility is a pure function of `SessionState` plus a single boolean for the aim-at-marker hint (which is shown only while `SessionState == AWAITING_MARKER`).

---

## Notes for the implementer

- The data model intentionally avoids prescribing a class hierarchy in JavaScript. Each entity above maps to either an A-Frame component schema (e.g. `chamber`, `tracking-fade`, `jitter-smoother`) or to a small plain object inside `app.js` (e.g. `SessionState` is a string variable + a tiny dispatcher function). No new classes are required.
- All tunable defaults (chamber dimensions, head scale, fade duration, grace window) are declared at the top of `app.js` (or as A-Frame component schema defaults) so they can be adjusted without code surgery.
