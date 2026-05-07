/**
 * chamber.js — A-Frame component that builds the hollow color-coded interior chamber.
 *
 * Creates 5 inward-facing colored planes (walls/ceiling/floor/back) plus a 4-segment
 * orange rim at the front opening. All planes use material.side = BackSide so the
 * interior face is what the camera sees (research.md R2, R3; data-model.md §§ Chamber, ChamberSurface).
 *
 * Face color mapping (FR-007):
 *   +X wall (right)  → red     #FF3333
 *   −X wall (left)   → green   #33C26B
 *   +Y (ceiling)     → blue    #3580FF
 *   −Y (floor)       → yellow  #FFC93C
 *   +Z (back wall)   → purple  #7A36C0
 *   front rim        → orange  #FF7A1F
 *
 * Coordinate frame (research.md R3):
 *   Chamber extends into −Z from z=0 (marker plane / front opening).
 *   All planes are positioned and rotated so their back face (the visible
 *   side when material.side = BackSide) points inward.
 */

/* ─── Defaults ─────────────────────────────────────────────────────── */

const DEFAULTS = {
  width:              1.0,
  height:             1.0,
  depth:              1.0,
  frontOpeningRimWidth: 0.04,
  colorRight:   '#FF3333',  // red
  colorLeft:    '#33C26B',  // green
  colorCeiling: '#3580FF',  // blue
  colorFloor:   '#FFC93C',  // yellow
  colorBack:    '#7A36C0',  // purple
  colorRim:     '#FF7A1F',  // orange
};

/* ─── Component registration ──────────────────────────────────────── */

AFRAME.registerComponent('chamber', {
  schema: {
    width:               { type: 'number', default: DEFAULTS.width },
    height:              { type: 'number', default: DEFAULTS.height },
    depth:               { type: 'number', default: DEFAULTS.depth },
    frontOpeningRimWidth:{ type: 'number', default: DEFAULTS.frontOpeningRimWidth },
    colorRight:          { type: 'color',  default: DEFAULTS.colorRight },
    colorLeft:           { type: 'color',  default: DEFAULTS.colorLeft },
    colorCeiling:        { type: 'color',  default: DEFAULTS.colorCeiling },
    colorFloor:          { type: 'color',  default: DEFAULTS.colorFloor },
    colorBack:           { type: 'color',  default: DEFAULTS.colorBack },
    colorRim:            { type: 'color',  default: DEFAULTS.colorRim },
  },

  init() {
    this._build();
  },

  update(oldData) {
    // Rebuild if schema values change (e.g. during calibration)
    if (Object.keys(this.schema).some(k => this.data[k] !== oldData[k])) {
      // Remove previous children
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      this._build();
    }
  },

  _build() {
    const { width, height, depth,
            frontOpeningRimWidth,
            colorRight, colorLeft, colorCeiling,
            colorFloor, colorBack, colorRim } = this.data;

    const hw = width  / 2;  // half-width
    const hh = height / 2;  // half-height

    // Chamber's local origin is at the centre of the front opening (z=0).
    // The chamber extends into −Z; the back wall is at z = −depth.
    // The centre of each closed wall is at z = −depth/2.

    const midZ = -depth / 2;

    /*
     * _makePlane(w, h, position, rotation, color)
     *
     * Creates an <a-plane> with:
     *   material.side = back   → the plane's back face is rendered, facing inward
     *   transparent = true     → opacity driven by tracking-fade
     *   opacity = 0            → hidden until fade-in
     *   roughness = 0.85       → matte appearance, takes light well
     */
    const makePlane = (w, h, position, rotation, color) => {
      const el = document.createElement('a-plane');
      el.setAttribute('width',  w);
      el.setAttribute('height', h);
      el.setAttribute('position', `${position[0]} ${position[1]} ${position[2]}`);
      el.setAttribute('rotation', `${rotation[0]} ${rotation[1]} ${rotation[2]}`);
      el.setAttribute('material', [
        `color: ${color}`,
        'side: back',
        'transparent: true',
        'opacity: 0',
        'roughness: 0.85',
        'metalness: 0.0',
        'shader: standard',
      ].join('; '));
      return el;
    };

    // ── Right wall (+X) — red ──────────────────────────────────────
    // Positioned at x = +hw, centred along Z.
    // Rotated 90° around Y so the plane faces −X (inward).
    this.el.appendChild(
      makePlane(depth, height, [hw, 0, midZ], [0, 90, 0], colorRight)
    );

    // ── Left wall (−X) — green ─────────────────────────────────────
    // Positioned at x = −hw, rotated −90° around Y → faces +X (inward).
    this.el.appendChild(
      makePlane(depth, height, [-hw, 0, midZ], [0, -90, 0], colorLeft)
    );

    // ── Ceiling (+Y) — blue ────────────────────────────────────────
    // Positioned at y = +hh, rotated 90° around X → faces −Y (inward, downward).
    this.el.appendChild(
      makePlane(width, depth, [0, hh, midZ], [90, 0, 0], colorCeiling)
    );

    // ── Floor (−Y) — yellow ────────────────────────────────────────
    // Rotation [90, 0, 0] → normal points −Y (downward).
    // BackSide visible from +Y (above floor, where the camera always is). ✓
    // Using −90° would give normal +Y → BackSide visible from −Y (below floor) → invisible.
    this.el.appendChild(
      makePlane(width, depth, [0, -hh, midZ], [90, 0, 0], colorFloor)
    );

    // ── Back wall (+Z far, at z = −depth) — purple ────────────────
    // BackSide renders the face OPPOSITE to the normal direction.
    // Default normal is +Z; with BackSide, the viewer must be on the −Z side to see it.
    // But our viewer is at z=0 (+Z relative to back wall at z=−depth), so we must flip
    // the normal to −Z with Y=180° rotation → BackSide now faces toward +Z = viewer. ✓
    this.el.appendChild(
      makePlane(width, height, [0, 0, -depth], [0, 180, 0], colorBack)
    );

    // ── Front opening rim — orange ────────────────────────────────
    // Four thin rectangles forming an inset frame around the opening at z=0.
    // Each is a thin strip on the inward-facing edge (no closed wall blocking the view).
    const rw = frontOpeningRimWidth;
    const rimZ = 0;

    // Top strip
    this.el.appendChild(
      makePlane(width, rw, [0,  hh - rw/2, rimZ], [0, 0, 0], colorRim)
    );
    // Bottom strip
    this.el.appendChild(
      makePlane(width, rw, [0, -hh + rw/2, rimZ], [0, 0, 0], colorRim)
    );
    // Left strip
    this.el.appendChild(
      makePlane(rw, height - 2 * rw, [-hw + rw/2, 0, rimZ], [0, 0, 0], colorRim)
    );
    // Right strip
    this.el.appendChild(
      makePlane(rw, height - 2 * rw, [hw - rw/2, 0, rimZ], [0, 0, 0], colorRim)
    );
  },
});
