// agenda-ia.service.js — Rebeca Agenda Bot WhatsApp
// SOMENTE Rebeca Agenda — não afeta Delivery nem Corrida
const Anthropic = require('@anthropic-ai/sdk');
const { AdminAgenda, ServicoAgenda, ProfissionalAgenda, AgendamentoAgenda, ClienteAgenda } = require('../models/AgendaServico');
const { getAgendaPlanFeatures } = require('../utils/agenda-plan-features');

const _claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── ESTADO DE CONVERSAS (global com TTL 30min) ───────────────────────────────
if (!global._agendaConversas) global._agendaConversas = new Map();
if (!global._agendaLogs)      global._agendaLogs      = new Map(); // adminId -> [logs]

function _limparAntigas() {
  const agora = Date.now();
  for (const [k, v] of global._agendaConversas) {
    if (agora - v.ultimaMsg > 30 * 60 * 1000) global._agendaConversas.delete(k);
  }
}

function _getConversa(adminId, telefone) {
  const chave = String(adminId) + '_' + telefone;
  if (!global._agendaConversas.has(chave)) {
    global._agendaConversas.set(chave, {
      historico: [], ultimaMsg: Date.now(),
      etapa: 'idle',
      dados: { nomeCliente:'', servico:'', servicoId:null, profissional:'', profissionalId:null, data:'', hora:'' },
      humanHandoff: false, handoffAt: null,
      telefone, adminId: String(adminId)
    });
  }
  const c = global._agendaConversas.get(chave);
  c.ultimaMsg = Date.now();
  return c;
}

function _salvarLog(adminId, tipo, dados) {
  const key = String(adminId);
  if (!global._agendaLogs.has(key)) global._agendaLogs.set(key, []);
  const logs = global._agendaLogs.get(key);
  logs.unshift({ tipo, dados, ts: new Date().toISOString() });
  if (logs.length > 200) logs.pop();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function _fmtData(d) {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' }); }
  catch(_) { return d || ''; }
}

function _parseData(texto) {
  const t = (texto || '').toLowerCase().trim();
  const hoje = new Date();
  const pad = n => String(n).padStart(2,'0');
  const iso = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());

  if (t.match(/\bhoje\b/)) return iso(hoje);
  if (t.match(/\bamanh[ãa]\b/)) { const d=new Date(hoje); d.setDate(d.getDate()+1); return iso(d); }
  if (t.match(/\bsegunda\b/)) return iso(_proxDia(hoje,1));
  if (t.match(/\bterca|terça\b/)) return iso(_proxDia(hoje,2));
  if (t.match(/\bquarta\b/)) return iso(_proxDia(hoje,3));
  if (t.match(/\bquinta\b/)) return iso(_proxDia(hoje,4));
  if (t.match(/\bsexta\b/)) return iso(_proxDia(hoje,5));
  if (t.match(/\bsabado|sábado\b/)) return iso(_proxDia(hoje,6));
  if (t.match(/\bdomingo\b/)) return iso(_proxDia(hoje,0));
  const m = t.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const ano = hoje.getFullYear();
    return `${ano}-${pad(m[2])}-${pad(m[1])}`;
  }
  return null;
}

function _proxDia(base, diaSemana) {
  const d = new Date(base);
  const atual = d.getDay();
  let diff = diaSemana - atual;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function _detectarIntencao(texto) {
  const t = (texto || '').toLowerCase();
  if (t.match(/\b(oi|ol[aá]|bom dia|boa tarde|boa noite|ei|al[oô])\b/)) return 'greeting';
  if (t.match(/\b(humano|atendente|pessoa|algu[eé]m|ajuda|n[aã]o entend)\b/)) return 'talk_to_human';
  if (t.match(/\b(cancelar|cancela|desmarcar|desmarco)\b/)) return 'cancel_booking';
  if (t.match(/\b(remarcar|remarca|mudar horario|trocar horario|outro dia)\b/)) return 'reschedule_booking';
  if (t.match(/\b(endere[cç]o|fica onde|como chego|onde [eé]|localiza[cç])\b/)) return 'ask_address';
  if (t.match(/\b(avalia[cç][aã]o|estrela|nota|depoimento)\b/)) return 'ask_reviews';
  if (t.match(/\b(link|site|agenda|p[aá]gina)\b/)) return 'ask_agenda_link';
  if (t.match(/\b(obrigad|valeu|brigad|muito bom|excelente)\b/)) return 'thanks';
  if (t.match(/\b(servi[cç]o|o que faz|o que tem|menu|op[cç][õo]es)\b/)) return 'show_services';
  if (t.match(/\b(quanto (custa|[eé]|tem)|pre[cç]o|valor|cobr)\b/)) return 'ask_price';
  if (t.match(/\b(profissional|quem atende|com quem|hor[aá]rio|disponivel|vaga|livre)\b/)) return 'ask_available_times';
  if (t.match(/\b(marcar|agendar|quero marcar|quero agendar|marcarum|reservar)\b/)) return 'start_booking';
  if (t.match(/\b(confirmar|confirmo|sim|isso mesmo|pode marcar|ok|certo|exato|tudo certo)\b/)) return 'confirm_booking';
  return 'fallback';
}

// ── BUSCAR CONTEXTO ───────────────────────────────────────────────────────────
async function _buscarCtx(adminId) {
  try {
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return null;
    const servicos = await ServicoAgenda.find({ adminId, ativo: true }).lean();
    const profissionais = await ProfissionalAgenda.find({ adminId, ativo: true }).lean();
    return { admin, servicos, profissionais };
  } catch(e) { return null; }
}

async function _horariosLivres(adminId, data, servicoDuracao) {
  try {
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return [];
    const cfg = admin.config || {};
    const ab = cfg.horarioAbertura || '08:00';
    const fe = cfg.horarioFechamento || '18:00';
    const intervalo = servicoDuracao || cfg.intervaloAgendamento || 60;

    const ags = await AgendamentoAgenda.find({
      adminId,
      dataHora: { $gte: new Date(data+'T00:00:00'), $lte: new Date(data+'T23:59:59') },
      status: { $in: ['pendente','confirmado'] }
    }).lean();

    const ocupados = ags.map(a => new Date(a.dataHora).toTimeString().slice(0,5));
    const slots = [];
    const [hAb,mAb] = ab.split(':').map(Number);
    const [hFe,mFe] = fe.split(':').map(Number);
    let min = hAb*60+mAb;
    const fim = hFe*60+mFe;
    while (min < fim) {
      const h = String(Math.floor(min/60)).padStart(2,'0');
      const m = String(min%60).padStart(2,'0');
      const slot = h+':'+m;
      if (!ocupados.includes(slot)) slots.push(slot);
      min += Number(intervalo);
    }
    return slots;
  } catch(e) { return []; }
}

async function _criarAgendamento(adminId, conv, dados) {
  try {
    const { nomeCliente, telefone, servicoNome, servicoId, profissionalNome, profissionalId, data, hora } = dados;
    const dataHora = new Date(data+'T'+hora+':00');

    const ag = await AgendamentoAgenda.create({
      adminId,
      nomeCliente,
      telefoneCliente: telefone,
      servicoId: servicoId || null,
      nomeServico: servicoNome,
      profissionalId: profissionalId || null,
      nomeProfissional: profissionalNome || '',
      dataHora,
      status: 'pendente',
      origem: 'whatsapp_ia'
    });

    await ClienteAgenda.findOneAndUpdate(
      { adminId, telefone },
      { $set: { nome: nomeCliente, telefone }, $setOnInsert: { totalAtendimentos: 0 } },
      { upsert: true }
    );

    // Notificar admin push
    try {
      const { notificarAdmin } = require('../routes/agenda-push.routes');
      await notificarAdmin(
        adminId,
        '📅 Agendamento via WhatsApp',
        nomeCliente + ' - ' + servicoNome + ' às ' + hora,
        '/agenda-adm'
      );
    } catch(_) {}

    _salvarLog(adminId, 'agendamento_criado', { ag: ag._id, nomeCliente, servicoNome, data, hora, telefone });
    return ag;
  } catch(e) {
    console.error('[AGENDA-IA] Erro criar:', e.message);
    _salvarLog(adminId, 'erro_criar_agendamento', { erro: e.message });
    return null;
  }
}

// ── RESPONDER ─────────────────────────────────────────────────────────────────
const AgendaIAService = {

  getLogs(adminId) {
    return global._agendaLogs.get(String(adminId)) || [];
  },

  getConversas(adminId) {
    const result = [];
    for (const [k, v] of global._agendaConversas) {
      if (k.startsWith(String(adminId)+'_')) result.push(v);
    }
    return result;
  },

  resetHandoff(adminId, telefone) {
    const c = _getConversa(adminId, telefone);
    c.humanHandoff = false; c.handoffAt = null; c.etapa = 'idle';
  },

  async responder(telefone, mensagem, adminId) {
    _limparAntigas();

    // Verificar plano
    const ctx = await _buscarCtx(adminId);
    if (!ctx) return null;

    const { admin, servicos, profissionais } = ctx;
    const features = getAgendaPlanFeatures(admin.plano);
    const nomeNegocio = admin.nomeNegocio || 'nossa agenda';
    const linkAgenda = process.env.APP_URL
      ? `${process.env.APP_URL}/espaco-digital?id=${adminId}`
      : `/espaco-digital?id=${adminId}`;

    // Plano R$97: sem automação completa
    if (!features.canUseWhatsappAutomation) {
      return `Oi! Tudo bem? 😊\n\nPara agendar seu horário na *${nomeNegocio}*, acesse nossa agenda online:\n${linkAgenda}\n\nQualquer dúvida, é só chamar!`;
    }

    const conv = _getConversa(adminId, telefone);

    // Human handoff ativo — pausar bot por 30min
    if (conv.humanHandoff) {
      const elapsed = Date.now() - (conv.handoffAt || 0);
      if (elapsed < 30 * 60 * 1000) {
        _salvarLog(adminId, 'handoff_ativo', { telefone, mensagem });
        return null; // silêncio — humano está atendendo
      }
      conv.humanHandoff = false; // expirou, bot volta
    }

    // Detectar intenção
    const intencao = _detectarIntencao(mensagem);
    _salvarLog(adminId, 'mensagem_recebida', { telefone, mensagem, intencao, etapa: conv.etapa });

    const cfg = admin.config || {};
    const horario = `${cfg.horarioAbertura||'08:00'} às ${cfg.horarioFechamento||'18:00'}`;

    // ── INTENÇÕES DIRETAS ─────────────────────────────────────────────────────

    if (intencao === 'talk_to_human') {
      conv.humanHandoff = true;
      conv.handoffAt = Date.now();
      conv.etapa = 'human_handoff';
      try {
        const { notificarAdmin } = require('../routes/agenda-push.routes');
        await notificarAdmin(adminId, '🚨 Atenção necessária', `${telefone} pediu atendimento humano.`, '/agenda-adm');
      } catch(_) {}
      _salvarLog(adminId, 'human_handoff', { telefone });
      return `Claro, vou chamar alguém da equipe pra te ajudar 💬\n\nEnquanto isso, se quiser adiantar, você pode ver serviços e horários por aqui:\n${linkAgenda}`;
    }

    if (intencao === 'ask_address') {
      const end = admin.endereco || null;
      if (!end) return `Acabei de consultar aqui, mas não encontrei o endereço cadastrado no sistema.\n\nPra evitar te passar algo errado, acesse:\n${linkAgenda}`;
      return `📍 *Endereço:*\n${end}\n\nQualquer dúvida, é só chamar 😊`;
    }

    if (intencao === 'ask_agenda_link') {
      return `Aqui está o link da nossa agenda 😊\n${linkAgenda}`;
    }

    if (intencao === 'thanks') {
      return `De nada! Foi um prazer 😊\n\nSempre que precisar, é só chamar! Até logo 👋`;
    }

    if (intencao === 'show_services') {
      if (!servicos.length) return `Não encontrei serviços cadastrados no momento.\n\nAcesse a agenda para ver as opções:\n${linkAgenda}`;
      const lista = servicos.map(s => {
        let linha = `• *${s.nome}*`;
        if (s.duracao) linha += ` — ${s.duracao}min`;
        if (s.preco) linha += ` — R$ ${Number(s.preco).toFixed(2)}`;
        return linha;
      }).join('\n');
      _salvarLog(adminId, 'servicos_consultados', { telefone });
      return `Maravilha, acabei de conferir os serviços disponíveis pra você 😊\n\n${lista}\n\nQuer marcar algum? É só me falar!`;
    }

    if (intencao === 'ask_price') {
      if (!servicos.length) return `Não encontrei valores cadastrados.\n\nAcesse: ${linkAgenda}`;
      // Tentar achar serviço mencionado
      const termos = mensagem.toLowerCase().split(/\s+/);
      const encontrado = servicos.find(s => termos.some(t => s.nome.toLowerCase().includes(t) && t.length > 3));
      if (encontrado) {
        const dur = encontrado.duracao ? `\nDuração média: ${encontrado.duracao} minutos.` : '';
        const preco = encontrado.preco ? `R$ ${Number(encontrado.preco).toFixed(2)}` : 'a consultar';
        return `Boa pergunta! Acabei de conferir aqui ✅\n\nO *${encontrado.nome}* está cadastrado como *${preco}*.${dur}\n\nQuer que eu veja os horários livres pra ele?`;
      }
      const lista = servicos.map(s => `• *${s.nome}*${s.preco?' — R$ '+Number(s.preco).toFixed(2):''}`).join('\n');
      return `Claro! Aqui estão nossos serviços e valores 😊\n\n${lista}\n\nSobre qual você quer saber mais?`;
    }

    if (intencao === 'ask_available_times') {
      const dataParsed = _parseData(mensagem);
      if (!dataParsed) {
        return `Qual dia você prefere? Pode me mandar tipo *hoje*, *amanhã* ou uma data certinha 😊`;
      }
      const dur = conv.dados.servicoId ? (servicos.find(s=>String(s._id)===conv.dados.servicoId)?.duracao||60) : 60;
      const slots = await _horariosLivres(adminId, dataParsed, dur);
      if (!slots.length) return `Puts, não encontrei horários livres em *${_fmtData(dataParsed)}* 😕\n\nTenta outro dia ou acesse:\n${linkAgenda}`;
      _salvarLog(adminId, 'horarios_consultados', { telefone, data: dataParsed });
      return `Esses são os horários livres em *${_fmtData(dataParsed)}* 😊\n\n${slots.slice(0,8).join('  ·  ')}\n\nQuer marcar algum?`;
    }

    if (intencao === 'cancel_booking') {
      const ags = await AgendamentoAgenda.find({
        adminId, telefoneCliente: { $regex: telefone.replace(/\D/g,'').slice(-9) },
        status: { $in: ['pendente','confirmado'] },
        dataHora: { $gte: new Date() }
      }).sort({ dataHora: 1 }).limit(3).lean();

      if (!ags.length) return `Não encontrei agendamentos futuros para esse número.\n\nSe precisar marcar, é só falar 😊`;

      conv.etapa = 'awaiting_cancel_confirm';
      conv.dados._cancelarId = String(ags[0]._id);
      const ag = ags[0];
      const hora = new Date(ag.dataHora).toTimeString().slice(0,5);
      const data = new Date(ag.dataHora).toLocaleDateString('pt-BR');
      return `Combinado, encontrei esse agendamento:\n\n📅 ${data}\n⏰ ${hora}\n💼 ${ag.nomeServico}\n\nVocê confirma que quer cancelar? (sim/não)`;
    }

    // Confirmar cancelamento
    if (conv.etapa === 'awaiting_cancel_confirm') {
      if (mensagem.toLowerCase().match(/\b(sim|s|confirmo|pode|isso)\b/)) {
        try {
          await AgendamentoAgenda.findByIdAndUpdate(conv.dados._cancelarId, { status: 'cancelado' });
          conv.etapa = 'idle'; conv.dados._cancelarId = null;
          _salvarLog(adminId, 'agendamento_cancelado', { id: conv.dados._cancelarId, telefone });
          return `Combinado, seu agendamento foi cancelado ✅\n\nSe quiser marcar outro horário:\n${linkAgenda}`;
        } catch(_) {
          return `Não consegui cancelar agora. Tente pela agenda:\n${linkAgenda}`;
        }
      } else {
        conv.etapa = 'idle';
        return `Tudo bem, o agendamento foi mantido 😊 Qualquer coisa, é só chamar!`;
      }
    }

    // ── FLUXO DE AGENDAMENTO ──────────────────────────────────────────────────

    if (intencao === 'start_booking' || conv.etapa === 'awaiting_service') {
      if (!servicos.length) return `Não há serviços cadastrados no momento.\n\nAcesse: ${linkAgenda}`;
      conv.etapa = 'awaiting_service';
      const lista = servicos.map((s,i) => `${i+1}. *${s.nome}*${s.preco?' — R$ '+Number(s.preco).toFixed(2):''}`).join('\n');
      _salvarLog(adminId, 'inicio_agendamento', { telefone });
      return `Maravilha! Vamos marcar seu horário 😊\n\nQual serviço você prefere?\n\n${lista}`;
    }

    // Escolha de serviço (etapa awaiting_service + mensagem com número ou nome)
    if (conv.etapa === 'awaiting_service') {
      const num = parseInt(mensagem.trim()) - 1;
      let srv = isNaN(num) ? servicos.find(s => mensagem.toLowerCase().includes(s.nome.toLowerCase().split(' ')[0])) : servicos[num];
      if (!srv) return `Não entendi qual serviço 😅\n\nMe manda o número ou o nome do serviço da lista acima.`;
      conv.dados.servico = srv.nome;
      conv.dados.servicoId = String(srv._id);
      conv.etapa = 'awaiting_date';
      if (profissionais.length > 0) {
        const lista = profissionais.map((p,i) => `${i+1}. ${p.nome}`).join('\n');
        conv.etapa = 'awaiting_professional';
        return `Ótima escolha! *${srv.nome}* ✅\n\nCom qual profissional você prefere?\n\n${lista}\n\nOu me manda "qualquer um" pra eu escolher o disponível.`;
      }
      return `Ótima escolha! *${srv.nome}* ✅\n\nQual dia você prefere? Pode mandar *hoje*, *amanhã*, dia da semana ou a data 😊`;
    }

    // Escolha de profissional
    if (conv.etapa === 'awaiting_professional') {
      if (!mensagem.toLowerCase().match(/\b(qualquer|tanto faz|qualquer um|nao importa|não importa)\b/)) {
        const num = parseInt(mensagem.trim()) - 1;
        let prof = isNaN(num) ? profissionais.find(p => mensagem.toLowerCase().includes(p.nome.toLowerCase().split(' ')[0])) : profissionais[num];
        if (prof) { conv.dados.profissional = prof.nome; conv.dados.profissionalId = String(prof._id); }
      }
      conv.etapa = 'awaiting_date';
      return `Combinado 😊\n\nQual dia você prefere? Pode mandar *hoje*, *amanhã*, dia da semana ou a data.`;
    }

    // Escolha de data
    if (conv.etapa === 'awaiting_date') {
      const data = _parseData(mensagem);
      if (!data) return `Qual dia você prefere? Pode ser *hoje*, *amanhã*, *sexta*, ou uma data como *15/06* 😊`;
      const srv = servicos.find(s => String(s._id) === conv.dados.servicoId);
      const slots = await _horariosLivres(adminId, data, srv?.duracao||60);
      if (!slots.length) return `Puts, não encontrei horários livres em *${_fmtData(data)}* 😕\n\nQuer tentar outro dia?`;
      conv.dados.data = data;
      conv.etapa = 'awaiting_time';
      return `Esses são os horários livres em *${_fmtData(data)}* 😊\n\n${slots.slice(0,8).join('  ·  ')}\n\nQual você prefere?`;
    }

    // Escolha de horário
    if (conv.etapa === 'awaiting_time') {
      const m = mensagem.match(/\b(\d{1,2})[h:](\d{0,2})\b/);
      let hora = null;
      if (m) hora = String(m[1]).padStart(2,'0')+':'+String(m[2]||'00').padStart(2,'0');
      else {
        const slots = await _horariosLivres(adminId, conv.dados.data, 60);
        hora = slots.find(s => mensagem.includes(s));
      }
      if (!hora) return `Qual horário você prefere? Me manda no formato *14:00* ou *14h* 😊`;
      // Validar disponibilidade
      const srv = servicos.find(s => String(s._id) === conv.dados.servicoId);
      const slots = await _horariosLivres(adminId, conv.dados.data, srv?.duracao||60);
      if (!slots.includes(hora)) return `Puxa, o horário *${hora}* não está disponível 😕\n\nHorários livres: ${slots.slice(0,6).join('  ·  ')}\n\nQual você prefere?`;
      conv.dados.hora = hora;
      conv.etapa = 'awaiting_name';
      return `Perfeito! *${hora}* anotado ✅\n\nPra confirmar, qual é o seu nome completo?`;
    }

    // Nome do cliente
    if (conv.etapa === 'awaiting_name') {
      const nome = mensagem.trim();
      if (nome.length < 2) return `Pode me passar seu nome completo? 😊`;
      conv.dados.nomeCliente = nome;
      conv.etapa = 'awaiting_confirmation';
      const d = conv.dados;
      return `Perfeito, só pra eu não marcar nada errado 😊\n\nConfirma esses dados pra mim?\n\n💼 *Serviço:* ${d.servico}\n${d.profissional?'👤 *Profissional:* '+d.profissional+'\n':''}📅 *Data:* ${_fmtData(d.data)}\n⏰ *Horário:* ${d.hora}\n👤 *Nome:* ${nome}\n\nResponda *confirmar* para finalizar.`;
    }

    // Confirmação
    if (conv.etapa === 'awaiting_confirmation' && intencao === 'confirm_booking') {
      const d = conv.dados;
      // Validar disponibilidade novamente
      const srv = servicos.find(s => String(s._id) === d.servicoId);
      const slots = await _horariosLivres(adminId, d.data, srv?.duracao||60);
      if (!slots.includes(d.hora)) {
        conv.etapa = 'awaiting_time';
        return `Puxa, o horário *${d.hora}* foi preenchido agora 😕\n\nHorários livres em ${_fmtData(d.data)}: ${slots.slice(0,6).join('  ·  ')}\n\nQual você prefere?`;
      }
      const ag = await _criarAgendamento(adminId, conv, { ...d, telefone });
      if (!ag) {
        return `Poxa, não consegui salvar o agendamento agora 😕\n\nTenta pela agenda:\n${linkAgenda}`;
      }
      conv.etapa = 'booked';
      const end = admin.endereco ? `\n📍 *Endereço:* ${admin.endereco}` : '';
      return `Maravilha! Acabei de marcar seu horário ✅\n\n📅 *Data:* ${_fmtData(d.data)}\n⏰ *Horário:* ${d.hora}\n💼 *Serviço:* ${d.servico}${d.profissional?'\n👤 *Profissional:* '+d.profissional:''}${end}\n\nTe esperamos por aqui! Qualquer coisa, é só chamar 😊`;
    }

    // Greeting
    if (intencao === 'greeting') {
      conv.etapa = 'idle';
      const hora = new Date().getHours();
      const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      return `${saud}! Tudo bem? Que bom te ver por aqui 😊\n\nSou a assistente da *${nomeNegocio}*. Posso te ajudar com:\n\n1️⃣ Marcar um horário\n2️⃣ Ver serviços e valores\n3️⃣ Consultar horários livres\n4️⃣ Ver endereço\n5️⃣ Falar com a equipe\n\nSe preferir, agende direto por aqui:\n${linkAgenda}`;
    }

    // Fallback — usar Claude para resposta livre dentro do contexto
    try {
      const listaServicos = servicos.map(s => `- ${s.nome}: R$ ${Number(s.preco||0).toFixed(2)} (${s.duracao||60}min)`).join('\n') || 'Consulte pelo site';
      const system = `Você é a Rebeca, assistente virtual de agendamento da ${nomeNegocio}. Tom: brasileiro, alegre, educado, leve jeito mineiro. Máx 3 linhas. Nunca invente serviços, preços ou horários. Se não souber, mande o link: ${linkAgenda}\n\nSERVIÇOS:\n${listaServicos}\nHORÁRIO: ${horario}`;
      conv.historico.push({ role: 'user', content: mensagem });
      if (conv.historico.length > 8) conv.historico = conv.historico.slice(-8);
      const r = await _claude.messages.create({ model:'claude-haiku-4-5', max_tokens:250, system, messages: conv.historico });
      const resp = r.content[0].text;
      conv.historico.push({ role: 'assistant', content: resp });
      _salvarLog(adminId, 'fallback_claude', { telefone, mensagem });
      return resp;
    } catch(e) {
      return `Uai, acho que não consegui entender direitinho 😅\n\nPosso te ajudar com:\n📅 Agendar horário\n💼 Ver serviços\n⏰ Consultar horários\n💬 Falar com a equipe\n\n${linkAgenda}`;
    }
  }
};

module.exports = AgendaIAService;
