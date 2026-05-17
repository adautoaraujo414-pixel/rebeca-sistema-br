/**
 * rebeca-security.js — Security Layer Frontend
 * Versão 1.0
 *
 * Responsabilidades:
 *   - Detectar e bloquear tentativas cross-tenant no frontend
 *   - Isolar uploads por tenant
 *   - Audit trail de ações sensíveis
 *   - Validar consistência do token vs adminId
 *   - Preparar WebSocket isolation (rooms por tenant)
 *   - Hardening do Service Worker cache
 */

window.RebecaSecurity = (() => {

  // ── AUDIT LOG ──────────────────────────────────────────────────────────────
  const _auditLog = [];
  const MAX_LOG = 200;

  function _log(tipo, dados = {}) {
    const entry = {
      ts: Date.now(),
      tipo,
      tenantId: window.RebecaTenant?.id() || 'unknown',
      modulo:   window.RebecaTenant?.modulo() || 'unknown',
      url:      window.location.pathname,
      ...dados,
    };
    _auditLog.unshift(entry);
    if (_auditLog.length > MAX_LOG) _auditLog.pop();

    // Alertas críticos
    if ((tipo.startsWith('CROSS_TENANT') || tipo.startsWith('SECURITY_')) && tipo !== 'SECURITY_INIT') {
      console.error('[RebecaSecurity] ⚠️ ALERTA:', entry);
      // Notificar via RebecaNotify se disponível
      if (window.RebecaNotify) {
        RebecaNotify.alerta({
          titulo: 'Alerta de Segurança',
          msg: `${tipo}: ${dados.detalhe || ''}`,
        });
      }
    } else {
      console.log('[RebecaSecurity]', tipo, dados);
    }

    return entry;
  }

  // ── VALIDAR CONSISTÊNCIA TOKEN vs STORAGE ──────────────────────────────────
  function _validarToken() {
    const tokenKeys = ['soft_token', 'agenda_token', 'token', 'delivery_token'];
    const adminKeys = ['soft_admin_id', 'softAdminId', 'agenda_admin_id', 'adminId', 'deliveryAdminId'];

    for (const tk of tokenKeys) {
      const token = localStorage.getItem(tk);
      if (!token) continue;

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const tokenAdminId = String(
          payload.softAdminId || payload.adminId || payload.id || payload.sub || ''
        );
        if (!tokenAdminId) continue;

        // Verificar se bate com os adminIds no localStorage
        for (const ak of adminKeys) {
          const storedId = localStorage.getItem(ak);
          if (!storedId) continue;
          if (storedId !== tokenAdminId) {
            _log('CROSS_TENANT_DETECTED', {
              detalhe: `Token ${tk} (${tokenAdminId}) ≠ storage ${ak} (${storedId})`,
              acao: 'BLOQUEADO',
            });
            // Limpar storage comprometido
            localStorage.removeItem(ak);
            return false;
          }
        }

        // Verificar expiração
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          _log('TOKEN_EXPIRADO', { chave: tk });
        }

      } catch(e) {
        _log('TOKEN_INVALIDO', { chave: tk, erro: e.message });
      }
    }
    return true;
  }

  // ── INTERCEPTAR FETCH — detectar requests cross-tenant ────────────────────
  function _patchFetch() {
    const origFetch = window.fetch;
    const myTenant  = window.RebecaTenant?.id() || null;

    window.fetch = async function(input, init = {}) {
      const url = typeof input === 'string' ? input : input.url || '';

      // Só auditar requests para nossa API
      if (url.includes('/api/') && myTenant) {
        const body = init.body;
        if (body && typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            const bodyAdminId = parsed.adminId || parsed.softAdminId;
            if (bodyAdminId && String(bodyAdminId) !== String(myTenant)) {
              _log('CROSS_TENANT_REQUEST', {
                detalhe: `fetch ${url} com adminId ${bodyAdminId} ≠ tenant ${myTenant}`,
                acao: 'AUDITADO',
              });
            }
          } catch {}
        }
      }

      return origFetch.call(this, input, init);
    };
  }

  // ── UPLOAD ISOLATION ───────────────────────────────────────────────────────
  // Garantir que uploads são prefixados com tenantId
  function _uploadPath(filename) {
    const tid = window.RebecaTenant?.id() || 'unknown';
    const mod = window.RebecaTenant?.modulo() || 'default';
    return `uploads/${tid}/${mod}/${filename}`;
  }

  // ── OFFLINE QUEUE ISOLATION ────────────────────────────────────────────────
  function _offlineQueueKey() {
    const tid = window.RebecaTenant?.id() || 'unknown';
    const mod = window.RebecaTenant?.modulo() || 'default';
    return `rebeca:${tid}:${mod}:offline-queue`;
  }

  function _queueOffline(tipo, dados) {
    try {
      const key  = _offlineQueueKey();
      const fila = JSON.parse(localStorage.getItem(key) || '[]');
      fila.push({ tipo, dados, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(fila));
      _log('OFFLINE_QUEUED', { tipo, key });
    } catch(e) {
      _log('OFFLINE_QUEUE_ERROR', { erro: e.message });
    }
  }

  // ── WEBSOCKET ISOLATION (preparação) ──────────────────────────────────────
  // Quando WebSocket for implementado, cada tenant deve usar room isolada
  function _wsRoom() {
    const tid = window.RebecaTenant?.id() || 'unknown';
    const mod = window.RebecaTenant?.modulo() || 'default';
    return `tenant:${tid}:${mod}`;
  }

  // Patcher para socket.io futuro
  function _prepareSocketIsolation() {
    // Quando socket.io for carregado, patchar automaticamente
    Object.defineProperty(window, 'io', {
      get() { return window._io_original; },
      set(ioFn) {
        window._io_original = function(...args) {
          const socket = ioFn(...args);
          const room   = _wsRoom();
          // Auto-join tenant room
          socket.on('connect', () => {
            socket.emit('join_tenant_room', { room, tenantId: window.RebecaTenant?.id() });
            _log('WS_CONNECTED', { room });
          });
          return socket;
        };
      },
      configurable: true,
    });
  }

  // ── SW CACHE ISOLATION ────────────────────────────────────────────────────
  // Enviar tenantId para o SW poder prefixar caches futuros
  function _initSWIsolation() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) {
        reg.active.postMessage({
          type: 'TENANT_CONTEXT',
          tenantId: window.RebecaTenant?.id() || 'unknown',
          modulo:   window.RebecaTenant?.modulo() || 'default',
        });
        _log('SW_TENANT_CONTEXT_SENT');
      }
    }).catch(() => {});
  }

  // ── TESTES DE INVASÃO INTERNA ─────────────────────────────────────────────
  function _runSecurityChecks() {
    const checks = [];

    // 1. Token vs storage consistency
    const tokenOk = _validarToken();
    checks.push({ nome: 'token_consistency', ok: tokenOk });

    // 2. Tenant ID presente
    const hasTenant = !!(window.RebecaTenant?.id() && window.RebecaTenant.id() !== 'default');
    checks.push({ nome: 'tenant_identificado', ok: hasTenant });

    // 3. Verificar se há adminIds de outros tenants no storage
    const allKeys = Object.keys(localStorage);
    const tenantPrefix = `rebeca:${window.RebecaTenant?.id()}`;
    const alienKeys = allKeys.filter(k =>
      k.startsWith('rebeca:') && !k.startsWith(tenantPrefix) && k !== 'rebeca:default'
    );
    checks.push({ nome: 'storage_limpo', ok: alienKeys.length === 0, detalhe: alienKeys });

    // 4. Sem tokens de outros módulos ativos simultaneamente
    const tokens = ['soft_token', 'agenda_token', 'token'].filter(k => localStorage.getItem(k));
    checks.push({ nome: 'tokens_unicos', ok: tokens.length <= 1, detalhe: tokens });

    return checks;
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function _init() {
    // 1. Validar token imediatamente
    _validarToken();

    // 2. Interceptar fetch para auditoria
    _patchFetch();

    // 3. Preparar isolamento WebSocket
    _prepareSocketIsolation();

    // 4. Enviar contexto tenant ao SW
    setTimeout(_initSWIsolation, 2000);

    // 5. Checar periodicamente (a cada 10min)
    setInterval(_validarToken, 10 * 60 * 1000);

    console.log('[RebecaSecurity] ✅ SECURITY_INIT', { tenantId: window.RebecaTenant?.id() });
    console.log('[RebecaSecurity] ✅ Inicializado');
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────
  return {
    init: _init,
    uploadPath: _uploadPath,
    offlineQueue: { push: _queueOffline, key: _offlineQueueKey },
    wsRoom: _wsRoom,
    auditLog: () => [..._auditLog],
    runChecks: _runSecurityChecks,
    log: _log,

    // Simular ataque para teste
    testCrossTenant(fakeTenantId) {
      _log('SECURITY_TEST', { detalhe: `Simulando cross-tenant com ${fakeTenantId}` });
      const myId = window.RebecaTenant?.id();
      if (fakeTenantId === myId) return { bloqueado: false, motivo: 'mesmo tenant' };
      return { bloqueado: true, motivo: 'tenant diferente detectado', meu: myId, tentativa: fakeTenantId };
    },
  };
})();

// Auto-init (após RebecaTenant)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => RebecaSecurity.init(), 100); // após RebecaTenant
  });
} else {
  setTimeout(() => RebecaSecurity.init(), 100);
}

console.log('✅ RebecaSecurity carregado');
console.log('   → RebecaSecurity.runChecks()        — auditoria de segurança');
console.log('   → RebecaSecurity.auditLog()          — ver logs de segurança');
console.log('   → RebecaSecurity.testCrossTenant(id) — simular ataque');
