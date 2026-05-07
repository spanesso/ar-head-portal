# Implementation Plan: AR Internal World Inside Image Marker

**Branch**: `001-ar-internal-world` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ar-internal-world/spec.md`

## Summary

Deliver a browser-only WebAR experience in which pointing a mobile device camera at a printed image marker reveals a hollow, color-coded miniature chamber containing a centered human-head GLB model. The experience must read as *looking inside* a contained world (strong parallax, marker-anchored geometry, inward-facing colored faces) rather than as a model placed *on top of* a marker. Implementation uses A-Frame 1.5.x as the scene framework, MindAR's image-tracking variant as the marker tracker, and vanilla HTML/CSS/JavaScript — no React/Vue/Angular/Babylon/Unity. The chamber is built as six inward-facing planes parented to the MindAR target entity so that the world is rigidly anchored to the marker's local frame, producing real perspective parallax from device/marker motion. Smooth fades, jitter smoothing, loading states, error states, and a clean tracking-loss path complete the user-facing flow.

## Technical Context

**Language/Version**: JavaScript (ES2020+), HTML5, CSS3 — no transpiler, no bundler, no build step (vanilla shipped as-is)
**Primary Dependencies**: A-Frame 1.5.x (`aframe.min.js` via CDN), MindAR image-tracking (`mindar-image-aframe.prod.js` via CDN)
**Storage**: N/A (stateless; no persistence, no analytics, no accounts in v1)
**Testing**: Manual on-device QA on iOS Safari (current) and Android Chrome (current); browser-console smoke checks (no automated test framework — vanilla static site, no test harness justified for v1)
**Target Platform**: Mobile web — iOS Safari 15+ on iPhone, Android Chrome (recent) on Android phone; desktop browsers are not target devices but should not crash
**Project Type**: Single-project static web app (one HTML entry point + small CSS/JS files + assets directory). No backend, no API.
**Performance Goals**: Sustained ≥30 FPS during marker tracking on a current mid-range mobile device; first-detection-to-render ≤2s under normal indoor lighting; smooth transitions (no perceivable stutter ≥95% of session time per SC-007)
**Constraints**:

- **Hard tech-stack input** from spec assumptions: only A-Frame + MindAR + vanilla JS/HTML/CSS. No alternative renderers permitted.
- **HTTPS required** at runtime — `getUserMedia` is gated behind a secure context on mobile browsers; localhost is the only insecure-context exception during development.
- **No installation, no app store, no plug-in.**
- **Camera permission requested via standard browser flow** — no custom permission UI.
- **Asset weight kept low** — keep head model under a few MB; no heavy textures, no postprocessing pipeline.

**Scale/Scope**: Single page, single marker, single tracked target, single user per session. Source code footprint: ≤5 source files (`index.html`, `css/styles.css`, `js/app.js`, optional `js/components/` modules), ≤2 asset files (`assets/targets/marker.mind`, `assets/models/human_head.glb`), 1 doc (`README.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is still in template form — no project-specific principles, additional constraints, governance rules, or version have been ratified. There are therefore no concrete gates to evaluate at this time.

**Effective gates applied (defensive defaults in absence of a ratified constitution):**

| Gate | Status | Notes |
|------|--------|-------|
| Simplicity (single project, no premature abstractions) | ✅ Pass | Single-project static site; module structure stays minimal (one main app file + a small number of A-Frame components only when extracting a component is justified) |
| YAGNI (no speculative features) | ✅ Pass | Plan covers exactly the FR/SC set in the spec — no analytics, no accounts, no offline-first guarantees, no multi-marker support |
| Tech-stack discipline | ✅ Pass | Plan binds itself to the user's mandated stack (A-Frame + MindAR + vanilla JS/HTML/CSS) — no third renderer, no framework |
| Performance budget aligned with spec | ✅ Pass | Plan documents ≥30 FPS target and ≤2s first-render target consistent with SC-001/SC-007 |
| Reversibility / no risky operations during build | ✅ Pass | Static site; no deployment automation, no destructive scripts in scope |

**No gate violations — Phase 0 may proceed.**

> If a real constitution is ratified later, re-run `/speckit-plan` (or refresh this section) to re-evaluate against actual principles.

## Project Structure

### Documentation (this feature)

```text
specs/001-ar-internal-world/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (already authored)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   ├── assets-contract.md       # Input asset contracts (.mind, .glb)
│   └── runtime-events-contract.md # MindAR/A-Frame events the app reacts to
├── checklists/
│   └── requirements.md  # Spec quality checklist (already authored)
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root)

```text
project-root/
├── index.html                       # Single entry point: A-Frame scene + MindAR target + UI overlays
├── css/
│   └── styles.css                   # Permission/error overlays, aim-at-marker hint, loading state
├── js/
│   ├── app.js                       # Bootstrap: scene wiring, state machine, fade/transition orchestration
│   └── components/
│       ├── chamber.js               # A-Frame component that builds the 6 inward-facing colored planes
│       ├── tracking-fade.js         # Component that fades the world in/out on targetFound/targetLost
│       └── jitter-smoother.js       # Component that low-pass-filters target pose to suppress jitter
├── assets/
│   ├── models/
│   │   └── human_head.glb           # Pre-authored, web-optimized GLB (delivered, not generated here)
│   └── targets/
│       └── marker.mind              # Pre-compiled MindAR target (delivered, not generated here)
├── docs/
│   └── app_reference.png            # Canonical visual target (already in repo)
└── README.md                        # User-facing setup, run, and troubleshooting
```

**Structure Decision**: Single-project static web app. The implementation is small enough that splitting backend/frontend or introducing a build pipeline would violate YAGNI. JavaScript is split into a thin bootstrap (`app.js`) plus narrowly scoped A-Frame components (`js/components/*.js`) — each component owns one concern (chamber geometry, fade behavior, jitter smoothing). This avoids the "giant inline script" anti-pattern called out in the spec without introducing a bundler.

## Complexity Tracking

> No Constitution-gate violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(n/a)_ | _(n/a)_ |
