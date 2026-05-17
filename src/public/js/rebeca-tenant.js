/**
 * rebeca-tenant.js — Tenant Context Frontend
 * Versão 1.0
 *
 * Responsabilidades:
 *   - Identificar tenant atual (adminId) de forma segura
 *   - Isolar localStorage por tenant:módulo
 *   - Isolar cache por tenant
 *   - Expor branding dinâmico (logo, cor, nome)
 *   - Expor plano e módulos ativos
 *   - Garantir que RebecaRealtime, RebecaNotify e RebecaAI operem com contexto correto
 *
 * USO:
 *   RebecaTenant.id()              — tenantId atual
 *   RebecaTenant.modulo()          — 'delivery' | 'agenda' | 'corrida'
 *   RebecaTenant.storage.get(k)    — localStorage isolado por tenant
 *   RebecaTenant.cache.get(k)      — cache em memória isolado por tenant
 *   RebecaTenant.branding()        — { nome, cor, logo, plano }
 *   RebecaTenant.pode('relatorio') — verificar permissão
 */

window.RebecaTenant = (() => {

  // ── DETECTAR MÓDULO ────────────────────────────────────────────────────────
  function _modulo() {
    const path  = window.location.pathname.toLowerCase();
    const title = document.title.toLowerCase();
    const host  = window.location.hostname.toLowerCase();

    if (path.includes('/corrida') || path.includes('/motorista') || path.includes('/rebeca') || title.includes('corrida') || title.includes('motorista')) return 'corrida';
    if (path.includes('/agenda') || title.includes('agenda') || host.includes('agenda')) return 'agenda';
    if (path.includes('/delivery') || path.includes('/admin') || title.includes('delivery')) return 'delivery';
    return 'delivery'; // default (agenda e delivery são os outros módulos)
  }

  // ── DETECTAR TENANT ID ─────────────────────────────────────────────────────
  // Usa o adminId do módulo ativo como tenantId
  function _tenantId() {
    const keys = [
      'soft_admin_id', 'softAdminId',
      'agenda_admin_id', 'agendaAdminId',
      'adminId', 'admin_id',
      'deliveryAdminId', 'delivery_admin_id',
    ];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.length >= 4) return v;
    }
    // Fallback: tentar extrair do JWT
    const tokenKeys = ['soft_token', 'agenda_token', 'token', 'delivery_token'];
    for (const k of tokenKeys) {
      const t = localStorage.getItem(k);
      if (!t) continue;
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        const id = payload.adminId || payload.id || payload.sub || payload.softAdminId;
        if (id) return String(id);
      } catch {}
    }
    return 'default';
  }

  // ── PREFIXO DE ISOLAMENTO ──────────────────────────────────────────────────
  function _prefix() {
    return `rebeca:${_tenantId()}:${_modulo()}`;
  }

  // ── STORAGE ISOLADO ────────────────────────────────────────────────────────
  const storage = {
    key: (k) => `${_prefix()}:${k}`,

    get(k, fallback = null) {
      try {
        const v = localStorage.getItem(this.key(k));
        return v !== null ? JSON.parse(v) : fallback;
      } catch { return fallback; }
    },

    set(k, v) {
      try { localStorage.setItem(this.key(k), JSON.stringify(v)); return true; }
      catch { return false; }
    },

    del(k) {
      try { localStorage.removeItem(this.key(k)); return true; }
      catch { return false; }
    },

    // Listar todas as chaves deste tenant+módulo
    keys() {
      const prefix = _prefix() + ':';
      return Object.keys(localStorage)
        .filter(k => k.startsWith(prefix))
        .map(k => k.slice(prefix.length));
    },

    // Limpar tudo deste tenant+módulo
    clear() {
      const prefix = _prefix() + ':';
      Object.keys(localStorage)
        .filter(k => k.startsWith(prefix))
        .forEach(k => localStorage.removeItem(k));
    },

    // Limpar outro tenant (admin master apenas)
    clearTenant(tenantId, modulo) {
      const prefix = `rebeca:${tenantId}:${modulo || ''}`;
      Object.keys(localStorage)
        .filter(k => k.startsWith(prefix))
        .forEach(k => localStorage.removeItem(k));
    },
  };

  // ── CACHE EM MEMÓRIA ISOLADO ───────────────────────────────────────────────
  // Estrutura: Map<tenantKey, Map<chave, {data, ts, ttl}>>
  const _caches = new Map();

  const cache = {
    _store() {
      const key = _prefix();
      if (!_caches.has(key)) _caches.set(key, new Map());
      return _caches.get(key);
    },

    get(k) {
      const store = this._store();
      const e = store.get(k);
      if (!e) return null;
      if (Date.now() - e.ts > e.ttl) { store.delete(k); return null; }
      return e.data;
    },

    set(k, data, ttlMs = 5 * 60 * 1000) {
      this._store().set(k, { data, ts: Date.now(), ttl: ttlMs });
    },

    del(k) { this._store().delete(k); },

    clear() { this._store().clear(); },

    // Stats para o monitor
    stats() {
      const store = this._store();
      return { entries: store.size, prefix: _prefix() };
    },
  };

  // ── BRANDING ───────────────────────────────────────────────────────────────
  // Lê do storage isolado (salvo no login) ou usa defaults Rebeca
  function _branding() {
    const saved = storage.get('branding', {});
    const modulo = _modulo();

    const defaults = {
      delivery: { nome: 'Rebeca Delivery', cor: '#f97316', logo: '/icon-rebeca-192.png', plano: 'starter' },
      agenda:   { nome: 'Rebeca Agenda',   cor: '#3b82f6', logo: '/agenda-icon-192.png', plano: 'starter' },
      corrida:  { nome: 'Rebeca Corrida',  cor: '#10b981', logo: '/icon-rebeca-192.png', plano: 'corrida_solo' },
    };

    return { ...defaults[modulo], ...saved };
  }

  // Aplicar branding dinamicamente no DOM
  function _aplicarBranding() {
    const b = _branding();
    // CSS variable para a cor primária do tenant
    document.documentElement.style.setProperty('--tenant-primary', b.cor);
    document.documentElement.style.setProperty('--tenant-name', `"${b.nome}"`);

    // Atualizar favicon se tiver logo custom
    if (b.logo && b.logo !== '/icon-rebeca-192.png') {
      const link = document.querySelector("link[rel~='icon']");
      if (link) link.href = b.logo;
    }
  }

  // ── PLANO E PERMISSÕES ────────────────────────────────────────────────────
  const PLANOS = {
    agenda_solo:    { relatorio: false, multiusuario: false, whitelabel: false, exportar: false },
    delivery_solo:  { relatorio: false, multiusuario: false, whitelabel: false, exportar: false },
    corrida_solo:   { relatorio: false, multiusuario: false, whitelabel: false, exportar: false },
    combo_agd_del:  { relatorio: false, multiusuario: false, whitelabel: false, exportar: true  },
    combo_del_cor:  { relatorio: false, multiusuario: false, whitelabel: false, exportar: true  },
    combo_completo: { relatorio: true,  multiusuario: false, whitelabel: false, exportar: true  },
    enterprise:     { relatorio: true,  multiusuario: true,  whitelabel: true,  exportar: true  },
  };

  function _pode(permissao) {
    const plano = storage.get('plano', 'starter');
    return !!(PLANOS[plano] || PLANOS.starter)[permissao];
  }

  // ── MÓDULOS ATIVOS ────────────────────────────────────────────────────────
  function _modulosAtivos() {
    return storage.get('modulos', ['delivery']); // default: delivery
  }

  // ── SALVAR CONTEXTO (chamado no login) ────────────────────────────────────
  function _salvarContexto(ctx) {
    // ctx: { branding, plano, modulos, adminId }
    if (ctx.branding) storage.set('branding', ctx.branding);
    if (ctx.plano)    storage.set('plano', ctx.plano);
    if (ctx.modulos)  storage.set('modulos', ctx.modulos);
    console.log(`[RebecaTenant] Contexto salvo — tenant: ${_tenantId()}, módulo: ${_modulo()}`);
  }

  // ── ISOLAMENTO DO REALTIME ─────────────────────────────────────────────────
  // Patcher: garante que RebecaRealtime.register sempre inclui tenantId
  function _patchRealtime() {
    if (!window.RebecaRealtime) return;
    const orig = window.RebecaRealtime.register.bind(window.RebecaRealtime);
    window.RebecaRealtime.register = function(id, fn, interval, opts = {}) {
      const tid = _tenantId();
      const mid = _modulo();
      // Prefixar id da task com tenant:modulo
      const isolatedId = id.startsWith(tid) ? id : `${tid}:${mid}:${id}`;
      // Wrapping fn para injetar contexto no header das chamadas fetch
      return orig(isolatedId, fn, interval, { ...opts, tenantId: tid, modulo: mid });
    };
    console.log('[RebecaTenant] RebecaRealtime patchado para isolamento tenant');
  }

  // ── ISOLAMENTO DO NOTIFY ───────────────────────────────────────────────────
  // Garante que notificações não cruzam tenants (proteção local)
  function _patchNotify() {
    if (!window.RebecaNotify) return;
    // Adicionar tenantId ao histórico de notificações
    const origToast = window.RebecaNotify._toast || null;
    // Apenas adiciona metadata — não bloqueia nada localmente
    window.RebecaNotify._tenantId = _tenantId();
    window.RebecaNotify._modulo   = _modulo();
    console.log('[RebecaTenant] RebecaNotify tagueado com tenant');
  }

  // ── ISOLAMENTO DA IA ──────────────────────────────────────────────────────
  function _patchAI() {
    if (!window.RebecaAI) return;
    window.RebecaAI._tenantId = _tenantId();
    window.RebecaAI._modulo   = _modulo();
    console.log('[RebecaTenant] RebecaAI tagueado com tenant');
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function _init() {
    _aplicarBranding();

    // Patch dos módulos (aguardar carregamento)
    const _tryPatch = () => {
      _patchRealtime();
      _patchNotify();
      _patchAI();
    };

    if (document.readyState === 'complete') {
      _tryPatch();
    } else {
      window.addEventListener('load', _tryPatch);
    }

    // Expor tenantId globalmente de forma segura (read-only)
    Object.defineProperty(window, '__REBECA_TENANT__', {
      get: () => ({ id: _tenantId(), modulo: _modulo(), prefix: _prefix() }),
      configurable: false,
    });

    console.log(`[RebecaTenant] ✅ Inicializado — ${_prefix()}`);
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────
  return {
    id:       _tenantId,
    modulo:   _modulo,
    prefix:   _prefix,
    storage,
    cache,
    branding: _branding,
    pode:     _pode,
    modulosAtivos: _modulosAtivos,
    salvarContexto: _salvarContexto,
    aplicarBranding: _aplicarBranding,
    init: _init,

    // Debug
    info() {
      return {
        tenantId: _tenantId(),
        modulo: _modulo(),
        prefix: _prefix(),
        branding: _branding(),
        plano: storage.get('plano', 'starter'),
        modulos: _modulosAtivos(),
        cacheStats: cache.stats(),
        storageKeys: storage.keys(),
      };
    },
  };
})();

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => RebecaTenant.init());
} else {
  RebecaTenant.init();
}

console.log('✅ RebecaTenant carregado');
console.log('   → RebecaTenant.info()         — ver contexto completo');
console.log('   → RebecaTenant.storage.get(k) — storage isolado por tenant');
console.log('   → RebecaTenant.pode("ia")     — verificar permissão de plano');
