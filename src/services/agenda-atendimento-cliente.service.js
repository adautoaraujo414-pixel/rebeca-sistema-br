'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { AdminAgenda, AgendamentoAgenda, ClienteAgenda } = require('../models/AgendaServico');

// Sessões em memória por telefone cliente
const _sessoes = new Map();
const _getS = (t) => { if (!_sessoes.has(t)) _sessoes.set(t, { historico: [], etapa: 'inicio', dadosColetados: {}, ts: Date.now() }); return _sessoes.get(t); };
const _limparVelhas = () => { const lim = Date.now() - 2*60*60*1000; for (const [k,v] of _sessoes) if (v.ts < lim) _sessoes.delete(k); };

async function _buscarServicos(adminId) {
  try {
    const { ServicoAgenda } = require('../models/AgendaServico');
    return await ServicoAgenda.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean();
  } catch(e) { return []; }
}

async function _buscarHorariosLivres(adminId, data) {
  try {
    const admin = await AdminAgenda.findById(adminId).select('config').lean();
    const abre = admin?.config?.horarioAbertura || '08:00';
    const fecha = admin?.config?.horarioFechamento || '18:00';
    const [hA, mA] = abre.split(':').map(Number);
    const [hF, mF] = fecha.split(':').map(Number);
    const ini = new Date(data); ini.setHours(hA, mA, 0, 0);
    const fim = new Date(data); fim.setHours(hF, mF, 0, 0);
    const agendados = await AgendamentoAgenda.find({
      adminId, dataHora: { $gte: ini, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();
    const ocupados = new Set(agendados.map(a => new Date(a.dataHora).getHours() + ':' + String(new Date(a.dataHora).getMinutes()).padStart(2,'0')));
    const livres = [];
    for (let h = hA; h < hF; h++) {
      for (const m of [0, 30]) {
        if (h === hF && m > 0) break;
        const slot = h + ':' + String(m).padStart(2,'0');
        if (!ocupados.has(slot)) livres.push(slot);
      }
    }
    return livres.slice(0, 10);
  } catch(e) { return []; }
}

async function _normalizarTel(tel) {
  const t = tel.replace(/\D/g,'');
  return ['55'+t, t, t.replace(/^55/,''), '55'+t.replace(/^55(d{2})(d{8})$/,'$19$2')];
}

async function atenderCliente(telefoneCliente, mensagem, adminId) {
  _limparVelhas();
  const ses = _getS(telefoneCliente);
  ses.ts = Date.now();

  try {
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return null;

    const nomeNegocio = admin.nomeNegocio || 'nosso salão';
    const segmento    = admin.segmento || 'serviços';
    const hrAbre      = admin?.config?.horarioAbertura  || '08:00';
    const hrFecha     = admin?.config?.horarioFechamento || '18:00';
    const linkAgenda  = admin?.configBot?.linkAgenda !== false;

    // Buscar cliente cadastrado
    const variantes = await _normalizarTel(telefoneCliente);
    const clienteCad = await ClienteAgenda.findOne({
      adminId, telefone: { $in: variantes }
    }).lean();
    const nomeCliente = clienteCad?.nome || ses.dadosColetados.nome || null;

    // Buscar serviços
    const servicos = await _buscarServicos(adminId);
    const listaServicos = servicos.length
      ? servicos.map(s => `• *${s.nome}* — R$ ${Number(s.preco).toFixed(2).replace('.',',')} (${s.duracao} min)${s.descricao ? ' — '+s.descricao : ''}`).join('\n')
      : '• Consulte nossos serviços diretamente';

    // Próximos agendamentos do cliente
    let agendamentoCliente = null;
    if (clienteCad) {
      agendamentoCliente = await AgendamentoAgenda.findOne({
        adminId, telefoneCliente: { $in: variantes },
        dataHora: { $gte: new Date() },
        status: { $in: ['pendente','confirmado'] }
      }).sort({ dataHora: 1 }).lean();
    }

    // Montar contexto de horários livres para hoje e amanhã
    const hoje = new Date();
    const amanha = new Date(Date.now() + 86400000);
    const livresHoje   = await _buscarHorariosLivres(adminId, hoje);
    const livresAmanha = await _buscarHorariosLivres(adminId, amanha);
    const diasSemana   = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
    const fmtData      = d => d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
    const hora         = new Date().getHours() + 'h' + String(new Date().getMinutes()).padStart(2,'0');

    // Adicionar mensagem ao histórico
    ses.historico.push({ role: 'user', content: mensagem });
    if (ses.historico.length > 20) ses.historico.splice(0, 2);

    const systemPrompt = `Você é a Rebeca, atendente virtual do *${nomeNegocio}* — um negócio de ${segmento}.
Você atende clientes pelo WhatsApp com simpatia, agilidade e conhecimento total dos serviços.

IDENTIDADE:
- Você é humana — se perguntarem diga "sou sim, pode falar!"
- NUNCA mencione IA, sistema, robô, plataforma
- Tom caloroso, próximo, brasileiro — como atendente que conhece o cliente
- Linguagem natural: "Oi!", "Claro!", "Com certeza!", "Deixa eu ver aqui pra você"
- Emojis com moderação — máximo 2 por mensagem
- Respostas CURTAS — máximo 4 linhas por mensagem

NEGÓCIO:
- Nome: ${nomeNegocio}
- Segmento: ${segmento}
- Horário: ${hrAbre} às ${hrFecha}
- Hora atual: ${hora} | Dia: ${diasSemana[new Date().getDay()]}

SERVIÇOS DISPONÍVEIS:
${listaServicos}

AGENDA:
- Horários livres HOJE (${fmtData(hoje)}): ${livresHoje.length ? livresHoje.slice(0,6).join(', ') : 'agenda cheia'}
- Horários livres AMANHÃ (${fmtData(amanha)}): ${livresAmanha.length ? livresAmanha.slice(0,6).join(', ') : 'agenda cheia'}
${agendamentoCliente ? `- Cliente tem agendamento em: ${new Date(agendamentoCliente.dataHora).toLocaleString('pt-BR')} — ${agendamentoCliente.nomeServico||'serviço'}` : ''}
${nomeCliente ? `- Nome do cliente: ${nomeCliente} (cliente cadastrado)` : '- Cliente novo (sem cadastro ainda)'}

FLUXO DE ATENDIMENTO:
1. Saudação calorosa se primeira mensagem — use o nome se souber
2. Entender o que o cliente quer: agendar, consultar, cancelar, tirar dúvida
3. Se agendar → perguntar serviço desejado, sugerir horários livres, confirmar nome e horário
4. Se cancelar → confirmar qual agendamento e cancelar com gentileza
5. Se dúvida → responder com base nos serviços e horários acima
6. Sempre fechar com "Posso ajudar em mais alguma coisa?" ou similar

REGRAS CRÍTICAS:
- NUNCA invente serviços, preços ou horários que não estão listados acima
- NUNCA confirme agendamento — diga "vou confirmar com a equipe e te aviso" ou "anotei aqui, aguarda a confirmação"
- Se pedir serviço fora da lista → "Esse serviço não temos no momento, mas temos: [listar 2-3 opções]"
- Fora do horário de atendimento → "Estamos fechados agora, abrimos às ${hrAbre}. Posso anotar seu interesse!"
- Se cliente reclamar ou pedir falar com humano → "Entendido! Vou chamar um atendente pra você agora."
- Se cliente perguntar preço → informe o preço exato da lista acima
- Linguagem do cliente → se informal, seja informal; se formal, seja formal
${linkAgenda ? `- Se cliente quiser agendar online → "Você pode agendar direto pelo nosso link: rebecasistemas.com.br/agendar — é rapidinho!"` : ''}`;

    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: ses.historico
    });

    const resposta = r.content?.[0]?.text?.trim();
    if (!resposta) return null;

    ses.historico.push({ role: 'assistant', content: resposta });

    // Detectar se precisa notificar admin
    const _notificarAdmin = /atendente|humano|falar com|reclamação|reclamacao|problema|urgente/i.test(mensagem);

    console.log('[AtendimentoCliente]', adminId, '|', telefoneCliente, '| notif:', _notificarAdmin);
    return { resposta, notificarAdmin: _notificarAdmin, nomeCliente };

  } catch(e) {
    console.error('[AtendimentoCliente] erro:', e.message);
    return { resposta: 'Oi! Um momento, estou verificando aqui para você 😊', notificarAdmin: false };
  }
}

module.exports = { atenderCliente };
