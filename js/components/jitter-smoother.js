/**
 * jitter-smoother.js — A-Frame component that suppresses per-frame tracking jitter.
 *
 * Applies a frame-rate-aware low-pass filter (critically-damped exponential form)
 * to position (lerp) and quaternion (slerp) separately.
 *
 * Mount this on the wrapper entity that is a direct child of mindar-image-target.
 * The component reads the parent's world pose and writes a smoothed version to
 * its own object3D, so child entities (chamber, head, lights) inherit a stable pose.
 *
 * research.md R6; data-model.md § Cross-Entity Invariant 1.
 */

AFRAME.registerComponent('jitter-smoother', {
  schema: {
    // Smoothing strength: higher α = more responsive but more jitter.
    // Exposed for runtime calibration; default from window.__arWorld.JITTER_ALPHA.
    alpha: { type: 'number', default: 0 },
  },

  init() {
    this._smoothPos  = new THREE.Vector3();
    this._smoothQuat = new THREE.Quaternion();
    this._initialized = false;
  },

  tick(time, deltaTime) {
    const parent = this.el.parentEl;
    if (!parent || !parent.object3D) return;

    // MindAR writes pose to the parent's object3D in world space.
    // We grab local position/quaternion (parent-relative) and smooth them.
    const srcPos  = parent.object3D.position;
    const srcQuat = parent.object3D.quaternion;

    if (!this._initialized) {
      this._smoothPos.copy(srcPos);
      this._smoothQuat.copy(srcQuat);
      this._initialized = true;
      return;
    }

    // Frame-rate-aware α: 1 - exp(-k * dt)
    // k is derived from the nominal alpha at 60 Hz so the feel is consistent
    // across frame-rate variance.
    const alpha = this.data.alpha || (window.__arWorld?.JITTER_ALPHA ?? 0.3);
    const dt    = Math.min(deltaTime / 1000, 0.1);  // seconds, clamped to 100 ms
    const k     = -Math.log(1 - alpha) * 60;        // convert per-frame α to rate
    const a     = 1 - Math.exp(-k * dt);            // frame-rate-independent α

    this._smoothPos.lerp(srcPos, a);
    this._smoothQuat.slerp(srcQuat, a);

    // Write smoothed values to our own object3D (children inherit this)
    this.el.object3D.position.copy(this._smoothPos);
    this.el.object3D.quaternion.copy(this._smoothQuat);
  },
});
