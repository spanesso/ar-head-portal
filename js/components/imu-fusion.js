/**
 * imu-fusion.js — Predicción de pose entre frames de MindAR usando giroscopio (IMU).
 *
 * Funciona como una capa adicional encima del #target de MindAR. Entre actualizaciones
 * de pose de MindAR (~33ms), integra la rotación del dispositivo desde el giroscopio
 * y aplica la rotación inversa al contenido para mantenerlo sincronizado con donde
 * el marcador realmente está (no donde MindAR lo vio por última vez).
 *
 * Esto NO es SLAM:
 *   - Sin mapa del mundo, sin loop closure, sin anclaje persistente
 *   - El gyro acumula drift; cada detección de MindAR resetea el predictor
 *   - Solo predice rotación (la traslación requeriría double-integral del accelerómetro,
 *     que drifta demasiado en milisegundos)
 *
 * Lo que SÍ logra:
 *   - El AR responde a 60Hz (gyro) en vez de 30Hz (frames de MindAR)
 *   - Reduce el lag perceptible del contenido cuando el usuario mueve el teléfono
 *   - Suaviza la transición entre detecciones consecutivas
 *
 * Permisos:
 *   En iOS 13+ se requiere DeviceMotionEvent.requestPermission() llamado desde un
 *   user gesture. La activación se inicia desde app.js tras click en botón.
 *   Hasta entonces este componente está dormido y no hace nada (this._enabled = false).
 *
 * Implementación:
 *   - Componente montado en una entidad `#imu-predict` entre `#target` y `#fade-wrap`.
 *   - Acumula rotación del giroscopio en un quaternion local.
 *   - Cada tick, compara la matrix del padre (#target) con la cacheada para detectar
 *     updates de MindAR. Si cambió, resetea el acumulador (ground truth nueva).
 *   - Si no cambió, aplica la rotación inversa del acumulador al quaternion local
 *     → los descendientes (mundo) rotan al revés que el dispositivo, simulando que
 *     siguen anclados al marcador físico.
 *
 * Matemática (v1.4 — corregida):
 *   1. Composición body-frame: gyro reporta velocidad angular en body frame.
 *      Total rotation entre frames de MindAR: dR = dR_1 · dR_2 · ... · dR_n
 *      (post-multiply para body-frame composition: `acc.multiply(delta)`).
 *      v1.2-v1.3 usaba `premultiply` por error → drift de orientación con movimientos
 *      sostenidos del teléfono.
 *
 *   2. Conjugación al aplicar al hijo: el #imu-predict_local debe ser la rotación
 *      "expresada en la frame local del padre #target". Si Q_target es la rotación
 *      world del marcador (set por MindAR) y dR es la rotación body-frame del device,
 *      entonces:
 *        #imu-predict_local = Q_target⁻¹ · dR⁻¹ · Q_target
 *      Esta es la conjugación que hace que el efecto neto en world (camera frame) sea
 *      pre-multiplicar M_camera por dR⁻¹, que es lo que matemáticamente queremos.
 *      v1.2-v1.3 aplicaba solo dR⁻¹ sin conjugación → la rotación se aplicaba en
 *      frame LOCAL del marcador en vez de world/camera, haciendo que la cabeza (que
 *      está a un offset del origen del marcador) barriera un arco en vez de quedarse
 *      anclada. v1.4 conjuga correctamente.
 */

AFRAME.registerComponent('imu-fusion', {
  schema: {
    enabled: { type: 'boolean', default: false },
  },

  init() {
    this._enabled              = false;
    this._lastEventTime        = 0;
    this._accumulatedQuat      = new THREE.Quaternion();
    this._parentMatrixCached   = new THREE.Matrix4();
    this._matrixInitialized    = false;

    // Buffers reusables (evitar GC)
    this._tmpEuler   = new THREE.Euler();
    this._tmpQuat    = new THREE.Quaternion();
    this._dRinv      = new THREE.Quaternion();
    this._M          = new THREE.Quaternion();
    this._Minv       = new THREE.Quaternion();
    this._localQuat  = new THREE.Quaternion();

    this._onMotion = this._onMotion.bind(this);

    // Si app.js ya concedió permiso antes de que este componente cargara, auto-activar.
    if (window.__imuPermissionGranted) {
      this.enable();
    }
  },

  /**
   * Inicia la fusión IMU. Llamar desde app.js tras conceder permiso de DeviceMotionEvent.
   * Idempotente.
   */
  enable() {
    if (this._enabled) return;
    this._enabled = true;
    this._lastEventTime = 0;
    this._accumulatedQuat.identity();
    window.addEventListener('devicemotion', this._onMotion);
    console.log('[imu-fusion] enabled');
  },

  /**
   * Detiene la fusión y limpia estado. Idempotente.
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    window.removeEventListener('devicemotion', this._onMotion);
    this._accumulatedQuat.identity();
    this.el.object3D.quaternion.identity();
    console.log('[imu-fusion] disabled');
  },

  remove() {
    this.disable();
  },

  /**
   * Handler de DeviceMotionEvent. rotationRate = velocidad angular en deg/s.
   *   alpha = rotación alrededor de Z (heading)
   *   beta  = rotación alrededor de X (front-back tilt)
   *   gamma = rotación alrededor de Y (left-right tilt)
   *
   * Integra rate × dt en un delta quaternion y lo acumula al estado.
   */
  _onMotion(e) {
    if (!e.rotationRate) return;

    // Calcular dt: preferir e.interval (más reliable en iOS) sobre timestamp diff.
    let dt;
    if (typeof e.interval === 'number' && e.interval > 0) {
      dt = e.interval / 1000;
    } else {
      const now = e.timeStamp || performance.now();
      if (this._lastEventTime === 0) {
        this._lastEventTime = now;
        return;
      }
      dt = (now - this._lastEventTime) / 1000;
      this._lastEventTime = now;
    }

    // Descarta deltas raros (suspend/resume, primer frame, etc.)
    if (dt <= 0 || dt > 0.1) return;

    const DEG2RAD = Math.PI / 180;
    const ax = (e.rotationRate.beta  || 0) * DEG2RAD * dt;
    const ay = (e.rotationRate.gamma || 0) * DEG2RAD * dt;
    const az = (e.rotationRate.alpha || 0) * DEG2RAD * dt;

    this._tmpEuler.set(ax, ay, az, 'XYZ');
    this._tmpQuat.setFromEuler(this._tmpEuler);

    // Body-frame composition: acc_new = acc_old · delta (post-multiply).
    // El gyro reporta velocidad angular en frame del dispositivo (body frame).
    // La rotación total entre T y T+n·dt = dR_1 · dR_2 · ... · dR_n (post-multiply).
    // (v1.2-v1.3 usaba premultiply incorrectamente → drift con movimiento sostenido.)
    this._accumulatedQuat.multiply(this._tmpQuat);
  },

  tick() {
    if (!this._enabled) return;

    const parent = this.el.parentEl;
    if (!parent || !parent.object3D) return;

    const parentMatrix = parent.object3D.matrix;

    // Inicializar cache la primera vez
    if (!this._matrixInitialized) {
      this._parentMatrixCached.copy(parentMatrix);
      this._matrixInitialized = true;
      return;
    }

    // ¿Cambió la matrix del padre? → MindAR refrescó la pose este frame
    if (!parentMatrix.equals(this._parentMatrixCached)) {
      this._parentMatrixCached.copy(parentMatrix);
      this._accumulatedQuat.identity();           // nueva ground truth
      this.el.object3D.quaternion.identity();     // sin offset
      return;
    }

    // MindAR no actualizó este frame → aplicar predicción del gyro.
    //
    // Conjugación: local = M⁻¹ · dR⁻¹ · M
    //   donde M = #target.worldQuaternion (rotación del marcador en frame de cámara
    //   set por MindAR), y dR = rotación body-frame del device acumulada desde el
    //   último anchor.
    //
    // Por qué la conjugación: queremos que el efecto NETO sobre los descendientes sea
    // pre-multiplicar la pose del marcador por dR⁻¹ EN FRAME DE CÁMARA. Three.js compone
    // child_world = parent_world · child_local (post-multiply en composición de hijos).
    // Para que esa post-multiplicación produzca el resultado de pre-multiplicar la
    // pose del marcador en frame de cámara, child_local debe ser dR⁻¹ "expresado en
    // frame local de #target" = M⁻¹ · dR⁻¹ · M.
    //
    // (v1.2-v1.3 aplicaba solo dR⁻¹ → la rotación quedaba en frame local del marcador
    // → la cabeza, que está a un offset del origen del marcador, barría un arco en vez
    // de quedarse anclada. Eso causaba la "translación" reportada por el usuario.)

    parent.object3D.getWorldQuaternion(this._M);
    this._Minv.copy(this._M).invert();
    this._dRinv.copy(this._accumulatedQuat).invert();

    this._localQuat.copy(this._Minv);          // M⁻¹
    this._localQuat.multiply(this._dRinv);     // M⁻¹ · dR⁻¹
    this._localQuat.multiply(this._M);         // M⁻¹ · dR⁻¹ · M

    this.el.object3D.quaternion.copy(this._localQuat);
  },
});
