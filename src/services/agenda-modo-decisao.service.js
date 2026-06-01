'use strict';

/**
 * Modo de Decisão — Rebeca analisa contexto, histórico do cliente
 * e dados do negócio para ajudar o dono a tomar decisões inteligentes.
 *
 * Ativado quando:
 * - Dono menciona cliente + situação (cancelou, sumiu, reclamou, voltou)
 * - Dono pede conselho de negócio
 * - Dono está indeciso sobre algo (encaixar, cobrar, remarcar)
 * - Dono desabafa sobre cliente específico
 * - Cerebro retorna fora_escopo mas há nome de cliente na mensagem
 */

const { AgendamentoAgenda, ClienteAgenda, FinanceiroAgenda } = require('../models/AgendaServico');

// ── Detecta se a mensagem precisa de análise de decisão ──────────────
function precisaDecisao(msg, intencaoCerebro) {
  const m = msg.toLowerCase();

  // Gatilhos diretos de decisão
  const gatilhos = [
    /o que (você|vc|voce) (acha|faria|sugere|recomenda)/i,
    /vale a pena/i,
    /devo (cobrar|remarcar|cancelar|ligar|mandar|aceitar|recusar)/i,
    /me (ajuda|aconselha|orienta|fala) (a decidir|o que fazer|como agir)/i,
    /o que (faço|devo fazer|você faria)/i,
    /boa ideia/i,
    /tenho dúvida|não sei (se|o que)/i,
    /me (dá|da) uma força/i,
  ];

  // Gatilhos com cliente
  const gatilhosCliente = [
    /cancelou (de novo|outra vez|sempre|já é)/i,
    /nunca (aparece|vem|confirma|paga)/i,
    /cliente (chato|ruim|problema|difícil|sumiu|sumida)/i,
    /sempre (atrasa|falta|cancela|reclama)/i,
    /(sumiu|sumida|não aparece|não vem)/i,
    /(devo|deveria) (cobrar|remarcar|aceitar|recusar|bloquear)/i,
    /tô (com raiva|brava|indignada|frustrada) (com|da|do)/i,
    /(que faço|o que faço) (com|pra|para)/i,
  ];

  for (const g of gatilhos) {
    if (g.test(msg)) return true;
  }
  for (const g of gatilhosCliente) {
    if (g.test(msg)) return true;
  }

  return false;
}

// ── Extrai nome de cliente da mensagem ──────────────────────────────
function _extrairNomeCliente(msg) {
  // Padrões: "a Ana", "o João", "da Maria", "do Pedro", "cliente Ana"
  const m = msg.match(
    /(?:a|o|da|do|cliente|a cliente|o cliente|pra|com)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+)?)/
  );
  if (m) return m[1].trim();

  // Nome próprio isolado
  const m2 = msg.match(/\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{2,})\b/);
  if (m2) return m2[1].trim();

  return null;
}

// ── Busca histórico completo do cliente ──────────────────────────────
async function _buscarDadosCliente(adminId, nomeCliente) {
  if (!nomeCliente) return null;

  const mongoose = require('mongoose');
  const adminObjId = mongoose.Types.ObjectId.isValid(adminId)
    ? new mongoose.Types.ObjectId(adminId) : adminId;

  // Buscar cadastro
  const cliente = await ClienteAgenda.findOne({
    adminId: adminObjId,
    $or: [
      { nome: { $regex: nomeCliente, $options: 'i' } },
      { apelido: { $regex: nomeCliente, $options: 'i' } }
    ]
  }).lean();

  // Buscar agendamentos dos últimos 6 meses
  const seismesesAtras = new Date(Date.now() - 180 * 86400000);
  const agendamentos = await AgendamentoAgenda.find({
    adminId: adminObjId,
    nomeCliente: { $regex: nomeCliente, $options: 'i' },
    dataHora: { $gte: seismesesAtras }
  }).sort({ dataHora: -1 }).limit(20).lean();

  // Calcular métricas
  const total = agendamentos.length;
  const concluidos = agendamentos.filter(a => a.status === 'concluido' || a.status === 'confirmado').length;
  const cancelados = agendamentos.filter(a => a.status === 'cancelado').length;
  const faltou     = agendamentos.filter(a => a.status === 'faltou').length;
  const taxaCancelamento = total > 0 ? Math.round((cancelados + faltou) / total * 100) : 0;

  // Último atendimento
  const ultimoConcluido = agendamentos.find(a => a.status === 'concluido' || a.status === 'confirmado');
  const diasSemVir = ultimoConcluido
    ? Math.floor((Date.now() - new Date(ultimoConcluido.dataHora)) / 86400000)
    : null;

  // Valor gerado
  const receitas = await FinanceiroAgenda.find({
    adminId: adminObjId,
    tipo: 'receita',
    $or: [
      { descricao: { $regex: nomeCliente, $options: 'i' } },
      { origem: { $regex: nomeCliente, $options: 'i' } }
    ],
    data: { $gte: seismesesAtras }
  }).lean();
  const valorTotal = receitas.reduce((s, r) => s + Number(r.valor || 0), 0);

  return {
    cliente,
    agendamentos: agendamentos.slice(0, 8),
    metricas: {
      total, concluidos, cancelados, faltou,
      taxaCancelamento, diasSemVir, valorTotal
    }
  };
}

// ── Monta resumo do cliente para o prompt ───────────────────────────
function _resumoCliente(dados, nomeCliente) {
  if (!dados) return `Nenhum histórico encontrado para "${nomeCliente}".`;

  const { metricas, agendamentos, cliente } = dados;
  const lines = [];

  if (cliente) {
    lines.push(`Cadastro: ${cliente.nome}${cliente.telefone ? ' | tel: '+cliente.telefone : ''}`);
    if (cliente.totalAtendimentos) lines.push(`Total histórico: ${cliente.totalAtendimentos} atendimentos`);
  }

  lines.push(`Últimos 6 meses: ${metricas.total} agendamentos`);
  lines.push(`  ✅ Concluídos: ${metricas.concluidos}`);
  if (metricas.cancelados) lines.push(`  ❌ Cancelados: ${metricas.cancelados}`);
  if (metricas.faltou) lines.push(`  👻 Faltou: ${metricas.faltou}`);
  if (metricas.taxaCancelamento > 0) lines.push(`  📊 Taxa cancelamento/falta: ${metricas.taxaCancelamento}%`);
  if (metricas.diasSemVir !== null) lines.push(`  📅 Dias sem aparecer: ${metricas.diasSemVir}`);
  if (metricas.valorTotal > 0) lines.push(`  💰 Valor gerado: R$ ${metricas.valorTotal.toFixed(2).replace('.', ',')}`);

  if (agendamentos.length > 0) {
    lines.push('Histórico recente:');
    agendamentos.slice(0, 5).forEach(a => {
      const dt = new Date(a.dataHora);
      const dStr = `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}`;
      lines.push(`  ${dStr} ${a.nomeServico || 'serviço'} — ${a.status}`);
    });
  }

  return lines.join('\n');
}

// ── Análise principal ────────────────────────────────────────────────
async function analisar(msg, adminId, opcoes = {}) {
  const { nomeNegocio = '', nomeDono = '', genero = '', apelidoAdmin = '' } = opcoes;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Extrair nome do cliente se houver
    const nomeCliente = _extrairNomeCliente(msg);
    const dadosCliente = nomeCliente
      ? await _buscarDadosCliente(adminId, nomeCliente)
      : null;

    const _chefe = apelidoAdmin || (genero === 'F' ? 'chefa' : 'chefe');
    const _agoraBR = new Date(Date.now() - 3*60*60*1000);
    const hora = _agoraBR.getUTCHours();
    const periodo = hora < 12 ? 'manhã' : hora < 18 ? 'tarde' : 'noite';

    const contextoCliente = nomeCliente
      ? `\nHISTÓRICO DO CLIENTE "${nomeCliente}":\n${_resumoCliente(dadosCliente, nomeCliente)}`
      : '';

    const system = `Você é a Rebeca — melhor amiga e parceira de negócio de ${_chefe}, dona de ${nomeNegocio || 'um salão/barbearia'}.

Você acabou de estudar o histórico completo e vai ajudar ${_chefe} a tomar a melhor decisão.

COMO RESPONDER:
- Tom de amiga de confiança que entende de negócio
- Primeiro valide o sentimento dela/dele
- Depois apresente os dados de forma simples e direta
- Por fim, dê sua recomendação pessoal — clara, direta, sem rodeios
- Se o padrão do cliente for ruim → fale com honestidade, mas com carinho
- Se o cliente for bom → reforce isso
- Máximo 5-6 linhas no WhatsApp
- Use emojis com moderação
- NUNCA seja robótica ou fria
- NUNCA mencione IA, sistema, dados, banco`;

    const userPrompt = `Hora: ${periodo} | Dono: ${_chefe}
${contextoCliente}

Mensagem de ${_chefe}: "${msg}"

Analise a situação, cruze com o histórico e responda de forma natural, empática e útil. Dê uma recomendação clara no final.`;

    const r = await claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const resposta = r.content?.[0]?.text?.trim();
    if (resposta) {
      console.log('[ModoDecisao] analise OK | cliente:', nomeCliente || 'sem cliente');
      return { resposta, nomeCliente, dadosCliente };
    }
  } catch(e) {
    console.error('[ModoDecisao] erro:', e.message);
  }
  return null;
}

module.exports = { analisar, precisaDecisao, _extrairNomeCliente };
