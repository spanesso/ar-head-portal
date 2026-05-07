/**
 * debug-console.js — Consola visual en pantalla para depuración en iPhone.
 *
 * Carga sin defer (primer script del <head>) para capturar errores tempranos.
 * Intercepta: console.log/info/warn/error, window.onerror, unhandledrejection.
 *
 * UI: botón flotante [DBG] en la esquina inferior derecha.
 *     Tócalo para abrir/cerrar el panel de logs.
 */

(function () {
  'use strict';

  /* ── Configuración ──────────────────────────────────────── */
  const MAX_ENTRIES = 150;
  const STORAGE_KEY = 'arworld_debug_open';

  /* ── Estado interno ─────────────────────────────────────── */
  const entries  = [];
  let   panelEl  = null;
  let   listEl   = null;
  let   isOpen   = false;

  /* ── Estilos inyectados ─────────────────────────────────── */
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #dbg-toggle {
        position: fixed;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
        right: 12px;
        z-index: 9999;
        background: rgba(0,0,0,0.75);
        color: #0f0;
        font: bold 11px/1 monospace;
        padding: 7px 10px;
        border: 1px solid #0f0;
        border-radius: 6px;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        letter-spacing: 0.05em;
      }
      #dbg-panel {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(0,0,0,0.92);
        flex-direction: column;
        font: 12px/1.4 monospace;
        color: #ccc;
      }
      #dbg-panel.dbg-open { display: flex; }
      #dbg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid #333;
        background: #111;
        flex-shrink: 0;
      }
      #dbg-title {
        color: #0f0;
        font-weight: bold;
        font-size: 13px;
        letter-spacing: 0.05em;
      }
      #dbg-actions { display: flex; gap: 8px; }
      .dbg-btn {
        background: #222;
        color: #aaa;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 4px 10px;
        font: 11px monospace;
        cursor: pointer;
      }
      .dbg-btn:active { background: #333; }
      #dbg-list {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 6px 0;
      }
      .dbg-entry {
        display: flex;
        gap: 8px;
        padding: 3px 12px;
        border-bottom: 1px solid #1a1a1a;
        word-break: break-word;
        align-items: flex-start;
      }
      .dbg-entry:last-child { border-bottom: none; }
      .dbg-time {
        color: #555;
        flex-shrink: 0;
        padding-top: 1px;
        font-size: 10px;
      }
      .dbg-level {
        flex-shrink: 0;
        font-weight: bold;
        font-size: 10px;
        padding-top: 1px;
        min-width: 28px;
        text-align: right;
      }
      .dbg-msg { flex: 1; white-space: pre-wrap; }
      .dbg-log   .dbg-level { color: #888; }
      .dbg-info  .dbg-level { color: #4af; }
      .dbg-warn  .dbg-level { color: #fa0; }
      .dbg-error .dbg-level { color: #f44; }
      .dbg-error .dbg-msg   { color: #f88; }
      .dbg-warn  .dbg-msg   { color: #fca; }
    `;
    document.head.appendChild(style);
  }

  /* ── Construcción del DOM ───────────────────────────────── */
  function buildUI() {
    /* Panel */
    panelEl = document.createElement('div');
    panelEl.id = 'dbg-panel';

    const header = document.createElement('div');
    header.id = 'dbg-header';

    const title = document.createElement('span');
    title.id = 'dbg-title';
    title.textContent = '⬛ DEBUG CONSOLE';

    const actions = document.createElement('div');
    actions.id = 'dbg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'dbg-btn';
    copyBtn.textContent = 'Copiar';
    copyBtn.addEventListener('click', copyLogs);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'dbg-btn';
    clearBtn.textContent = 'Limpiar';
    clearBtn.addEventListener('click', clearLogs);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dbg-btn';
    closeBtn.textContent = '✕ Cerrar';
    closeBtn.addEventListener('click', closePanel);

    actions.append(copyBtn, clearBtn, closeBtn);
    header.append(title, actions);

    listEl = document.createElement('div');
    listEl.id = 'dbg-list';

    panelEl.append(header, listEl);
    document.body.appendChild(panelEl);

    /* Botón toggle */
    const toggle = document.createElement('button');
    toggle.id = 'dbg-toggle';
    toggle.textContent = 'DBG';
    toggle.addEventListener('click', togglePanel);
    document.body.appendChild(toggle);

    /* Restaurar estado abierto si se refresca */
    if (sessionStorage.getItem(STORAGE_KEY) === '1') openPanel();
  }

  /* ── Render de una entrada ──────────────────────────────── */
  function renderEntry(entry) {
    const row = document.createElement('div');
    row.className = `dbg-entry dbg-${entry.level}`;

    const time = document.createElement('span');
    time.className = 'dbg-time';
    time.textContent = entry.time;

    const level = document.createElement('span');
    level.className = 'dbg-level';
    level.textContent = entry.level.toUpperCase().slice(0, 3);

    const msg = document.createElement('span');
    msg.className = 'dbg-msg';
    msg.textContent = entry.msg;

    row.append(time, level, msg);
    return row;
  }

  /* ── Añadir entrada ─────────────────────────────────────── */
  function addEntry(level, args) {
    const msg = args
      .map(a => {
        if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
        if (typeof a === 'object') {
          try { return JSON.stringify(a, null, 2); } catch { return String(a); }
        }
        return String(a);
      })
      .join(' ');

    const now  = new Date();
    const time = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;

    const entry = { level, time, msg };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();

    if (listEl) {
      if (entries.length === 1 && listEl.children.length === 0 ||
          entries.length <= MAX_ENTRIES) {
        listEl.appendChild(renderEntry(entry));
        // Auto-scroll al final
        listEl.scrollTop = listEl.scrollHeight;
      }
    }
  }

  /* ── Acciones del panel ─────────────────────────────────── */
  function openPanel() {
    isOpen = true;
    panelEl?.classList.add('dbg-open');
    sessionStorage.setItem(STORAGE_KEY, '1');
    // Rebuild list (por si hubo entradas antes de que el DOM estuviera listo)
    if (listEl) {
      listEl.innerHTML = '';
      entries.forEach(e => listEl.appendChild(renderEntry(e)));
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  function closePanel() {
    isOpen = false;
    panelEl?.classList.remove('dbg-open');
    sessionStorage.setItem(STORAGE_KEY, '0');
  }

  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function clearLogs() {
    entries.length = 0;
    if (listEl) listEl.innerHTML = '';
  }

  function copyLogs() {
    const text = entries.map(e => `[${e.time}] ${e.level.toUpperCase()} ${e.msg}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      addEntry('info', ['📋 Logs copiados al portapapeles']);
    }).catch(() => {
      addEntry('warn', ['No se pudo copiar (sin permiso de clipboard)']);
    });
  }

  /* ── Intercepción de console ────────────────────────────── */
  const _orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  };

  ['log', 'info', 'warn', 'error'].forEach(level => {
    console[level] = (...args) => {
      _orig[level](...args);
      addEntry(level, args);
    };
  });

  /* ── Errores globales no capturados ─────────────────────── */
  window.addEventListener('error', (e) => {
    addEntry('error', [`${e.message}\n  → ${e.filename}:${e.lineno}:${e.colno}`]);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error
      ? (e.reason.stack || e.reason.message)
      : String(e.reason);
    addEntry('error', [`Promise rechazada: ${reason}`]);
  });

  /* ── Inicialización cuando el DOM esté listo ────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectStyles();
      buildUI();
    });
  } else {
    injectStyles();
    buildUI();
  }

  /* Mensaje de bienvenida */
  addEntry('info', ['🟢 Debug console activa — toca [DBG] para abrir/cerrar']);
})();
