'use strict';

/**
 * agenda-intent-parser.js
 * Responsável APENAS por identificar intenção + entidades via Claude.
 * Retorna JSON validado. NUNCA responde ao usuário.
 */

const INTENCOES_VALIDAS = new Set([
  'financeiro_hoje','financeiro_semana','financeiro_mes',
  'registrar_receita','registrar_despesa',
  'agenda_hoje','agenda_amanha','agenda_semana',
  'proximo_cliente','clientes_inativos','clientes_novos','clientes_confirmados',
  'historico_cliente','encaixar_cliente',
  'cancelar_agendamento','confirmar_agendamento',
  'bloquear_horario','fechar_dia','liberar_agenda',
  'criar_lembrete','listar_lembretes',
  'aniversariantes','servicos_mais_pedidos',
  'resumo_semanal','resumo_mensal',
  'mandar_mensagem','ajuda','saudacao',
  'confirmar_pendente','cancelar_pendente',
  'fora_escopo'
]);

// Intenções críticas que exigem confidence >= 0.90
const INTENCOES_CRITICAS = new Set([
  'registrar_receita','registrar_despesa',
  'cancelar_agendamento','fechar_dia',
  'bloquear_horario','liberar_agenda','mandar_mensagem'
]);

const CONFIDENCE_MINIMA_PADRAO  = 0.75;
const CONFIDENCE_MINIMA_CRITICA = 0.90;

function _intentVazio() {
  return { intencao: 'fora_escopo', entidades: {}, confianca: 0, resposta_direta: null };
}

function _validar(parsed) {
  if (!parsed || typeof parsed !== 'object') return _intentVazio();
  const intencao = INTENCOES_VALIDAS.has(parsed.intencao) ? parsed.intencao : 'fora_escopo';
  const confianca = typeof parsed.confianca === 'number'
    ? Math.min(1, Math.max(0, parsed.confianca)) : 0;
  const entidades = (parsed.entidades && typeof parsed.entidades === 'object')
    ? parsed.entidades : {};
  const resposta_direta = typeof parsed.resposta_direta === 'string'
    ? parsed.resposta_direta.substring(0, 300) : null;
  return { intencao, entidades, confianca, resposta_direta };
}

/**
 * Retorna { intencao, entidades, confianca, resposta_direta, confiancaSuficiente }
 */
async function parseIntent(msg, sessionCtx = {}) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const _claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const historicoStr = (sessionCtx.historico || [])
      .slice(-4)
      .map(h => `[${h.role}]: ${String(h.content).substring(0, 80)}`)
      .join(' | ');

    const prompt = `Você é um parser de intenções para sistema de agenda/salão.
Retorne SOMENTE JSON válido, sem texto extra, sem markdown, sem explicação.

CONTEXTO:
- Assunto atual da sessão: ${sessionCtx.assuntoAtual || 'nenhum'}
- Ação pendente: ${sessionCtx.ultimaAcaoPendente ? JSON.stringify(sessionCtx.ultimaAcaoPendente) : 'nenhuma'}
- Histórico recente: ${historicoStr || 'nenhum'}

INTENÇÕES VÁLIDAS (use exatamente um desses valores):
financeiro_hoje, financeiro_semana, financeiro_mes,
registrar_receita, registrar_despesa,
agenda_hoje, agenda_amanha, agenda_semana,
proximo_cliente, clientes_inativos, clientes_novos, clientes_confirmados,
historico_cliente, encaixar_cliente,
cancelar_agendamento, confirmar_agendamento,
bloquear_horario, fechar_dia, liberar_agenda,
criar_lembrete, listar_lembretes,
aniversariantes, servicos_mais_pedidos,
resumo_semanal, resumo_mensal,
mandar_mensagem, ajuda, saudacao,
confirmar_pendente, cancelar_pendente, fora_escopo

ENTIDADES (extraia apenas as presentes):
nome_cliente, horario, data, valor, descricao, servico, telefone, hora_inicio, hora_fim

MENSAGEM: "${msg.substring(0, 200)}"

Retorne APENAS:
{"intencao":"...","entidades":{},"confianca":0.0,"resposta_direta":null}

resposta_direta: preencha APENAS para saudacao/ajuda/fora_escopo com texto curto (máx 3 linhas). Para todo o resto: null.`;

    const r = await _claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = (r.content?.[0]?.text || '').trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    const validado = _validar(parsed);

    const minima = INTENCOES_CRITICAS.has(validado.intencao)
      ? CONFIDENCE_MINIMA_CRITICA : CONFIDENCE_MINIMA_PADRAO;

    return { ...validado, confiancaSuficiente: validado.confianca >= minima };

  } catch(e) {
    console.warn('[IntentParser] erro:', e.message);
    return { ..._intentVazio(), confiancaSuficiente: false };
  }
}

module.exports = { parseIntent, INTENCOES_CRITICAS, INTENCOES_VALIDAS };
