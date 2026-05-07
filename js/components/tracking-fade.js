/**
 * tracking-fade.js — A-Frame component that orchestrates the world's
 * fade-in / fade-out in response to MindAR tracking events.
 *
 * Implements the TrackingState machine:
 *   PENDING → DETECTED → LOST_GRACE → LOST → DETECTED → …
 *
 * The fade tween adjusts material opacity on all descendant <a-plane>
 * (chamber surfaces) and the head GLB simultaneously through a shared
 * per-frame RAF-based tweener. Tweens are cancellable mid-flight
 * so a targetFound during a fade-out produces a seamless continuation.
 *
 * Emits:
 *   world-revealed  — first time opacity reaches 1
 *   world-hidden    — every time opacity reaches 0 after a fade-out
 *
 * Subscribes to:
 *   targetFound / targetLost on the closest mindar-image-target ancestor
 *
 * research.md R7; contracts/runtime-events-contract.md §§ 1, 2, 3.
 *
 * IMPORTANT: This is the SOLE subscriber to targetFound / targetLost.
 * No other component or app.js code may subscribe to these events directly.
 * (contracts/runtime-events-contract.md § 3 — Single-Source-of-Truth Invariant)
 */

/* ─── TrackingState enum ─────────────────────────────────────────── */

const TrackingState = Object.freeze({
  PENDING:    'PENDING',
  DETECTED:   'DETECTED',
  LOST_GRACE: 'LOST_GRACE',
  LOST:       'LOST',
});

/* ─── Component ──────────────────────────────────────────────────── */

AFRAME.registerComponent('tracking-fade', {
  schema: {
    fadeDuration: { type: 'number', default: 0 },  // 0 → use window.__arWorld
    graceWindow:  { type: 'number', default: 0 },  // 0 → use window.__arWorld
  },

  init() {
    this._trackingState = TrackingState.PENDING;
    this._opacity       = 0;
    this._tweenRAF      = null;
    this._graceTimer    = null;
    this._everRevealed  = false;
    this._assetsReady   = false;
    this._pendingReveal = false;  // targetFound arrived before assets were ready

    // Wait for assets-ready signal from app.js coordinator
    document.addEventListener('assets-ready', this._onAssetsReady.bind(this));

    // Find the mindar-image-target ancestor and subscribe to its events
    this._bindTrackingEvents();

    // Start hidden
    this.el.setAttribute('visible', false);
  },

  remove() {
    if (this._tweenRAF)   cancelAnimationFrame(this._tweenRAF);
    if (this._graceTimer) clearTimeout(this._graceTimer);
    document.removeEventListener('assets-ready', this._onAssetsReady.bind(this));
  },

  /* ── Asset readiness ─────────────────────────────────────────── */

  _onAssetsReady() {
    this._assetsReady = true;
    // If targetFound had already arrived, start the deferred fade-in
    if (this._pendingReveal) {
      this._pendingReveal = false;
      this._startFadeIn();
    }
  },

  /* ── Tracking event binding ───────────────────────────────────── */

  _bindTrackingEvents() {
    // Walk ancestors to find the mindar-image-target entity
    let ancestor = this.el.parentEl;
    while (ancestor) {
      if (ancestor.hasAttribute('mindar-image-target')) {
        this._targetEntity = ancestor;
        break;
      }
      ancestor = ancestor.parentEl;
    }

    if (!this._targetEntity) {
      console.warn('[tracking-fade] No mindar-image-target ancestor found.');
      return;
    }

    this._onTargetFound = this._handleTargetFound.bind(this);
    this._onTargetLost  = this._handleTargetLost.bind(this);

    this._targetEntity.addEventListener('targetFound', this._onTargetFound);
    this._targetEntity.addEventListener('targetLost',  this._onTargetLost);
  },

  /* ── targetFound handler ─────────────────────────────────────── */

  _handleTargetFound() {
    // Cancel any pending grace timer
    if (this._graceTimer) {
      clearTimeout(this._graceTimer);
      this._graceTimer = null;
    }

    this._trackingState = TrackingState.DETECTED;

    if (!this._assetsReady) {
      // Assets not yet loaded — queue the reveal
      this._pendingReveal = true;
      return;
    }

    this._startFadeIn();
  },

  /* ── targetLost handler ──────────────────────────────────────── */

  _handleTargetLost() {
    if (this._trackingState !== TrackingState.DETECTED) return;

    this._trackingState = TrackingState.LOST_GRACE;

    const graceMs = this.data.graceWindow || (window.__arWorld?.GRACE_WINDOW_MS ?? 120);

    this._graceTimer = setTimeout(() => {
      this._graceTimer = null;
      // Only proceed if still in LOST_GRACE (not re-detected during grace window)
      if (this._trackingState === TrackingState.LOST_GRACE) {
        this._trackingState = TrackingState.LOST;
        this._startFadeOut();
      }
    }, graceMs);
  },

  /* ── Fade-in tween ───────────────────────────────────────────── */

  _startFadeIn() {
    this._cancelTween();
    this.el.setAttribute('visible', true);

    const startOpacity  = this._opacity;
    const targetOpacity = 1;
    const durationMs    = this.data.fadeDuration || (window.__arWorld?.FADE_DURATION_MS ?? 350);
    const startTime     = performance.now();

    const tick = (now) => {
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out quad
      this._opacity = startOpacity + (targetOpacity - startOpacity) * eased;
      this._applyOpacity(this._opacity);

      if (t < 1) {
        this._tweenRAF = requestAnimationFrame(tick);
      } else {
        this._opacity = 1;
        this._applyOpacity(1);
        this._tweenRAF = null;
        this._onFadeInComplete();
      }
    };

    this._tweenRAF = requestAnimationFrame(tick);
  },

  /* ── Fade-out tween ──────────────────────────────────────────── */

  _startFadeOut() {
    this._cancelTween();

    const startOpacity  = this._opacity;
    const targetOpacity = 0;
    const durationMs    = this.data.fadeDuration || (window.__arWorld?.FADE_DURATION_MS ?? 350);
    const startTime     = performance.now();

    const tick = (now) => {
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this._opacity = startOpacity + (targetOpacity - startOpacity) * eased;
      this._applyOpacity(this._opacity);

      if (t < 1) {
        this._tweenRAF = requestAnimationFrame(tick);
      } else {
        this._opacity = 0;
        this._applyOpacity(0);
        this._tweenRAF = null;
        this.el.setAttribute('visible', false);
        this._onFadeOutComplete();
      }
    };

    this._tweenRAF = requestAnimationFrame(tick);
  },

  /* ── Cancel in-flight tween ──────────────────────────────────── */

  _cancelTween() {
    if (this._tweenRAF) {
      cancelAnimationFrame(this._tweenRAF);
      this._tweenRAF = null;
    }
  },

  /* ── Apply opacity to all chamber planes + head ──────────────── */
  // Traverses the world subtree and sets opacity on every material-bearing entity.

  _applyOpacity(opacity) {
    this.el.object3D.traverse((node) => {
      if (!node.isMesh || !node.material) return;

      // Handle arrays of materials (multi-material meshes in GLB)
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(mat => {
        mat.opacity      = opacity;
        mat.transparent  = true;
        mat.needsUpdate  = true;
      });
    });
  },

  /* ── Completion callbacks ─────────────────────────────────────── */

  _onFadeInComplete() {
    if (!this._everRevealed) {
      this._everRevealed = true;
      // Emit world-revealed (first reveal only) so app.js transitions to RUNNING
      this.el.dispatchEvent(new CustomEvent('world-revealed', { bubbles: true }));
    }
    // Emit world-shown for every reveal (optional hook for future use)
    this.el.dispatchEvent(new CustomEvent('world-shown', { bubbles: true }));
  },

  _onFadeOutComplete() {
    this.el.dispatchEvent(new CustomEvent('world-hidden', { bubbles: true }));
  },
});
