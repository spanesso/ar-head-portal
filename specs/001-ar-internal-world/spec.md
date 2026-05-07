# Feature Specification: AR Internal World Inside Image Marker

**Feature Branch**: `001-ar-internal-world`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "WebAR experience where pointing a mobile camera at a printed image marker reveals a complete internal 3D miniature world (a hollow color-coded cube containing a centered human head). The marker behaves as the physical container of the world; the user explores by physically moving the marker, producing strong parallax and the psychological sensation of looking *inside* a contained dimensional chamber rather than at an object placed *on top* of a marker."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover the Internal World on Marker Detection (Priority: P1)

A user opens the experience on their mobile browser, grants camera permission, and points the device at the printed image marker. The marker is recognized, and a hollow, color-coded miniature world fades into view *inside* the marker, with a centered human head model visibly contained within the colored chamber. The user immediately perceives the marker as the physical mouth of a dimensional space rather than a flat surface displaying an overlay.

**Why this priority**: This is the foundational moment of the experience. Without recognition, internal-world rendering, and the contained-world illusion at this exact instant, no other behavior matters. Detection + first reveal is the single test that proves the product exists.

**Independent Test**: A user with a supported mobile browser opens the URL, points the camera at the marker under normal indoor lighting, and within seconds sees the colored interior chamber and centered head appear *inside* the marker boundary. The reveal feels volumetric — not like a sticker.

**Acceptance Scenarios**:

1. **Given** the user has loaded the experience and granted camera access, **When** they point the camera at the marker, **Then** the internal world (colored hollow chamber + centered head) fades into view inside the marker boundary within 2 seconds of detection.
2. **Given** the marker is detected, **When** the user inspects the visible chamber, **Then** they see six distinct internal surfaces with the assigned colors (right=red, left=green, ceiling=blue, floor=yellow, back=purple, front opening=orange) and a recognizable human head positioned at the geometric center.
3. **Given** the world has appeared, **When** the user holds the marker still, **Then** the world remains visually stable (no jitter, no pop-out, no flicker) for as long as the marker is in frame.

---

### User Story 2 - Explore the Miniature World via Parallax (Priority: P1)

While the marker is being tracked, the user tilts the device, moves their head, or rotates the physical marker. The internal world responds with realistic parallax: side walls slide past the head, the back wall recedes more slowly, the head visibly occludes back-wall geometry from new angles. The user feels that they are physically peering *into* a contained miniature space and changing viewpoint relative to objects that exist behind the marker plane.

**Why this priority**: Parallax is the load-bearing illusion. A static cube can be faked; a cube that responds correctly to viewer motion cannot — and is the entire psychological payoff promised by the experience. Treated as P1 alongside detection because the project explicitly states "Parallax + Camera Psychology" is the most important part.

**Independent Test**: With the world visible, the user moves the device or marker through a full range of natural angles (left-right tilt, up-down tilt, distance change). The interior elements consistently reveal new surfaces, the head model occludes background walls correctly from each angle, and the front-opening edge of the marker behaves as the visible aperture into the chamber.

**Acceptance Scenarios**:

1. **Given** the world is visible, **When** the user tilts the device left/right, **Then** opposite side walls progressively reveal/recede and the head shifts apparent position relative to the back wall, consistent with viewing into a fixed 3D chamber.
2. **Given** the world is visible, **When** the user moves the device closer/farther, **Then** interior depth scales correctly — the head appears to recede deeper at distance and the chamber walls foreshorten as the user approaches.
3. **Given** the world is visible, **When** the user rotates the marker around its normal axis, **Then** the chamber rotates rigidly with the marker (the world stays anchored to the marker, not the camera).
4. **Given** the world is visible, **When** the user views the marker from a steep oblique angle, **Then** the front opening shape distorts in perspective and the user can see deeper into one side of the chamber than the other (no flat-overlay behavior).

---

### User Story 3 - Tracking Loss and Re-Acquisition (Priority: P2)

The user moves the camera off the marker (or the marker leaves the field of view, or lighting becomes too poor for detection). The internal world fades out cleanly and disappears. When the user re-aims the camera at the marker, the world fades back in smoothly without leaving artifacts, frozen geometry, or stale ghost imagery floating in space.

**Why this priority**: Critical for the illusion to hold across a real session, but secondary to the moment of first reveal. A broken disappearance (frozen world floating mid-air, walls left orphaned in the camera feed) would shatter the contained-world metaphor. P2 because the experience can ship without perfect handling and still demo, but it cannot scale to real users without it.

**Independent Test**: A user with the world visible deliberately moves the camera away from the marker, confirms the world disappears cleanly, then re-aims at the marker and confirms the world reappears smoothly with no visible artifacts or transition glitches.

**Acceptance Scenarios**:

1. **Given** the world is visible, **When** the marker leaves the camera view, **Then** the entire world (chamber + head + lighting) fades out and is no longer rendered.
2. **Given** the world has disappeared from tracking loss, **When** the user re-aims the camera at the marker, **Then** the world fades back in at the correct position and orientation within 2 seconds.
3. **Given** rapid in/out movement of the marker, **When** tracking flickers, **Then** the world does not strobe disruptively — it stabilizes via smoothed transitions rather than hard pop-in/pop-out per frame.

---

### User Story 4 - First-Run Onboarding and Permission Handling (Priority: P3)

A first-time user lands on the page. The experience requests camera permission. If granted, the experience loads and prompts the user (visually or with brief instruction) to point the camera at the marker. If denied, the user receives a clear explanation that camera access is required and instructions to retry.

**Why this priority**: Necessary for unfamiliar users but not differentiating. Standard pattern; failure does not break the experience for users who have used WebAR before.

**Independent Test**: A first-time user reaches the URL on a supported mobile browser; the permission prompt appears; on grant, the user sees a clear visual cue indicating they should aim at the marker; on denial, the user sees an explanation and a retry path.

**Acceptance Scenarios**:

1. **Given** a first-time user lands on the experience URL, **When** the page loads, **Then** the camera permission prompt appears and a visible aim-at-marker hint is shown until detection occurs.
2. **Given** the user denies camera permission, **When** the page detects denial, **Then** a clear message explains why camera access is required and offers a retry action.
3. **Given** the user grants camera permission, **When** the camera feed becomes active, **Then** the marker-aiming hint persists until the marker is first detected and then disappears.

---

### Edge Cases

- **Marker fully covered or out-of-frame**: World must disappear cleanly within one fade cycle, not freeze in place.
- **Partial marker visibility / occlusion**: Tracking remains stable while sufficient marker features are visible; falls back to clean disappearance once unrecoverable.
- **Low-light conditions**: When the camera cannot reliably detect the marker, no world appears; the user is not shown a misaligned or jittery world.
- **Glare, reflection, or steep glancing angle**: Tracking degrades gracefully — small jitter is smoothed; large jitter triggers a clean fade-out instead of a wobbling world.
- **Very fast marker motion**: World stays anchored to the marker without overshoot, lag, or detachment.
- **Multiple markers in view**: Only one instance of the world is rendered; behavior with duplicates is deterministic (e.g., first detected wins) rather than stacking world copies.
- **Camera permission denied or unavailable**: User receives a clear, actionable message; no broken render state.
- **Unsupported browser** (e.g., desktop browser without camera, older WebKit, in-app browsers blocking WebAR): The user is shown a compatibility message instead of a blank screen.
- **Slow network** (large model or tracker file still loading): A loading state is visible; the world does not partially render with missing geometry or untextured walls.
- **Asset load failure** (head model or marker target file missing/corrupt): The user is shown an error message; the experience does not silently render an empty chamber or a chamber with no head.
- **Device rotation / orientation change**: Layout remains usable; the experience either continues smoothly or reinitializes cleanly.
- **Backgrounded tab / locked screen / returning to tab**: On resume, the experience re-initializes camera and tracking without leaving stale geometry.

## Requirements *(mandatory)*

### Functional Requirements

#### Marker Recognition & Tracking

- **FR-001**: System MUST recognize the designated printed image marker through the device camera and report a stable "tracking" state once features lock.
- **FR-002**: System MUST treat the marker plane as the local origin and orientation of the internal world, so that the world is anchored to the physical marker and not to the camera or screen.
- **FR-003**: System MUST detect tracking loss (marker out of frame, fully occluded, or detection confidence below a usable threshold) and emit a tracking-lost signal that drives the disappearance behavior.
- **FR-004**: System MUST recover smoothly when tracking is regained, re-anchoring the world to the marker without restart of the page or camera.
- **FR-005**: System MUST smooth small per-frame tracking jitter so that the rendered world does not visibly vibrate when the marker is held nominally still.

#### Internal World Composition

- **FR-006**: System MUST render a hollow rectangular chamber whose interior is visible to the viewer through the marker plane, with each interior surface of the chamber visible from inside (not from outside).
- **FR-007**: System MUST render the chamber with six distinct interior surfaces colored as follows: right wall red, left wall green, ceiling blue, floor yellow, back wall purple, front opening (the surface coincident with the marker plane / aperture toward the viewer) orange.
- **FR-008**: System MUST construct the chamber with surface normals oriented inward, so that the colored interior is visible from the viewer's vantage point and the back of any surface is never exposed to the camera during normal use.
- **FR-009**: System MUST place a recognizable human head model at the geometric center of the chamber interior, scaled and positioned to clearly fit inside the chamber and feel grounded within it (not embedded in walls and not floating implausibly).
- **FR-010**: System MUST size the chamber proportionally to the marker so that the perceived volume reads as a miniature world contained by the marker, not a full-room-scale environment.

#### Volumetric Illusion & Parallax

- **FR-011**: System MUST render the chamber and its contents with full perspective projection so that walls foreshorten and the head occludes background geometry correctly from each viewpoint.
- **FR-012**: System MUST produce realistic parallax in response to camera motion, marker motion, and viewing angle changes, such that foreground (the head and front-opening edge), middle-ground (chamber side walls), and background (back wall) elements visibly move at different perceived speeds.
- **FR-013**: System MUST keep the chamber rigidly fixed to the marker frame so that physically rotating or tilting the marker rotates or tilts the chamber identically, reinforcing the perception that the world lives inside the marker.
- **FR-014**: System MUST avoid any rendering treatment that flattens the world (billboarding, screen-space overlays, or always-facing-camera behavior on chamber elements).

#### Lighting & Visual Integration

- **FR-015**: System MUST illuminate the head model and chamber with at least one ambient light source and one directional light source, calibrated so that the head shows clear form/volume and the chamber's depth is legible.
- **FR-016**: System MUST integrate the head model visually into the chamber (consistent lighting direction, plausible relative brightness) so the head reads as belonging to the contained world, not as a separate floating asset.
- **FR-017**: System SHOULD support an additional accent or rim light to enhance the head's silhouette against the back wall when device performance permits.

#### Reveal, Disappearance, and Transitions

- **FR-018**: System MUST fade the internal world in smoothly when the marker is first detected, rather than popping in instantly.
- **FR-019**: System MUST fade the internal world out smoothly when tracking is lost, leaving no residual geometry, ghost outline, or floating fragment in the camera feed.
- **FR-020**: System MUST stabilize transitions across short, rapid tracking flickers so brief detection drops do not produce a strobing reveal/hide cycle.

#### Cross-Device & Browser Support

- **FR-021**: System MUST run in a current mobile web browser on both iOS Safari and Android Chrome without requiring app installation.
- **FR-022**: System MUST request camera permission through the standard browser flow on first use.
- **FR-023**: System MUST display a clear, actionable message when camera permission is denied or when the browser is incompatible with the experience.
- **FR-024**: System MUST remain usable across portrait and landscape orientation; orientation changes MUST NOT leave the experience in a broken render state.

#### Onboarding & Feedback

- **FR-025**: System MUST display a "point the camera at the marker" hint to first-time users until the marker is first detected.
- **FR-026**: System MUST present a loading indication while critical assets (marker target data, head model) are still being fetched, and MUST NOT render the world until those assets are ready.
- **FR-027**: System MUST display a clear failure message if a critical asset (marker target file or head model) cannot be loaded, instead of silently rendering an incomplete world.

#### Performance

- **FR-028**: System MUST maintain smooth motion (no perceptible stutter on typical user motion) on a current mid-range mobile device under normal indoor lighting.
- **FR-029**: System MUST use lightweight geometry, optimized assets, and minimal post-processing so that performance is not bottlenecked on shader complexity, texture size, or polygon count.

### Key Entities *(include if feature involves data)*

- **Image Marker**: The printed visual target the user points the camera at; functions as the physical anchor and aperture for the internal world. Has a known visual signature, a fixed local coordinate frame, and a tracking state (detected / lost / pending).
- **Internal World**: The complete contained scene revealed inside the marker. Composed of a hollow chamber, a centered focal model, and lighting. Anchored to the marker's local frame.
- **Chamber**: A rigid hollow rectangular volume whose six interior surfaces are visible to the viewer. Each surface has an assigned color and an inward-facing orientation. Defines the physical container metaphor of the experience.
- **Chamber Surface**: One of the six interior faces of the chamber. Attributes: color (red/green/blue/yellow/purple/orange), positional role (right/left/ceiling/floor/back/front-opening), inward-facing orientation.
- **Head Model**: The 3D representation of a human head at the chamber's geometric center. Attributes: pose (centered, upright, facing the front opening), scale (proportional to chamber so it reads as inhabitant of the miniature space), illumination state.
- **Lighting Rig**: The combined set of light sources illuminating the chamber and head. At minimum: one ambient light and one directional light. Optionally: rim / accent lights.
- **Tracking State**: The current relationship between the camera and the marker. Values: pending (not yet detected), detected (stable lock), lost (no longer locked). Drives the world's reveal, presence, and disappearance.
- **Session State**: The current overall experience state. Values: initializing (loading assets), awaiting-permission, awaiting-marker, running, error. Drives onboarding and error messaging shown to the user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a user with a supported mobile browser points the camera at the marker under normal indoor lighting, the internal world is visible (chamber + head fully rendered) within 2 seconds of the marker entering the frame, in at least 9 out of 10 attempts.
- **SC-002**: With the marker stationary in frame, the rendered world remains visually stable (no perceptible jitter, no flicker, no pop-out) for at least 30 continuous seconds.
- **SC-003**: When the user moves the device or marker through a full range of natural viewing angles (±45° tilt, full 360° rotation around the marker normal, ±30 cm distance change), the world remains anchored to the marker and exhibits visible parallax (foreground, middle-ground, background elements move at different perceived speeds) in 100% of test trials.
- **SC-004**: When the marker leaves the camera view, the world disappears cleanly (faded out, no residual geometry visible) within 1 second; when the marker returns, the world reappears within 2 seconds.
- **SC-005**: At least 80% of first-time test users describe the experience using language consistent with "looking *inside* a contained world" or equivalent phrasing about depth/containment, rather than language describing "an object on the marker" or "a model floating above the marker."
- **SC-006**: The experience runs successfully (loads, requests permission, tracks the marker, renders the world) on current iOS Safari and current Android Chrome without requiring any installation, plug-in, or app store interaction.
- **SC-007**: On a current mid-range mobile device, the experience maintains smooth motion (no user-perceptible stutter during natural viewing motion) for at least 95% of session time.
- **SC-008**: When camera permission is denied or the browser is incompatible, 100% of users see a clear, actionable message rather than a blank or broken screen.
- **SC-009**: When a critical asset fails to load (marker target file, head model), 100% of users see an explicit error state rather than an empty or partial chamber.
- **SC-010**: Across rapid marker in/out movement (e.g., 5+ losses and re-acquisitions within 15 seconds), the experience never enters a stuck state — every loss results in a clean fade-out and every re-acquisition results in a clean fade-in.

## Assumptions

- **Tech stack is a hard external constraint**: The experience is delivered as a browser-only WebAR application using A-Frame, MindAR, and vanilla HTML/CSS/JavaScript. No native app, no React/Vue/Angular/Babylon/Unity. This is a fixed input from the user, not a design decision to revisit.
- **Marker is physically printed/displayed**: A printed (or screen-displayed) instance of the image marker is available to users; the experience does not generate the marker.
- **Marker target file is pre-compiled**: A MindAR-compatible target file (`.mind`) for the marker is delivered with the assets and does not need to be generated at runtime.
- **Head model is pre-authored**: A web-optimized GLB file representing a human head is delivered with the assets at the documented path; sourcing/authoring the model is out of scope for this spec.
- **Mobile-first**: Primary supported platforms are current iOS Safari and current Android Chrome on phones. Tablets and desktop browsers are not target devices for v1.
- **Indoor / typical ambient lighting**: The experience is designed for normal indoor lighting where the marker is clearly visible. Extreme low-light or direct-glare conditions are not target scenarios.
- **Single-marker, single-user session**: Only one marker is in view at a time, and the experience runs on one user device per session.
- **Chamber dimensions are content choices**, not user inputs: The spec preserves the proportional intent (cube reads as a miniature world inside the marker). Exact scale values are implementation choices at the planning phase.
- **Front opening is conceptual**: The "front opening" is the surface coincident with the marker plane — it is the aperture through which the user looks into the chamber. Its orange color appears on the inward-facing edge/frame of the opening, not as a closed wall blocking the view.
- **Camera permission is requested via the browser's standard flow**: No custom permission UI is built; the experience reacts to grant/deny states.
- **No user accounts, persistence, or analytics in v1**: The experience is anonymous and stateless across sessions.
- **Network connectivity is required for first load only**: Once assets are cached by the browser, the experience SHOULD continue to function on subsequent loads; offline-first guarantees are not in scope for v1.
- **Marker reference image (`docs/app_reference.png`) is the canonical visual target**: It defines the intended psychological effect (contained miniature world with strong color-coded depth and centered head). Implementation visual decisions defer to it.
