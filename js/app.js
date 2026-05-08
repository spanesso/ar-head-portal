/**
 * app.js — AR Internal World bootstrap and session orchestration.
 *
 * v2.0 (8th Wall edition): reemplaza MindAR + IMU fusion del v1.x por el
 * XR Engine de 8th Wall (open source desde 2026). Owns: SessionState machine,
 * asset coordinator, overlay manager, ciclo de vida de XR8 (xrloaded → configure →
 * realityready → marker tracking → world-revealed → RUNNING).
 *
 * tracking-fade es el ÚNICO suscriptor de xrimagefound/xrimagelost (eventos de
 * 8th Wall que reemplazaron a targetFound/targetLost de MindAR). app.js es el
 * único dueño de SessionState.
 */

const APP_VERSION = 'v2.0-8thwall';

/* ─── Tunables (adjust without code surgery) ─────────────────────────── */

const FADE_DURATION_MS = 350;  // world fade-in / fade-out duration
const GRACE_WINDOW_MS  = 120;  // tracking-loss grace window before fade-out
const CHAMBER_SIZE     = { width: 1.0, height: 1.42, depth: 1.0 };  // height = 1492/1054 (marker portrait aspect ratio)
const HEAD_SCALE       = 0.35; // uniform scale applied to the GLB head model (reducido en v1.3)

/* ─── Expose tunables for components ─────────────────────────────────── */

window.__arWorld = {
  version: APP_VERSION,
  FADE_DURATION_MS,
  GRACE_WINDOW_MS,
  CHAMBER_SIZE,
  HEAD_SCALE,
};

console.log('[app]', APP_VERSION);

/* ─── SessionState enum ───────────────────────────────────────────────── */

const SessionState = Object.freeze({
  INITIALIZING:          'INITIALIZING',
  AWAITING_PERMISSION:   'AWAITING_PERMISSION',
  AWAITING_MARKER:       'AWAITING_MARKER',
  RUNNING:               'RUNNING',
  ERROR:                 'ERROR',
});

/* ─── AssetLoadState enum ─────────────────────────────────────────────── */

const AssetLoadState = Object.freeze({
  PENDING: 'PENDING',
  LOADED:  'LOADED',
  ERROR:   'ERROR',
});

/* ─── Module state ────────────────────────────────────────────────────── */

let _sessionState  = SessionState.INITIALIZING;
let _errorReason   = null;   // 'permission-denied' | 'browser-incompatible' | 'asset-error'
let _assetsReady   = false;
let _markerEverDetected = false;

const _assetStates = {
  head: AssetLoadState.PENDING,
};

/* ─── Expose assetsReady flag for tracking-fade component ─────────────── */

Object.defineProperty(window.__arWorld, 'assetsReady', {
  get: () => _assetsReady,
});

/* ─── SessionState machine ────────────────────────────────────────────── */

function setSessionState(next) {
  if (_sessionState === next) return;
  _sessionState = next;
  applyOverlayState();
}

/* ─── Overlay manager ─────────────────────────────────────────────────── */
// Pure function: SessionState → which overlay (if any) is shown.
// At most one overlay visible at a time (data-model.md § Cross-Entity Invariant 4).

function applyOverlayState() {
  const ids = [
    'overlay-loading',
    'overlay-permission-denied',
    'overlay-browser-incompatible',
    'overlay-asset-error',
  ];
  // Hide all
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('overlay--hidden');
  });

  const hint = document.getElementById('hint-aim');

  switch (_sessionState) {
    case SessionState.INITIALIZING:
      show('overlay-loading');
      hint?.classList.add('hint--hidden');
      break;

    case SessionState.AWAITING_PERMISSION:
      // Browser owns the permission prompt; no app overlay.
      hint?.classList.add('hint--hidden');
      break;

    case SessionState.AWAITING_MARKER:
      hint?.classList.remove('hint--hidden');
      break;

    case SessionState.RUNNING:
      hint?.classList.add('hint--hidden');
      break;

    case SessionState.ERROR:
      hint?.classList.add('hint--hidden');
      if (_errorReason === 'permission-denied') {
        show('overlay-permission-denied');
      } else if (_errorReason === 'browser-incompatible') {
        show('overlay-browser-incompatible');
      } else {
        // asset-error or unknown
        show('overlay-asset-error');
      }
      break;

    default:
      break;
  }
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('overlay--hidden');
}

/* ─── Asset loading coordinator ───────────────────────────────────────── */
// Tracks AssetLoadState per tracked asset; fires 'assets-ready' on document
// when all assets are LOADED, or 'asset-error' if any fail.
// (contracts/runtime-events-contract.md §§ 1, 2)

function initAssetCoordinator(scene) {
  const headEl = scene.querySelector('#head');
  if (!headEl) {
    console.warn('[app] #head entity not found in scene');
    return;
  }

  headEl.addEventListener('model-loaded', () => {
    _assetStates.head = AssetLoadState.LOADED;
    checkAllAssetsReady();
  });

  headEl.addEventListener('model-error', (e) => {
    _assetStates.head = AssetLoadState.ERROR;
    const msg = e.detail?.message || 'Unknown model error';
    console.error('[app] head GLB load error:', msg);
    document.dispatchEvent(new CustomEvent('asset-error', {
      detail: { assetId: 'head', errorMessage: msg },
    }));
  });
}

function checkAllAssetsReady() {
  const allLoaded = Object.values(_assetStates).every(s => s === AssetLoadState.LOADED);
  if (allLoaded && !_assetsReady) {
    _assetsReady = true;
    document.dispatchEvent(new CustomEvent('assets-ready'));
  }
}

/* ─── Scene loaded handler ────────────────────────────────────────────── */
// A-Frame's 'loaded' event es la señal fiable de que la escena y todos los
// componentes están inicializados. La usamos como trigger primario para salir
// de INITIALIZING, en vez de depender solo de eventos del runtime de tracking
// (heredado de v1.x donde MindAR's 'arReady' a veces no disparaba — patrón
// equivalente con 8th Wall por seguridad).

function onSceneLoaded() {
  console.log('[app] scene loaded, state:', _sessionState);
  if (_sessionState === SessionState.INITIALIZING) {
    setSessionState(SessionState.AWAITING_MARKER);
  }
}

/* ─── 8th Wall lifecycle handlers (v2.0) ──────────────────────────────── */
// Reemplazan a los handlers de MindAR (arReady/arError) del v1.x.
//
// Eventos relevantes de 8th Wall:
//   xrloaded     (window) : engine cargó. Punto de partida para configurar XrController.
//   realityready (scene)  : SLAM/cámara/tracking listos. Equivalente de "AWAITING_MARKER".
//   xrerror      (scene)  : error del runtime de 8th Wall.

function onXrLoaded() {
  console.log('[app] xrloaded fired — configuring image targets');

  if (!window.XR8 || !XR8.XrController) {
    console.error('[app] XR8 not available even after xrloaded');
    _errorReason = 'asset-error';
    setSessionState(SessionState.ERROR);
    return;
  }

  // Cargar el JSON del image target compilado y configurar XrController.
  // El JSON lo genera `npx @8thwall/image-target-cli@latest` (ver assets/targets/README.md).
  fetch('./image-targets/marker.json')
    .then(r => {
      if (!r.ok) throw new Error('marker.json HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      XR8.XrController.configure({ imageTargetData: [data] });
      console.log('[app] image target configured:', data.name);
    })
    .catch(e => {
      console.error('[app] failed to load marker target:', e);
      _errorReason = 'asset-error';
      setSessionState(SessionState.ERROR);
    });
}

function onRealityReady() {
  console.log('[app] realityready fired');
  if (_sessionState === SessionState.INITIALIZING) {
    setSessionState(SessionState.AWAITING_MARKER);
  }
}

function onXrError(e) {
  const detail = e.detail || {};
  const msg = String(detail.message || detail.error || detail.errorMessage || detail).toLowerCase();
  console.error('[app] xrerror fired:', msg);

  if (msg.includes('camera') || msg.includes('permission') || msg.includes('notallowed')) {
    _errorReason = 'permission-denied';
  } else if (msg.includes('notfound') || msg.includes('device') ||
             !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    _errorReason = 'browser-incompatible';
  } else {
    _errorReason = 'asset-error';
  }

  setSessionState(SessionState.ERROR);
}

/* ─── world-revealed handler (from tracking-fade component) ───────────── */
// On first world reveal, session transitions to RUNNING.

function onWorldRevealed() {
  if (!_markerEverDetected) {
    _markerEverDetected = true;
    setSessionState(SessionState.RUNNING);
  }
}

/* ─── asset-error handler ─────────────────────────────────────────────── */

function onAssetError(e) {
  console.error('[app] asset-error:', e.detail);
  _errorReason = 'asset-error';
  setSessionState(SessionState.ERROR);
}

/* ─── Perf gating: rim accent light ─────────────────────────────────── */
// Disable the optional rim light on low-core-count devices (research.md R5).

function applyPerfGating(scene) {
  const cores = navigator.hardwareConcurrency ?? 8;
  if (cores <= 4) {
    const rim = scene.querySelector('#rim');
    if (rim) rim.setAttribute('visible', false);
  }
}

/* ─── Bootstrap ───────────────────────────────────────────────────────── */
// Nota v2.0: el setupIMU del v1.2 ya no aplica — 8th Wall tiene SLAM/sensor fusion
// internamente, mucho mejor que nuestro complementary filter rudimentario.

document.addEventListener('DOMContentLoaded', () => {
  // Pre-flight: verify browser supports getUserMedia (FR-022, SC-008).
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    _errorReason = 'browser-incompatible';
    setSessionState(SessionState.ERROR);
    return;
  }

  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // Overlay button wiring
  document.getElementById('btn-retry')?.addEventListener('click', () => location.reload());
  document.getElementById('btn-reload')?.addEventListener('click', () => location.reload());

  // A-Frame scene loaded — primary trigger to hide the loading screen.
  // This fires reliably once A-Frame and all components are initialized.
  if (scene.hasLoaded) {
    onSceneLoaded();
    initAssetCoordinator(scene);
    applyPerfGating(scene);
  } else {
    scene.addEventListener('loaded', () => {
      onSceneLoaded();
      initAssetCoordinator(scene);
      applyPerfGating(scene);
    }, { once: true });
  }

  // 8th Wall lifecycle events (v2.0):
  //   xrloaded fires on `window` cuando el engine binary se inicializa.
  //   Si el engine ya cargó antes de DOMContentLoaded (raro pero posible), ejecutar inmediato.
  if (window.XR8) {
    onXrLoaded();
  } else {
    window.addEventListener('xrloaded', onXrLoaded);
  }
  scene.addEventListener('realityready', onRealityReady);
  scene.addEventListener('xrerror', onXrError);

  // tracking-fade derived events
  const fadeWrap = document.getElementById('fade-wrap');
  if (fadeWrap) {
    fadeWrap.addEventListener('world-revealed', onWorldRevealed);
  }

  // asset-error from coordinator
  document.addEventListener('asset-error', onAssetError);

  // Set initial overlay state
  applyOverlayState();
});
