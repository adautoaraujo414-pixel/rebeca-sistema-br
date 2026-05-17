/**
 * RebecaNotify — Sistema de Notificações In-App
 * Versão 1.0
 *
 * USO:
 *   RebecaNotify.pedido({ numero: 42, cliente: 'João', total: 89.90 })
 *   RebecaNotify.agendamento({ cliente: 'Ana', servico: 'Corte', horario: '14:30' })
 *   RebecaNotify.pagamento({ valor: 150, metodo: 'PIX', cliente: 'Pedro' })
 *   RebecaNotify.alerta({ titulo: 'Estoque baixo', msg: 'Coca-Cola acabando' })
 *   RebecaNotify.sucesso('Caixa fechado com sucesso!')
 *   RebecaNotify.erro('Falha ao conectar WhatsApp')
 *   RebecaNotify.info('Sistema atualizado')
 */

window.RebecaNotify = (() => {

  // ── CONFIG ─────────────────────────────────────────────────────────────────
  const CFG = {
    maxToasts:    5,
    duration:     5000,   // ms padrão
    durationLong: 8000,   // pedidos e agendamentos
    soundEnabled: true,
  };

  // ── ESTADO ─────────────────────────────────────────────────────────────────
  let _container = null;
  let _badge = 0;
  let _history = [];   // todas as notificações recentes
  let _callbacks = {}; // listeners externos

  // ── SONS (Web Audio API — sem arquivos externos) ───────────────────────────
  function _playSound(tipo) {
    if (!CFG.soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const sons = {
        pedido:      { freq: [523, 659, 784], dur: 0.12 },   // Dó-Mi-Sol — alegre
        agendamento: { freq: [440, 554],       dur: 0.15 },   // La-Do# — suave
        pagamento:   { freq: [659, 784, 988],  dur: 0.10 },   // Mi-Sol-Si — positivo
        alerta:      { freq: [440, 415],       dur: 0.18 },   // dissonante leve
        erro:        { freq: [330, 311],       dur: 0.2  },   // grave
        sucesso:     { freq: [523, 659],       dur: 0.12 },
        info:        { freq: [440],            dur: 0.1  },
      };

      const s = sons[tipo] || sons.info;
      let t = ctx.currentTime;
      s.freq.forEach((f, i) => {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.frequency.value = f;
        o2.type = 'sine';
        g2.gain.setValueAtTime(0.15, t + i * s.dur);
        g2.gain.exponentialRampToValueAtTime(0.001, t + i * s.dur + s.dur);
        o2.start(t + i * s.dur);
        o2.stop(t + i * s.dur + s.dur + 0.05);
      });
    } catch(e) {}
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('rnotify-css')) return;
    const s = document.createElement('style');
    s.id = 'rnotify-css';
    s.textContent = `
      /* ── CONTAINER ── */
      #rnotify-container {
        position:fixed;top:16px;right:16px;
        z-index:99995;
        display:flex;flex-direction:column;gap:10px;
        pointer-events:none;
        max-width:360px;width:calc(100vw - 32px);
      }

      /* ── TOAST BASE ── */
      .rn-toast {
        background:#fff;
        border-radius:14px;
        box-shadow:0 8px 32px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.08);
        border:1.5px solid #f1f5f9;
        overflow:hidden;
        pointer-events:all;
        cursor:pointer;
        animation:rn-in .35s cubic-bezier(.16,1,.3,1);
        position:relative;
      }
      .rn-toast.rn-out {
        animation:rn-out .3s cubic-bezier(.4,0,1,1) forwards;
      }
      @keyframes rn-in {
        from { opacity:0; transform:translateX(120%); }
        to   { opacity:1; transform:translateX(0); }
      }
      @keyframes rn-out {
        from { opacity:1; transform:translateX(0); max-height:200px; margin:0; }
        to   { opacity:0; transform:translateX(120%); max-height:0; margin:-10px 0 0; }
      }

      /* ── PROGRESS BAR ── */
      .rn-progress {
        position:absolute;bottom:0;left:0;right:0;height:3px;
        background:#f1f5f9;
      }
      .rn-progress-fill {
        height:100%;border-radius:0 2px 2px 0;
        transition:width linear;
      }

      /* ── INNER ── */
      .rn-inner {
        display:flex;align-items:flex-start;gap:12px;
        padding:14px 16px 16px;
      }
      .rn-icon {
        width:40px;height:40px;border-radius:10px;
        display:flex;align-items:center;justify-content:center;
        font-size:18px;flex-shrink:0;
      }
      .rn-content { flex:1;min-width:0; }
      .rn-titulo {
        font-size:.83rem;font-weight:700;color:#0f172a;
        margin-bottom:2px;line-height:1.3;
      }
      .rn-msg {
        font-size:.77rem;color:#64748b;line-height:1.4;
      }
      .rn-time {
        font-size:.68rem;color:#94a3b8;margin-top:4px;
      }
      .rn-close {
        font-size:14px;color:#cbd5e1;cursor:pointer;
        line-height:1;padding:2px;flex-shrink:0;
        background:none;border:none;
        transition:color .15s;
      }
      .rn-close:hover { color:#94a3b8; }

      /* ── AÇÕES ── */
      .rn-acoes {
        display:flex;gap:6px;padding:0 16px 12px;
      }
      .rn-btn {
        padding:5px 12px;border-radius:7px;font-size:.74rem;
        font-weight:600;cursor:pointer;border:none;
        font-family:inherit;transition:all .15s;
      }
      .rn-btn.primary {
        background:#0f172a;color:#fff;
      }
      .rn-btn.primary:hover { background:#1e293b; }
      .rn-btn.secondary {
        background:#f1f5f9;color:#475569;
      }
      .rn-btn.secondary:hover { background:#e2e8f0; }

      /* ── CORES POR TIPO ── */
      .rn-pedido    .rn-icon { background:#fff7ed; }
      .rn-pedido    .rn-progress-fill { background:#f97316; }
      .rn-pedido    .rn-btn.primary   { background:#f97316; }
      .rn-pedido    .rn-btn.primary:hover { background:#ea6c0a; }

      .rn-agendamento .rn-icon { background:#eff6ff; }
      .rn-agendamento .rn-progress-fill { background:#3b82f6; }
      .rn-agendamento .rn-btn.primary   { background:#3b82f6; }

      .rn-pagamento .rn-icon { background:#f0fdf4; }
      .rn-pagamento .rn-progress-fill { background:#22c55e; }
      .rn-pagamento .rn-btn.primary   { background:#22c55e; }

      .rn-alerta  .rn-icon { background:#fffbeb; }
      .rn-alerta  .rn-progress-fill { background:#f59e0b; }

      .rn-sucesso .rn-icon { background:#f0fdf4; }
      .rn-sucesso .rn-progress-fill { background:#22c55e; }

      .rn-erro    .rn-icon { background:#fef2f2; }
      .rn-erro    .rn-progress-fill { background:#ef4444; }

      .rn-info    .rn-icon { background:#f8fafc; }
      .rn-info    .rn-progress-fill { background:#64748b; }

      /* ── BADGE ── */
      #rnotify-badge {
        position:fixed;top:12px;right:12px;
        background:#ef4444;color:#fff;
        font-size:10px;font-weight:800;
        width:18px;height:18px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        z-index:99996;pointer-events:none;
        animation:rn-pulse 2s infinite;
        display:none;
      }
      @keyframes rn-pulse {
        0%,100% { transform:scale(1); }
        50%      { transform:scale(1.2); }
      }

      /* ── CENTRAL ── */
      #rnotify-central {
        position:fixed;top:0;right:0;bottom:0;
        width:360px;max-width:100vw;
        background:#fff;
        box-shadow:-8px 0 40px rgba(0,0,0,.12);
        z-index:99997;
        display:flex;flex-direction:column;
        transform:translateX(100%);
        transition:transform .35s cubic-bezier(.16,1,.3,1);
      }
      #rnotify-central.open { transform:translateX(0); }
      #rnotify-central .nc-header {
        padding:20px;border-bottom:1px solid #f1f5f9;
        display:flex;align-items:center;justify-content:space-between;
        flex-shrink:0;
      }
      #rnotify-central .nc-titulo {
        font-size:1rem;font-weight:800;color:#0f172a;
      }
      #rnotify-central .nc-close {
        width:32px;height:32px;border-radius:8px;background:#f8fafc;
        border:none;cursor:pointer;font-size:16px;
        display:flex;align-items:center;justify-content:center;
      }
      #rnotify-central .nc-body {
        flex:1;overflow-y:auto;padding:12px;
      }
      #rnotify-central .nc-item {
        display:flex;gap:10px;padding:12px;border-radius:10px;
        margin-bottom:6px;border:1.5px solid #f1f5f9;cursor:pointer;
        transition:background .15s;
      }
      #rnotify-central .nc-item:hover { background:#f8fafc; }
      #rnotify-central .nc-item-icon {
        width:32px;height:32px;border-radius:8px;
        display:flex;align-items:center;justify-content:center;
        font-size:14px;flex-shrink:0;background:#f8fafc;
      }
      #rnotify-central .nc-item-txt { flex:1;min-width:0; }
      #rnotify-central .nc-item-titulo {
        font-size:.8rem;font-weight:600;color:#0f172a;margin-bottom:2px;
      }
      #rnotify-central .nc-item-msg {
        font-size:.74rem;color:#64748b;
      }
      #rnotify-central .nc-item-time {
        font-size:.68rem;color:#94a3b8;margin-top:2px;
      }
      #rnotify-central .nc-empty {
        text-align:center;padding:60px 20px;color:#94a3b8;font-size:.85rem;
      }
      #rnotify-central .nc-footer {
        padding:12px;border-top:1px solid #f1f5f9;flex-shrink:0;
      }
      #rnotify-central .nc-clear {
        width:100%;padding:9px;border-radius:8px;
        background:#f8fafc;border:1.5px solid #e2e8f0;
        color:#64748b;font-size:.8rem;font-weight:600;
        cursor:pointer;font-family:inherit;transition:all .15s;
      }
      #rnotify-central .nc-clear:hover { background:#f1f5f9;color:#475569; }

      /* ── SINO BTN ── */
      #rnotify-sino {
        display:none; /* mostrar só se o painel quiser */
      }

      /* ── MOBILE ── */
      @media(max-width:480px) {
        #rnotify-container { top:8px;right:8px;left:8px;max-width:100%; }
        .rn-toast { border-radius:12px; }
        #rnotify-central { width:100vw; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── CONTAINER ──────────────────────────────────────────────────────────────
  function _ensureContainer() {
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'rnotify-container';
      document.body.appendChild(_container);
    }
    return _container;
  }

  // ── CORE TOAST ─────────────────────────────────────────────────────────────
  function _toast({ tipo, icon, titulo, msg, duration, acoes, onClick }) {
    _injectCSS();
    const container = _ensureContainer();

    // Limitar quantidade
    const toasts = container.querySelectorAll('.rn-toast');
    if (toasts.length >= CFG.maxToasts) {
      _dismiss(toasts[0]);
    }

    const dur = duration || CFG.duration;
    const id  = 'rnt-' + Date.now();
    const ts  = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const hn = (acoes || []).map(a =>
      `<button class="rn-btn ${a.primary ? 'primary' : 'secondary'}"
        onclick="event.stopPropagation();RebecaNotify._acao('${id}','${a.action}')"
      >${a.label}</button>`
    ).join('');

    const el = document.createElement('div');
    el.id = id;
    el.className = `rn-toast rn-${tipo}`;
    el.innerHTML = `
      <div class="rn-inner">
        <div class="rn-icon">${icon}</div>
        <div class="rn-content">
          <div class="rn-titulo">${titulo}</div>
          ${msg ? `<div class="rn-msg">${msg}</div>` : ''}
          <div class="rn-time">${ts}</div>
        </div>
        <button class="rn-close" onclick="event.stopPropagation();RebecaNotify._dismiss('${id}')">✕</button>
      </div>
      ${hn ? `<div class="rn-acoes">${hn}</div>` : ''}
      <div class="rn-progress">
        <div class="rn-progress-fill" id="${id}-prog" style="width:100%"></div>
      </div>`;

    if (onClick) el.onclick = onClick;
    container.appendChild(el);

    // Progress bar
    setTimeout(() => {
      const prog = document.getElementById(`${id}-prog`);
      if (prog) {
        prog.style.transition = `width ${dur}ms linear`;
        prog.style.width = '0%';
      }
    }, 50);

    // Auto-dismiss
    const timer = setTimeout(() => _dismiss(el), dur);
    el._timer = timer;

    // Historico
    _history.unshift({ id, tipo, icon, titulo, msg, ts: Date.now() });
    if (_history.length > 50) _history.pop();
    _updateBadge();

    // Callbacks
    (_callbacks[tipo] || []).forEach(fn => fn({ titulo, msg }));

    return id;
  }

  function _dismiss(elOrId) {
    const el = typeof elOrId === 'string'
      ? document.getElementById(elOrId)
      : elOrId;
    if (!el) return;
    clearTimeout(el._timer);
    el.classList.add('rn-out');
    setTimeout(() => el.remove(), 320);
  }

  function _updateBadge() {
    // Atualizar badge no sino se existir
    const sino = document.getElementById('rnotify-sino-badge');
    if (sino) {
      sino.textContent = _history.length > 9 ? '9+' : _history.length;
      sino.style.display = _history.length ? 'flex' : 'none';
    }
  }

  // ── CENTRAL DE NOTIFICAÇÕES ────────────────────────────────────────────────
  function _openCentral() {
    _injectCSS();
    let central = document.getElementById('rnotify-central');
    if (!central) {
      central = document.createElement('div');
      central.id = 'rnotify-central';
      document.body.appendChild(central);
    }

    const items = _history.length
      ? _history.map(n => {
          const time = new Date(n.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="nc-item">
              <div class="nc-item-icon">${n.icon}</div>
              <div class="nc-item-txt">
                <div class="nc-item-titulo">${n.titulo}</div>
                ${n.msg ? `<div class="nc-item-msg">${n.msg}</div>` : ''}
                <div class="nc-item-time">${time}</div>
              </div>
            </div>`;
        }).join('')
      : '<div class="nc-empty">🔔<br>Nenhuma notificação ainda</div>';

    central.innerHTML = `
      <div class="nc-header">
        <span class="nc-titulo">🔔 Notificações</span>
        <button class="nc-close" onclick="RebecaNotify.closeCentral()">✕</button>
      </div>
      <div class="nc-body">${items}</div>
      <div class="nc-footer">
        <button class="nc-clear" onclick="RebecaNotify.clearHistory()">Limpar histórico</button>
      </div>`;

    requestAnimationFrame(() => central.classList.add('open'));

    // Fechar clicando fora
    setTimeout(() => {
      document.addEventListener('click', function _out(e) {
        if (!central.contains(e.target)) {
          RebecaNotify.closeCentral();
          document.removeEventListener('click', _out);
        }
      });
    }, 200);
  }

  // ── SINO (botão para abrir central) ───────────────────────────────────────
  function _injectSino(targetSelector) {
    _injectCSS();
    const target = document.querySelector(targetSelector);
    if (!target) return;

    const btn = document.createElement('button');
    btn.id = 'rnotify-sino';
    btn.title = 'Notificações';
    btn.style.cssText = `
      position:relative;background:none;border:none;cursor:pointer;
      padding:6px;border-radius:8px;font-size:20px;
      display:inline-flex;align-items:center;justify-content:center;
      transition:background .15s;
    `;
    btn.innerHTML = `🔔<span id="rnotify-sino-badge" style="
      position:absolute;top:0;right:0;
      background:#ef4444;color:#fff;
      font-size:9px;font-weight:800;
      width:16px;height:16px;border-radius:50%;
      display:none;align-items:center;justify-content:center;
    "></span>`;
    btn.onclick = () => _openCentral();
    target.appendChild(btn);
  }

  // ── AÇÕES DOS TOASTS ───────────────────────────────────────────────────────
  const _acaoHandlers = {};

  return {
    // ── TIPOS ESPECÍFICOS ────────────────────────────────────────────────────
    pedido({ numero, cliente, total, mesa, tipo = 'delivery' }) {
      _playSound('pedido');
      const icone = tipo === 'mesa' ? '🍽️' : '🛵';
      const onde  = mesa ? `Mesa ${mesa}` : 'Delivery';
      return _toast({
        tipo: 'pedido',
        icon: icone,
        titulo: `Novo pedido #${numero}`,
        msg: `${cliente} • ${onde} • R$ ${Number(total).toFixed(2).replace('.', ',')}`,
        duration: CFG.durationLong,
        acoes: [
          { label: 'Ver pedido', action: `verPedido:${numero}`, primary: true },
          { label: 'Aceitar',    action: `aceitarPedido:${numero}` },
        ],
      });
    },

    agendamento({ cliente, servico, horario, profissional }) {
      _playSound('agendamento');
      return _toast({
        tipo: 'agendamento',
        icon: '📅',
        titulo: `Novo agendamento`,
        msg: `${cliente} • ${servico} • ${horario}${profissional ? ` • ${profissional}` : ''}`,
        duration: CFG.durationLong,
        acoes: [
          { label: 'Ver agenda', action: 'verAgenda', primary: true },
          { label: 'Confirmar',  action: `confirmarAgend:${cliente}` },
        ],
      });
    },

    pagamento({ valor, metodo, cliente }) {
      _playSound('pagamento');
      const icones = { PIX: '⚡', Dinheiro: '💵', Cartão: '💳', Crédito: '💳', Débito: '💳' };
      return _toast({
        tipo: 'pagamento',
        icon: icones[metodo] || '💰',
        titulo: `Pagamento recebido`,
        msg: `R$ ${Number(valor).toFixed(2).replace('.', ',')} via ${metodo}${cliente ? ` • ${cliente}` : ''}`,
        duration: CFG.duration,
      });
    },

    alerta({ titulo, msg, acao }) {
      _playSound('alerta');
      return _toast({
        tipo: 'alerta', icon: '⚠️', titulo, msg,
        duration: CFG.durationLong,
        acoes: acao ? [{ label: acao.label, action: acao.action, primary: true }] : [],
      });
    },

    sucesso(msg, titulo = 'Concluído') {
      _playSound('sucesso');
      return _toast({ tipo: 'sucesso', icon: '✅', titulo, msg, duration: CFG.duration });
    },

    erro(msg, titulo = 'Erro') {
      _playSound('erro');
      return _toast({ tipo: 'erro', icon: '❌', titulo, msg, duration: CFG.durationLong });
    },

    info(msg, titulo = 'Info') {
      return _toast({ tipo: 'info', icon: 'ℹ️', titulo, msg, duration: CFG.duration });
    },

    // ── CONTROLE ─────────────────────────────────────────────────────────────
    _dismiss(id)  { _dismiss(id); },
    _acao(toastId, action) {
      _dismiss(toastId);
      const [tipo, param] = action.split(':');
      const handlers = {
        verPedido:      (n) => window.mostrarTela?.('pedidos'),
        aceitarPedido:  (n) => console.log('[RebecaNotify] aceitar pedido', n),
        verAgenda:      ()  => window.mostrarTela?.('agenda'),
        confirmarAgend: (c) => console.log('[RebecaNotify] confirmar agend', c),
      };
      (handlers[tipo] || (() => {}))(param);
      (_acaoHandlers[action] || (() => {}))();
    },

    openCentral()   { _openCentral(); },
    closeCentral()  {
      const c = document.getElementById('rnotify-central');
      if (c) { c.classList.remove('open'); setTimeout(() => c.remove(), 350); }
    },
    clearHistory()  {
      _history = [];
      _updateBadge();
      this.closeCentral();
    },

    injectSino: _injectSino,

    // Registrar handler de ação customizado
    onAcao(action, fn) { _acaoHandlers[action] = fn; },

    // Registrar listener por tipo
    on(tipo, fn) {
      if (!_callbacks[tipo]) _callbacks[tipo] = [];
      _callbacks[tipo].push(fn);
    },

    // Config
    config(opts) { Object.assign(CFG, opts); },

    // Demo
    demo() {
      setTimeout(() => this.pedido({ numero: 42, cliente: 'João Silva', total: 89.90 }), 0);
      setTimeout(() => this.agendamento({ cliente: 'Ana Paula', servico: 'Corte + Escova', horario: '14:30' }), 1200);
      setTimeout(() => this.pagamento({ valor: 150, metodo: 'PIX', cliente: 'Carlos' }), 2400);
      setTimeout(() => this.alerta({ titulo: 'Estoque baixo', msg: 'Coca-Cola: apenas 2 unidades' }), 3600);
      setTimeout(() => this.sucesso('Caixa fechado — saldo R$ 1.240,00'), 4800);
    },

    history() { return [..._history]; },
  };
})();

console.log('✅ RebecaNotify carregado');
console.log('   → RebecaNotify.demo()  — ver todos os tipos');
console.log('   → RebecaNotify.pedido({ numero:1, cliente:"João", total:50 })');
