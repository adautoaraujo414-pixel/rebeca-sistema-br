'use strict';

/**
 * agenda-action-router.js
 * Registry declarativo de intenções → handlers.
 * NUNCA toma decisões de negócio — apenas roteia.
 * Handlers recebem ctx e retornam { resposta: string } ou null.
 */

// ── Helpers de personalidade (inline para não criar dependência circular) ──
const _chefes = ['chefe','chefão','chefa','patrão','patroa'];
let _ci = 0;
const chefe  = () => _chefes[_ci++ % _chefes.length];
const fmtHora = d => d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const fmtData = d => d.toLocaleDateString('pt-BR');

// ── MENU SEGURO — resposta quando intenção não reconhecida ou confidence baixa ──
function respostaSegura(motivo = '') {
  return `Não entendi direito${motivo ? ' — ' + motivo : ''}, ${chefe()}. 🤔\n\nPosso te ajudar com:\n📅 *agenda* hoje/amanhã/semana\n💰 *financeiro* hoje/semana\n👤 *clientes* inativos/histórico\n⏰ *lembretes*\n🔒 *bloquear* horários\n\nTenta de outro jeito! 💙`;
}

// ── HANDLERS ─────────────────────────────────────────────────────────────────

function handlerFinanceiroHoje({ dados }) {
  const { entradasHoje, saidasHoje, nomeNegocio } = dados;
  const resultado = entradasHoje - saidasHoje;
  return `💰 Financeiro de hoje:\n\nEntradas: R$ ${entradasHoje.toFixed(2)}${entradasHoje===0?' (nenhuma ainda)':''}\nSaídas: R$ ${saidasHoje.toFixed(2)}\nResultado: R$ ${resultado.toFixed(2)}${resultado > 0?' 🟢':resultado < 0?' 🔴':' ⚪'}`;
}

function handlerFinanceiroSemana({ dados }) {
  const { receitaSemana } = dados;
  return `📊 Semana (últimos 7 dias):\n\nReceita: R$ ${receitaSemana.toFixed(2)}${receitaSemana===0?' (nenhuma registrada ainda)':''}`;
}

function handlerAgendaHoje({ dados }) {
  const { agsHoje, resumoHoje } = dados;
  if (!agsHoje.length) return `📅 Agenda livre hoje, ${chefe()}! Quer encaixar alguém? 🎉`;
  return `📅 Agenda de hoje (${agsHoje.length}):\n\n${resumoHoje}`;
}

function handlerAgendaAmanha({ dados }) {
  const { agsAmanha, resumoAmanha } = dados;
  if (!agsAmanha.length) return `📅 Amanhã tá livre, ${chefe()}! 🎉`;
  return `📅 Amanhã (${agsAmanha.length}):\n\n${resumoAmanha}`;
}

function handlerProximoCliente({ dados }) {
  const { agsHoje } = dados;
  const agora = new Date();
  const prox = agsHoje.find(a => new Date(a.dataHora) > agora);
  if (!prox) return `Sem mais clientes hoje, ${chefe()}! 🎉 Missão cumprida!`;
  return `⏭️ Próximo: *${prox.nomeCliente}* às ${fmtHora(new Date(prox.dataHora))} — ${prox.nomeServico || 'serviço'}`;
}

function handlerLembretes({ dados }) {
  const { resumoLembretes } = dados;
  if (!resumoLembretes || resumoLembretes.trim() === '' || resumoLembretes === 'nenhum') {
    return `Sem lembretes pendentes, ${chefe()}! ✅ Tudo em dia.`;
  }
  return `⏰ Lembretes pendentes:\n\n${resumoLembretes}`;
}

function handlerFaltaram({ dados }) {
  const { resumoFaltaram } = dados;
  return `😕 Faltaram hoje:\n\n${resumoFaltaram}`;
}

function handlerSaudacao() {
  const saudacoes = ['Oi','Olá','Ei','Opa'];
  const s = saudacoes[Math.floor(Math.random()*saudacoes.length)];
  return `${s}, ${chefe()}! 😊 Tô por aqui, pode mandar!`;
}

function handlerAjuda() {
  return `Oi ${chefe()}! Posso te ajudar com:\n\n📅 *Agenda*: hoje, amanhã, semana, próximo cliente\n💰 *Financeiro*: hoje, semana, registrar entrada/saída\n👤 *Clientes*: inativos, histórico, encaixar\n⏰ *Lembretes*: criar, listar\n🔒 *Agenda*: bloquear horário, fechar dia\n\nDigita o que precisar!`;
}

function handlerConfiancaBaixa({ intent }) {
  const msgs = {
    registrar_receita: 'Para registrar entrada, fala assim: *Rebeca, entrada de R$120 no Pix*',
    registrar_despesa: 'Para registrar gasto, fala assim: *Rebeca, gasto de R$50 em produto*',
    cancelar_agendamento: 'Para cancelar, fala assim: *cancela a Maria das 14h* ou *Maria não vem*',
    bloquear_horario: 'Para bloquear, fala assim: *bloqueia amanhã das 12h às 14h*',
    fechar_dia: 'Para fechar o dia, fala: *fecha a agenda de amanhã*',
    mandar_mensagem: 'Para mandar mensagem, fala: *manda mensagem pra Maria: confirmado*',
  };
  const dica = msgs[intent.intencao] || '';
  return `Não tive certeza do que você quis fazer, ${chefe()}. 🤔${dica ? '\n\n' + dica : ''}\n\nTenta de outro jeito ou digita *ajuda*!`;
}

// ── REGISTRY DECLARATIVO ─────────────────────────────────────────────────────
// Intenções que são tratadas diretamente pelos handlers de dados acima
const REGISTRY = {
  financeiro_hoje:    handlerFinanceiroHoje,
  financeiro_semana:  handlerFinanceiroSemana,
  financeiro_mes:     handlerFinanceiroSemana, // reutiliza semana como fallback
  agenda_hoje:        handlerAgendaHoje,
  agenda_amanha:      handlerAgendaAmanha,
  proximo_cliente:    handlerProximoCliente,
  listar_lembretes:   handlerLembretes,
  faltaram:           handlerFaltaram,
  relatorio_financeiro: ({ dados }) => {
    const { entradasHoje, saidasHoje, receitaSemana } = dados;
    const resultado = (entradasHoje||0) - (saidasHoje||0);
    return `📊 Resumo do dia:\n\nEntradas: R$ ${Number(entradasHoje||0).toFixed(2)}\nSaídas: R$ ${Number(saidasHoje||0).toFixed(2)}\nResultado: R$ ${resultado.toFixed(2)}${resultado > 0?' 🟢':resultado < 0?' 🔴':' ⚪'}\n\nSemana: R$ ${Number(receitaSemana||0).toFixed(2)}`;
  },
  saudacao:           handlerSaudacao,
  ajuda:              handlerAjuda,
};

// Intenções que precisam de lógica complexa já existente no modo-dono
// Retornar null = deixar o service original tratar via handlers existentes
const DELEGAR_AO_SERVICE = new Set([
  'registrar_receita','registrar_despesa',
  'agenda_semana','clientes_inativos','clientes_novos','clientes_confirmados',
  'historico_cliente','encaixar_cliente',
  'cancelar_agendamento','confirmar_agendamento',
  'bloquear_horario','fechar_dia','liberar_agenda',
  'criar_lembrete','aniversariantes','servicos_mais_pedidos',
  'resumo_semanal','resumo_mensal','mandar_mensagem',
]);

/**
 * Roteia intenção para handler.
 * Retorna string (resposta) | null (delegar ao service) | 'SEGURO' (menu seguro)
 */
function rotear(intent, ctx) {
  const { intencao, confiancaSuficiente } = intent;

  // Confidence insuficiente para intenções críticas
  if (!confiancaSuficiente) {
    return handlerConfiancaBaixa({ intent });
  }

  // Intenção não reconhecida
  if (intencao === 'fora_escopo') {
    return intent.resposta_direta || respostaSegura();
  }

  // Resposta direta do parser (saudação simples, fora escopo com contexto)
  if (intent.resposta_direta && ['saudacao','fora_escopo'].includes(intencao)) {
    return intent.resposta_direta;
  }

  // Handler direto no registry
  if (REGISTRY[intencao]) {
    try {
      return REGISTRY[intencao](ctx);
    } catch(e) {
      console.error('[ActionRouter] handler erro:', intencao, e.message);
      return respostaSegura('erro interno');
    }
  }

  // Delegar ao service (handlers complexos já existentes)
  if (DELEGAR_AO_SERVICE.has(intencao)) {
    return null; // sinal para o service continuar com lógica existente
  }

  // Fallback seguro — NUNCA deixa IA livre
  return respostaSegura();
}

module.exports = { rotear, respostaSegura, DELEGAR_AO_SERVICE };
