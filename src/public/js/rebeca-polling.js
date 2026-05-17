// ── RebecaPollingManager — Singleton central de polling ──────────────────
// Uso: RebecaPollingManager.start('key', fn, ms)
//      RebecaPollingManager.stop('key')
//      RebecaPollingManager.stopAll()
// Regra: NENHUMA tela cria setInterval direto — sempre usar este manager.

(function() {
  if (window.RebecaPollingManager) return; // singleton

  window.RebecaPollingManager = {
    _tasks: {},
    _paused: false,

    start(key, fn, ms) {
      this.stop(key); // limpar anterior antes de criar novo
      if (this._paused) return;
      this._tasks[key] = {
        interval: setInterval(fn, ms),
        fn: fn,
        ms: ms
      };
      console.log('[Polling] start:', key, ms + 'ms');
    },

    stop(key) {
      if (this._tasks[key]) {
        clearInterval(this._tasks[key].interval);
        delete this._tasks[key];
        console.log('[Polling] stop:', key);
      }
    },

    stopAll() {
      Object.keys(this._tasks).forEach(k => this.stop(k));
      console.log('[Polling] stopAll');
    },

    pauseAll() {
      this._paused = true;
      Object.keys(this._tasks).forEach(k => {
        clearInterval(this._tasks[key].interval);
      });
    },

    resumeAll() {
      this._paused = false;
      Object.keys(this._tasks).forEach(k => {
        const t = this._tasks[k];
        t.interval = setInterval(t.fn, t.ms);
      });
    },

    list() {
      return Object.keys(this._tasks);
    }
  };

  // Pausar polling quando aba está invisível — economizar recursos
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      Object.keys(window.RebecaPollingManager._tasks).forEach(k => {
        clearInterval(window.RebecaPollingManager._tasks[k].interval);
      });
      console.log('[Polling] aba oculta — intervals pausados');
    } else {
      Object.keys(window.RebecaPollingManager._tasks).forEach(k => {
        const t = window.RebecaPollingManager._tasks[k];
        t.interval = setInterval(t.fn, t.ms);
      });
      console.log('[Polling] aba ativa — intervals restaurados');
    }
  });

  console.log('✅ RebecaPollingManager carregado');
})();
