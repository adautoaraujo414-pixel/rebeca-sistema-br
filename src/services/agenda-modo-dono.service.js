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

  // ── LEMBRETE PESSOAL ─────────────────────────────────────────────────────────
  if (/me\s*lembr[ae]|lembrete|n[aã]o\s*me\s*deixa?\s*esquecer|anota\s*(a[ií])?/i.test(msgL)) {
    const hora  = _parseHora(msgL);
    const dia   = _parseDia(msgL) || new Date();

    // Extrair o que é o lembrete
    const textoM = msg.match(/(?:me lembr[ae]|lembrete[:\s]+|anota[:\s]+|esquecer[:\s]+)\s*(?:de\s+|que\s+)?(.+?)(?:\s+(?:amanhã|hoje|às?|as)\s+\d|$)/i)
                || msg.match(/(?:tenho\s+que|preciso|vou)\s+(.+?)(?:\s+(?:amanhã|hoje|às?|as)\s+\d|$)/i);
    const textoLembrete = textoM ? textoM[1].trim() : msg.replace(/rebeca[,\s]*/i,'').trim();

    if (hora) {
      const dataLembrete = new Date(dia);
      dataLembrete.setHours(hora.h, hora.min - 15, 0, 0); // 15min antes

      // Salvar como bloqueio com motivo de lembrete
      await BloqueioAgenda.create({
        adminId: adminObjId,
        inicio: dataLembrete,
        fim: new Date(dataLembrete.getTime() + 15*60000),
        motivo: `🔔 LEMBRETE: ${textoLembrete}`,
        tipo: 'lembrete'
      });

      await responder(
        `Anotado, ${_chefe()}! 📝✨

` +
        `🔔 *Lembrete criado:*
${textoLembrete}

` +
        `📅 ${_fmtData(dia)} às ${_fmtHora(new Date(dia.setHours(hora.h, hora.min, 0, 0)))}

` +
        `Vou te avisar 15 minutinhos antes pra você não esquecer! 💙`
      );
    } else {
      // Sem hora definida — salva como lembrete geral
      await BloqueioAgenda.create({
        adminId: adminObjId,
        inicio: dia,
        fim: new Date(dia.getTime() + 60*60000),
        motivo: `🔔 LEMBRETE: ${textoLembrete}`,
        tipo: 'lembrete'
      });
      await responder(
        `Anotei aqui, ${_chefe()}! 📝

` +
        `🔔 *${textoLembrete}*

` +
        `Me fala o horário também pra eu te avisar antes! Ex:
` +
        `*Rebeca, amanhã às 10h tenho reunião me lembra* 😊`
      );
    }
    return true;
  }

  // ── ÁUDIO — transcrito pelo webhook como texto ────────────────────────────
  if (msg.startsWith('[AUDIO]')) {
    await responder(
      `${_saudacao()}, ${_chefe()}! 🎤

` +
      `Recebi seu áudio! Por enquanto ainda não consigo ouvir, mas tô aprendendo! 😅

` +
      `Me manda em texto que resolvo na hora! 💙`
    );
    return true;
  }

  // ── PRÓXIMO CLIENTE ──────────────────────────────────────────────────────────
  if (/pr[oó]ximo\s*cliente|quem\s*(é\s*)?o\s*pr[oó]ximo|próximo\s*da\s*fila/i.test(msgL)) {
    const agora = new Date();
    const fim = new Date(); fim.setHours(23,59,59,999);
    const ag = await AgendamentoAgenda.findOne({
      adminId: adminObjId, dataHora: { $gte: agora, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();
    if (!ag) {
      await responder(`${_saudacao()}, ${_chefe()}! 😊

Não tem mais ninguém agendado hoje não! Tá livre o resto do dia. 🎉`);
    } else {
      const mins = Math.round((new Date(ag.dataHora) - agora) / 60000);
      const tempo = mins <= 0 ? 'já deveria ter chegado!' : mins < 60 ? `em ${mins} minutinhos` : `em ${Math.round(mins/60)}h`;
      await responder(`${_saudacao()}! O próximo é ${_chefe()}! 😄

👤 *${ag.nomeCliente}*
✂️ ${ag.nomeServico || '—'}
⏰ ${_fmtHora(new Date(ag.dataHora))} (${tempo})

Bora se preparar! 💪`);
    }
    return true;
  }

  // ── AGENDA DA SEMANA ──────────────────────────────────────────────────────
  if (/agenda\s*d[ao]\s*semana|semana\s*toda|essa\s*semana/i.test(msgL)) {
    const ini = new Date(); ini.setHours(0,0,0,0);
    const fim = new Date(ini); fim.setDate(fim.getDate() + 7); fim.setHours(23,59,59,999);
    const ags = await AgendamentoAgenda.find({
      adminId: adminObjId, dataHora: { $gte: ini, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();
    if (!ags.length) {
      await responder(`${_saudacao()}, ${_chefe()}! 😊

A semana tá zerada por enquanto. Bora divulgar pra encher a agenda! 🚀`);
    } else {
      const porDia = {};
      ags.forEach(a => {
        const d = _fmtData(new Date(a.dataHora));
        if (!porDia[d]) porDia[d] = [];
        porDia[d].push(`  • ${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente}`);
      });
      const lista = Object.entries(porDia).map(([d,v]) => '📅 *' + d + '*\n' + v.join('\n')).join('\n\n');
      await responder('Olha a semana aí, ' + _chefe() + '! 🗓️\n\n' + lista + '\n\n' + ags.length + ' agendamento(s) no total. Tá cheio! 💪');
    }
    return true;
  }

  // ── ENCAIXAR CLIENTE ──────────────────────────────────────────────────────
  if (/encaixa|marca\s*(um\s*)?hor[aá]rio|adiciona\s*(um\s*)?cliente/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL) || new Date();
    const nomeM = msg.match(/encaixa\s+([A-Za-zÀ-ú\s]+?)\s+(?:às?|as|para|pra)\s+\d/i) ||
                  msg.match(/marca\s+(?:pra\s+|para\s+)?([A-Za-zÀ-ú\s]+?)\s+(?:às?|as)\s+\d/i);
    const nome = nomeM ? nomeM[1].trim() : null;
    if (hora && nome) {
      const dataHora = new Date(dia); dataHora.setHours(hora.h, hora.min, 0, 0);
      await AgendamentoAgenda.create({
        adminId: adminObjId, nomeCliente: nome,
        nomeServico: 'A definir', dataHora,
        status: 'confirmado', origem: 'whatsapp_dono'
      });
      await responder(`Maravilha, ${_chefe()}! 🎉

✅ *${nome}* encaixado às *${_fmtHora(dataHora)}* de ${_fmtData(dia)}!

Já tá na agenda. Pode mandar o cliente! 💙`);
    } else {
      await responder(`Quase lá, ${_chefe()}! Me fala assim:

*Rebeca, encaixa João às 14h* ou
*Rebeca, encaixa Maria amanhã às 10h* 😊`);
    }
    return true;
  }

  // ── FECHAR AGENDA DO DIA INTEIRO ──────────────────────────────────────────
  if (/fecha\s*(minha\s*)?agenda\s*(o\s*dia\s*todo|inteira|completa|toda)?|tira\s*(o\s*dia|hoje|amanhã)/i.test(msgL)) {
    const dia = _parseDia(msgL) || new Date();
    const ini = new Date(dia); ini.setHours(6,0,0,0);
    const fim = new Date(dia); fim.setHours(22,0,0,0);
    await BloqueioAgenda.create({
      adminId: adminObjId, inicio: ini, fim,
      motivo: 'Dia fechado via WhatsApp'
    });
    await responder(`Feito, ${_chefe()}! 🔒

${_fmtData(dia)} tá bloqueado o dia todo. Ninguém consegue agendar não!

Descansa bem! 😊💙`);
    return true;
  }

  // ── LIBERAR AGENDA ────────────────────────────────────────────────────────
  if (/libera\s*(minha\s*)?agenda|remove\s*(os\s*)?bloqueios?|abre\s*(minha\s*)?agenda/i.test(msgL)) {
    const dia = _parseDia(msgL) || new Date();
    const ini = new Date(dia); ini.setHours(0,0,0,0);
    const fim = new Date(dia); fim.setHours(23,59,59,999);
    const res = await BloqueioAgenda.deleteMany({ adminId: adminObjId, inicio: { $gte: ini, $lte: fim } });
    await responder(`Prontinho, ${_chefe()}! 🔓

Removi ${res.deletedCount} bloqueio(s) de ${_fmtData(dia)}. Agenda aberta e pronta pra receber cliente! 🚀`);
    return true;
  }

  // ── HISTÓRICO DO CLIENTE ──────────────────────────────────────────────────
  if (/hist[oó]rico\s*(do|da|de)\s+|[uú]ltimas?\s*visitas?\s*(do|da|de)\s+/i.test(msgL)) {
    const nomeM = msg.match(/hist[oó]rico\s*d[oa]?\s+([A-Za-zÀ-ú\s]+?)(?:\s*$)/i) ||
                  msg.match(/visitas?\s*d[oa]?\s+([A-Za-zÀ-ú\s]+?)(?:\s*$)/i);
    const nome = nomeM ? nomeM[1].trim() : null;
    if (nome) {
      const ags = await AgendamentoAgenda.find({
        adminId: adminObjId,
        nomeCliente: { $regex: nome, $options: 'i' },
        status: { $in: ['confirmado','concluido'] }
      }).sort({ dataHora: -1 }).limit(5).lean();
      if (!ags.length) {
        await responder(`Hmm, não achei histórico pra *${nome}* não, ${_chefe()}. Será que o nome tá diferente? 🤔`);
      } else {
        const lista = ags.map(a => `• ${_fmtData(new Date(a.dataHora))} — ${a.nomeServico || 'Serviço'}`).join(' + ');
        await responder(`Achei aqui, ${_chefe()}! 🔍

👤 *${ags[0].nomeCliente}*

${lista}

${ags.length} visita(s) registrada(s)! 💙`);
      }
    } else {
      await responder(`Me fala o nome, ${_chefe()}! Assim:

*Rebeca, histórico da Ana* 😊`);
    }
    return true;
  }

  // ── ANIVERSARIANTES ───────────────────────────────────────────────────────
  if (/anivers[aá]riantes?|faz\s*anivers[aá]rio/i.test(msgL)) {
    const hoje = new Date();
    const dia7 = new Date(hoje); dia7.setDate(dia7.getDate() + 7);
    const clientes = await ClienteAgenda.find({
      adminId: adminObjId,
      dataNascimento: { $exists: true, $ne: null }
    }).lean();
    const aniv = clientes.filter(c => {
      if (!c.dataNascimento) return false;
      const d = new Date(c.dataNascimento);
      const mesAtual = hoje.getMonth(); const diaAtual = hoje.getDate();
      const mes7 = dia7.getMonth(); const dia7d = dia7.getDate();
      const cm = d.getMonth(); const cd = d.getDate();
      if (mesAtual === mes7) return cm === mesAtual && cd >= diaAtual && cd <= dia7d;
      return (cm === mesAtual && cd >= diaAtual) || (cm === mes7 && cd <= dia7d);
    });
    if (!aniv.length) {
      await responder(`${_saudacao()}, ${_chefe()}! 🎂

Nenhum aniversariante nos próximos 7 dias não. Mas fique de olho! 👀`);
    } else {
      const lista = aniv.map(c => {
        const d = new Date(c.dataNascimento);
        return `• ${c.nome} — ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      }).join(' + ');
      await responder(`🎂 Ó os aniversariantes, ${_chefe()}!

${lista}

Que tal mandar uma mensagem especial pra eles? 💙`);
    }
    return true;
  }

  // ── RESUMO SEMANAL ────────────────────────────────────────────────────────
  if (/resumo\s*d[ao]\s*semana|faturamento\s*d[ao]\s*semana|quanto\s*(fiz|faturei)\s*(essa|na)\s*semana/i.test(msgL)) {
    const ini = new Date(); ini.setDate(ini.getDate() - 7); ini.setHours(0,0,0,0);
    const fim = new Date(); fim.setHours(23,59,59,999);
    const lanc = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean();
    const entradas = lanc.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+l.valor,0);
    const saidas   = lanc.filter(l=>l.tipo==='saida').reduce((s,l)=>s+l.valor,0);
    const atend    = await AgendamentoAgenda.countDocuments({ adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['confirmado','concluido'] } });
    await responder(`${_saudacao()}, ${_chefe()}! Olha a semana! 📊

✅ Atendimentos: *${atend}*
💰 Entradas: *R$ ${entradas.toFixed(2)}*
💸 Gastos: *R$ ${saidas.toFixed(2)}*
📈 Resultado: *R$ ${(entradas-saidas).toFixed(2)}*

${(entradas-saidas)>=0?'Semana boa demais! 🚀':'Semana de aprendizado! Próxima vai bombar! 💪'}`);
    return true;
  }

  // ── RESUMO MENSAL ─────────────────────────────────────────────────────────
  if (/resumo\s*d[ao]\s*m[eê]s|faturamento\s*d[ao]\s*m[eê]s|quanto\s*(fiz|faturei)\s*(esse|no|este)\s*m[eê]s/i.test(msgL)) {
    const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
    const fim = new Date(); fim.setHours(23,59,59,999);
    const lanc = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean();
    const entradas = lanc.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+l.valor,0);
    const saidas   = lanc.filter(l=>l.tipo==='saida').reduce((s,l)=>s+l.valor,0);
    const atend    = await AgendamentoAgenda.countDocuments({ adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['confirmado','concluido'] } });
    const ticket   = atend > 0 ? (entradas/atend).toFixed(2) : '0.00';
    await responder(`${_saudacao()}, ${_chefe()}! Resumo do mês! 📊

✅ Atendimentos: *${atend}*
💰 Entradas: *R$ ${entradas.toFixed(2)}*
💸 Gastos: *R$ ${saidas.toFixed(2)}*
📈 Resultado: *R$ ${(entradas-saidas).toFixed(2)}*
🎯 Ticket médio: *R$ ${ticket}*

${atend>10?'Esse mês tá voando! 🚀':'Ainda dá tempo de bombar! 💪'}`);
    return true;
  }

  // ── CLIENTES CONFIRMADOS HOJE ─────────────────────────────────────────────
  if (/clientes?\s*(de\s*hoje\s*)?confirmados?|confirmados?\s*hoje/i.test(msgL)) {
    const ini = new Date(); ini.setHours(0,0,0,0);
    const fim = new Date(); fim.setHours(23,59,59,999);
    const ags = await AgendamentoAgenda.find({
      adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: 'confirmado'
    }).sort({ dataHora: 1 }).lean();
    if (!ags.length) {
      await responder(`${_saudacao()}, ${_chefe()}! 😊

Nenhum confirmado ainda hoje não. Quer que eu mande lembrete pra galera? Me fala! 💙`);
    } else {
      const lista = ags.map(a => `✅ ${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente}`).join(' + ');
      await responder(`${_saudacao()}, ${_chefe()}! Olha quem confirmou hoje! 🎉

${lista}

${ags.length} confirmado(s)! Tá cheio! 💪`);
    }
    return true;
  }

  // ── SERVIÇOS MAIS PEDIDOS ─────────────────────────────────────────────────
  if (/servi[çc]os?\s*mais\s*(pedidos?|populares?|requisitados?)|o\s*que\s*mais\s*pedem/i.test(msgL)) {
    const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
    const ags = await AgendamentoAgenda.find({ adminId: adminObjId, dataHora: { $gte: ini } }).lean();
    const rank = {};
    ags.forEach(a => { if(a.nomeServico) rank[a.nomeServico] = (rank[a.nomeServico]||0)+1; });
    const sorted = Object.entries(rank).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!sorted.length) {
      await responder(`Ainda não tem dados suficientes não, ${_chefe()}. Mês que vem já vai ter um ranking lindo! 📊`);
    } else {
      const emojis = ['🥇','🥈','🥉','4️⃣','5️⃣'];
      const lista = sorted.map(([s,n],i) => `${emojis[i]} ${s} — ${n}x`).join(' + ');
      await responder(`Olha o ranking desse mês, ${_chefe()}! 🏆

${lista}

Esses são os queridinhos! 💙`);
    }
    return true;
  }

  // ── CLIENTES NOVOS ────────────────────────────────────────────────────────
  if (/clientes?\s*novos?|quantos\s*clientes?\s*novos?/i.test(msgL)) {
    const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
    const total = await ClienteAgenda.countDocuments({ adminId: adminObjId, createdAt: { $gte: ini } });
    await responder(`${_saudacao()}, ${_chefe()}! 🎉

Esse mês você ganhou *${total} cliente(s) novo(s)*!

${total>5?'Tá crescendo muito! Continua assim! 🚀':'Todo cliente novo é uma vitória! 💪'}`);
    return true;
  }

  // ── MANUAL DE COMANDOS ────────────────────────────────────────────────────
  if (/ajuda|comandos?|o\s*que\s*(vc|você)\s*(faz|pode|sabe)|menu|help/i.test(msgL)) {
    await responder(
      `${_saudacao()}, ${_chefe()}! Aqui tô eu! 💙

` +
      `📅 *AGENDA*
` +
      `• Rebeca, minha agenda de hoje
` +
      `• Rebeca, minha agenda de amanhã
` +
      `• Rebeca, agenda da semana
` +
      `• Rebeca, próximo cliente
` +
      `• Rebeca, encaixa [nome] às 14h
` +
      `• Rebeca, fecha agenda amanhã
` +
      `• Rebeca, libera minha agenda amanhã
` +
      `• Rebeca, bloqueia amanhã das 12h às 14h

` +
      `✅ *AGENDAMENTOS*
` +
      `• Rebeca, confirma o agendamento das 14h
` +
      `• Rebeca, cancela o agendamento das 14h
` +
      `• Rebeca, clientes confirmados hoje

` +
      `💰 *FINANCEIRO*
` +
      `• Rebeca, quanto faturei hoje?
` +
      `• Rebeca, resumo da semana
` +
      `• Rebeca, resumo do mês
` +
      `• Rebeca, registra entrada de R$150 no Pix
` +
      `• Rebeca, registra gasto de R$80 em produtos

` +
      `👥 *CLIENTES*
` +
      `• Rebeca, histórico da [nome]
` +
      `• Rebeca, aniversariantes
` +
      `• Rebeca, clientes inativos
` +
      `• Rebeca, clientes novos

` +
      `📊 *RELATÓRIOS*
` +
      `• Rebeca, serviços mais pedidos

` +
      `⏰ *HORÁRIOS*
` +
      `• Rebeca, hoje vou trabalhar das 8h às 18h

` +
      `Pode mandar qualquer coisa, tô aqui! 😊💙`
    );
    return true;
  }

  // ── NÃO RECONHECIDO ────────────────────────────────────────────────────────
  await responder(`${_saudacao()}, ${_chefe()}! 😊

Não tive certeza do que você quis dizer, mas tô aqui! Tenta me falar de outro jeito ou digita *ajuda* pra ver tudo que sei fazer por você! 💙`);
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

// ── CRON: DISPARAR LEMBRETES PESSOAIS ────────────────────────────────────────
async function rodarLembretesPessoais() {
  try {
    const LembreteAgenda = require('../models/LembreteAgenda');
    const agora = new Date();

    // Busca lembretes cujo aviso já chegou (dataEvento - antecedencia <= agora) e não enviados
    // [TENANT-OK] Job global de lembretes — processa todos os tenants intencionalmente
        const pendentes = await LembreteAgenda.find({ enviado: false }).lean();

    for (const lmb of pendentes) {
      const dataAviso = new Date(lmb.dataEvento.getTime() - lmb.antecedencia * 60000);
      if (dataAviso > agora) continue; // ainda não chegou a hora de avisar

      try {
        const admin = await AdminAgenda.findById(lmb.adminId).lean();
        if (!admin) continue;

        const telDono = _normalizarTel(admin.whatsapp || admin.telefone);
        if (!telDono) continue;

        const inst = await InstanciaWhatsapp.findOne({
          adminId: String(lmb.adminId), adminTipo: 'agenda', status: 'conectado'
        }).lean();
        if (!inst) continue;

        // Verifica se tem agendamento do cliente nas últimas 24h (janela gratuita Meta)
        const janela24h = new Date(agora.getTime() - 24 * 60 * 60000);
        const temJanela = await AgendamentoAgenda.findOne({
          adminId: adminObjId,
          updatedAt: { $gte: janela24h }
        }).lean();

        // Se não tem janela aberta, agenda para próxima interação do cliente
        // mas envia mesmo assim pois lembrete pessoal é prioridade
        const horaEvento = _fmtHora(new Date(lmb.dataEvento));
        const dataEvento = _fmtData(new Date(lmb.dataEvento));
        const mins       = lmb.antecedencia;

        // Mensagens humanizadas — sorteia uma
        const saudacao = _saudacao();
        const chefe    = _chefe();
        const msgs = [
          `${saudacao}, ${chefe}! 💙\n\nEi, não esquece não — daqui a ${mins} minutinhos você tem:\n\n📌 *${lmb.texto}*\n📅 Hoje às ${horaEvento}\n\nBora se preparar! Você consegue! 🚀`,
          `Oi, ${chefe}! Sou a Rebeca e vim te lembrar de algo importante! 😊\n\n🔔 *${lmb.texto}*\n⏰ ${horaEvento} — em ${mins} minutos!\n\nNão deixa escapar não! 💪`,
          `${saudacao}! 🌟\n\nPassando aqui rapidinho pra te avisar, ${chefe}:\n\n📌 *${lmb.texto}*\n📅 ${dataEvento} às ${horaEvento}\n\nAinda dá tempo de se organizar! 😉💙`,
          `Alerta da Rebeca! 🔔\n\n${chefe}, em ${mins} minutinhos você tem compromisso:\n\n✨ *${lmb.texto}*\n⏰ ${horaEvento}\n\nFui te lembrar porque é isso que eu faço! 💙😄`
        ];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];

        await _enviarMsg(inst, telDono, msg);
        await LembreteAgenda.findByIdAndUpdate(lmb._id, { enviado: true, dataEnvio: new Date() });
        console.log('[Lembretes] Aviso enviado para', telDono, lmb.texto);
      } catch(e) {
        console.error('[Lembretes] Erro individual:', e.message);
      }
    }
  } catch(e) {
    console.error('[Lembretes] Erro geral:', e.message);
  }
}

module.exports.rodarLembretesPessoais = rodarLembretesPessoais;
