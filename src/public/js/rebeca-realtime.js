/**
 * RebecaRealtime — Gerenciador centralizado de polling
 * Versão 1.0 | Arquitetura escalável para WebSocket/SSE no futuro
 *
 * USO:
 *   RebecaRealtime.register('cozinha', carregarPedidos, 5000, 'alta')
 *   RebecaRealtime.pause('cozinha')
 *   RebecaRealtime.resume('cozinha')
 *   RebecaRealtime.destroy('cozinha')
 */

window.RebecaRealtime = (() => {
  // ── ESTADO ────────────────────────────────────────────────────────────────
  const _tasks = new Map();        // id → { fn, interval, priority, timer, paused, lastRun, cache }
  const _cache = new Map();        // url → { data, ts }
  const CACHE_TTL = 4000;          // 4s — deduplicação de requests
  let _tabActive = !document.hidden;

  // ── PRIORIDADES → multiplicador quando aba inativa ────────────────────────
  const PRIORIDADE = {
    critica: 1,    // nunca reduz (GPS, cozinha ativa, PDV aberto)
    alta:    2,    // 2x mais lento quando inativo
    media:   4,    // 4x mais lento
    baixa:   8,    // 8x mais lento
    minima:  0,    // pausa completamente quando inativo
  };

  // ── VISIBILIDADE DA ABA ───────────────────────────────────────────────────
  document.addEventListener('visibilitychange', () => {
    _tabActive = !document.hidden;
    if (_tabActive) {
      console.log('[RebecaRealtime] Aba ativa — restaurando polling');
      _tasks.forEach((task, id) => { if (!task.manualPause) _scheduleTask(id); });
    } else {
      console.log('[RebecaRealtime] Aba inativa — reduzindo polling');
      _tasks.forEach((task, id) => _adjustForInactive(id));
    }
  });

  // ── SCHEDULER INTERNO ─────────────────────────────────────────────────────
  function _scheduleTask(id) {
    const task = _tasks.get(id);
    if (!task || task.manualPause) return;
    clearTimeout(task.timer);
    task.timer = setTimeout(async () => {
      if (!task.manualPause) {
        try {
          task.lastRun = Date.now();
          await task.fn();
        } catch(e) {
          console.warn(`[RebecaRealtime] Erro em '${id}':`, e.message);
        }
        _scheduleTask(id); // reagendar após execução
      }
    }, task.currentInterval);
  }

  function _adjustForInactive(id) {
    const task = _tasks.get(id);
    if (!task || task.manualPause) return;
    const mult = PRIORIDADE[task.priority] ?? 4;
    if (mult === 0) {
      clearTimeout(task.timer);
      return;
    }
    task.currentInterval = task.interval * mult;
    _scheduleTask(id);
  }

  // ── FETCH COM CACHE COMPARTILHADO ─────────────────────────────────────────
  async function fetchCached(url, options = {}) {
    const key = url + JSON.stringify(options);
    const cached = _cache.get(key);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      return cached.data;
    }
    const res = await fetch(url, options);
    const data = await res.json();
    _cache.set(key, { data, ts: Date.now() });
    return data;
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────
  return {
    /**
     * Registrar uma tarefa de polling
     * @param {string} id - identificador único
     * @param {Function} fn - função async a executar
     * @param {number} interval - intervalo em ms
     * @param {string} priority - 'critica'|'alta'|'media'|'baixa'|'minima'
     * @param {boolean} runNow - executar imediatamente?
     */
    register(id, fn, interval, priority = 'media', runNow = true) {
      if (_tasks.has(id)) this.destroy(id);
      const task = {
        fn, interval, priority,
        currentInterval: interval,
        timer: null,
        manualPause: false,
        lastRun: null,
      };
      _tasks.set(id, task);
      if (runNow) fn().catch(() => {});
      if (!_tabActive) {
        _adjustForInactive(id);
      } else {
        _scheduleTask(id);
      }
      console.log(`[RebecaRealtime] ✅ Registrado: '${id}' a cada ${interval/1000}s [${priority}]`);
    },

    /** Pausar manualmente uma tarefa */
    pause(id) {
      const task = _tasks.get(id);
      if (!task) return;
      task.manualPause = true;
      clearTimeout(task.timer);
      console.log(`[RebecaRealtime] ⏸ Pausado: '${id}'`);
    },

    /** Retomar tarefa pausada */
    resume(id) {
      const task = _tasks.get(id);
      if (!task) return;
      task.manualPause = false;
      task.currentInterval = task.interval;
      _scheduleTask(id);
      console.log(`[RebecaRealtime] ▶ Retomado: '${id}'`);
    },

    /** Destruir tarefa */
    destroy(id) {
      const task = _tasks.get(id);
      if (!task) return;
      clearTimeout(task.timer);
      _tasks.delete(id);
    },

    /** Destruir todas as tarefas */
    destroyAll() {
      _tasks.forEach((_, id) => this.destroy(id));
      console.log('[RebecaRealtime] 🛑 Todas as tarefas destruídas');
    },

    /** Executar uma tarefa imediatamente sem esperar o intervalo */
    runNow(id) {
      const task = _tasks.get(id);
      if (!task) return;
      clearTimeout(task.timer);
      task.fn().catch(() => {}).finally(() => _scheduleTask(id));
    },

    /** Fetch com cache compartilhado — evita requests duplicados */
    fetchCached,

    /** Status de todas as tarefas — debug */
    status() {
      console.table([..._tasks.entries()].map(([id, t]) => ({
        id,
        priority: t.priority,
        interval: `${t.interval/1000}s`,
        currentInterval: `${t.currentInterval/1000}s`,
        paused: t.manualPause,
        lastRun: t.lastRun ? new Date(t.lastRun).toLocaleTimeString() : 'nunca',
      })));
    },

    /** Estimativa de requests/min atual */
    requestsPerMin() {
      let total = 0;
      _tasks.forEach(t => {
        if (!t.manualPause) total += 60000 / t.currentInterval;
      });
      return Math.round(total);
    },
  };
})();

console.log('✅ RebecaRealtime carregado — window.RebecaRealtime disponível');
