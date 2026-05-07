# Runtime Events Contract

**Feature**: 001-ar-internal-world
**Owner**: WebAR runtime (`js/app.js` + A-Frame components)
**Consumers**: Internal — the components and the bootstrap state machine

This contract defines the **events** that flow inside the runtime: which event fires, who emits it, who listens for it, and what each subscriber must do in response. It is the runtime's wiring diagram — the rules that keep the spec's reveal/disappear/parallax/error behavior coherent across components.

---

## 1. Events the runtime consumes from MindAR / A-Frame

These events come from libraries we don't control. The contract is: only the documented subscribers listen to them; everything else observes derived state.

### `targetFound`

| Property | Value |
|---|---|
| **Emitter** | The `<a-entity mindar-image-target="targetIndex: 0">` entity, dispatched by MindAR. |
| **Authoritative subscriber** | `tracking-fade` component on the world wrapper. |
| **Payload** | None (event has no detail object). |
| **Required reaction** | `tracking-fade` transitions `TrackingState`: `PENDING → DETECTED` (first time), `LOST → DETECTED`, or `LOST_GRACE → DETECTED` (cancel pending fade-out). Then starts (or cancels and continues) the fade-in tween. |
| **Forbidden** | No other component or `app.js` may subscribe directly. They observe `tracking-fade`'s downstream events instead. |

### `targetLost`

| Property | Value |
|---|---|
| **Emitter** | Same entity as `targetFound`, by MindAR. |
| **Authoritative subscriber** | `tracking-fade` component on the world wrapper. |
| **Payload** | None. |
| **Required reaction** | `tracking-fade` transitions `TrackingState`: `DETECTED → LOST_GRACE`, starts the ~120 ms grace timer. Does **not** start fade-out yet. |
| **Forbidden** | No other component or `app.js` may subscribe directly. |

### `model-loaded`

| Property | Value |
|---|---|
| **Emitter** | The `<a-gltf-model>` head entity, dispatched by A-Frame after the GLB has finished loading. |
| **Authoritative subscriber** | `app.js` (or a small loading-coordinator helper inside it). |
| **Payload** | `{ format, model }` per A-Frame's standard event shape. |
| **Required reaction** | Mark the head's `AssetLoadState` as `LOADED`. If all tracked assets are `LOADED`, mark the world as ready to fade in (gates `tracking-fade`'s actual reveal). |

### `arReady` (MindAR system event)

| Property | Value |
|---|---|
| **Emitter** | `<a-scene mindar-image>` (MindAR), once camera and target set are initialized. |
| **Authoritative subscriber** | `app.js`. |
| **Payload** | None. |
| **Required reaction** | Transition `SessionState`: `INITIALIZING → AWAITING_PERMISSION` (if camera permission has not yet been granted) or `INITIALIZING → AWAITING_MARKER` (if it has). Hide the loading overlay; show the aim-at-marker hint as appropriate. |

### `arError` (MindAR system event)

| Property | Value |
|---|---|
| **Emitter** | `<a-scene mindar-image>` (MindAR), on initialization failure. |
| **Authoritative subscriber** | `app.js`. |
| **Payload** | Error detail (varies — typical cases: camera permission denied, no camera available, browser unsupported, marker file failed to load). |
| **Required reaction** | Transition `SessionState → ERROR`. Show the appropriate error overlay (permission-denied vs. browser-incompatible vs. asset-error) based on the error detail. |

---

## 2. Internal events the runtime emits

These are events **the runtime emits to itself** — they decouple subscribers from the raw MindAR event stream and let `app.js` observe state without racing the fade orchestration.

### `world-revealed`

| Property | Value |
|---|---|
| **Emitter** | `tracking-fade` component on the world wrapper. |
| **Subscribers** | `app.js` (transitions `SessionState` to `RUNNING` on first reveal). |
| **Fired when** | The fade-in tween completes and `opacity == 1`, AND the world has not been revealed before in this session. (Subsequent re-reveals during a single session do not re-fire this — see `world-shown` below for the per-track signal.) |
| **Payload** | None. |

### `world-hidden`

| Property | Value |
|---|---|
| **Emitter** | `tracking-fade` component on the world wrapper. |
| **Subscribers** | `app.js` (optional — for analytics/logging in future versions; v1 has no required subscriber). |
| **Fired when** | A fade-out tween completes and the world's `visible` flag has been set to `false`. |
| **Payload** | None. |

### `world-shown` *(optional, only if needed)*

| Property | Value |
|---|---|
| **Emitter** | `tracking-fade`. |
| **Subscribers** | None required in v1. |
| **Fired when** | Any fade-in tween completes (every re-reveal, including non-first). |
| **Payload** | None. |
| **Notes** | Document but do not require a v1 subscriber — this is a hook for future features. |

### `assets-ready`

| Property | Value |
|---|---|
| **Emitter** | The asset loading coordinator inside `app.js`. |
| **Subscribers** | `tracking-fade` (gates: do not start fade-in until this fires). |
| **Fired when** | All tracked assets have transitioned to `LOADED`. |
| **Payload** | None. |

### `asset-error`

| Property | Value |
|---|---|
| **Emitter** | The asset loading coordinator inside `app.js`. |
| **Subscribers** | `app.js` itself (state-machine handler — transitions to `ERROR`). |
| **Fired when** | Any tracked asset transitions to `ERROR`. |
| **Payload** | `{ assetId, errorMessage }`. |

---

## 3. Subscription rules (single-source-of-truth invariants)

These rules MUST be enforced — they are what keep the runtime predictable.

1. **`tracking-fade` is the sole owner of `targetFound` / `targetLost` reactions.** No other component, no other listener, no inline handler. Every other consumer of "is the marker tracked?" reads it through `tracking-fade`'s state or its derived events.
2. **`app.js` is the sole owner of `SessionState`.** Components do not mutate session state directly; they emit events that `app.js` interprets.
3. **The fade orchestration's tween is cancellable**. A new `targetFound` while a fade-out is mid-flight cancels the fade-out and starts a fade-in **from the current opacity**, not from 0. (No opacity discontinuity, FR-020.)
4. **No event handler may trigger a synchronous re-emit of the same event.** If an event handler wants to chain into another event, it does so via `requestAnimationFrame` / `setTimeout(0)` to avoid recursive event storms during rapid track flickers.
5. **DOM overlay visibility is a pure function of `SessionState` plus the aim-at-marker boolean.** No component sets overlay visibility directly; `app.js` re-renders overlays whenever `SessionState` changes.

---

## 4. Failure modes (how the contract handles errors)

| Failure | Detected by | Response |
|---|---|---|
| `marker.mind` fetch fails | `arError` from MindAR (or our explicit fetch wrapper) | `SessionState → ERROR`, show asset-error overlay |
| `human_head.glb` load fails | A-Frame `model-error` event on the head entity, surfaced to `app.js` as `asset-error` | `SessionState → ERROR`, show asset-error overlay |
| Camera permission denied | `arError` from MindAR with permission code | `SessionState → ERROR`, show permission-denied overlay with retry instructions |
| Browser incompatible (no `getUserMedia`) | Pre-flight check in `app.js` before MindAR boots | `SessionState → ERROR`, show browser-incompatible overlay |
| Tracking flicker storm (rapid `targetLost`/`targetFound`) | Default behavior — the grace timer absorbs short flickers | Stays in `LOST_GRACE` until grace expires; never enters a strobing render loop (SC-010) |
| Renderer (WebGL) context lost | A-Frame `renderer.context.loseContext` event, surfaced to `app.js` | `SessionState → ERROR`, show generic error overlay (rare; full reload is the expected recovery) |

---

## 5. Anti-patterns explicitly forbidden

These would silently break the spec or the contract; the implementation must not introduce them:

- ❌ Subscribing to `targetFound` / `targetLost` from anywhere other than `tracking-fade`.
- ❌ Setting `chamber` or `headModel` `visible` / `opacity` directly from `app.js` or from the fade-in/fade-out tween's caller. Only `tracking-fade` writes those values.
- ❌ Stuffing more than one DOM overlay class on the document body simultaneously.
- ❌ Emitting `world-revealed` from a place other than `tracking-fade` (it is the gating signal for `SessionState → RUNNING`).
- ❌ Reading marker pose from anywhere other than `mindar-image-target`'s transform (no copy-pasting MindAR internals; no global pose store).
