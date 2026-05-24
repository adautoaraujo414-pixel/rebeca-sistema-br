/**
 * rebeca-ai.js — IA Operacional Integrada
 * Versão 1.0
 *
 * Arquitetura híbrida:
 *   1. Engine local (heurísticas + regras) — zero custo, zero latência
 *   2. Claude via /api/ia/chat — enriquece com linguagem natural
 *   3. Cache inteligente — evita spam de tokens
 *
 * USO:
 *   RebecaAI.init()                    — inicializar (automático)
 *   RebecaAI.resumoDia()               — gerar resumo do dia
 *   RebecaAI.insights()                — painel de insights
 *   RebecaAI.alertas()                 — alertas operacionais
 *   RebecaAI.showPanel()               — abrir painel IA
 */

window.RebecaAI = (() => {

  // ── CONFIG ──────────────────────────────────────────────────────────────────
  const CFG = {
    cacheMs:       5 * 60 * 1000,   // 5 min — não chamar IA repetido
    resumoMs:      30 * 60 * 1000,  // 30 min — resumo do dia
    iaEnabled:     true,             // desativar para modo só local
    maxRetry:      2,
  };

  // ── CACHE ───────────────────────────────────────────────────────────────────
  const _cache = {};
  function _cacheGet(key) {
    const e = _cache[key];
    if (!e) return null;
    if (Date.now() - e.ts > e.ttl) { delete _cache[key]; return null; }
    return e.data;
  }
  function _cacheSet(key, data, ttl = CFG.cacheMs) {
    _cache[key] = { data, ts: Date.now(), ttl };
  }

  // ── TOKEN ───────────────────────────────────────────────────────────────────
  function _token() {
    return localStorage.getItem('token') ||
           localStorage.getItem('agenda_token') ||
           localStorage.getItem('soft_token') || '';
  }
  function _adminId() {
    return localStorage.getItem('adminId') ||
           localStorage.getItem('agenda_admin_id') || '';
  }
  function _produto() {
    const t = document.title.toLowerCase();
    if (t.includes('agenda')) return 'agenda';
    if (t.includes('delivery') || t.includes('admin')) return 'delivery';
    if (t.includes('soft') || t.includes('loja')) return 'soft';
    return 'delivery';
  }

  // ── FETCH COM AUTH ──────────────────────────────────────────────────────────
  async function _api(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_token()}`,
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }

  // ── COLETA DE DADOS REAIS ───────────────────────────────────────────────────
  async function _coletarDados() {
    const cached = _cacheGet('dados-operacionais');
    if (cached) return cached;

    const produto = _produto();
    const hoje = new Date().toISOString().split('T')[0];
    const dados = { produto, hoje, ts: Date.now() };

    const fetchSafe = async (url) => {
      try { return await _api(url); } catch { return null; }
    };

    if (produto === 'soft') {
      // Rebeca Soft — financeiro real
      const [operacional, fluxo, lucro, formas] = await Promise.all([
        fetchSafe('/api/soft/financeiro/operacional'),
        fetchSafe('/api/soft/financeiro/fluxo?periodo=7d'),
        fetchSafe('/api/soft/financeiro/lucro?periodo=30d'),
        fetchSafe('/api/soft/financeiro/vendas/formas'),
      ]);
      dados.operacional = operacional;
      dados.fluxo       = fluxo;
      dados.lucro       = lucro;
      dados.formas      = formas;

      // Estoque com alerta
      const estoque = await fetchSafe('/api/soft/estoque/alertas');
      dados.estoqueAlertas = estoque;

      // Caixa atual
      const caixa = await fetchSafe('/api/soft/caixa/atual');
      dados.caixaAtual = caixa;

    } else if (produto === 'delivery') {
      const adminId = _adminId();
      const [pedidos, config] = await Promise.all([
        fetchSafe('/api/delivery/pedidos/ativos'),
        fetchSafe('/api/delivery/config'),
      ]);
      dados.pedidosAtivos = pedidos;
      dados.configDelivery = config;

      // Caixa aberto
      const caixas = await fetchSafe('/api/delivery/caixa/abertos');
      dados.caixaDelivery = caixas;

    } else if (produto === 'agenda') {
      const adminId = _adminId();
      const [agendamentos, financeiro, inativos] = await Promise.all([
        fetchSafe('/api/agenda/agendamentos'),
        fetchSafe('/api/agenda/financeiro/resumo'),
        fetchSafe('/api/agenda/crm/clientes-inativos'),
      ]);
      dados.agendamentosHoje = agendamentos;
      dados.financeiroAgenda = financeiro;
      dados.clientesInativos = inativos;
    }

    _cacheSet('dados-operacionais', dados, 3 * 60 * 1000); // 3 min
    return dados;
  }

  // ── ENGINE LOCAL — HEURÍSTICAS ──────────────────────────────────────────────
  function _analisarLocal(dados) {
    const insights = [];
    const alertas  = [];
    const metricas = {};

    const produto = dados.produto;

    // ── SOFT (Loja/PDV) ──────────────────────────────────────────────────────
    if (produto === 'soft' && dados.operacional) {
      const op = dados.operacional;

      // Vendas hoje
      const vendasHoje = op.vendas_hoje || op.totalVendas || 0;
      const ticketMedio = op.ticket_medio || op.ticketMedio || 0;
      const qtdVendas = op.qtd_vendas || op.quantidadeVendas || 0;

      metricas.vendasHoje = vendasHoje;
      metricas.ticketMedio = ticketMedio;
      metricas.qtdVendas = qtdVendas;

      if (vendasHoje > 0) {
        insights.push({
          tipo: 'vendas',
          icone: '💰',
          titulo: 'Vendas hoje',
          valor: `R$ ${vendasHoje.toFixed(2).replace('.', ',')}`,
          detalhe: `${qtdVendas} venda${qtdVendas !== 1 ? 's' : ''} • Ticket médio R$ ${ticketMedio.toFixed(2).replace('.', ',')}`,
          prioridade: 1,
        });
      }

      // Caixa baixo
      if (dados.caixaAtual) {
        const saldo = dados.caixaAtual.saldo || dados.caixaAtual.valorAbertura || 0;
        if (saldo < 100) {
          alertas.push({
            tipo: 'caixa_baixo',
            icone: '⚠️',
            titulo: 'Caixa baixo',
            msg: `Saldo atual: R$ ${saldo.toFixed(2).replace('.', ',')}`,
            prioridade: 'alta',
          });
        }
      }

      // Estoque crítico
      if (dados.estoqueAlertas?.length > 0) {
        const criticos = dados.estoqueAlertas.filter(e => e.quantidade <= (e.estoqueMinimo || 0));
        if (criticos.length > 0) {
          alertas.push({
            tipo: 'estoque_critico',
            icone: '📦',
            titulo: `${criticos.length} produto${criticos.length > 1 ? 's' : ''} com estoque crítico`,
            msg: criticos.slice(0, 3).map(e => e.nome || e.produtoNome).join(', '),
            prioridade: 'alta',
          });
        }
      }

      // Tendência (fluxo 7 dias)
      if (dados.fluxo?.dias?.length >= 2) {
        const dias = dados.fluxo.dias;
        const ontem = dias[dias.length - 2]?.receita || 0;
        const hoje  = dias[dias.length - 1]?.receita || 0;
        if (ontem > 0) {
          const var_pct = ((hoje - ontem) / ontem * 100).toFixed(0);
          const subiu = hoje >= ontem;
          insights.push({
            tipo: 'tendencia',
            icone: subiu ? '📈' : '📉',
            titulo: subiu ? `Vendas ${var_pct}% acima de ontem` : `Vendas ${Math.abs(var_pct)}% abaixo de ontem`,
            valor: '',
            detalhe: `Ontem: R$ ${ontem.toFixed(2).replace('.', ',')} → Hoje: R$ ${hoje.toFixed(2).replace('.', ',')}`,
            prioridade: subiu ? 2 : 1,
          });
        }
      }
    }

    // ── DELIVERY ─────────────────────────────────────────────────────────────
    if (produto === 'delivery' && dados.pedidosAtivos) {
      const pedidos = Array.isArray(dados.pedidosAtivos)
        ? dados.pedidosAtivos
        : dados.pedidosAtivos?.pedidos || [];

      const ativos    = pedidos.length;
      const atrasados = pedidos.filter(p => {
        if (!p.createdAt && !p.criadoEm) return false;
        const criado = new Date(p.createdAt || p.criadoEm);
        return (Date.now() - criado) > 45 * 60 * 1000; // > 45min
      });

      metricas.pedidosAtivos = ativos;
      metricas.pedidosAtrasados = atrasados.length;

      if (ativos > 0) {
        insights.push({
          tipo: 'pedidos',
          icone: '🛵',
          titulo: `${ativos} pedido${ativos !== 1 ? 's' : ''} em andamento`,
          valor: '',
          detalhe: atrasados.length > 0
            ? `⚠️ ${atrasados.length} atrasado${atrasados.length > 1 ? 's' : ''}`
            : 'Todos dentro do prazo',
          prioridade: atrasados.length > 0 ? 1 : 2,
        });
      }

      if (atrasados.length > 0) {
        alertas.push({
          tipo: 'pedidos_atrasados',
          icone: '⏰',
          titulo: `${atrasados.length} pedido${atrasados.length > 1 ? 's atrasados' : ' atrasado'}`,
          msg: 'Pedidos com mais de 45 minutos sem atualização',
          prioridade: 'critica',
        });
      }
    }

    // ── AGENDA ───────────────────────────────────────────────────────────────
    if (produto === 'agenda') {
      const agends = Array.isArray(dados.agendamentosHoje)
        ? dados.agendamentosHoje
        : dados.agendamentosHoje?.agendamentos || [];

      const hoje = new Date().toISOString().split('T')[0];
      const agendHoje = agends.filter(a => {
        const d = (a.data || a.dataHora || '').split('T')[0];
        return d === hoje;
      });

      metricas.agendamentosHoje = agendHoje.length;

      if (agendHoje.length > 0) {
        insights.push({
          tipo: 'agenda',
          icone: '📅',
          titulo: `${agendHoje.length} agendamento${agendHoje.length !== 1 ? 's' : ''} hoje`,
          valor: '',
          detalhe: `Próximo: ${agendHoje[0]?.horario || agendHoje[0]?.hora || '—'}`,
          prioridade: 1,
        });
      }

      // Clientes inativos
      const inativos = dados.clientesInativos?.clientes || dados.clientesInativos || [];
      if (inativos.length > 0) {
        insights.push({
          tipo: 'crm',
          icone: '👥',
          titulo: `${inativos.length} cliente${inativos.length !== 1 ? 's' : ''} sem visitar`,
          valor: '',
          detalhe: `${inativos[0]?.nome || 'Cliente'} — ${inativos[0]?.diasSemVisita || '?'} dias sem agendar`,
          prioridade: 3,
        });
      }

      // Resumo financeiro
      if (dados.financeiroAgenda) {
        const rec = dados.financeiroAgenda.receitaTotal || dados.financeiroAgenda.total || 0;
        if (rec > 0) {
          insights.push({
            tipo: 'financeiro',
            icone: '💰',
            titulo: 'Receita do mês',
            valor: `R$ ${rec.toFixed(2).replace('.', ',')}`,
            detalhe: '',
            prioridade: 2,
          });
        }
      }
    }

    return { insights, alertas, metricas };
  }

  // ── CLAUDE — ENRIQUECER COM LINGUAGEM NATURAL ──────────────────────────────
  async function _gerarResumoIA(dados, analise) {
    const cacheKey = `resumo-ia-${dados.produto}-${dados.hoje}`;
    const cached = _cacheGet(cacheKey);
    if (cached) return cached;

    if (!CFG.iaEnabled) return null;

    const { metricas, alertas, insights } = analise;
    const produto = dados.produto;

    // Construir contexto compacto para a IA (economizar tokens)
    const ctx = {
      produto,
      data: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      metricas,
      alertas: alertas.map(a => ({ tipo: a.tipo, titulo: a.titulo })),
      insights: insights.map(i => ({ tipo: i.tipo, titulo: i.titulo, valor: i.valor })),
    };

    const prompt = `Você é a Rebeca, assistente executiva de um negócio ${
      produto === 'agenda' ? 'de beleza/estética' :
      produto === 'delivery' ? 'de delivery/restaurante' :
      'de varejo/loja'
    }. 

Gere um resumo executivo do dia em NO MÁXIMO 3 frases, em linguagem natural e direta.
Use dados reais fornecidos. Tom: profissional mas humano. Sem listas.
Se as métricas forem boas, celebre. Se houver alertas, mencione com solução.

Dados: ${JSON.stringify(ctx)}

Responda APENAS o resumo, sem explicações.`;

    try {
      const res = await _api('/api/ia/resumo-operacional', {
        method: 'POST',
        body: JSON.stringify({ metricas, alertas: analise.alertas, produto, contexto: 'resumo-operacional' }),
      });

      const resumo = res.resposta || res.texto || res.content || '';
      if (resumo) {
        _cacheSet(cacheKey, resumo, CFG.resumoMs);
        return resumo;
      }
    } catch(e) {
      console.warn('[RebecaAI] IA indisponível, usando modo local:', e.message);
    }

    // Fallback local — gerar resumo por regras
    return _resumoLocal(analise, dados);
  }

  function _resumoLocal(analise, dados) {
    const { metricas, alertas, insights } = analise;
    const hora = new Date().getHours();
    const turno = hora < 12 ? 'manhã' : hora < 18 ? 'tarde' : 'noite';

    const partes = [];

    if (metricas.vendasHoje > 0) {
      partes.push(`Bom ${turno}! Suas vendas hoje já somam R$ ${metricas.vendasHoje.toFixed(2).replace('.', ',')}.`);
    } else if (metricas.agendamentosHoje > 0) {
      partes.push(`Bom ${turno}! Você tem ${metricas.agendamentosHoje} agendamento${metricas.agendamentosHoje !== 1 ? 's' : ''} hoje.`);
    } else if (metricas.pedidosAtivos > 0) {
      partes.push(`Bom ${turno}! Há ${metricas.pedidosAtivos} pedido${metricas.pedidosAtivos !== 1 ? 's' : ''} em andamento.`);
    } else {
      partes.push(`Bom ${turno}! Seu painel está atualizado e monitorando tudo.`);
    }

    if (alertas.length > 0) {
      const critico = alertas.find(a => a.prioridade === 'critica' || a.prioridade === 'alta');
      if (critico) partes.push(`Atenção: ${critico.titulo}.`);
    }

    if (insights.length > 1) {
      const destaque = insights.find(i => i.tipo === 'tendencia');
      if (destaque) partes.push(destaque.titulo + '.');
    }

    return partes.join(' ');
  }

  // ── SUGESTÕES AUTOMÁTICAS ──────────────────────────────────────────────────
  function _gerarSugestoes(dados, analise) {
    const sugestoes = [];
    const { metricas, alertas } = analise;
    const hora = new Date().getHours();

    // Horário de pico próximo
    if (hora >= 17 && hora <= 18) {
      sugestoes.push({
        icone: '⚡',
        texto: 'Pico de pedidos em breve (18h–20h). Verifique estoque e equipe.',
        acao: null,
      });
    }

    // Estoque crítico → sugestão de compra
    if (dados.estoqueAlertas?.length > 0) {
      const criticos = dados.estoqueAlertas.filter(e => e.quantidade <= (e.estoqueMinimo || 0));
      criticos.slice(0, 2).forEach(item => {
        sugestoes.push({
          icone: '📦',
          texto: `Repor ${item.nome || item.produtoNome} — estoque em ${item.quantidade} unidade${item.quantidade !== 1 ? 's' : ''}.`,
          acao: 'verEstoque',
        });
      });
    }

    // Clientes inativos → sugestão de reengajamento
    if (dados.clientesInativos?.length > 0) {
      const inativos = Array.isArray(dados.clientesInativos)
        ? dados.clientesInativos
        : dados.clientesInativos?.clientes || [];
      if (inativos.length >= 3) {
        sugestoes.push({
          icone: '💬',
          texto: `${inativos.length} clientes sem visitar há mais de 20 dias. Envie uma mensagem de retorno.`,
          acao: 'verClientes',
        });
      }
    }

    // Pedidos atrasados
    if (metricas.pedidosAtrasados > 0) {
      sugestoes.push({
        icone: '⏰',
        texto: `${metricas.pedidosAtrasados} pedido${metricas.pedidosAtrasados > 1 ? 's atrasados' : ' atrasado'}. Verifique a cozinha e entregadores.`,
        acao: 'verPedidos',
      });
    }

    // Final do dia
    if (hora >= 20) {
      sugestoes.push({
        icone: '🔒',
        texto: 'Fim do expediente se aproximando. Lembre de fechar o caixa.',
        acao: 'fecharCaixa',
      });
    }

    return sugestoes.slice(0, 4);
  }

  // ── CSS ──────────────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('rai-css')) return;
    const s = document.createElement('style');
    s.id = 'rai-css';
    s.textContent = `
      /* ── PAINEL IA ── */
      #rai-panel {
        position:fixed;top:0;left:0;right:0;bottom:0;
        z-index:99985;
        display:flex;align-items:flex-start;justify-content:flex-end;
        pointer-events:none;
      }
      #rai-drawer {
        width:420px;max-width:100vw;height:100vh;
        background:#fff;
        box-shadow:-12px 0 48px rgba(0,0,0,.15);
        display:flex;flex-direction:column;
        transform:translateX(100%);
        transition:transform .4s cubic-bezier(.16,1,.3,1);
        pointer-events:all;
        overflow:hidden;
      }
      #rai-drawer.open { transform:translateX(0); }

      /* ── HEADER ── */
      #rai-header {
        background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
        padding:20px 24px;flex-shrink:0;
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      #rai-header .rai-logo {
        display:flex;align-items:center;gap:10px;margin-bottom:16px;
      }
      #rai-header .rai-logo-icon {
        width:36px;height:36px;border-radius:10px;
        background:linear-gradient(135deg,#f97316,#fb923c);
        display:flex;align-items:center;justify-content:center;
        font-size:18px;
      }
      #rai-header .rai-logo-txt {
        font-size:.88rem;font-weight:800;color:#f8fafc;
        letter-spacing:.03em;
      }
      #rai-header .rai-logo-sub {
        font-size:.7rem;color:#64748b;font-weight:400;
      }
      #rai-header .rai-close {
        position:absolute;top:20px;right:20px;
        background:rgba(255,255,255,.08);border:none;
        color:#94a3b8;width:30px;height:30px;border-radius:8px;
        cursor:pointer;font-size:14px;
        display:flex;align-items:center;justify-content:center;
        transition:all .15s;
      }
      #rai-header .rai-close:hover { background:rgba(255,255,255,.15);color:#f8fafc; }

      /* ── RESUMO ── */
      #rai-resumo {
        background:linear-gradient(135deg,#0f172a,#1e293b);
        padding:0 24px 24px;flex-shrink:0;
      }
      #rai-resumo .rai-resumo-txt {
        font-size:.88rem;color:#cbd5e1;line-height:1.7;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
        border-radius:12px;padding:14px 16px;
        position:relative;
      }
      #rai-resumo .rai-resumo-label {
        font-size:.68rem;color:#f97316;font-weight:700;
        letter-spacing:.06em;text-transform:uppercase;
        margin-bottom:6px;display:flex;align-items:center;gap:5px;
      }
      #rai-resumo .rai-dot {
        width:6px;height:6px;border-radius:50%;background:#f97316;
        animation:rai-pulse 2s infinite;
      }
      @keyframes rai-pulse {
        0%,100%{opacity:1} 50%{opacity:.4}
      }

      /* ── BODY ── */
      #rai-body { flex:1;overflow-y:auto;padding:20px 24px; }

      /* ── SECTION ── */
      .rai-section-title {
        font-size:.72rem;font-weight:700;color:#94a3b8;
        letter-spacing:.07em;text-transform:uppercase;
        margin:0 0 10px;display:flex;align-items:center;gap:6px;
      }
      .rai-section-title::after {
        content:'';flex:1;height:1px;background:#f1f5f9;
      }

      /* ── INSIGHT CARDS ── */
      .rai-insights { display:flex;flex-direction:column;gap:8px;margin-bottom:20px; }
      .rai-insight-card {
        background:#f8fafc;border:1.5px solid #f1f5f9;
        border-radius:12px;padding:12px 14px;
        display:flex;align-items:flex-start;gap:12px;
        transition:border-color .15s,background .15s;cursor:default;
      }
      .rai-insight-card:hover { border-color:#f97316;background:#fff7ed; }
      .rai-insight-card.prioridade-1 { border-color:#fde68a;background:#fffbeb; }
      .rai-insight-icon {
        font-size:22px;width:36px;height:36px;
        display:flex;align-items:center;justify-content:center;
        background:#fff;border-radius:8px;border:1px solid #f1f5f9;
        flex-shrink:0;
      }
      .rai-insight-txt { flex:1;min-width:0; }
      .rai-insight-titulo {
        font-size:.83rem;font-weight:700;color:#0f172a;margin-bottom:2px;
      }
      .rai-insight-valor {
        font-size:1.1rem;font-weight:800;color:#f97316;
        line-height:1.2;margin-bottom:2px;
      }
      .rai-insight-detalhe {
        font-size:.74rem;color:#64748b;line-height:1.4;
      }

      /* ── ALERTAS ── */
      .rai-alertas { display:flex;flex-direction:column;gap:8px;margin-bottom:20px; }
      .rai-alerta-card {
        border-radius:10px;padding:10px 14px;
        display:flex;align-items:center;gap:10px;
        border-left:4px solid;
      }
      .rai-alerta-card.critica { background:#fef2f2;border-color:#ef4444; }
      .rai-alerta-card.alta    { background:#fffbeb;border-color:#f59e0b; }
      .rai-alerta-card.media   { background:#eff6ff;border-color:#3b82f6; }
      .rai-alerta-icon { font-size:18px;flex-shrink:0; }
      .rai-alerta-txt { flex:1; }
      .rai-alerta-titulo { font-size:.8rem;font-weight:700;color:#0f172a; }
      .rai-alerta-msg    { font-size:.74rem;color:#64748b;margin-top:2px; }

      /* ── SUGESTÕES ── */
      .rai-sugestoes { display:flex;flex-direction:column;gap:8px;margin-bottom:20px; }
      .rai-sugestao {
        background:#f8fafc;border:1.5px dashed #e2e8f0;
        border-radius:10px;padding:10px 14px;
        display:flex;align-items:flex-start;gap:10px;
        cursor:default;transition:border-color .15s;
      }
      .rai-sugestao:hover { border-color:#f97316; }
      .rai-sug-icon { font-size:16px;flex-shrink:0;margin-top:1px; }
      .rai-sug-txt { flex:1;font-size:.79rem;color:#475569;line-height:1.5; }
      .rai-sug-btn {
        font-size:.72rem;color:#f97316;font-weight:600;
        background:none;border:none;cursor:pointer;
        white-space:nowrap;padding:0;font-family:inherit;
      }
      .rai-sug-btn:hover { text-decoration:underline; }

      /* ── FOOTER ── */
      #rai-footer {
        padding:16px 24px;border-top:1px solid #f1f5f9;
        display:flex;align-items:center;justify-content:space-between;
        flex-shrink:0;
      }
      #rai-footer .rai-refresh {
        display:flex;align-items:center;gap:6px;
        font-size:.74rem;color:#94a3b8;cursor:pointer;
        background:none;border:none;font-family:inherit;
        transition:color .15s;
      }
      #rai-footer .rai-refresh:hover { color:#f97316; }
      #rai-footer .rai-ts { font-size:.68rem;color:#cbd5e1; }

      /* ── FAB ── */
      #rai-fab {
        position:fixed;bottom:72px;left:16px;
        width:48px;height:48px;border-radius:50%;
        background:linear-gradient(135deg,#0f172a,#1e293b);
        color:#f97316;border:2px solid #f97316;
        cursor:pointer;font-size:20px;z-index:99984;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 20px rgba(249,115,22,.3);
        transition:all .2s;
      }
      #rai-fab:hover { transform:scale(1.08);box-shadow:0 6px 28px rgba(249,115,22,.4); }
      #rai-fab .rai-fab-badge {
        position:absolute;top:-4px;right:-4px;
        width:16px;height:16px;border-radius:50%;
        background:#ef4444;color:#fff;
        font-size:9px;font-weight:800;
        display:none;align-items:center;justify-content:center;
        border:2px solid #fff;
      }

      /* ── LOADING ── */
      .rai-loading {
        display:flex;flex-direction:column;align-items:center;
        justify-content:center;padding:40px;gap:12px;
      }
      .rai-spinner {
        width:32px;height:32px;border-radius:50%;
        border:3px solid #f1f5f9;border-top-color:#f97316;
        animation:rai-spin .8s linear infinite;
      }
      @keyframes rai-spin { to{transform:rotate(360deg)} }
      .rai-loading-txt { font-size:.8rem;color:#94a3b8; }

      /* ── OVERLAY ── */
      #rai-overlay {
        position:fixed;inset:0;background:rgba(0,0,0,.3);
        z-index:99983;backdrop-filter:blur(2px);
        opacity:0;transition:opacity .3s;pointer-events:none;
      }
      #rai-overlay.visible { opacity:1;pointer-events:all; }

      /* ── MOBILE ── */
      @media(max-width:480px) {
        #rai-drawer { width:100vw; }
        #rai-body { padding:16px; }
        #rai-header { padding:16px 20px; }
        #rai-resumo { padding:0 20px 20px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── RENDER PAINEL ─────────────────────────────────────────────────────────
  let _drawer = null;
  let _overlay = null;
  let _lastUpdate = null;
  let _lastAnalise = null;

  function _buildUI() {
    if (document.getElementById('rai-panel')) return;
    _injectCSS();

    // Overlay
    _overlay = document.createElement('div');
    _overlay.id = 'rai-overlay';
    _overlay.onclick = () => RebecaAI.closePanel();
    document.body.appendChild(_overlay);

    // Panel + Drawer
    const panel = document.createElement('div');
    panel.id = 'rai-panel';
    panel.innerHTML = `
      <div id="rai-drawer">
        <div id="rai-header" style="position:relative">
          <div class="rai-logo">
            <div class="rai-logo-icon">✦</div>
            <div>
              <div class="rai-logo-txt">Rebeca IA</div>
              <div class="rai-logo-sub">Assistente Executiva</div>
            </div>
          </div>
          <button class="rai-close" onclick="RebecaAI.closePanel()">✕</button>
        </div>
        <div id="rai-resumo">
          <div class="rai-resumo-label">
            <span class="rai-dot"></span> Resumo do dia
          </div>
          <div class="rai-resumo-txt" id="rai-resumo-txt">
            Carregando inteligência operacional...
          </div>
        </div>
        <div id="rai-body">
          <div class="rai-loading">
            <div class="rai-spinner"></div>
            <div class="rai-loading-txt">Analisando seus dados...</div>
          </div>
        </div>
        <div id="rai-footer">
          <button class="rai-refresh" onclick="RebecaAI.refresh()">
            🔄 Atualizar análise
          </button>
          <span class="rai-ts" id="rai-ts">—</span>
        </div>
      </div>`;
    document.body.appendChild(panel);
    _drawer = document.getElementById('rai-drawer');

    // FAB
    // rai-fab desativado — botão flutuante removido
    // Para acessar a IA: RebecaAI.showPanel()
  }

  function _renderBody(analise, sugestoes) {
    const body = document.getElementById('rai-body');
    if (!body) return;

    const { insights, alertas } = analise;

    let html = '';

    // Alertas primeiro (se houver)
    if (alertas.length > 0) {
      html += `<div class="rai-section-title">⚠️ Alertas</div>
        <div class="rai-alertas">
          ${alertas.map(a => `
            <div class="rai-alerta-card ${a.prioridade}">
              <span class="rai-alerta-icon">${a.icone}</span>
              <div class="rai-alerta-txt">
                <div class="rai-alerta-titulo">${a.titulo}</div>
                ${a.msg ? `<div class="rai-alerta-msg">${a.msg}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>`;

      // Badge no FAB
      const badge = document.getElementById('rai-fab-badge');
      if (badge) {
        badge.textContent = alertas.length;
        badge.style.display = 'flex';
      }
    }

    // Insights
    if (insights.length > 0) {
      html += `<div class="rai-section-title">📊 Insights</div>
        <div class="rai-insights">
          ${insights.sort((a,b) => a.prioridade - b.prioridade).map(i => `
            <div class="rai-insight-card prioridade-${i.prioridade}">
              <div class="rai-insight-icon">${i.icone}</div>
              <div class="rai-insight-txt">
                <div class="rai-insight-titulo">${i.titulo}</div>
                ${i.valor ? `<div class="rai-insight-valor">${i.valor}</div>` : ''}
                ${i.detalhe ? `<div class="rai-insight-detalhe">${i.detalhe}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>`;
    }

    // Sugestões
    if (sugestoes.length > 0) {
      html += `<div class="rai-section-title">💡 Sugestões</div>
        <div class="rai-sugestoes">
          ${sugestoes.map(s => `
            <div class="rai-sugestao">
              <span class="rai-sug-icon">${s.icone}</span>
              <span class="rai-sug-txt">${s.texto}</span>
              ${s.acao ? `<button class="rai-sug-btn" onclick="RebecaAI._acao('${s.acao}')">Ver →</button>` : ''}
            </div>`).join('')}
        </div>`;
    }

    if (!html) {
      html = `<div style="text-align:center;padding:40px 20px;color:#94a3b8">
        <div style="font-size:32px;margin-bottom:12px">✅</div>
        <div style="font-weight:600;color:#475569;margin-bottom:6px">Tudo em ordem</div>
        <div style="font-size:.8rem">Nenhum alerta ou insight crítico no momento.</div>
      </div>`;
    }

    body.innerHTML = html;

    // Timestamp
    const ts = document.getElementById('rai-ts');
    if (ts) ts.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  // ── AÇÕES ──────────────────────────────────────────────────────────────────
  function _acao(nome) {
    const acoes = {
      verEstoque:  () => window.mostrarTela?.('estoque'),
      verClientes: () => window.mostrarTela?.('clientes'),
      verPedidos:  () => window.mostrarTela?.('pedidos'),
      fecharCaixa: () => window.mostrarTela?.('caixa'),
    };
    (acoes[nome] || (() => {}))();
    RebecaAI.closePanel();
  }

  // ── LOOP AUTOMÁTICO ────────────────────────────────────────────────────────
  let _autoTimer = null;

  function _startAuto() {
    // Verificar alertas a cada 5 minutos em background (sem abrir painel)
    _autoTimer = setInterval(async () => {
      try {
        const dados   = await _coletarDados();
        const analise = _analisarLocal(dados);
        _lastAnalise = analise;

        // Notificar alertas críticos via RebecaNotify
        analise.alertas.forEach(a => {
          if (a.prioridade === 'critica' && window.RebecaNotify) {
            RebecaNotify.alerta({ titulo: a.titulo, msg: a.msg });
          }
        });

        // Atualizar badge do FAB
        const badge = document.getElementById('rai-fab-badge');
        if (badge) {
          const n = analise.alertas.length;
          badge.textContent = n || '';
          badge.style.display = n > 0 ? 'flex' : 'none';
        }
      } catch(e) {}
    }, 5 * 60 * 1000); // 5 min
  }

  // ── API PÚBLICA ────────────────────────────────────────────────────────────
  return {
    async init() {
      // Só inicializar em painéis logados
      const hasToken = !!(localStorage.getItem('token') ||
                          localStorage.getItem('agenda_token') ||
                          localStorage.getItem('soft_token'));
      if (!hasToken) return;

      _injectCSS();
      _buildUI();

      // Primeira análise em background após 10s
      setTimeout(() => this.refresh(false), 10000);

      // Loop automático
      _startAuto();

      console.log('[RebecaAI] ✅ Inicializado');
    },

    async refresh(abrirPainel = false) {
      try {
        const dados   = await _coletarDados();
        const analise = _analisarLocal(dados);
        const resumo  = await _gerarResumoIA(dados, analise);
        const sugest  = _gerarSugestoes(dados, analise);

        _lastAnalise = analise;
        _lastUpdate = new Date();

        // Atualizar resumo
        const rEl = document.getElementById('rai-resumo-txt');
        if (rEl && resumo) rEl.textContent = resumo;

        // Atualizar body
        _renderBody(analise, sugest);

        if (abrirPainel) this.showPanel();

      } catch(e) {
        console.warn('[RebecaAI] Erro refresh:', e);
        const body = document.getElementById('rai-body');
        if (body) body.innerHTML = `
          <div style="text-align:center;padding:40px;color:#94a3b8">
            <div style="font-size:28px;margin-bottom:8px">📡</div>
            <div style="font-size:.8rem">Sem dados disponíveis no momento.</div>
          </div>`;
      }
    },

    showPanel() {
      if (!_drawer) _buildUI();
      _drawer?.classList.add('open');
      _overlay?.classList.add('visible');
      // Se dados antigos (>5min), atualizar
      if (!_lastUpdate || Date.now() - _lastUpdate > CFG.cacheMs) {
        this.refresh(false);
      }
    },

    closePanel() {
      _drawer?.classList.remove('open');
      _overlay?.classList.remove('visible');
    },

    _acao,

    // Expor para debug
    dados: () => _coletarDados(),
    analise: () => _lastAnalise,
  };
})();

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => RebecaAI.init());
} else {
  setTimeout(() => RebecaAI.init(), 500);
}

console.log('✅ RebecaAI carregado');
console.log('   → RebecaAI.showPanel()  — abrir painel IA');
console.log('   → RebecaAI.refresh()    — forçar atualização');
