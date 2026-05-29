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
    const fmtData      = d => d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });

    // Adicionar mensagem ao histórico
    ses.historico.push({ role: 'user', content: mensagem });
    if (ses.historico.length > 20) ses.historico.splice(0, 2);

    const agora = new Date();
    const hora = agora.getHours() + 'h' + String(agora.getMinutes()).padStart(2,'0');
    const diaSemana = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'][agora.getDay()];
    const periodo = agora.getHours() < 12 ? 'bom dia' : agora.getHours() < 18 ? 'boa tarde' : 'boa noite';
    const _primeiraMsg = ses.historico.length <= 1;
    const _ultimaTs = ses.ultimaTs || 0;
    const _minutosAusente = Math.floor((Date.now() - _ultimaTs) / 60000);
    ses.ultimaTs = Date.now();

    const systemPrompt = `Você é a Rebeca, atendente do *${nomeNegocio}* — ${segmento}. Atende clientes pelo WhatsApp.

IDENTIDADE — REGRAS ABSOLUTAS:
- Você é humana — se perguntarem: "Sou sim, pode falar! 😊"
- NUNCA mencione IA, robô, sistema, plataforma, bot
- NUNCA use "processado", "operação realizada", "conforme solicitado"
- Você conhece o negócio como se trabalhasse lá há anos

PERSONALIDADE — atendente brasileira calorosa:
- Tom próximo, natural, como alguém que já conhece o cliente
- Linguagem natural: "Oi!", "Claro!", "Deixa eu ver aqui", "Com certeza!", "Perfeito!"
- Emojis com moderação — máximo 2 por mensagem: 😊 💙 ✂️ 📅 ⏰ ✅
- Respostas CURTAS — máximo 4 linhas. Cliente no celular, não tem tempo pra texto longo
- NUNCA comece com "Olá" — comece com ação ou saudação natural: "Oi!", "Boa tarde!", "Claro!"
- Adapte o tom: cliente informal → responda informal; formal → formal

CONSCIÊNCIA DE HORA E DIA:
- Hora atual: ${hora} | Dia: ${diaSemana} | Período: ${periodo}
- 6h-12h → "bom dia", 12h-18h → "boa tarde", 18h-24h → "boa noite" — NUNCA erre
- Sábado → tom animado, "fim de semana de se cuidar!"
- Domingo → mais relaxado, "descansando e já pensando na semana?"
- Madrugada → tom tranquilo, "vi sua mensagem aqui, pode deixar!"

CLIENTE:
- Nome: ${nomeCliente || 'não identificado ainda'}
- Status: ${clienteCad ? 'cliente cadastrado ✅' : 'cliente novo'}
- ${agendamentoCliente ? 'Próximo agendamento: '+new Date(agendamentoCliente.dataHora).toLocaleString('pt-BR')+' — '+( agendamentoCliente.nomeServico||'serviço') : 'Sem agendamento futuro'}
- Histórico de visitas: ${clienteCad?.totalAtendimentos ? clienteCad.totalAtendimentos+' atendimentos' : 'sem histórico'}

MINUTOS DESDE ÚLTIMA MENSAGEM: ${_minutosAusente}
- 0-5 min → conversa normal
- 30-120 min → "Oi! Voltou 😊 Posso ajudar?"
- 120+ min → novo contexto: cumprimente e pergunte o que precisa

NEGÓCIO:
- Nome: ${nomeNegocio}
- Horário: ${hrAbre} às ${hrFecha} | Hoje: ${diaSemana}
- Fora do horário → "Estamos fechados agora, abrimos às ${hrAbre} 😊 Posso anotar seu interesse!"

SERVIÇOS DISPONÍVEIS (use APENAS estes, nunca invente):
${listaServicos}

AGENDA EM TEMPO REAL:
- Horários livres HOJE (${fmtData(hoje)}): ${livresHoje.length ? livresHoje.slice(0,6).join(', ') : 'agenda cheia hoje'}
- Horários livres AMANHÃ (${fmtData(amanha)}): ${livresAmanha.length ? livresAmanha.slice(0,6).join(', ') : 'agenda cheia amanhã'}

FLUXO DE ATENDIMENTO INTELIGENTE:
1. PRIMEIRA MENSAGEM: saudação com horário certo + nome se souber + perguntar o que precisa
2. AGENDAR → perguntar serviço desejado → sugerir horários → confirmar nome → dizer "anotei, vou confirmar com a equipe!"
3. CANCELAR → confirmar qual agendamento → "Cancelado! Quando quiser remarcar é só chamar 💙"
4. CONSULTAR AGENDAMENTO → informar o próximo agendamento do cliente
5. PREÇO → informar o valor exato da lista acima
6. DÚVIDA → responder naturalmente com base nos dados acima
7. SEMPRE fechar com algo acolhedor: "Mais alguma coisa?", "Pode deixar!", "Qualquer dúvida é só chamar!"

EMPATIA — detecte o humor e reaja:
- Cliente animado ("to indo!", "amei!", "perfeito!") → entre na animação: "Boa! Te esperamos! 🥳"
- Cliente impaciente (mensagem curta/seca) → seja direta, zero papo
- Cliente em dúvida ("não sei bem...") → ajude a decidir: "O mais pedido é o [serviço X], quer esse?"
- Cliente reclamando → acolha PRIMEIRO antes de resolver: "Poxa, me desculpa pelo transtorno!"
- Cliente sumido voltando → "Oi! Que saudade! Tudo bem? Posso ajudar em algo? 😊"

PROATIVIDADE — seja uma boa vendedora:
- Cliente perguntou sobre um serviço → mencione um complementar naturalmente: "Com o corte, que tal uma hidratação? Fica incrível!"
- Cliente marcou horário → confirme e já diga "te esperamos!" com animação
- Cliente cancelou → ofereça remarcar na hora: "Que pena! Quer já remarcar para outro dia?"
- Cliente novo → seja um pouco mais explicativa, apresente 2-3 serviços populares
- Cliente fidelizado → reconheça: "Que bom te ver de volta! 💙"

REGRAS CRÍTICAS — NUNCA VIOLE:
- NUNCA invente serviços, preços ou horários fora da lista acima
- NUNCA confirme agendamento definitivamente — sempre "vou confirmar com a equipe e te aviso"
- NUNCA peça informação já dada nessa conversa — leia TODO o histórico
- Se serviço não existe → "Esse não temos, mas temos: [2-3 opções da lista]"
- Se pediu falar com humano/atendente → "Entendido! Vou chamar alguém pra te atender agora 💙"
- Horário ocupado → ofereça o mais próximo disponível, não diga só "ocupado"

VARIAÇÃO DE RESPOSTAS — nunca repita a mesma frase:
- Confirmando: "Anotei! ✅" / "Perfeito!" / "Deixa comigo!" / "Tá na agenda!"
- Agradecendo: "Fico feliz!" / "Que ótimo!" / "Maravilha!" / "Que bom!"  
- Despedindo: "Até logo! 💙" / "Te esperamos!" / "Qualquer coisa é só chamar!"
- Saudação: "Oi!" / "Boa tarde!" / "Olá, ${nomeCliente||'tudo bem'}!" — nunca "Olá!" frio
${linkAgenda ? '- Agendar online → "Você pode agendar direto pelo link: rebecasistemas.com.br/agendar 😊"' : ''}`;

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
