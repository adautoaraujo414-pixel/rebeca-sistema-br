// agenda-ia.service.js — Rebeca Agenda Bot WhatsApp
// SOMENTE Rebeca Agenda — nao afeta Delivery nem Corrida
// Plano R$97: redireciona para agenda online
// Plano R$147: atendimento automatico completo
const Anthropic = require('@anthropic-ai/sdk');
const { AdminAgenda, ServicoAgenda, ProfissionalAgenda, AgendamentoAgenda, ClienteAgenda } = require('../models/AgendaServico');
const { getAgendaPlanFeatures } = require('../utils/agenda-plan-features');

const _claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── ESTADO DE CONVERSAS (global com TTL 30min) ───────────────────────────────
if (!global._agendaConversas) global._agendaConversas = new Map();
if (!global._agendaLogs)      global._agendaLogs      = new Map();

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
      dados: { nomeCliente:'', servico:'', servicoId:null, profissional:'', profissionalId:null, data:'', hora:'', _cancelarId:null },
      humanHandoff: false, handoffAt: null,
      telefone, adminId: String(adminId), tentativas: 0
    });
  }
  const c = global._agendaConversas.get(chave);
  c.ultimaMsg = Date.now();
  return c;
}

function _log(adminId, tipo, dados) {
  const key = String(adminId);
  if (!global._agendaLogs.has(key)) global._agendaLogs.set(key, []);
  const logs = global._agendaLogs.get(key);
  logs.unshift({ tipo, dados, ts: new Date().toISOString() });
  if (logs.length > 200) logs.pop();
}

// ── VARIAÇÕES DE TOM ─────────────────────────────────────────────────────────
const _v = {
  abertura:    ['Maravilha.', 'Perfeito.', 'Combinado.', 'Boa.', 'Deixa comigo.', 'Vou olhar aqui.'],
  consulta:    ['Vou conferir.', 'Ja vejo pra voce.', 'Vou buscar aqui.', 'Deixa eu ver na agenda.', 'Vou checar os horarios.'],
  pedirSrv:    ['Qual servico voce quer marcar?', 'Me fala o servico que voce procura.', 'Qual atendimento voce quer fazer?'],
  pedirData:   ['Qual dia fica melhor?', 'Pra qual dia voce quer?', 'Me fala o dia que voce prefere.'],
  pedirProf:   ['Tem preferencia por profissional?', 'Pode ser qualquer profissional?', 'Quer escolher alguem da equipe?'],
  pedirNome:   ['Me passa seu nome?', 'Qual e o seu nome?', 'Como posso te chamar?'],
  naoAchou:    ['Conferi aqui.', 'Olhei aqui.', 'Nao apareceu pra mim.'],
  fechamento:  ['Te esperamos.', 'Qualquer coisa, e so chamar.', 'Fico feliz em ajudar.'],
  confirmacao: ['Prontinho.', 'Ficou marcado.', 'Ficou certinho.', 'Esta tudo certo.'],
};

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── MSGS CENTRALIZADAS ────────────────────────────────────────────────────────
const MSG = {
  bemVindo(nomeNegocio, linkAgenda) {
    const hora = new Date().getHours();
    const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    return saud + '! Que bom te ver por aqui.\n\nPosso te ajudar com:\n\n1. Marcar horario\n2. Ver servicos\n3. Consultar horarios livres\n4. Ver endereco\n5. Falar com a equipe\n\nSe preferir, acesse a agenda:\n' + linkAgenda;
  },
  pedirServico() {
    return _pick(_v.abertura) + '\n\n' + _pick(_v.pedirSrv);
  },
  listaServicos(servicos, linkAgenda) {
    if (!servicos.length) return _pick(_v.naoAchou) + '\n\nNao apareceu servico cadastrado.\n\nQuer que eu chame a equipe?';
    const lista = servicos.map((s, i) => {
      let linha = (i+1) + '. ' + s.nome;
      if (s.duracao) linha += ' — ' + s.duracao + 'min';
      if (s.preco) linha += ' — R$ ' + Number(s.preco).toFixed(2);
      return linha;
    }).join('\n');
    return _pick(_v.abertura) + '\n\nServicos disponiveis:\n\n' + lista + '\n\nQual deles voce prefere?';
  },
  preco(servico) {
    if (!servico.preco) return 'Olhei aqui.\n\nEsse servico esta cadastrado,\nmas o valor nao apareceu.\n\nQuer que eu veja os horarios?';
    const dur = servico.duracao ? '\nDuracao: ' + servico.duracao + ' minutos.' : '';
    return 'Conferi aqui.\n\n' + servico.nome + ' esta como R$ ' + Number(servico.preco).toFixed(2) + '.' + dur + '\n\nQuer ver horarios?';
  },
  listaProfissionais(profs) {
    if (!profs.length) return 'Conferi aqui.\n\nNao apareceu profissional cadastrado.\n\nPosso buscar pelo proximo horario livre?';
    const lista = profs.map((p, i) => (i+1) + '. ' + p.nome).join('\n');
    return 'Claro.\n\nTemos esses profissionais:\n\n' + lista + '\n\nTem preferencia por algum deles?';
  },
  pedirData() {
    return _pick(_v.consulta) + '\n\n' + _pick(_v.pedirData);
  },
  listaHorarios(data, slots, fmtData) {
    if (!slots.length) return 'Conferi aqui.\n\nPra ' + fmtData + ' nao apareceu horario livre.\n\nQuer tentar outro dia?';
    return 'Achei esses horarios em ' + fmtData + ':\n\n' + slots.slice(0, 8).join('  |  ') + '\n\nQual fica melhor?';
  },
  pedirNome() {
    return 'Boa escolha.\n\n' + _pick(_v.pedirNome);
  },
  resumo(d, fmtData) {
    const prof = d.profissional ? '\nProfissional: ' + d.profissional : '';
    return 'Perfeito, ' + d.nomeCliente + '.\n\nFicou assim:\n\nServico: ' + d.servico + prof + '\nDia: ' + fmtData + '\nHora: ' + d.hora + '\n\nPosso confirmar?';
  },
  sucesso(d, fmtData, endereco) {
    const end = endereco ? '\n\nEndereco:\n' + endereco : '';
    return _pick(_v.confirmacao) + ' ' + d.nomeCliente + '.\n\nSeu horario ficou marcado.' + '\n\nServico: ' + d.servico + '\nDia: ' + fmtData + '\nHora: ' + d.hora + end + '\n\nTe esperamos 😊';
  },
  erroSalvar(linkAgenda) {
    return 'Conferi de novo aqui.\n\nEsse horario nao ficou disponivel.\n\nQuer que eu veja outro?\n\nOu acesse a agenda:\n' + linkAgenda;
  },
  humanHandoff(linkAgenda) {
    return 'Combinado.\n\nVou chamar a equipe pra te ajudar ✅\n\nSe quiser, acesse a agenda:\n' + linkAgenda;
  },
  humanHandoffSemRegistro() {
    return 'Combinado.\n\nVou te orientar por aqui\nda melhor forma.';
  },
  endereco(end) {
    if (!end) return 'Conferi aqui.\n\nO endereco nao apareceu no cadastro.\n\nQuer que eu chame a equipe?';
    return 'Claro.\n\nO endereco cadastrado e:\n\n' + end;
  },
  linkAgenda(link) {
    return 'Voce tambem pode escolher\ndireto pela agenda:\n\n' + link;
  },
  cancelamento(ag, fmtDataFn) {
    return 'Combinado, encontrei esse agendamento:\n\n' + fmtDataFn(new Date(ag.dataHora).toISOString().split('T')[0]) + '\n' + new Date(ag.dataHora).toTimeString().slice(0,5) + '\n' + ag.nomeServico + '\n\nVoce confirma o cancelamento?';
  },
  cancelado(linkAgenda) {
    return 'Combinado, seu agendamento foi cancelado.\n\nSe quiser marcar outro horario:\n' + linkAgenda;
  },
  fallbackConduzido() {
    const ops = [
      'Vamos por partes.\n\nVoce quer marcar horario\nou ver os servicos?',
      'Consigo te ajudar.\n\nVoce quer ver horarios,\nservicos ou falar com a equipe?',
      'Me fala so uma coisinha.\n\nQual servico voce procura?',
    ];
    return _pick(ops);
  },
  erroTecnico(linkAgenda) {
    return 'Deu uma instabilidade aqui.\n\nPra nao te passar nada errado,\nmelhor confirmar pela agenda.\n\n' + linkAgenda;
  },
  planoBasico(nomeNegocio, linkAgenda) {
    return 'Oi! Para marcar seu horario na ' + nomeNegocio + ',\nacesse nossa agenda:\n\n' + linkAgenda + '\n\nQualquer duvida, e so chamar!';
  },
  agradecimento() {
    return 'Imagina.\n\nFico feliz em ajudar 😊\n\nQualquer coisa, e so chamar.';
  },
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function _fmtData(d) {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' }); }
  catch(_) { return d || ''; }
}

function _parseData(texto) {
  const t = (texto || '').toLowerCase().trim();
  const hoje = new Date();
  const pad = n => String(n).padStart(2,'0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  if (t.match(/\bhoje\b/)) return iso(hoje);
  if (t.match(/\bamanh[aa]\b/)) { const d=new Date(hoje); d.setDate(d.getDate()+1); return iso(d); }
  const dias = { segunda:1, terca:2, 'terca-feira':2, quarta:3, quinta:4, sexta:5, sabado:6, domingo:0 };
  for (const [nome, num] of Object.entries(dias)) {
    if (t.includes(nome)) return iso(_proxDia(hoje, num));
  }
  const m = t.match(/(\d{1,2})[/\-](\d{1,2})/);
  if (m) return hoje.getFullYear() + '-' + pad(m[2]) + '-' + pad(m[1]);
  return null;
}

function _proxDia(base, diaSemana) {
  const d = new Date(base);
  let diff = diaSemana - d.getDay();
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function _detectarIntencao(texto, etapaAtual) {
  const t = (texto || '').toLowerCase();
  if (t.match(/\b(oi|ola|boa|bom dia|boa tarde|boa noite|ei|alo)\b/)) return 'greeting';
  if (t.match(/\b(humano|atendente|pessoa|alguem|ajuda real|falar com)\b/)) return 'talk_to_human';
  if (t.match(/\b(cancelar|cancela|desmarcar|desmarco|nao quero mais)\b/)) return 'cancel_booking';
  if (t.match(/\b(remarcar|remarca|mudar|trocar horario|outro dia)\b/)) return 'reschedule_booking';
  if (t.match(/\b(endereco|fica onde|como chego|onde e|localizacao|mapa)\b/)) return 'ask_address';
  if (t.match(/\b(link|site|pagina|agenda online)\b/)) return 'ask_link';
  if (t.match(/\b(obrigad|valeu|brigad|muito bom|otimo|excelente|perfeito)\b/)) return 'thanks';
  if (t.match(/\b(servico|atendimento|o que tem|menu|opcoes|o que faz)\b/)) return 'show_services';
  if (t.match(/\b(quanto custa|preco|valor|cobr|quanto e|quanto tem)\b/)) return 'ask_price';
  if (t.match(/\b(profissional|quem atende|com quem|equipe)\b/)) return 'show_professionals';
  if (t.match(/\b(horario|disponivel|vaga|livre|tem hora|tem vaga|quando)\b/)) return 'ask_times';
  if (t.match(/\b(marcar|agendar|quero marcar|quero agendar|reservar|marca)\b/)) return 'start_booking';
  if (t.match(/\b(confirmar|confirmo|sim|isso mesmo|pode marcar|ok|certo|exato|tudo certo|pode|isso|quero)\b/)) return 'confirm';
  if (t.match(/\b(nao|nope|cancela|errado|mudei|outro)\b/)) return 'nao';
  return 'fallback';
}

// ── DADOS ─────────────────────────────────────────────────────────────────────
async function _buscarCtx(adminId) {
  try {
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return null;
    const servicos = await ServicoAgenda.find({ adminId, ativo: true }).lean();
    const profissionais = await ProfissionalAgenda.find({ adminId, ativo: true }).lean();
    return { admin, servicos, profissionais };
  } catch(e) { return null; }
}

async function _horariosLivres(adminId, data, duracao) {
  try {
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return [];
    const cfg = admin.config || {};
    const ab = cfg.horarioAbertura || '08:00';
    const fe = cfg.horarioFechamento || '18:00';
    const intervalo = Number(duracao) || Number(cfg.intervaloAgendamento) || 60;
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
      min += intervalo;
    }
    return slots;
  } catch(e) { return []; }
}

async function _criarAgendamento(adminId, dados) {
  try {
    const { nomeCliente, telefone, servicoNome, servicoId, profissionalNome, profissionalId, data, hora } = dados;
    const ag = await AgendamentoAgenda.create({
      adminId,
      nomeCliente,
      telefoneCliente: telefone,
      servicoId: servicoId || null,
      nomeServico: servicoNome,
      profissionalId: profissionalId || null,
      nomeProfissional: profissionalNome || '',
      dataHora: new Date(data+'T'+hora+':00'),
      status: 'pendente',
      origem: 'whatsapp_ia'
    });
    await ClienteAgenda.findOneAndUpdate(
      { adminId, telefone },
      { $set: { nome: nomeCliente, telefone }, $setOnInsert: { totalAtendimentos: 0 } },
      { upsert: true }
    );
    try {
      const { notificarAdmin } = require('../routes/agenda-push.routes');
      await notificarAdmin(adminId, 'Agendamento criado', nomeCliente + ' — ' + servicoNome + ' as ' + hora, '/agenda-adm');
    } catch(_) {}
    _log(adminId, 'agendamento_criado', { nomeCliente, servicoNome, data, hora, telefone });
    return ag;
  } catch(e) {
    _log(adminId, 'erro_criar_agendamento', { erro: e.message });
    return null;
  }
}

async function _notificarADM(adminId, titulo, corpo) {
  try {
    const { notificarAdmin } = require('../routes/agenda-push.routes');
    await notificarAdmin(adminId, titulo, corpo, '/agenda-adm');
  } catch(_) {}
}

// ── SERVICO PRINCIPAL ─────────────────────────────────────────────────────────
const AgendaIAService = {

  getLogs(adminId) { return global._agendaLogs.get(String(adminId)) || []; },

  getConversas(adminId) {
    const result = [];
    for (const [k, v] of global._agendaConversas) {
      if (k.startsWith(String(adminId)+'_')) result.push(v);
    }
    return result;
  },

  resetHandoff(adminId, telefone) {
    const c = _getConversa(adminId, telefone);
    c.humanHandoff = false; c.handoffAt = null; c.etapa = 'idle'; c.tentativas = 0;
  },

  async responder(telefone, mensagem, adminId) {
    _limparAntigas();

    const ctx = await _buscarCtx(adminId);
    if (!ctx) return null;

    const { admin, servicos, profissionais } = ctx;
    const features = getAgendaPlanFeatures(admin.plano);
    const nomeNegocio = admin.nomeNegocio || 'nossa agenda';
    const linkAgenda = (process.env.APP_URL || '') + '/espaco-digital?id=' + adminId;

    // Plano R$97 — sem automacao completa
    if (!features.canUseWhatsappAutomation) {
      return MSG.planoBasico(nomeNegocio, linkAgenda);
    }

    const conv = _getConversa(adminId, telefone);

    // Human handoff ativo
    if (conv.humanHandoff) {
      const elapsed = Date.now() - (conv.handoffAt || 0);
      if (elapsed < 30 * 60 * 1000) { _log(adminId, 'handoff_ativo', { telefone }); return null; }
      conv.humanHandoff = false;
    }

    // Ignorar mensagem propria do bot
    const msgLower = (mensagem || '').toLowerCase().trim();
    if (!msgLower || msgLower.length < 1) return null;

    const intencao = _detectarIntencao(mensagem, conv.etapa);
    _log(adminId, 'mensagem_recebida', { telefone, mensagem: mensagem.substring(0,80), intencao, etapa: conv.etapa });

    // ── ETAPA: aguardando cancelamento
    if (conv.etapa === 'awaiting_cancel_confirm') {
      if (intencao === 'confirm') {
        try {
          await AgendamentoAgenda.findByIdAndUpdate(conv.dados._cancelarId, { status: 'cancelado' });
          conv.etapa = 'idle'; conv.dados._cancelarId = null;
          _log(adminId, 'agendamento_cancelado', { telefone });
          return MSG.cancelado(linkAgenda);
        } catch(_) { return MSG.erroTecnico(linkAgenda); }
      } else {
        conv.etapa = 'idle';
        return 'Tudo bem.\n\nSeu horario foi mantido.\n\nQualquer coisa, e so chamar.';
      }
    }

    // ── ETAPA: aguardando servico
    if (conv.etapa === 'awaiting_service') {
      const num = parseInt(mensagem.trim()) - 1;
      let srv = null;
      if (!isNaN(num) && servicos[num]) {
        srv = servicos[num];
      } else {
        srv = servicos.find(s => mensagem.toLowerCase().split(/\s+/).some(t => t.length > 3 && s.nome.toLowerCase().includes(t)));
      }
      if (srv) {
        conv.dados.servico = srv.nome;
        conv.dados.servicoId = String(srv._id);
        _log(adminId, 'servico_escolhido', { telefone, servico: srv.nome });
        if (profissionais.length > 0) {
          conv.etapa = 'awaiting_professional';
          return _pick(_v.abertura) + '\n\n' + _pick(_v.pedirProf) + '\n\n' + profissionais.map((p,i) => (i+1)+'. '+p.nome).join('\n') + '\n\nOu me diz "qualquer um".';
        }
        conv.etapa = 'awaiting_date';
        return MSG.pedirData();
      }
      conv.tentativas++;
      if (conv.tentativas >= 3) {
        conv.tentativas = 0;
        return 'Deixa eu te mandar a lista novamente.\n\n' + MSG.listaServicos(servicos, linkAgenda);
      }
      return 'Me manda o numero ou o nome\ndo servico da lista. 😊';
    }

    // ── ETAPA: aguardando profissional
    if (conv.etapa === 'awaiting_professional') {
      const qualquer = mensagem.toLowerCase().match(/(qualquer|tanto faz|qualquer um|nao importa|pode ser qualquer)/);
      if (!qualquer) {
        const num = parseInt(mensagem.trim()) - 1;
        let prof = !isNaN(num) && profissionais[num] ? profissionais[num] : profissionais.find(p => mensagem.toLowerCase().includes(p.nome.toLowerCase().split(' ')[0]));
        if (prof) { conv.dados.profissional = prof.nome; conv.dados.profissionalId = String(prof._id); }
      }
      conv.etapa = 'awaiting_date';
      return MSG.pedirData();
    }

    // ── ETAPA: aguardando data
    if (conv.etapa === 'awaiting_date') {
      const data = _parseData(mensagem);
      if (!data) return 'Qual dia voce prefere?\n\nPode ser *hoje*, *amanha*,\num dia da semana ou uma data. 😊';
      const srv = servicos.find(s => String(s._id) === conv.dados.servicoId);
      const slots = await _horariosLivres(adminId, data, srv && srv.duracao);
      _log(adminId, 'horarios_consultados', { telefone, data });
      conv.dados.data = data;
      conv.etapa = 'awaiting_time';
      return MSG.listaHorarios(data, slots, _fmtData(data));
    }

    // ── ETAPA: aguardando horario
    if (conv.etapa === 'awaiting_time') {
      const m = mensagem.match(/(\d{1,2})[h:](\d{0,2})/);
      let hora = null;
      if (m) hora = String(m[1]).padStart(2,'0') + ':' + String(m[2]||'00').padStart(2,'0');
      else {
        const srv = servicos.find(s => String(s._id) === conv.dados.servicoId);
        const slots = await _horariosLivres(adminId, conv.dados.data, srv && srv.duracao);
        hora = slots.find(s => mensagem.includes(s));
      }
      if (!hora) return 'Me manda o horario que voce prefere.\n\nExemplo: *14:00* ou *14h*';
      const srv2 = servicos.find(s => String(s._id) === conv.dados.servicoId);
      const slots2 = await _horariosLivres(adminId, conv.dados.data, srv2 && srv2.duracao);
      if (!slots2.includes(hora)) {
        return 'Puxa, esse horario nao esta disponivel.\n\nHorarios livres:\n' + slots2.slice(0,6).join('  |  ') + '\n\nQual voce prefere?';
      }
      conv.dados.hora = hora;
      conv.etapa = 'awaiting_name';
      return MSG.pedirNome();
    }

    // ── ETAPA: aguardando nome
    if (conv.etapa === 'awaiting_name') {
      const nome = mensagem.trim();
      if (nome.length < 2 || nome.match(/^\d+$/)) return 'Me passa seu nome completo, por favor.';
      conv.dados.nomeCliente = nome;
      conv.etapa = 'awaiting_confirmation';
      return MSG.resumo(conv.dados, _fmtData(conv.dados.data));
    }

    // ── ETAPA: aguardando confirmacao
    if (conv.etapa === 'awaiting_confirmation') {
      if (intencao === 'nao') {
        conv.etapa = 'awaiting_service';
        return 'Sem problema.\n\n' + MSG.pedirServico();
      }
      if (intencao === 'confirm') {
        const srv = servicos.find(s => String(s._id) === conv.dados.servicoId);
        const slots = await _horariosLivres(adminId, conv.dados.data, srv && srv.duracao);
        if (!slots.includes(conv.dados.hora)) {
          conv.etapa = 'awaiting_time';
          return 'Conferi aqui.\n\nEsse horario foi preenchido agora.\n\nHorarios livres em ' + _fmtData(conv.dados.data) + ':\n' + slots.slice(0,6).join('  |  ') + '\n\nQual voce prefere?';
        }
        const ag = await _criarAgendamento(adminId, { ...conv.dados, telefone });
        if (!ag) return MSG.erroTecnico(linkAgenda);
        conv.etapa = 'booked';
        await _notificarADM(adminId, 'Agendamento criado', conv.dados.nomeCliente + ' — ' + conv.dados.servico + ' as ' + conv.dados.hora);
        return MSG.sucesso(conv.dados, _fmtData(conv.dados.data), admin.endereco);
      }
      return MSG.resumo(conv.dados, _fmtData(conv.dados.data));
    }

    // ── INTENCOES DIRETAS ─────────────────────────────────────────────────────

    if (intencao === 'greeting') {
      conv.etapa = 'idle'; conv.tentativas = 0;
      await _notificarADM(adminId, 'Novo atendimento no WhatsApp', telefone + ' iniciou uma conversa.');
      return MSG.bemVindo(nomeNegocio, linkAgenda);
    }

    if (intencao === 'thanks') {
      return MSG.agradecimento();
    }

    if (intencao === 'talk_to_human') {
      conv.humanHandoff = true; conv.handoffAt = Date.now(); conv.etapa = 'human_handoff';
      await _notificarADM(adminId, 'Cliente pediu ajuda humana', telefone + ' quer atendimento humano.');
      _log(adminId, 'human_handoff', { telefone });
      return MSG.humanHandoff(linkAgenda);
    }

    if (intencao === 'ask_address') {
      return MSG.endereco(admin.endereco);
    }

    if (intencao === 'ask_link') {
      return MSG.linkAgenda(linkAgenda);
    }

    if (intencao === 'show_services') {
      _log(adminId, 'servicos_consultados', { telefone });
      return MSG.listaServicos(servicos, linkAgenda);
    }

    if (intencao === 'ask_price') {
      const termos = mensagem.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      const encontrado = servicos.find(s => termos.some(t => s.nome.toLowerCase().includes(t)));
      if (encontrado) { _log(adminId, 'preco_consultado', { telefone, servico: encontrado.nome }); return MSG.preco(encontrado); }
      return MSG.listaServicos(servicos, linkAgenda);
    }

    if (intencao === 'show_professionals') {
      _log(adminId, 'profissionais_consultados', { telefone });
      return MSG.listaProfissionais(profissionais);
    }

    if (intencao === 'ask_times') {
      const dataParsed = _parseData(mensagem);
      if (!dataParsed) {
        if (!conv.dados.servicoId) {
          conv.etapa = 'awaiting_service';
          return 'Consigo olhar sim.\n\n' + _pick(_v.pedirSrv);
        }
        conv.etapa = 'awaiting_date';
        return MSG.pedirData();
      }
      const srv = servicos.find(s => String(s._id) === conv.dados.servicoId);
      const slots = await _horariosLivres(adminId, dataParsed, srv && srv.duracao);
      _log(adminId, 'horarios_consultados', { telefone, data: dataParsed });
      return MSG.listaHorarios(dataParsed, slots, _fmtData(dataParsed));
    }

    if (intencao === 'cancel_booking') {
      const ags = await AgendamentoAgenda.find({
        adminId, telefoneCliente: { $regex: telefone.replace(/\D/g,'').slice(-9) },
        status: { $in: ['pendente','confirmado'] }, dataHora: { $gte: new Date() }
      }).sort({ dataHora: 1 }).limit(1).lean();
      if (!ags.length) return 'Nao encontrei agendamento futuro\npara esse numero.\n\nQuer marcar um horario?';
      conv.etapa = 'awaiting_cancel_confirm'; conv.dados._cancelarId = String(ags[0]._id);
      return MSG.cancelamento(ags[0], _fmtData);
    }

    if (intencao === 'start_booking') {
      conv.etapa = 'awaiting_service';
      _log(adminId, 'inicio_agendamento', { telefone });
      return MSG.listaServicos(servicos, linkAgenda);
    }

    // ── FALLBACK CONDUZIDO (nunca diz "nao entendi") ──────────────────────────
    conv.tentativas = (conv.tentativas || 0) + 1;

    // Apos 3 tentativas sem entender, oferecer humano
    if (conv.tentativas >= 3) {
      conv.tentativas = 0;
      try {
        await _notificarADM(adminId, 'Sistema precisa de atencao', telefone + ' nao encontrou a informacao que procurava.');
      } catch(_) {}
      return 'Vou chamar a equipe pra te ajudar melhor.\n\nEnquanto isso, acesse a agenda:\n' + linkAgenda;
    }

    // Fallback com Claude — contexto real, sem inventar
    try {
      const listaServicos = servicos.map(s => s.nome + (s.preco ? ' R$'+Number(s.preco).toFixed(2) : '') + (s.duracao ? ' '+s.duracao+'min' : '')).join(', ') || 'Consulte pela agenda';
      const system = 'Voce e a assistente de agendamento da ' + nomeNegocio + '. Tom: brasileiro, educado, mensagens curtas (max 4 linhas). Nunca invente servico, preco ou horario. Se nao souber, mande: ' + linkAgenda + '. SERVICOS REAIS: ' + listaServicos + '. Nunca diga "nao entendi" — sempre conduza para uma acao.';
      conv.historico.push({ role: 'user', content: mensagem });
      if (conv.historico.length > 6) conv.historico = conv.historico.slice(-6);
      const r = await _claude.messages.create({ model:'claude-haiku-4-5', max_tokens:200, system, messages: conv.historico });
      const resp = r.content[0].text;
      conv.historico.push({ role: 'assistant', content: resp });
      _log(adminId, 'fallback_claude', { telefone });
      return resp;
    } catch(e) {
      return MSG.fallbackConduzido();
    }
  }
};

module.exports = AgendaIAService;
