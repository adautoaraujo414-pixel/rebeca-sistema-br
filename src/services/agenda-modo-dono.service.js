// agenda-modo-dono.service.js
// Modo Rebeca pelo WhatsApp — comandos do dono/admin pelo número conectado
// NÃO afeta Delivery nem Corrida. NÃO cria nova instância.

const axios = require('axios');
const { AdminAgenda, AgendamentoAgenda, FinanceiroAgenda, BloqueioAgenda, ClienteAgenda } = require('../models/AgendaServico');
const { InstanciaWhatsapp } = require('../models');

const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-794f.up.railway.app';
const EVOLUTION_GLOBAL_KEY = process.env.EVOLUTION_API_KEY || null;

// ── Personalidade Rebeca ─────────────────────────────────────────────────────
function _saudacao() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function _chefe() {
  const opcoes = ['chefe', 'chefa', 'patrão', 'patroa', 'chefão'];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

function _confirmacao() {
  const opcoes = [
    'Maravilha! Já anotei aqui. ✅',
    'Feito, ' + _chefe() + '! Tá registrado. 💙',
    'Prontinho! Já tá no sistema. 🎉',
    'Pode deixar, ' + _chefe() + '! Já tá anotado. ✅',
    'Ótimo! Já resolvi aqui. 💪'
  ];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

function _erro() {
  const opcoes = [
    'Eita, não entendi direito não. 😅',
    'Hmm, me explica melhor, ' + _chefe() + '?',
    'Não consegui pegar essa, pode repetir de outro jeito?'
  ];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

// ── Normalizar telefone (remover +, espaços, traços) ─────────────────────────
function _normalizarTel(tel) {
  if (!tel) return '';
  return String(tel).replace(/\D/g, '').replace(/^0/, '');
}

// ── Verificar se telefone é do dono/autorizado ───────────────────────────────
function isDono(telefoneRemetente, admin) {
  const telNorm = _normalizarTel(telefoneRemetente);
  if (!telNorm) return false;

  const candidatos = [
    admin.telefone,
    admin.whatsapp,
    ...((admin.modoWhatsappDono && admin.modoWhatsappDono.telefonesAutorizados) || [])
  ].filter(Boolean).map(_normalizarTel);

  return candidatos.some(c => c && (telNorm.endsWith(c) || c.endsWith(telNorm) || telNorm === c));
}

// ── Enviar mensagem pela instância conectada do admin ────────────────────────
async function _enviarMsg(instancia, numero, texto, instanciaResposta = null) {
  try {
    const apiKey = instancia.apiKey || EVOLUTION_GLOBAL_KEY;
    const baseUrl = instancia.apiUrl || EVOLUTION_BASE_URL;
    await axios.post(
      `${baseUrl}/message/sendText/${instancia.nomeInstancia}`,
      { number: numero, text: texto },
      { headers: { apikey: apiKey, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    console.log('[ModoDono] Mensagem enviada para', numero);
  } catch(e) {
    console.error('[ModoDono] Erro ao enviar msg:', e.message);
  }
}

// ── Enviar boas-vindas (apenas uma vez por admin) ─────────────────────────────
async function enviarBoasVindas(adminId) {
  try {
    const admin = await AdminAgenda.findById(adminId);
    if (!admin) return;
    if (admin.modoWhatsappDono && admin.modoWhatsappDono.boasVindasEnviado) return;

    const instancia = await InstanciaWhatsapp.findOne({ adminId, adminTipo: 'agenda', status: 'conectado' }).lean();
    if (!instancia) return;

    const telDono = _normalizarTel(admin.whatsapp || admin.telefone);
    if (!telDono) {
      console.log('[ModoDono] Nenhum telefone do dono configurado para boas-vindas');
      return;
    }

    const msg = `Olá, eu sou a Rebeca, sua funcionária digital. 💙

A partir de agora, você pode falar comigo por aqui sempre que precisar organizar sua rotina.

Você pode me pedir, por exemplo:
- *Rebeca, hoje vou trabalhar das 8h às 18h*
- *Rebeca, bloqueia amanhã das 12h às 14h*
- *Rebeca, mostra minha agenda de hoje*
- *Rebeca, registra uma entrada de R$120 no Pix*
- *Rebeca, registra um gasto de R$50 em produtos*
- *Rebeca, quanto faturei hoje?*

Eu atualizo sua agenda, organizo seus horários, registro entradas e gastos, aviso novos agendamentos e mantenho seu painel em dia.

Sempre que precisar, é só me chamar por aqui. 😊`;

    await _enviarMsg(instancia, telDono, msg);

    await AdminAgenda.findByIdAndUpdate(adminId, {
      'modoWhatsappDono.ativo': true,
      'modoWhatsappDono.boasVindasEnviado': true
    });
    console.log('[ModoDono] Boas-vindas enviadas para', telDono);
  } catch(e) {
    console.error('[ModoDono] Erro boas-vindas:', e.message);
  }
}

// ── Parser de data/hora simples ───────────────────────────────────────────────
function _parseDia(txt) {
  const hoje = new Date();
  if (/\bhoje\b/i.test(txt)) return new Date(hoje);
  if (/\bamanhã\b|\bamanha\b/i.test(txt)) {
    const d = new Date(hoje); d.setDate(d.getDate()+1); return d;
  }
  if (/\bsegunda\b/i.test(txt)) { const d = new Date(hoje); d.setDate(d.getDate()+(1+(7-d.getDay())%7||7)); return d; }
  if (/\bterca\b|\bterça\b/i.test(txt)) { const d = new Date(hoje); d.setDate(d.getDate()+(2+(7-d.getDay())%7||7)); return d; }
  if (/\bquarta\b/i.test(txt)) { const d = new Date(hoje); d.setDate(d.getDate()+(3+(7-d.getDay())%7||7)); return d; }
  if (/\bquinta\b/i.test(txt)) { const d = new Date(hoje); d.setDate(d.getDate()+(4+(7-d.getDay())%7||7)); return d; }
  if (/\bsexta\b/i.test(txt)) { const d = new Date(hoje); d.setDate(d.getDate()+(5+(7-d.getDay())%7||7)); return d; }
  // dd/mm
  const dm = txt.match(/(\d{1,2})\/(\d{1,2})/);
  if (dm) {
    const d = new Date(hoje.getFullYear(), parseInt(dm[2])-1, parseInt(dm[1]));
    return d;
  }
  return null;
}

function _parseHora(txt) {
  const m = txt.match(/(\d{1,2})h(?:(\d{2})?)?/i) || txt.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { h: parseInt(m[1]), min: parseInt(m[2]||'0') };
}

function _fmtData(d) {
  return d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit' });
}

function _fmtHora(d) {
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

// ── Processar comando do dono ────────────────────────────────────────────────
async function processarComandoDono(telefone, mensagem, adminId, instanciaResposta = null) {
  const msg = (mensagem || '').trim();
  const msgL = msg.toLowerCase();
  const adminObjId = adminId;

  const admin = await AdminAgenda.findById(adminObjId).lean();
  if (!admin) return null;

  const instancia = await InstanciaWhatsapp.findOne({ adminId: adminObjId, adminTipo: 'agenda' }).lean();
  if (!instancia) return null;

  async function responder(texto) {
    const _inst = instanciaResposta || instancia;
    const _num  = instanciaResposta?.numero || telefone;
    await _enviarMsg(_inst, _num, texto);
  }

  // ── AGENDA DE HOJE ─────────────────────────────────────────────────────────
  if (/\bagenda\s*(de\s*)?(hoje|amanhã|amanha)\b/i.test(msgL) || /\bmostra\s*(minha\s*)?agenda\b/i.test(msgL)) {
    const dia = /amanhã|amanha/i.test(msgL) ? (() => { const d = new Date(); d.setDate(d.getDate()+1); return d; })() : new Date();
    const ini = new Date(dia); ini.setHours(0,0,0,0);
    const fim = new Date(dia); fim.setHours(23,59,59,999);
    const ags = await AgendamentoAgenda.find({
      adminId: adminObjId,
      dataHora: { $gte: ini, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();

    if (!ags.length) {
      await responder(`${_saudacao()}, ${_chefe()}! 😊\n\nNão tem nenhum agendamento ${/amanhã|amanha/i.test(msgL)?'para amanhã':'pra hoje' } não. Tá livre! 🎉`);
      return true;
    }

    const lista = ags.map(a =>
      `• ${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente} (${a.nomeServico})`
    ).join('\n');
    await responder(`${_saudacao()}! Olha a agenda ${/amanhã|amanha/i.test(msgL)?'de amanhã':'de hoje'} pra você, ${_chefe()}! 📅\n\n${lista}\n\n${ags.length} agendamento(s) no total. Bora lá! 💪`);
    return true;
  }

  // ── BLOQUEAR HORÁRIO ───────────────────────────────────────────────────────
  if (/\bbloquei?a?\b/i.test(msgL)) {
    const dia = _parseDia(msgL);
    // Pegar horas "das Xh às Yh"
    const rangeM = msg.match(/das?\s*(\d{1,2}h?\d{0,2})\s*(?:às?|as)\s*(\d{1,2}h?\d{0,2})/i);
    if (dia && rangeM) {
      const h1 = _parseHora(rangeM[1]);
      const h2 = _parseHora(rangeM[2]);
      if (h1 && h2) {
        const ini = new Date(dia); ini.setHours(h1.h, h1.min, 0, 0);
        const fim = new Date(dia); fim.setHours(h2.h, h2.min, 0, 0);
        await BloqueioAgenda.create({
          adminId: adminObjId,
          inicio: ini, fim,
          motivo: 'Bloqueio via WhatsApp'
        });
        await responder(`🔒 ${_confirmacao()}\n\nBloqueio feito em ${_fmtData(dia)}, das ${_fmtHora(ini)} às ${_fmtHora(fim)}. Ninguém agenda nesse horário não! 😉`);
        return true;
      }
    }
    await responder(`${_erro()} Tente assim: *Rebeca, bloqueia amanhã das 12h às 14h* 😊`);
    return true;
  }

  // ── DEFINIR HORÁRIO DE TRABALHO ────────────────────────────────────────────
  if (/\bvou\s*trabalhar\b/i.test(msgL) || /\bhor[aá]rio\s*(de\s*)?(hoje|trabalho|funcionamento)\b/i.test(msgL)) {
    const rangeM = msg.match(/das?\s*(\d{1,2}h?\d{0,2})\s*(?:às?|as)\s*(\d{1,2}h?\d{0,2})/i);
    if (rangeM) {
      const h1 = _parseHora(rangeM[1]);
      const h2 = _parseHora(rangeM[2]);
      if (h1 && h2) {
        const abertura = `${String(h1.h).padStart(2,'0')}:${String(h1.min).padStart(2,'0')}`;
        const fechamento = `${String(h2.h).padStart(2,'0')}:${String(h2.min).padStart(2,'0')}`;
        await AdminAgenda.findByIdAndUpdate(adminObjId, {
          'config.horarioAbertura': abertura,
          'config.horarioFechamento': fechamento
        });
        await responder(`Anotei aqui, ${_chefe()}! ✅\n\nHoje você trabalha das *${abertura}* às *${fechamento}*. Pode vir cliente! 🚀`);
        return true;
      }
    }
    await responder(`${_erro()} Me fala assim: *Rebeca, hoje vou trabalhar das 8h às 18h* 😊`);
    return true;
  }

  // ── REGISTRAR ENTRADA FINANCEIRA ───────────────────────────────────────────
  if (/\bregistra\b.*\bentrada\b|\breceb[ei]\b.*\bR?\$|\bentrada\b.*\bR?\$/i.test(msgL)) {
    const valM = msg.match(/R?\$\s*(\d+(?:[.,]\d{1,2})?)/i);
    const val = valM ? parseFloat(valM[1].replace(',','.')) : null;
    const descM = msg.match(/(?:no|em|de|via)\s+([A-Za-zÀ-ú\s]+?)(?:\s*$|\s*R?\$)/i);
    const desc = descM ? descM[1].trim() : 'Entrada via WhatsApp';
    if (val) {
      await FinanceiroAgenda.create({
        adminId: adminObjId,
        tipo: 'entrada',
        valor: val,
        descricao: desc,
        data: new Date(),
        origem: 'whatsapp_dono'
      });
      await responder(`${_confirmacao()}\n\n💰 Entrada de *R$ ${val.toFixed(2)}* registrada — ${desc}. Dinheiro entrando é sempre bom! 🤑`);
      return true;
    }
    await responder(`${_erro()} Me fala assim: *Rebeca, registra uma entrada de R$120 no Pix* 💰`);
    return true;
  }

  // ── REGISTRAR GASTO ────────────────────────────────────────────────────────
  if (/\bregistra\b.*\bgasto\b|\bpaguei\b|\bcomprei\b|\bsaída\b|\bsaida\b/i.test(msgL)) {
    const valM = msg.match(/R?\$\s*(\d+(?:[.,]\d{1,2})?)/i);
    const val = valM ? parseFloat(valM[1].replace(',','.')) : null;
    const descM = msg.match(/(?:em|de|no|com)\s+([A-Za-zÀ-ú\s]+?)(?:\s*$|\s*R?\$)/i);
    const desc = descM ? descM[1].trim() : 'Gasto via WhatsApp';
    if (val) {
      await FinanceiroAgenda.create({
        adminId: adminObjId,
        tipo: 'saida',
        valor: val,
        descricao: desc,
        data: new Date(),
        origem: 'whatsapp_dono'
      });
      await responder(`${_confirmacao()}\n\n💸 Gasto de *R$ ${val.toFixed(2)}* anotado — ${desc}. Registrado direitinho! 📝`);
      return true;
    }
    await responder(`${_erro()} Me fala assim: *Rebeca, registra um gasto de R$50 em produtos* 💸`);
    return true;
  }

  // ── FATURAMENTO ────────────────────────────────────────────────────────────
  if (/\bfaturei\b|\bfaturamento\b|\bquanto\s*(entrou|fiz|ganhei)\b/i.test(msgL)) {
    const dia = _parseDia(msgL) || new Date();
    const ini = new Date(dia); ini.setHours(0,0,0,0);
    const fim = new Date(dia); fim.setHours(23,59,59,999);

    const lancamentos = await FinanceiroAgenda.find({
      adminId: adminObjId,
      data: { $gte: ini, $lte: fim }
    }).lean();

    const entradas = lancamentos.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+l.valor,0);
    const saidas = lancamentos.filter(l=>l.tipo==='saida').reduce((s,l)=>s+l.valor,0);
    const agendamentos = await AgendamentoAgenda.countDocuments({
      adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['confirmado','concluido'] }
    });

    await responder(
      `${_saudacao()}, ${_chefe()}! Olha o resumo aí 👇\n\n` +
      `📅 *${_fmtData(dia)}*\n\n` +
      `💰 Entradas: *R$ ${entradas.toFixed(2)}*\n` +
      `💸 Gastos: *R$ ${saidas.toFixed(2)}*\n` +
      `📈 Resultado: *R$ ${(entradas-saidas).toFixed(2)}*\n` +
      `✅ Atendimentos: *${agendamentos}*\n\n` +
      `${(entradas-saidas) >= 0 ? 'Tá indo bem! Continue assim! 🚀' : 'Fica tranquilo(a), amanhã compensa! 💪'}`
    );
    return true;
  }

  // ── CANCELAR AGENDAMENTO ───────────────────────────────────────────────────
  if (/\bcancela\b.*\bagendamento\b|\bcancela\b.*\bhor[aá]rio\b/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia = _parseDia(msgL) || new Date();
    if (hora) {
      const ini = new Date(dia); ini.setHours(hora.h, hora.min-5, 0, 0);
      const fim = new Date(dia); fim.setHours(hora.h, hora.min+5, 0, 0);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $ne: 'cancelado' }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'cancelado' });
        await responder(`Feito, ${_chefe()}! 😊\n\nCancelei o agendamento de *${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))}. Horário liberado! 🔓`);
        return true;
      }
    }
    await responder(`${_erro()} Tente assim: *Rebeca, cancela o agendamento das 14h* 😊`);
    return true;
  }

  // ── CONFIRMAR AGENDAMENTO ──────────────────────────────────────────────────
  if (/\bconfirma\b.*\bhor[aá]rio\b|\bconfirma\b.*\bagendamento\b|\bconfirma\b.*\b\d{1,2}h\b/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia = _parseDia(msgL) || new Date();
    if (hora) {
      const ini = new Date(dia); ini.setHours(hora.h, hora.min-5, 0, 0);
      const fim = new Date(dia); fim.setHours(hora.h, hora.min+5, 0, 0);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: 'pendente'
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'confirmado' });
        await responder(`Maravilha, ${_chefe()}! 🎉\n\nConfirmei o horário de *${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))}. Pode esperar o cliente! 💙`);
        return true;
      }
    }
    await responder(`${_erro()} Tente assim: *Rebeca, confirma o agendamento das 14h* 😊`);
    return true;
  }

  // ── CLIENTES INATIVOS ──────────────────────────────────────────────────────
  if (/\bclientes?\s*inativo\b|\binativos?\b/i.test(msgL)) {
    const dias = 30;
    const corte = new Date(Date.now() - dias*24*60*60*1000);
    const inativos = await ClienteAgenda.find({
      adminId: adminObjId,
      ultimoAtendimento: { $lt: corte, $exists: true }
    }).sort({ ultimoAtendimento: 1 }).limit(5).lean();
    if (!inativos.length) {
      await responder(`${_saudacao()}, ${_chefe()}! 🎉\n\nNenhum cliente inativo nos últimos 30 dias não! Todo mundo voltando direitinho! 💪`);
      return true;
    }
    const lista = inativos.map(c => {
      const d = Math.floor((Date.now()-new Date(c.ultimoAtendimento))/(86400000));
      return `• ${c.nome} — ${d} dias sem vir`;
    }).join('\n');
    await responder(`👥 *Clientes inativos (30d+):*\n\n${lista}`);
    return true;
  }

  // ── AJUDA ──────────────────────────────────────────────────────────────────
  if (/\bajuda\b|\bcomandos?\b|\bo que\s*(você|voce)\s*(faz|pode)\b/i.test(msgL)) {
    await responder(
      `💙 *Comandos disponíveis:*\n\n` +
      `📅 *Agenda*\n• Rebeca, mostra minha agenda de hoje\n• Rebeca, mostra minha agenda de amanhã\n\n` +
      `🔒 *Bloqueio*\n• Rebeca, bloqueia amanhã das 12h às 14h\n\n` +
      `⏰ *Horário*\n• Rebeca, hoje vou trabalhar das 8h às 18h\n\n` +
      `💰 *Financeiro*\n• Rebeca, registra uma entrada de R$120 no Pix\n• Rebeca, registra um gasto de R$50 em produtos\n• Rebeca, quanto faturei hoje?\n\n` +
      `✅ *Agendamentos*\n• Rebeca, confirma o agendamento das 14h\n• Rebeca, cancela o agendamento das 14h\n\n` +
      `👥 *Clientes*\n• Rebeca, clientes inativos`
    );
    return true;
  }

  // ── NÃO RECONHECIDO ────────────────────────────────────────────────────────
  await responder(`${_erro()}\n\nDigita *ajuda* pra ver tudo que eu sei fazer por você, ${_chefe()}! 💙`);
  return false;
}

// ── Notificar dono sobre novo agendamento ────────────────────────────────────
async function notificarDonoNovoAgendamento(adminId, dadosAg) {
  try {
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return;

    const telDono = _normalizarTel(admin.whatsapp || admin.telefone);
    if (!telDono) return;

    const instancia = await InstanciaWhatsapp.findOne({ adminId, adminTipo: 'agenda' }).lean();
    if (!instancia || instancia.status !== 'conectado') return;

    const dataHora = new Date(dadosAg.dataHora);
    const msg =
      `📅 *Novo agendamento!*\n\n` +
      `👤 Cliente: ${dadosAg.nomeCliente}\n` +
      `✂️ Serviço: ${dadosAg.nomeServico}\n` +
      `📆 Data: ${_fmtData(dataHora)}\n` +
      `⏰ Hora: ${_fmtHora(dataHora)}\n` +
      (dadosAg.nomeProfissional ? `👩 Profissional: ${dadosAg.nomeProfissional}\n` : '') +
      `\nPara ver todos os agendamentos, acesse seu painel.`;

    await _enviarMsg(instancia, telDono, msg);
  } catch(e) {
    console.error('[ModoDono] Erro ao notificar novo agendamento:', e.message);
  }
}

module.exports = { isDono, enviarBoasVindas, processarComandoDono, notificarDonoNovoAgendamento, processarComandoAdmin: (texto, adminId, instOfc) => processarComandoDono(instOfc?.numero || '', texto, adminId, instOfc) };

// ── LEMBRETE AUTOMÁTICO 30min antes ─────────────────────────────────────────
async function rodarLembretes() {
  try {
    const agora = new Date();
    const em30  = new Date(agora.getTime() + 30 * 60000);
    const em35  = new Date(agora.getTime() + 35 * 60000);

    const proximos = await AgendamentoAgenda.find({
      dataHora: { $gte: em30, $lte: em35 },
      status: { $in: ['pendente', 'confirmado'] },
      lembreteDonoEnviado: { $ne: true }
    }).lean();

    for (const ag of proximos) {
      try {
        const admin    = await AdminAgenda.findById(ag.adminId).lean();
        if (!admin) continue;
        const telDono  = _normalizarTel(admin.whatsapp || admin.telefone);
        if (!telDono) continue;

        const inst = await InstanciaWhatsapp.findOne({ adminId: String(ag.adminId), adminTipo: 'agenda', status: 'conectado' }).lean();
        if (!inst) continue;

        const hora = _fmtHora(new Date(ag.dataHora));
        await _enviarMsg(inst, telDono,
          `⏰ *Atenção, ${_chefe()}!*\n\n` +
          `*${ag.nomeCliente}* tá chegando em uns 30 minutinhos! 😊\n` +
          `🕐 Horário: ${hora}\n` +
          `✂️ Serviço: ${ag.nomeServico || '—'}\n\n` +
          `Se quiser confirmar: *Rebeca, confirma o agendamento das ${hora}* 💙`
        );

        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { lembreteDonoEnviado: true });
        console.log('[ModoDono] Lembrete enviado para', telDono, ag.nomeCliente);
      } catch(e) {
        console.error('[ModoDono] Erro lembrete individual:', e.message);
      }
    }
  } catch(e) {
    console.error('[ModoDono] Erro rodarLembretes:', e.message);
  }
}

// ── RELATÓRIO DIÁRIO AUTOMÁTICO ──────────────────────────────────────────────
async function rodarRelatorioDiario() {
  try {
    const admins = await require('../models/AgendaServico').AdminAgenda.find({
      ativo: true,
      'config.relatorioDiario': { $ne: false }
    }).lean();

    const ontem     = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ini = new Date(ontem); ini.setHours(0,0,0,0);
    const fim = new Date(ontem); fim.setHours(23,59,59,999);

    for (const admin of admins) {
      try {
        const telDono = _normalizarTel(admin.whatsapp || admin.telefone);
        if (!telDono) continue;

        const inst = await InstanciaWhatsapp.findOne({ adminId: String(admin._id), adminTipo: 'agenda', status: 'conectado' }).lean();
        if (!inst) continue;

        const lancamentos = await FinanceiroAgenda.find({ adminId: String(admin._id), data: { $gte: ini, $lte: fim } }).lean();
        const entradas    = lancamentos.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
        const saidas      = lancamentos.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
        const atendidos   = await AgendamentoAgenda.countDocuments({ adminId: String(admin._id), dataHora: { $gte: ini, $lte: fim }, status: { $in: ['confirmado','concluido'] } });

        await _enviarMsg(inst, telDono,
          `🌅 *Bom dia, ${_chefe()}!* Olha o resumo de ontem (${_fmtData(ontem)}) pra você:\n\n` +
          `✅ Atendimentos: *${atendidos}*\n` +
          `💰 Entradas: *R$ ${entradas.toFixed(2)}*\n` +
          `💸 Gastos: *R$ ${saidas.toFixed(2)}*\n` +
          `📈 Resultado: *R$ ${(entradas - saidas).toFixed(2)}*\n\n` +
          `${atendidos > 0 ? 'Arrasou ontem! Hoje vai ser ainda melhor. 🚀💙' : 'Hoje vai bombar, pode apostar! 💪💙'}`
        );
      } catch(e) {
        console.error('[ModoDono] Erro relatório admin:', admin._id, e.message);
      }
    }
  } catch(e) {
    console.error('[ModoDono] Erro rodarRelatorioDiario:', e.message);
  }
}

module.exports.rodarLembretes        = rodarLembretes;
module.exports.rodarRelatorioDiario  = rodarRelatorioDiario;
