const Anthropic = require('@anthropic-ai/sdk');
const { AdminAgenda, ServicoAgenda, ProfissionalAgenda, AgendamentoAgenda, ClienteAgenda } = require('../models/AgendaServico');

const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Histórico de conversas por telefone (em memória, limpo após 30min)
if (!global._agendaConversas) global._agendaConversas = new Map();

function limparConversasAntigas() {
  const agora = Date.now();
  for (const [k, v] of global._agendaConversas) {
    if (agora - v.ultimaMsg > 30 * 60 * 1000) global._agendaConversas.delete(k);
  }
}

async function buscarContextoAdmin(adminId) {
  try {
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return null;
    const servicos = await ServicoAgenda.find({ adminId, ativo: true }).lean();
    const profissionais = await ProfissionalAgenda.find({ adminId, ativo: true }).lean();
    return { admin, servicos, profissionais };
  } catch(e) { return null; }
}

async function buscarHorariosDisponiveis(adminId, data) {
  try {
    const { router: pushRouter, ...rest } = require('../routes/agenda-push.routes');
    // Buscar via model direto
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return [];
    const config = admin.config || {};
    const abertura = config.horarioAbertura || '08:00';
    const fechamento = config.horarioFechamento || '18:00';
    const intervalo = config.intervaloAgendamento || 60;

    const agendamentos = await AgendamentoAgenda.find({
      adminId,
      dataHora: {
        $gte: new Date(data + 'T00:00:00'),
        $lte: new Date(data + 'T23:59:59')
      },
      status: { $in: ['pendente','confirmado'] }
    }).lean();

    const ocupados = agendamentos.map(a => new Date(a.dataHora).toTimeString().slice(0,5));

    const slots = [];
    const [hAb, mAb] = abertura.split(':').map(Number);
    const [hFe, mFe] = fechamento.split(':').map(Number);
    let minutos = hAb * 60 + mAb;
    const fimMin = hFe * 60 + mFe;

    while (minutos < fimMin) {
      const h = String(Math.floor(minutos/60)).padStart(2,'0');
      const m = String(minutos%60).padStart(2,'0');
      const slot = h + ':' + m;
      if (!ocupados.includes(slot)) slots.push(slot);
      minutos += intervalo;
    }
    return slots;
  } catch(e) { return []; }
}

async function criarAgendamentoIA(adminId, dados) {
  try {
    const { nomeCliente, telefone, servicoNome, profissionalNome, data, hora } = dados;

    // Buscar serviço por nome aproximado
    const servicos = await ServicoAgenda.find({ adminId, ativo: true }).lean();
    const servico = servicos.find(s => s.nome.toLowerCase().includes(servicoNome.toLowerCase())) || servicos[0];

    const profissionais = await ProfissionalAgenda.find({ adminId, ativo: true }).lean();
    const prof = profissionalNome
      ? profissionais.find(p => p.nome.toLowerCase().includes(profissionalNome.toLowerCase()))
      : profissionais[0];

    const dataHora = new Date(data + 'T' + hora + ':00');

    const ag = await AgendamentoAgenda.create({
      adminId,
      nomeCliente,
      telefoneCliente: telefone,
      servicoId: servico?._id,
      nomeServico: servico?.nome || servicoNome,
      profissionalId: prof?._id,
      nomeProfissional: prof?.nome || '',
      dataHora,
      status: 'pendente',
      origem: 'whatsapp_ia'
    });

    // Atualizar/criar cliente
    await ClienteAgenda.findOneAndUpdate(
      { adminId, telefone },
      { $set: { nome: nomeCliente, telefone }, $inc: { totalAtendimentos: 0 }, $setOnInsert: { totalAtendimentos: 0 } },
      { upsert: true }
    );

    // Notificar admin via push
    try {
      const { notificarAdmin } = require('../routes/agenda-push.routes');
      await notificarAdmin(adminId, '📅 Novo agendamento WhatsApp', nomeCliente + ' - ' + (servico?.nome||servicoNome) + ' às ' + hora, '/agenda-adm');
    } catch(e) {}

    return ag;
  } catch(e) {
    console.error('[AGENDA-IA] Erro ao criar agendamento:', e.message);
    return null;
  }
}

const AgendaIAService = {

  async responder(telefone, mensagem, adminId) {
    limparConversasAntigas();

    const chave = adminId + '_' + telefone;
    if (!global._agendaConversas.has(chave)) {
      global._agendaConversas.set(chave, { historico: [], ultimaMsg: Date.now() });
    }
    const conversa = global._agendaConversas.get(chave);
    conversa.ultimaMsg = Date.now();

    // Buscar contexto do negócio
    const ctx = await buscarContextoAdmin(adminId);
    if (!ctx) return null;

    const { admin, servicos, profissionais } = ctx;
    const nomeNegocio = admin.nomeNegocio || 'nosso salão';
    const config = admin.config || {};

    // Montar lista de serviços
    const listaServicos = servicos.map(s =>
      `- ${s.nome}: R$ ${Number(s.preco).toFixed(2)} (${s.duracao}min)`
    ).join('\n') || 'Consulte nossos serviços pelo site';

    const listaProfissionais = profissionais.map(p => `- ${p.nome}`).join('\n') || 'Nossa equipe';

    // Hoje e amanhã formatados
    const hoje = new Date().toISOString().split('T')[0];
    const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const systemPrompt = `Você é a assistente virtual de agendamento do ${nomeNegocio}.
Seu nome é Rebeca e você é simpática, objetiva e profissional.
Você atende via WhatsApp e ajuda clientes a agendar horários.

SERVIÇOS DISPONÍVEIS:
${listaServicos}

PROFISSIONAIS:
${listaProfissionais}

HORÁRIOS: ${config.horarioAbertura||'08:00'} às ${config.horarioFechamento||'18:00'}
INTERVALO MÍNIMO: ${config.intervaloAgendamento||60} minutos
${admin.endereco ? 'ENDEREÇO: ' + admin.endereco : ''}
${admin.instagram ? 'INSTAGRAM: ' + admin.instagram : ''}

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}

REGRAS IMPORTANTES:
1. Para agendar, você PRECISA coletar: nome do cliente, serviço, data e hora
2. Quando tiver TODOS os dados, responda EXATAMENTE com este JSON na última linha:
   AGENDAR:{"nomeCliente":"...","telefone":"${telefone}","servicoNome":"...","data":"YYYY-MM-DD","hora":"HH:MM"}
3. Antes de confirmar, verifique disponibilidade perguntando a data preferida
4. Se perguntarem sobre horários disponíveis, informe os horários de funcionamento
5. Seja curta nas respostas — máximo 3 linhas por mensagem
6. Use emojis com moderação
7. Se já tem agendamento marcado, confirme os detalhes
8. Nunca invente informações sobre preços ou serviços que não estão listados acima`;

    // Adicionar mensagem do usuário ao histórico
    conversa.historico.push({ role: 'user', content: mensagem });

    // Manter histórico curto (últimas 10 mensagens)
    if (conversa.historico.length > 10) {
      conversa.historico = conversa.historico.slice(-10);
    }

    try {
      const response = await cliente.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: systemPrompt,
        messages: conversa.historico
      });

      const textoResposta = response.content[0].text;

      // Verificar se há comando de agendamento
      const linhas = textoResposta.split('\n');
      let agendado = false;
      let respostaFinal = textoResposta;

      for (const linha of linhas) {
        if (linha.startsWith('AGENDAR:')) {
          try {
            const dadosAg = JSON.parse(linha.replace('AGENDAR:', ''));

            // Verificar disponibilidade
            const slots = await buscarHorariosDisponiveis(adminId, dadosAg.data);
            if (!slots.includes(dadosAg.hora)) {
              respostaFinal = `⚠️ O horário ${dadosAg.hora} não está disponível para ${dadosAg.data}.\n\nHorários disponíveis: ${slots.slice(0,6).join(', ')}\n\nQual prefere?`;
              break;
            }

            const ag = await criarAgendamentoIA(adminId, dadosAg);
            if (ag) {
              const dataFmt = new Date(dadosAg.data + 'T12:00:00').toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long'});
              respostaFinal = `✅ *Agendamento confirmado!*\n\n📅 ${dataFmt} às ${dadosAg.hora}\n💇 ${dadosAg.servicoNome}\n👤 ${dadosAg.nomeCliente}\n\nTe esperamos! 😊`;
              agendado = true;
            }
          } catch(e) {
            console.error('[AGENDA-IA] Erro ao parsear AGENDAR:', e.message);
            respostaFinal = textoResposta.replace(linha, '').trim();
          }
          break;
        }
      }

      // Adicionar resposta ao histórico
      conversa.historico.push({ role: 'assistant', content: respostaFinal });

      return respostaFinal;

    } catch(e) {
      console.error('[AGENDA-IA] Erro Claude:', e.message);
      return `Olá! Sou a assistente do ${nomeNegocio}. Como posso te ajudar com seu agendamento? 😊`;
    }
  }
};

module.exports = AgendaIAService;
