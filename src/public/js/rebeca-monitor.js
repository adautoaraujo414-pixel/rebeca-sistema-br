/**
 * RebecaMonitor — Observabilidade e Health Monitoring
 * Versão 1.0
 *
 * USO:
 *   RebecaDebug.enable()          → abre painel overlay
 *   RebecaDebug.disable()         → fecha painel
 *   RebecaMonitor.report()        → relatório no console
 *   RebecaMonitor.slowEndpoints() → endpoints lentos
 */

window.RebecaMonitor = (() => {
  // ── ESTADO INTERNO ─────────────────────────────────────────────────────────
  const _api = {
    calls:    [],      // { url, ms, status, ts, error }
    maxCalls: 500,     // rolling window
  };

  const _errors = [];  // { type, msg, stack, ts }
  const _maxErrors = 100;

  const _perf = {
    fps: 60,
    fpsHistory: [],
    lastFrame: performance.now(),
    frameCount: 0,
  };

  // ── INTERCEPTAR FETCH GLOBALMENTE ──────────────────────────────────────────
  const _origFetch = window.fetch;
  window.fetch = async function(url, opts = {}) {
    const t0 = performance.now();
    const ts = Date.now();
    let status = 0;
    let error = null;
    try {
      const res = await _origFetch(url, opts);
      status = res.status;
      const ms = Math.round(performance.now() - t0);
      _trackCall(url, ms, status, ts, null);
      if (ms > 1500) _warn(`API lenta: ${url} (${ms}ms)`);
      return res;
    } catch(e) {
      error = e.message;
      const ms = Math.round(performance.now() - t0);
      _trackCall(url, ms, 0, ts, error);
      _trackError('fetch_error', `${url}: ${error}`, '');
      throw e;
    }
  };

  function _trackCall(url, ms, status, ts, error) {
    _api.calls.push({ url, ms, status, ts, error });
    if (_api.calls.length > _api.maxCalls) _api.calls.shift();
  }

  // ── ERROR TRACKING ─────────────────────────────────────────────────────────
  window.onerror = function(msg, src, line, col, err) {
    _trackError('js_error', msg, err?.stack || `${src}:${line}:${col}`);
    return false;
  };

  window.addEventListener('unhandledrejection', e => {
    _trackError('promise_rejection', String(e.reason), e.reason?.stack || '');
  });

  function _trackError(type, msg, stack) {
    _errors.push({ type, msg: String(msg).slice(0, 200), stack: String(stack).slice(0, 300), ts: Date.now() });
    if (_errors.length > _maxErrors) _errors.shift();
    if (window.RebecaDebug?._active) window.RebecaDebug._refreshPanel();
  }

  // ── FPS MONITOR ────────────────────────────────────────────────────────────
  function _trackFPS() {
    const now = performance.now();
    _perf.frameCount++;
    if (now - _perf.lastFrame >= 1000) {
      _perf.fps = _perf.frameCount;
      _perf.fpsHistory.push(_perf.fps);
      if (_perf.fpsHistory.length > 60) _perf.fpsHistory.shift();
      _perf.frameCount = 0;
      _perf.lastFrame = now;
    }
    requestAnimationFrame(_trackFPS);
  }
  requestAnimationFrame(_trackFPS);

  // ── WARNINGS ───────────────────────────────────────────────────────────────
  const _warnings = [];
  function _warn(msg) {
    const w = { msg, ts: Date.now() };
    _warnings.push(w);
    if (_warnings.length > 50) _warnings.shift();
    console.warn(`[RebecaMonitor] ⚠️ ${msg}`);
    if (window.RebecaDebug?._active) window.RebecaDebug._refreshPanel();
  }

  // ── METRICS ────────────────────────────────────────────────────────────────
  function _getApiMetrics() {
    const now = Date.now();
    const last60s = _api.calls.filter(c => now - c.ts < 60000);
    const errors  = last60s.filter(c => c.error || c.status >= 400);
    const times   = last60s.filter(c => c.ms > 0).map(c => c.ms);
    const avgMs   = times.length ? Math.round(times.reduce((a,b) => a+b, 0) / times.length) : 0;
    const maxMs   = times.length ? Math.max(...times) : 0;

    // endpoints agrupados
    const byUrl = {};
    last60s.forEach(c => {
      const key = c.url.replace(/\/[a-f0-9]{24}/g, '/:id').split('?')[0];
      if (!byUrl[key]) byUrl[key] = { count: 0, totalMs: 0, errors: 0 };
      byUrl[key].count++;
      byUrl[key].totalMs += c.ms;
      if (c.error || c.status >= 400) byUrl[key].errors++;
    });

    return { rpm: last60s.length, errors: errors.length, avgMs, maxMs, byUrl };
  }

  function _getMemory() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1048576),
        total: Math.round(performance.memory.totalJSHeapSize / 1048576),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
      };
    }
    return null;
  }

  function _getRealtimeTasks() {
    if (!window.RebecaRealtime) return [];
    // acessar status interno
    const tasks = [];
    try {
      // RebecaRealtime expõe status() — capturar via override temporário
      const orig = console.table;
      let captured = null;
      console.table = (data) => { captured = data; };
      window.RebecaRealtime.status();
      console.table = orig;
      if (captured) return captured;
    } catch(e) {}
    return tasks;
  }

  // ── API PÚBLICA ────────────────────────────────────────────────────────────
  return {
    report() {
      const m = _getApiMetrics();
      const mem = _getMemory();
      console.group('[RebecaMonitor] 📊 Health Report');
      console.log(`FPS: ${_perf.fps} | Req/min: ${m.rpm} | Avg: ${m.avgMs}ms | Max: ${m.maxMs}ms`);
      console.log(`Erros (60s): ${m.errors} | Erros JS: ${_errors.length} | Warnings: ${_warnings.length}`);
      if (mem) console.log(`Memória: ${mem.used}MB / ${mem.total}MB (limit: ${mem.limit}MB)`);
      console.log('Endpoints (60s):', m.byUrl);
      if (window.RebecaRealtime) window.RebecaRealtime.status();
      console.groupEnd();
    },

    slowEndpoints(thresholdMs = 1000) {
      const slow = _api.calls.filter(c => c.ms >= thresholdMs)
        .sort((a,b) => b.ms - a.ms)
        .slice(0, 20);
      console.table(slow.map(c => ({ url: c.url, ms: c.ms, status: c.status, time: new Date(c.ts).toLocaleTimeString() })));
      return slow;
    },

    errors()   { return [..._errors]; },
    warnings() { return [..._warnings]; },
    calls()    { return [..._api.calls]; },
    fps()      { return _perf.fps; },
    memory()   { return _getMemory(); },
    metrics()  { return _getApiMetrics(); },
  };
})();

// ── DEBUG OVERLAY ─────────────────────────────────────────────────────────────
window.RebecaDebug = (() => {
  let _panel = null;
  let _timer = null;
  let _active = false;

  function _css() {
    if (document.getElementById('rebeca-debug-css')) return;
    const s = document.createElement('style');
    s.id = 'rebeca-debug-css';
    s.textContent = `
      #rebeca-debug-panel {
        position:fixed;bottom:0;right:0;width:400px;max-height:70vh;
        background:#0f172a;color:#e2e8f0;font-family:'Courier New',monospace;
        font-size:11px;z-index:999999;border-radius:12px 0 0 0;
        box-shadow:-4px -4px 24px rgba(0,0,0,.5);overflow:hidden;
        display:flex;flex-direction:column;
      }
      #rebeca-debug-panel .dbg-header {
        background:#1e293b;padding:8px 12px;display:flex;
        align-items:center;justify-content:space-between;
        border-bottom:1px solid #334155;flex-shrink:0;
      }
      #rebeca-debug-panel .dbg-title { font-weight:700;color:#38bdf8;font-size:12px; }
      #rebeca-debug-panel .dbg-close {
        cursor:pointer;color:#94a3b8;font-size:14px;line-height:1;
        background:none;border:none;color:#f87171;font-weight:700;
      }
      #rebeca-debug-panel .dbg-tabs {
        display:flex;background:#1e293b;border-bottom:1px solid #334155;flex-shrink:0;
      }
      #rebeca-debug-panel .dbg-tab {
        padding:5px 10px;cursor:pointer;font-size:10px;color:#94a3b8;
        border:none;background:none;font-family:inherit;
      }
      #rebeca-debug-panel .dbg-tab.active { color:#38bdf8;border-bottom:2px solid #38bdf8; }
      #rebeca-debug-panel .dbg-body { overflow-y:auto;padding:10px;flex:1; }
      #rebeca-debug-panel .dbg-row {
        display:flex;justify-content:space-between;padding:3px 0;
        border-bottom:1px solid #1e293b;
      }
      #rebeca-debug-panel .dbg-label { color:#94a3b8; }
      #rebeca-debug-panel .dbg-val { color:#e2e8f0;font-weight:600; }
      #rebeca-debug-panel .dbg-ok  { color:#4ade80; }
      #rebeca-debug-panel .dbg-warn { color:#fbbf24; }
      #rebeca-debug-panel .dbg-err  { color:#f87171; }
      #rebeca-debug-panel .dbg-section { color:#38bdf8;font-weight:700;margin:8px 0 4px; }
      #rebeca-debug-panel .dbg-error-item {
        background:#1e293b;padding:4px 6px;border-radius:4px;margin-bottom:4px;
        border-left:3px solid #f87171;font-size:10px;word-break:break-all;
      }
      #rebeca-debug-panel .dbg-warn-item {
        background:#1e293b;padding:4px 6px;border-radius:4px;margin-bottom:4px;
        border-left:3px solid #fbbf24;font-size:10px;
      }
      #rebeca-debug-fab {
        position:fixed;bottom:16px;right:16px;width:44px;height:44px;
        background:#0f172a;color:#38bdf8;border:2px solid #38bdf8;
        border-radius:50%;cursor:pointer;font-size:18px;z-index:999998;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 16px rgba(56,189,248,.3);font-weight:700;
        transition:all .2s;
      }
      #rebeca-debug-fab:hover { background:#38bdf8;color:#0f172a; }
    `;
    document.head.appendChild(s);
  }

  function _buildPanel() {
    const el = document.createElement('div');
    el.id = 'rebeca-debug-panel';
    el.innerHTML = `
      <div class="dbg-header">
        <span class="dbg-title">🔬 RebecaDebug</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span id="dbg-fps" class="dbg-ok" style="font-size:10px">60 FPS</span>
          <button class="dbg-close" onclick="RebecaDebug.disable()">✕</button>
        </div>
      </div>
      <div class="dbg-tabs">
        <button class="dbg-tab active" onclick="RebecaDebug._tab('health')">Health</button>
        <button class="dbg-tab" onclick="RebecaDebug._tab('api')">API</button>
        <button class="dbg-tab" onclick="RebecaDebug._tab('realtime')">Realtime</button>
        <button class="dbg-tab" onclick="RebecaDebug._tab('errors')">Erros</button>
      </div>
      <div class="dbg-body" id="dbg-body"></div>
    `;
    document.body.appendChild(el);
    return el;
  }

  let _currentTab = 'health';

  function _renderHealth() {
    const m = window.RebecaMonitor.metrics();
    const mem = window.RebecaMonitor.memory();
    const fps = window.RebecaMonitor.fps();
    const errs = window.RebecaMonitor.errors();
    const warns = window.RebecaMonitor.warnings();
    const rt = window.RebecaRealtime;

    const fpsClass = fps >= 50 ? 'dbg-ok' : fps >= 30 ? 'dbg-warn' : 'dbg-err';
    const rpmClass = m.rpm <= 30 ? 'dbg-ok' : m.rpm <= 80 ? 'dbg-warn' : 'dbg-err';
    const avgClass = m.avgMs <= 500 ? 'dbg-ok' : m.avgMs <= 1500 ? 'dbg-warn' : 'dbg-err';

    return `
      <div class="dbg-section">⚡ Performance</div>
      <div class="dbg-row"><span class="dbg-label">FPS</span><span class="dbg-val ${fpsClass}">${fps}</span></div>
      <div class="dbg-row"><span class="dbg-label">Req/min (60s)</span><span class="dbg-val ${rpmClass}">${m.rpm}</span></div>
      <div class="dbg-row"><span class="dbg-label">Latência média</span><span class="dbg-val ${avgClass}">${m.avgMs}ms</span></div>
      <div class="dbg-row"><span class="dbg-label">Latência max</span><span class="dbg-val ${m.maxMs>1500?'dbg-err':m.maxMs>500?'dbg-warn':'dbg-ok'}">${m.maxMs}ms</span></div>
      <div class="dbg-row"><span class="dbg-label">Erros HTTP (60s)</span><span class="dbg-val ${m.errors>0?'dbg-err':'dbg-ok'}">${m.errors}</span></div>
      ${mem ? `
      <div class="dbg-section">🧠 Memória</div>
      <div class="dbg-row"><span class="dbg-label">JS Heap usado</span><span class="dbg-val ${mem.used/mem.limit>0.8?'dbg-err':mem.used/mem.limit>0.5?'dbg-warn':'dbg-ok'}">${mem.used}MB</span></div>
      <div class="dbg-row"><span class="dbg-label">JS Heap total</span><span class="dbg-val">${mem.total}MB</span></div>
      <div class="dbg-row"><span class="dbg-label">Heap limit</span><span class="dbg-val">${mem.limit}MB</span></div>
      ` : ''}
      <div class="dbg-section">🔴 Alertas</div>
      <div class="dbg-row"><span class="dbg-label">Erros JS</span><span class="dbg-val ${errs.length>0?'dbg-err':'dbg-ok'}">${errs.length}</span></div>
      <div class="dbg-row"><span class="dbg-label">Warnings</span><span class="dbg-val ${warns.length>0?'dbg-warn':'dbg-ok'}">${warns.length}</span></div>
      ${rt ? `
      <div class="dbg-section">📡 Realtime</div>
      <div class="dbg-row"><span class="dbg-label">Tasks ativas</span><span class="dbg-val dbg-ok">${rt.requestsPerMin ? rt.requestsPerMin() + ' rpm' : 'N/A'}</span></div>
      ` : ''}
    `;
  }

  function _renderApi() {
    const m = window.RebecaMonitor.metrics();
    const entries = Object.entries(m.byUrl).sort((a,b) => b[1].totalMs/b[1].count - a[1].totalMs/a[1].count);
    if (!entries.length) return '<div style="color:#94a3b8;padding:8px">Nenhuma chamada ainda</div>';
    return entries.map(([url, d]) => {
      const avg = Math.round(d.totalMs / d.count);
      const cls = avg > 1500 ? 'dbg-err' : avg > 500 ? 'dbg-warn' : 'dbg-ok';
      return `
        <div style="margin-bottom:6px;background:#1e293b;padding:5px 7px;border-radius:4px">
          <div style="color:#cbd5e1;word-break:break-all;margin-bottom:2px">${url}</div>
          <div style="display:flex;gap:10px">
            <span class="dbg-label">calls: <span class="dbg-val">${d.count}</span></span>
            <span class="dbg-label">avg: <span class="dbg-val ${cls}">${avg}ms</span></span>
            ${d.errors ? `<span class="dbg-err">erros: ${d.errors}</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function _renderRealtime() {
    if (!window.RebecaRealtime) return '<div style="color:#94a3b8">RebecaRealtime não carregado</div>';
    const rpm = window.RebecaRealtime.requestsPerMin();
    return `
      <div class="dbg-row"><span class="dbg-label">Req/min atual</span><span class="dbg-val dbg-ok">${rpm}</span></div>
      <div class="dbg-row"><span class="dbg-label">Aba ativa</span><span class="dbg-val">${!document.hidden ? '✅ sim' : '⏸ não'}</span></div>
      <div class="dbg-section">Tasks registradas</div>
      <div style="color:#94a3b8;font-size:10px">Use RebecaRealtime.status() no console para detalhes completos</div>
      <button onclick="RebecaRealtime.status()" style="margin-top:8px;padding:4px 10px;background:#1e293b;color:#38bdf8;border:1px solid #38bdf8;border-radius:4px;cursor:pointer;font-family:inherit;font-size:10px">Ver no console</button>
    `;
  }

  function _renderErrors() {
    const errs = window.RebecaMonitor.errors();
    const warns = window.RebecaMonitor.warnings();
    if (!errs.length && !warns.length) return '<div style="color:#4ade80;padding:8px">✅ Sem erros ou warnings</div>';
    return [
      ...errs.slice(-10).reverse().map(e => `
        <div class="dbg-error-item">
          <div style="color:#f87171;font-weight:700">${e.type}</div>
          <div>${e.msg}</div>
          <div style="color:#64748b">${new Date(e.ts).toLocaleTimeString()}</div>
        </div>`),
      ...warns.slice(-10).reverse().map(w => `
        <div class="dbg-warn-item">
          <div style="color:#fbbf24">${w.msg}</div>
          <div style="color:#64748b">${new Date(w.ts).toLocaleTimeString()}</div>
        </div>`),
    ].join('');
  }

  function _refresh() {
    if (!_active || !_panel) return;
    const body = document.getElementById('dbg-body');
    const fpsEl = document.getElementById('dbg-fps');
    if (!body) return;
    if (fpsEl) {
      const fps = window.RebecaMonitor.fps();
      fpsEl.textContent = `${fps} FPS`;
      fpsEl.className = fps >= 50 ? 'dbg-ok' : fps >= 30 ? 'dbg-warn' : 'dbg-err';
    }
    const renders = { health: _renderHealth, api: _renderApi, realtime: _renderRealtime, errors: _renderErrors };
    body.innerHTML = (renders[_currentTab] || _renderHealth)();
  }

  return {
    _active: false,
    _refreshPanel: _refresh,

    enable() {
      if (_active) return;
      _active = true;
      _css();
      // remover FAB se existir
      document.getElementById('rebeca-debug-fab')?.remove();
      _panel = _buildPanel();
      _refresh();
      _timer = setInterval(_refresh, 2000);
      console.log('[RebecaDebug] ✅ Painel ativo — RebecaDebug.disable() para fechar');
    },

    disable() {
      _active = false;
      clearInterval(_timer);
      _panel?.remove();
      _panel = null;
      // mostrar FAB
      const fab = document.createElement('button');
      fab.id = 'rebeca-debug-fab';
      fab.title = 'RebecaDebug';
      fab.textContent = '🔬';
      fab.onclick = () => { fab.remove(); this.enable(); };
      document.body.appendChild(fab);
    },

    _tab(name) {
      _currentTab = name;
      document.querySelectorAll('.dbg-tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
      _refresh();
    },

    // Shortcut: ativar com Ctrl+Shift+D
    _initShortcut() {
      document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
          e.preventDefault();
          _active ? this.disable() : this.enable();
        }
      });
    },
  };
})();

// Ativar shortcut Ctrl+Shift+D
window.RebecaDebug._initShortcut();

console.log('✅ RebecaMonitor + RebecaDebug carregados');
console.log('   → RebecaDebug.enable() ou Ctrl+Shift+D para abrir o painel');
console.log('   → RebecaMonitor.report() para relatório no console');
