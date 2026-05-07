# Assets Contract

**Feature**: 001-ar-internal-world
**Owner**: WebAR runtime
**Consumer**: Whoever delivers the marker target file and the head GLB (asset team / content authoring)

This contract defines the interface between **assets delivered to the project** and the **runtime that consumes them**. It is a delivery contract — the runtime promises to load assets at the documented paths under the documented constraints; the asset deliverer promises to produce assets that meet those constraints. If either side breaks the contract, the experience either fails to load or violates the spec.

---

## 1. Marker target file

**Path (project-relative)**: `assets/targets/marker.mind`

| Property | Value / constraint |
|---|---|
| **Format** | MindAR compiled image-target binary (`.mind`), produced by the official `mind-ar-js` image-target compiler tool. |
| **Source image** | The exact image the user will print and physically scan with the camera. The image used to compile the target file MUST be identical to the printed image (same content, same aspect ratio); changing one without recompiling the other will break tracking. |
| **Targets contained** | Exactly **one** image target. Multi-target `.mind` files are not supported by v1 (`targetIndex: 0` is hard-coded). |
| **Feature richness** | The source image MUST contain enough high-contrast trackable features to produce stable tracking on a current mid-range mobile device under normal indoor lighting (rule of thumb: high-detail photographic or graphic-rich images track well; flat color blocks do not). The MindAR compiler tool reports a "tracking quality" score; aim for ≥ 4 / 5. |
| **File location** | Served from the same origin as `index.html` (no CORS handshake required). |
| **MIME type** | `application/octet-stream` (or whatever the static server serves; MindAR fetches it via `fetch()` and reads as a binary buffer — Content-Type does not need to be specific). |
| **Size budget** | ≤ 1 MB practical limit for fast first-load on mobile. |

**Runtime expectations:**

- The runtime fetches `marker.mind` once during MindAR initialization.
- Fetch failure (404, network error, malformed binary) transitions `SessionState` to `ERROR` and surfaces the asset-load-error overlay (FR-027).
- The compiled `.mind` is **not** regenerated at runtime — it is delivered pre-compiled (R9).

---

## 2. Head model GLB

**Path (project-relative)**: `assets/models/human_head.glb`

| Property | Value / constraint |
|---|---|
| **Format** | GLB (binary glTF 2.0). `.gltf` + external buffers is not supported by v1 (single-file delivery only). |
| **Up axis** | Y-up (glTF standard). |
| **Forward axis (face direction)** | Head should face **−Z** in its own local frame (so when placed in the chamber and rotated 180° around Y by the runtime, the face turns toward the front opening / viewer). If the source asset faces +Z or another direction, document the deviation; the runtime will apply a corrective rotation in `HeadModel.rotation`. |
| **Origin** | At or near the head's **geometric center** (approximately the centroid of the cranium). Off-center origins are tolerable but require the runtime to apply a positional offset. |
| **Scale (in source GLB)** | Approximately **2 meters tall** for a real-life head (i.e. the GLB ships at "real scale," and the runtime scales it down to fit the chamber). Other scales are tolerable; runtime applies a uniform scale factor. |
| **Polygon count** | ≤ 25 K triangles. Higher counts violate the perf budget (R12). |
| **Textures** | At most 2 textures (e.g. albedo + normal). Total decoded texture bytes ≤ 2 MB. No HDR / high-res 4K textures. |
| **Material model** | PBR metallic-roughness (the glTF default). Unlit fallback is acceptable but loses the directional-light shaping. |
| **Animations** | None in v1 (simple static mesh). If included, they will be ignored. |
| **Embedded skeleton/skinning** | Not required; not used. |
| **File size** | ≤ 5 MB compressed (GLB is binary; do not double-compress with extra layers). |
| **MIME type** | `model/gltf-binary` (commonly served as `application/octet-stream` — both work). |

**Runtime expectations:**

- The runtime loads the GLB via `<a-gltf-model>` (which uses three.js GLTFLoader internally).
- The runtime listens for the `model-loaded` event on the head entity to gate world reveal (FR-026).
- Load failure transitions `SessionState` to `ERROR` and surfaces the asset-load-error overlay (FR-027).
- Lighting on the head is supplied entirely by the chamber's `LightingRig` — the GLB MUST NOT bake in baked lighting that visibly conflicts with the rig.

---

## 3. Reference image (canonical visual target)

**Path (project-relative)**: `docs/app_reference.png`

| Property | Value / constraint |
|---|---|
| **Role** | Canonical visual target — defines the intended look-and-feel of the experience (the contained miniature world with color-coded depth). |
| **Format** | PNG. |
| **Consumed by** | The implementation team (visual review). Not loaded by the runtime. |
| **Stability** | Treat as the source of truth when the spec text is ambiguous about visual treatment. |

---

## 4. CDN-loaded library bundles (out-of-tree)

These are **not** in the `assets/` directory but are part of the runtime's external delivery surface. Documented here for completeness.

| Bundle | Source | Pinned version |
|---|---|---|
| A-Frame | `aframe.io/releases/<version>/aframe.min.js` | `1.5.x` (specific minor pinned in `index.html`) |
| MindAR image-aframe | jsDelivr-served `mind-ar` package, prod bundle (`mindar-image-aframe.prod.js`) | `1.2.x` (specific patch pinned in `index.html`) |

**Runtime expectations:**

- Both libraries are loaded with `<script>` tags before `js/app.js` runs.
- If a CDN is unreachable at first load, the experience cannot start. Offline-after-first-load works through standard browser caching (no service worker in v1).
- Version bumps are a documented deliberate operation (see README).

---

## 5. What this contract does NOT cover

- **Marker print specifications** (paper, size, finish): the spec only assumes a printed/displayed marker exists. Print quality affects tracking but is not under the runtime's control.
- **Runtime-generated assets**: there are none. No procedural geometry beyond the chamber's six planes (built in code, not loaded as an asset).
- **Audio / video / haptic assets**: out of scope for v1.
