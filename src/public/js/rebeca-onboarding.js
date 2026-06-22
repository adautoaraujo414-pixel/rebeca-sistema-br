/**
 * RebecaOnboarding — Onboarding Premium
 * Versão 1.0
 *
 * Ativa automaticamente no primeiro acesso.
 * Manualmente: RebecaOnboarding.start()
 * Resetar:     RebecaOnboarding.reset()
 */

window.RebecaOnboarding = (() => {

  // ── CONFIG ─────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'rebeca_onboarding_v1';
  const CHECKLIST_KEY = 'rebeca_checklist_v1';

  // Detectar produto atual
  const _produto = (() => {
    const path = location.pathname;
    if (path.includes('agenda-adm') || document.title.includes('Agenda')) return 'agenda';
    if (path.includes('delivery') || document.title.includes('Delivery')) return 'delivery';
    return 'agenda'; // default
  })();

  // ── CHECKLIST POR PRODUTO ──────────────────────────────────────────────────
  const CHECKLISTS = {
    agenda: [
      { id: 'empresa',   icon: '🏢', label: 'Configurar empresa',        desc: 'Nome, logo e cor da marca' },
      { id: 'whatsapp',  icon: '💬', label: 'Conectar WhatsApp',         desc: 'Ativar atendimento automático' },
      { id: 'servico',   icon: '🔖',  label: 'Adicionar serviços',        desc: 'O que você oferece e os preços' },
      { id: 'agenda',    icon: '📅', label: 'Configurar agenda',          desc: 'Horários e disponibilidade' },
      { id: 'equipe',    icon: '👥', label: 'Cadastrar equipe',           desc: 'Profissionais e permissões' },
      { id: 'primeiro',  icon: '🎉', label: 'Primeiro agendamento',       desc: 'Receber o primeiro cliente' },
    ],
    delivery: [
      { id: 'empresa',   icon: '🏪', label: 'Configurar restaurante',    desc: 'Nome, logo e endereço' },
      { id: 'cardapio',  icon: '🍕', label: 'Montar cardápio',           desc: 'Produtos, categorias e preços' },
      { id: 'whatsapp',  icon: '💬', label: 'Conectar WhatsApp',         desc: 'Pedidos automáticos pelo bot' },
      { id: 'caixa',     icon: '💰', label: 'Abrir primeiro caixa',      desc: 'Controle financeiro do dia' },
      { id: 'entregador',icon: '🛵', label: 'Cadastrar entregador',      desc: 'Rastreamento em tempo real' },
      { id: 'pedido',    icon: '🎉', label: 'Primeiro pedido',           desc: 'Receber o primeiro pedido' },
    ],
  };

  // ── STEPS DO WIZARD ────────────────────────────────────────────────────────
  const STEPS = {
    agenda: [
      {
        id: 'welcome',
        tipo: 'welcome',
        titulo: 'Bem-vindo à Rebeca Agenda',
        subtitulo: 'Sua agenda inteligente com WhatsApp automático.',
        desc: 'Em menos de 5 minutos você vai ter tudo configurado e pronto para receber clientes.',
        cta: 'Começar configuração',
        skip: 'Pular e explorar sozinho',
      },
      {
        id: 'empresa',
        tipo: 'form',
        titulo: 'Como se chama seu negócio?',
        subtitulo: 'Essas informações aparecem para seus clientes.',
        campos: [
          { id: 'nome_empresa', label: 'Nome do negócio', placeholder: 'Ex: Studio da Ana', required: true },
          { id: 'whatsapp',    label: 'WhatsApp principal', placeholder: '(11) 99999-9999', type: 'tel' },
          { id: 'segmento',    label: 'Segmento', tipo: 'select', opcoes: [
            'Salão de beleza', 'Barbearia', 'Clínica estética', 'Massoterapia',
            'Psicologia / Terapia', 'Personal trainer', 'Tatuagem', 'Outro',
          ]},
        ],
        cta: 'Continuar',
      },
      {
        id: 'modulos',
        tipo: 'toggle',
        titulo: 'Quais módulos você vai usar?',
        subtitulo: 'Você pode ativar ou desativar depois.',
        opcoes: [
          { id: 'mod_agenda',    label: 'Agenda', icon: '📅', desc: 'Agendamentos online e gestão', on: true },
          { id: 'mod_whatsapp',  label: 'WhatsApp Bot', icon: '💬', desc: 'Atendimento e agendamento automático', on: true },
          { id: 'mod_financeiro',label: 'Financeiro', icon: '💰', desc: 'Controle de receitas e despesas', on: true },
          { id: 'mod_crm',       label: 'CRM', icon: '👥', desc: 'Clientes, retornos e fidelização', on: false },
          { id: 'mod_lembretes', label: 'Lembretes', icon: '🔔', desc: 'Avisos automáticos para clientes', on: true },
        ],
        cta: 'Continuar',
      },
      {
        id: 'pronto',
        tipo: 'success',
        titulo: 'Tudo pronto! 🎉',
        subtitulo: 'Seu painel está configurado.',
        desc: 'Próximo passo: conecte seu WhatsApp para começar a receber agendamentos automáticos.',
        cta: 'Ir para o painel',
        acoes: [
          { label: '💬 Conectar WhatsApp agora', action: 'conectarWhatsapp', primary: true },
          { label: '📅 Ver agenda',               action: 'irParaAgenda' },
        ],
      },
    ],
  };

  // ── ESTADO ─────────────────────────────────────────────────────────────────
  let _state = {
    concluido: false,
    stepAtual: 0,
    dados: {},
    checklist: {},
  };

  let _overlay = null;
  let _checklistPanel = null;

  // ── PERSISTÊNCIA ───────────────────────────────────────────────────────────
  function _load() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) _state = { ..._state, ...JSON.parse(s) };
      const ck = localStorage.getItem(CHECKLIST_KEY);
      if (ck) _state.checklist = JSON.parse(ck);
    } catch(e) {}
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        concluido: _state.concluido,
        stepAtual: _state.stepAtual,
        dados: _state.dados,
      }));
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(_state.checklist));
    } catch(e) {}
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('rebeca-onboarding-css')) return;
    const s = document.createElement('style');
    s.id = 'rebeca-onboarding-css';
    s.textContent = `
      /* ── OVERLAY ── */
      #rob-overlay {
        position:fixed;inset:0;z-index:99990;
        background:rgba(15,23,42,.85);
        backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;
        padding:16px;
        animation:rob-fadein .3s ease;
      }
      @keyframes rob-fadein { from{opacity:0} to{opacity:1} }
      @keyframes rob-slidein { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }

      /* ── CARD ── */
      #rob-card {
        background:#fff;border-radius:20px;
        width:100%;max-width:520px;
        box-shadow:0 32px 80px rgba(0,0,0,.25);
        overflow:hidden;
        animation:rob-slidein .35s cubic-bezier(.16,1,.3,1);
      }

      /* ── PROGRESS ── */
      #rob-progress {
        height:3px;background:#f1f5f9;
      }
      #rob-progress-bar {
        height:100%;background:linear-gradient(90deg,#f97316,#fb923c);
        transition:width .4s cubic-bezier(.16,1,.3,1);
        border-radius:0 2px 2px 0;
      }

      /* ── HEADER ── */
      #rob-header {
        padding:28px 32px 0;
        display:flex;align-items:center;justify-content:space-between;
      }
      .rob-logo {
        font-size:13px;font-weight:800;color:#f97316;
        letter-spacing:.04em;text-transform:uppercase;
      }
      .rob-step-label {
        font-size:11px;color:#94a3b8;font-weight:500;
      }

      /* ── BODY ── */
      #rob-body { padding:24px 32px 32px; }

      /* ── WELCOME ── */
      .rob-welcome-icon {
        width:64px;height:64px;border-radius:16px;
        background:linear-gradient(135deg,#f97316,#fb923c);
        display:flex;align-items:center;justify-content:center;
        font-size:28px;margin-bottom:20px;
        box-shadow:0 8px 24px rgba(249,115,22,.3);
      }
      .rob-titulo {
        font-size:1.5rem;font-weight:800;color:#0f172a;
        line-height:1.2;margin-bottom:8px;letter-spacing:-.03em;
      }
      .rob-subtitulo {
        font-size:.95rem;color:#64748b;margin-bottom:6px;font-weight:500;
      }
      .rob-desc {
        font-size:.85rem;color:#94a3b8;line-height:1.6;margin-bottom:24px;
      }

      /* ── FORM ── */
      .rob-form { display:flex;flex-direction:column;gap:14px;margin-bottom:24px; }
      .rob-field label {
        display:block;font-size:.78rem;font-weight:600;color:#475569;
        margin-bottom:5px;letter-spacing:.02em;
      }
      .rob-field input, .rob-field select {
        width:100%;padding:10px 14px;
        border:1.5px solid #e2e8f0;border-radius:10px;
        font-size:.9rem;color:#0f172a;background:#fff;
        font-family:inherit;box-sizing:border-box;
        transition:border-color .2s,box-shadow .2s;outline:none;
      }
      .rob-field input:focus, .rob-field select:focus {
        border-color:#f97316;
        box-shadow:0 0 0 3px rgba(249,115,22,.12);
      }

      /* ── TOGGLES ── */
      .rob-toggles { display:flex;flex-direction:column;gap:10px;margin-bottom:24px; }
      .rob-toggle-item {
        display:flex;align-items:center;gap:12px;
        padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:12px;
        cursor:pointer;transition:border-color .2s,background .2s;
        user-select:none;
      }
      .rob-toggle-item:hover { border-color:#f97316;background:#fff7ed; }
      .rob-toggle-item.on { border-color:#f97316;background:#fff7ed; }
      .rob-toggle-icon { font-size:20px;width:32px;text-align:center;flex-shrink:0; }
      .rob-toggle-txt { flex:1; }
      .rob-toggle-label { font-size:.88rem;font-weight:600;color:#0f172a; }
      .rob-toggle-desc  { font-size:.76rem;color:#94a3b8;margin-top:1px; }
      .rob-toggle-sw {
        width:36px;height:20px;border-radius:10px;
        background:#e2e8f0;position:relative;
        transition:background .2s;flex-shrink:0;
      }
      .rob-toggle-item.on .rob-toggle-sw { background:#f97316; }
      .rob-toggle-sw::after {
        content:'';position:absolute;top:2px;left:2px;
        width:16px;height:16px;border-radius:50%;background:#fff;
        transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.2);
      }
      .rob-toggle-item.on .rob-toggle-sw::after { transform:translateX(16px); }

      /* ── SUCCESS ── */
      .rob-success-icon {
        width:72px;height:72px;border-radius:50%;
        background:linear-gradient(135deg,#22c55e,#16a34a);
        display:flex;align-items:center;justify-content:center;
        font-size:32px;margin:0 auto 20px;
        box-shadow:0 8px 24px rgba(34,197,94,.3);
        animation:rob-bounce .5s cubic-bezier(.16,1,.3,1);
      }
      @keyframes rob-bounce {
        0%{transform:scale(0)} 60%{transform:scale(1.1)} 100%{transform:scale(1)}
      }
      .rob-acoes { display:flex;flex-direction:column;gap:8px;margin-top:20px; }
      .rob-acao-btn {
        padding:11px 20px;border-radius:10px;font-size:.88rem;
        font-weight:600;cursor:pointer;border:none;font-family:inherit;
        transition:all .18s;text-align:center;
      }
      .rob-acao-btn.primary {
        background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;
        box-shadow:0 4px 14px rgba(249,115,22,.3);
      }
      .rob-acao-btn.primary:hover { transform:translateY(-1px);box-shadow:0 6px 20px rgba(249,115,22,.4); }
      .rob-acao-btn.secondary {
        background:#f8fafc;color:#475569;border:1.5px solid #e2e8f0;
      }
      .rob-acao-btn.secondary:hover { border-color:#f97316;color:#f97316; }

      /* ── BOTÕES NAVEGAÇÃO ── */
      .rob-nav {
        display:flex;align-items:center;justify-content:space-between;
        padding-top:20px;border-top:1px solid #f1f5f9;margin-top:4px;
      }
      .rob-btn-skip {
        font-size:.8rem;color:#94a3b8;cursor:pointer;
        background:none;border:none;font-family:inherit;
        padding:4px;transition:color .2s;
      }
      .rob-btn-skip:hover { color:#64748b; }
      .rob-btn-primary {
        padding:10px 24px;border-radius:10px;
        background:linear-gradient(135deg,#f97316,#fb923c);
        color:#fff;font-weight:700;font-size:.88rem;
        border:none;cursor:pointer;font-family:inherit;
        box-shadow:0 4px 14px rgba(249,115,22,.25);
        transition:all .18s;
      }
      .rob-btn-primary:hover { transform:translateY(-1px);box-shadow:0 6px 20px rgba(249,115,22,.35); }
      .rob-btn-back {
        font-size:.8rem;color:#94a3b8;cursor:pointer;
        background:none;border:none;font-family:inherit;padding:4px;
      }

      /* ── CHECKLIST PANEL ── */
      #rob-checklist {
        position:fixed;bottom:72px;right:16px;
        width:280px;background:#fff;
        border-radius:16px;border:1.5px solid #e2e8f0;
        box-shadow:0 8px 32px rgba(0,0,0,.12);
        z-index:9990;overflow:hidden;
        animation:rob-slidein .3s cubic-bezier(.16,1,.3,1);
      }
      #rob-checklist .ck-header {
        padding:14px 16px;background:linear-gradient(135deg,#f97316,#fb923c);
        display:flex;align-items:center;justify-content:space-between;
      }
      #rob-checklist .ck-titulo {
        font-size:.85rem;font-weight:700;color:#fff;
      }
      #rob-checklist .ck-progress-txt {
        font-size:.75rem;color:rgba(255,255,255,.8);
      }
      #rob-checklist .ck-body { padding:12px; }
      #rob-checklist .ck-item {
        display:flex;align-items:center;gap:10px;
        padding:8px 10px;border-radius:8px;cursor:pointer;
        transition:background .15s;
      }
      #rob-checklist .ck-item:hover { background:#f8fafc; }
      #rob-checklist .ck-check {
        width:18px;height:18px;border-radius:50%;
        border:2px solid #e2e8f0;flex-shrink:0;
        display:flex;align-items:center;justify-content:center;
        font-size:9px;transition:all .2s;
      }
      #rob-checklist .ck-item.done .ck-check {
        background:#22c55e;border-color:#22c55e;color:#fff;
      }
      #rob-checklist .ck-item-label {
        font-size:.8rem;font-weight:500;color:#475569;flex:1;
      }
      #rob-checklist .ck-item.done .ck-item-label {
        text-decoration:line-through;color:#94a3b8;
      }
      #rob-checklist .ck-footer {
        padding:10px 12px;border-top:1px solid #f1f5f9;
      }
      #rob-checklist .ck-progress-bar-wrap {
        height:4px;background:#f1f5f9;border-radius:2px;overflow:hidden;
      }
      #rob-checklist .ck-progress-bar-fill {
        height:100%;background:linear-gradient(90deg,#f97316,#fb923c);
        border-radius:2px;transition:width .4s ease;
      }
      #rob-checklist .ck-toggle {
        position:fixed;bottom:16px;right:16px;
        width:48px;height:48px;border-radius:50%;
        background:linear-gradient(135deg,#f97316,#fb923c);
        color:#fff;border:none;cursor:pointer;
        font-size:20px;z-index:9989;
        box-shadow:0 4px 16px rgba(249,115,22,.4);
        transition:transform .2s;display:flex;
        align-items:center;justify-content:center;
      }
      #rob-checklist .ck-toggle:hover { transform:scale(1.08); }

      /* ── EMPTY STATE ── */
      .rob-empty {
        text-align:center;padding:40px 20px;
      }
      .rob-empty-icon { font-size:40px;margin-bottom:12px; }
      .rob-empty-title { font-size:1rem;font-weight:700;color:#0f172a;margin-bottom:6px; }
      .rob-empty-desc  { font-size:.83rem;color:#94a3b8;margin-bottom:20px;line-height:1.5; }
      .rob-empty-cta {
        display:inline-flex;align-items:center;gap:6px;
        padding:9px 20px;border-radius:10px;
        background:linear-gradient(135deg,#f97316,#fb923c);
        color:#fff;font-weight:600;font-size:.83rem;
        border:none;cursor:pointer;font-family:inherit;
        box-shadow:0 4px 14px rgba(249,115,22,.25);
        transition:all .18s;
      }
      .rob-empty-cta:hover { transform:translateY(-1px); }

      /* ── MOBILE ── */
      @media(max-width:480px) {
        #rob-card { border-radius:16px;max-width:100%; }
        #rob-body { padding:20px; }
        #rob-header { padding:20px 20px 0; }
        #rob-checklist { right:8px;bottom:64px;width:calc(100vw - 16px); }
        .rob-titulo { font-size:1.25rem; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── RENDER WIZARD ──────────────────────────────────────────────────────────
  function _renderStep(step) {
    const steps = STEPS[_produto] || STEPS.agenda;
    const total = steps.length;
    const idx   = _state.stepAtual;
    const pct   = Math.round(((idx) / (total - 1)) * 100);

    if (!_overlay) {
      _overlay = document.createElement('div');
      _overlay.id = 'rob-overlay';
      document.body.appendChild(_overlay);
    }

    let bodyHTML = '';

    if (step.tipo === 'welcome') {
      bodyHTML = `
        <div class="rob-welcome-icon">✨</div>
        <div class="rob-titulo">${step.titulo}</div>
        <div class="rob-subtitulo">${step.subtitulo}</div>
        <div class="rob-desc">${step.desc}</div>
        <div class="rob-nav">
          <button class="rob-btn-skip" onclick="RebecaOnboarding._skip()">${step.skip}</button>
          <button class="rob-btn-primary" onclick="RebecaOnboarding._next()">${step.cta} →</button>
        </div>`;
    }

    else if (step.tipo === 'form') {
      const campos = step.campos.map(campo => {
        if (campo.tipo === 'select') {
          const opts = campo.opcoes.map(o =>
            `<option value="${o}" ${_state.dados[campo.id]===o?'selected':''}>${o}</option>`
          ).join('');
          return `<div class="rob-field">
            <label>${campo.label}</label>
            <select id="rob-${campo.id}" onchange="RebecaOnboarding._dados('${campo.id}',this.value)">
              <option value="">Selecionar...</option>${opts}
            </select>
          </div>`;
        }
        return `<div class="rob-field">
          <label>${campo.label}${campo.required?'<span style="color:#f97316"> *</span>':''}</label>
          <input type="${campo.type||'text'}" id="rob-${campo.id}"
            placeholder="${campo.placeholder||''}"
            value="${_state.dados[campo.id]||''}"
            oninput="RebecaOnboarding._dados('${campo.id}',this.value)"
          >
        </div>`;
      }).join('');

      bodyHTML = `
        <div class="rob-titulo">${step.titulo}</div>
        <div class="rob-subtitulo">${step.subtitulo}</div>
        <div class="rob-form" style="margin-top:16px">${campos}</div>
        <div class="rob-nav">
          <button class="rob-btn-back" onclick="RebecaOnboarding._back()">← Voltar</button>
          <button class="rob-btn-primary" onclick="RebecaOnboarding._next()">${step.cta} →</button>
        </div>`;
    }

    else if (step.tipo === 'toggle') {
      const items = step.opcoes.map(op => {
        const isOn = _state.dados[op.id] !== undefined ? _state.dados[op.id] : op.on;
        return `
          <div class="rob-toggle-item ${isOn?'on':''}" id="rob-tog-${op.id}"
            onclick="RebecaOnboarding._toggle('${op.id}')">
            <span class="rob-toggle-icon">${op.icon}</span>
            <div class="rob-toggle-txt">
              <div class="rob-toggle-label">${op.label}</div>
              <div class="rob-toggle-desc">${op.desc}</div>
            </div>
            <div class="rob-toggle-sw"></div>
          </div>`;
      }).join('');

      bodyHTML = `
        <div class="rob-titulo">${step.titulo}</div>
        <div class="rob-subtitulo" style="margin-bottom:16px">${step.subtitulo}</div>
        <div class="rob-toggles">${items}</div>
        <div class="rob-nav">
          <button class="rob-btn-back" onclick="RebecaOnboarding._back()">← Voltar</button>
          <button class="rob-btn-primary" onclick="RebecaOnboarding._next()">${step.cta} →</button>
        </div>`;
    }

    else if (step.tipo === 'success') {
      const acoes = (step.acoes || []).map(a =>
        `<button class="rob-acao-btn ${a.primary?'primary':'secondary'}"
          onclick="RebecaOnboarding._action('${a.action}')">${a.label}</button>`
      ).join('');

      bodyHTML = `
        <div style="text-align:center">
          <div class="rob-success-icon">🎉</div>
          <div class="rob-titulo">${step.titulo}</div>
          <div class="rob-subtitulo">${step.subtitulo}</div>
          <div class="rob-desc">${step.desc}</div>
        </div>
        <div class="rob-acoes">${acoes}</div>`;
    }

    _overlay.innerHTML = `
      <div id="rob-card">
        <div id="rob-progress">
          <div id="rob-progress-bar" style="width:${pct}%"></div>
        </div>
        <div id="rob-header">
          <span class="rob-logo">✦ Rebeca</span>
          <span class="rob-step-label">${idx+1} de ${total}</span>
        </div>
        <div id="rob-body">${bodyHTML}</div>
      </div>`;
  }

  // ── CHECKLIST ──────────────────────────────────────────────────────────────
  function _renderChecklist() {
    const items = CHECKLISTS[_produto] || CHECKLISTS.agenda;
    const done  = items.filter(i => _state.checklist[i.id]).length;
    const pct   = Math.round((done / items.length) * 100);

    if (!_checklistPanel) {
      _checklistPanel = document.createElement('div');
      _checklistPanel.id = 'rob-checklist';
      document.body.appendChild(_checklistPanel);
      _checklistPanel.style.display = 'none'; // inicia fechado

      // FAB toggle
      const fab = document.createElement('button');
      fab.className = 'ck-toggle';
      fab.title = 'Checklist de configuração';
      fab.innerHTML = done === items.length ? '✅' : '📋';
      fab.onclick = () => {
        _checklistPanel.style.display =
          _checklistPanel.style.display === 'none' ? 'block' : 'none';
      };
      document.body.appendChild(fab);
    }

    const itemsHTML = items.map(item => {
      const isDone = !!_state.checklist[item.id];
      return `
        <div class="ck-item ${isDone?'done':''}" onclick="RebecaOnboarding._checkItem('${item.id}')">
          <div class="ck-check">${isDone ? '✓' : ''}</div>
          <span class="ck-item-label">${item.icon} ${item.label}</span>
        </div>`;
    }).join('');

    _checklistPanel.innerHTML = `
      <div class="ck-header">
        <span class="ck-titulo">📋 Configuração</span>
        <span class="ck-progress-txt">${done}/${items.length} concluídos</span>
      </div>
      <div class="ck-body">${itemsHTML}</div>
      <div class="ck-footer">
        <div class="ck-progress-bar-wrap">
          <div class="ck-progress-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  // ── EMPTY STATE HELPER ─────────────────────────────────────────────────────
  function _emptyState(containerId, { icon, titulo, desc, ctaLabel, ctaAction }) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <div class="rob-empty">
        <div class="rob-empty-icon">${icon}</div>
        <div class="rob-empty-title">${titulo}</div>
        <div class="rob-empty-desc">${desc}</div>
        ${ctaLabel ? `<button class="rob-empty-cta" onclick="${ctaAction}">${ctaLabel}</button>` : ''}
      </div>`;
  }

  // ── AÇÕES ──────────────────────────────────────────────────────────────────
  function _action(name) {
    const actions = {
      conectarWhatsapp: () => {
        _close();
        // navegar para tela whatsapp se existir
        const btn = document.querySelector('[onclick*="whatsapp"], [onclick*="Whatsapp"]');
        if (btn) btn.click();
        else if (window.mostrarTela) window.mostrarTela('whatsapp');
      },
      irParaAgenda: () => {
        _close();
        if (window.mostrarTela) window.mostrarTela('agenda');
      },
      irParaCardapio: () => {
        _close();
        if (window.mostrarTela) window.mostrarTela('cardapio');
        else {
          const btn = document.querySelector('[onclick*="cardapio"], [onclick*="Cardapio"]');
          if (btn) btn.click();
        }
      },
    };
    (actions[name] || _close)();
    _marcarConcluido();
  }

  function _marcarConcluido() {
    _state.concluido = true;
    _save();
  }

  function _close() {
    _overlay?.remove();
    _overlay = null;
  }

  // ── API INTERNA ────────────────────────────────────────────────────────────
  return {
    _next() {
      const steps = STEPS[_produto] || STEPS.agenda;
      // Salvar dados dos inputs antes de avançar
      const step = steps[_state.stepAtual];
      if (step?.campos) {
        step.campos.forEach(c => {
          const el = document.getElementById(`rob-${c.id}`);
          if (el) _state.dados[c.id] = el.value;
        });
      }
      _state.stepAtual = Math.min(_state.stepAtual + 1, steps.length - 1);
      _save();
      _renderStep(steps[_state.stepAtual]);
    },

    _back() {
      const steps = STEPS[_produto] || STEPS.agenda;
      _state.stepAtual = Math.max(_state.stepAtual - 1, 0);
      _renderStep(steps[_state.stepAtual]);
    },

    _skip() {
      _marcarConcluido();
      _close();
      _renderChecklist();
    },

    _dados(key, val) {
      _state.dados[key] = val;
    },

    _toggle(id) {
      const el = document.getElementById(`rob-tog-${id}`);
      if (!el) return;
      const isOn = el.classList.toggle('on');
      _state.dados[id] = isOn;
    },

    _action,

    _checkItem(id) {
      _state.checklist[id] = !_state.checklist[id];
      _save();
      _renderChecklist();
    },

    // ── API PÚBLICA ──────────────────────────────────────────────────────────
    start() {
      _load();
      _state.stepAtual = 0;
      _injectCSS();
      const steps = STEPS[_produto] || STEPS.agenda;
      _renderStep(steps[0]);
    },

    reset() {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CHECKLIST_KEY);
      _state = { concluido: false, stepAtual: 0, dados: {}, checklist: {} };
      console.log('[RebecaOnboarding] Reset completo — recarregue a página');
    },

    showChecklist() {
      _load();
      _injectCSS();
      _renderChecklist();
    },

    emptyState: _emptyState,

    // Auto-inicializar no primeiro acesso
    _autoInit() {
      _load();
      if (_state.concluido) {
        // Já fez onboarding — só mostrar checklist
        _injectCSS();
        _renderChecklist();
        return;
      }
      // Primeiro acesso — aguardar DOM estabilizar
      setTimeout(() => {
        // Checar novamente se usuário está logado antes de abrir
        const app = document.getElementById('app');
        if (app && getComputedStyle(app).display === 'none') return;
        _injectCSS();
        const steps = STEPS[_produto] || STEPS.agenda;
        _renderStep(steps[_state.stepAtual]);
      }, 1500);
    },
  };
})();

// Auto-init apenas em páginas de painel (não em landing/login)
(function() {
  const path = location.pathname;
  // Só em páginas de painel explícitas — nunca em raiz / ou index genérico
  const isPanel = path.includes('agenda-adm') || path.includes('delivery-admin') ||
                  path.includes('corrida-admin') || path.includes('master-admin');
  if (!isPanel) return;

  const hasToken = !!(localStorage.getItem('agenda_token') || localStorage.getItem('token') ||
                      localStorage.getItem('prof_token'));
  if (!hasToken) return;

  // Aguardar o #app estar visível (usuário logado de fato)
  function _tryInit() {
    const app = document.getElementById('app');
    const loginTela = document.getElementById('tela-login') || document.getElementById('login');
    // Se a tela de login ainda está visível, não inicializar
    if (loginTela && loginTela.style.display !== 'none' && 
        getComputedStyle(loginTela).display !== 'none') return;
    if (app && (app.style.display === 'none' || getComputedStyle(app).display === 'none')) return;
    RebecaOnboarding._autoInit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(_tryInit, 1200));
  } else {
    setTimeout(_tryInit, 1200);
  }

  // Escutar evento customizado de login bem-sucedido
  document.addEventListener('rebeca:login', () => setTimeout(() => RebecaOnboarding._autoInit(), 600));
})();

console.log('✅ RebecaOnboarding carregado');
console.log('   → RebecaOnboarding.start()       — iniciar wizard');
console.log('   → RebecaOnboarding.showChecklist() — ver checklist');
console.log('   → RebecaOnboarding.reset()         — resetar estado');
