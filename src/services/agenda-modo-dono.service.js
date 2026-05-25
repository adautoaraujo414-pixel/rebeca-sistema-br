

// agenda-modo-dono.service.js
// Modo Rebeca pelo WhatsApp — comandos do dono/admin pelo número conectado
// NÃO afeta Delivery nem Corrida. NÃO cria nova instância.

const axios = require('axios');
const SM = require('./agenda-session-manager');
const IntentParser  = require('./agenda-intent-parser');
const ActionRouter  = require('./agenda-action-router');
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


// ── Extrair categoria financeira do texto ────────────────────────────────────
function _extrairCategoria(txt) {
  const t = txt.toLowerCase();
  if (/combustível|combustivel|gasolina|diesel|álcool|alcool|posto/.test(t)) return 'combustível';
  if (/mercado|supermercado|feira|hortifruti|grocery/.test(t)) return 'mercado';
  if (/aluguel|aluel/.test(t)) return 'aluguel';
  if (/luz|energia|energisa|cemig|cpfl|coelba/.test(t)) return 'energia';
  if (/água|agua|saneamento|sabesp|copasa/.test(t)) return 'água';
  if (/internet|wifi|net|vivo|claro|tim|oi|fibra/.test(t)) return 'internet';
  if (/telefone|celular|plano/.test(t)) return 'telefone';
  if (/salário|salario|funcionário|funcionario|pagamentos+func/.test(t)) return 'salário';
  if (/imposto|taxa|tributo|contador|contabilidade|das|mei/.test(t)) return 'impostos';
  if (/fornecedor|produto|estoque|material|insumo/.test(t)) return 'produtos';
  if (/ifood|delivery|ubers*eat|rappi/.test(t)) return 'ifood';
  if (/farmácia|farmacia|remédio|remedio|médico|medico|consulta|exame/.test(t)) return 'saúde';
  if (/limpeza|higiene|sabão|detergente/.test(t)) return 'limpeza';
  if (/alimentação|alimentacao|refeição|refeicao|restaurante|lanche|comida/.test(t)) return 'alimentação';
  if (/pix|transferência|transferencia|ted|doc/.test(t)) return 'transferência';
  if (/dinheiro|espécie|especie|cash/.test(t)) return 'dinheiro';
  return 'outros';
}

function _extrairDescricao(txt, tipo) {
  // Palavras que NÃO são nomes de pessoas/descrições úteis
  const _stopWords = /^(reais?|pix|dinheiro|especie|espécie|entrada|saida|saída|gasto|despesa|receita|transfer|transferência|gasolina|combustivel|aluguel|internet|luz|agua|lanche|comida|mercado|farmacia|uber|ifood|taxa|imposto)$/i;
  // helper: captura nome próprio (1 ou 2 palavras com maiúscula inicial)
  const _nomeComposto = /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{1,30}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{1,30}){0,2})/;
  // 1. Nome próprio após "pra/para/pro/com" — ignora "mim/me/nós"
  const _ignorarPronom = /^(mim|me|nos|nós|você|voce|ele|ela|eles|elas)$/i;
  const mPra = txt.match(new RegExp('(?:^|\\s)(?:pra|para|pro|com)\\s+(?:(?:mim|me|nos|nós|você|voce)\\s+)?(' + _nomeComposto.source.slice(1,-1) + ')(?:\\s|$)'));
  if (mPra && mPra[1] && !_stopWords.test(mPra[1].split(' ')[0]) && !_ignorarPronom.test(mPra[1])) return mPra[1].trim();
  // 2. Nome próprio após "na/no/da/do"
  const mNa = txt.match(new RegExp('(?:^|\\s)(?:na|no|da|do)\\s+' + _nomeComposto.source + '(?:\\s|$)'));
  if (mNa && mNa[1] && !_stopWords.test(mNa[1])) return mNa[1].trim();
  // 3. Nome próprio (maiúscula) após valor numérico
  const mApos = txt.match(/R?\$?\s*[\d.,]+\s*(?:mil|k|reais?)?\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{2,30}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]{1,30})?)(?:\s|$)/);
  if (mApos && mApos[1] && !_stopWords.test(mApos[1])) return mApos[1].trim();
  // 4. Fallback
  return tipo === 'receita' ? 'Entrada via WhatsApp' : 'Gasto via WhatsApp';
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
    // Se veio do Meta WhatsApp API, usar MetaWA para responder
    if (instancia._enviarVia === 'meta' || instancia.apiUrl === 'meta') {
      const MetaWA = require('./meta-whatsapp.service');
      await MetaWA.enviarTexto(numero, texto);
      console.log('[ModoDono] Mensagem enviada via Meta para', numero);
      return;
    }
    // Evolution API (padrão)
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
  const agora = new Date();
  const brMs   = agora.getTime() - (3 * 60 * 60 * 1000);
  const brDate = new Date(brMs);
  const ano = brDate.getUTCFullYear();
  const mes = brDate.getUTCMonth();
  const dia = brDate.getUTCDate();
  const dow = brDate.getUTCDay();
  const mkData = (a, m, d) => new Date(Date.UTC(a, m, d, 3, 0, 0));
  if (/\bhoje\b/i.test(txt))               return new Date(agora);
  if (/(?:^|\s)amanh[aã](?:\s|$)/i.test(txt)) return mkData(ano, mes, dia + 1);
  const diasMap = { domingo:0, segunda:1, 'segunda-feira':1, terca:2, 'terça':2, 'terça-feira':2, quarta:3, 'quarta-feira':3, quinta:4, 'quinta-feira':4, sexta:5, 'sexta-feira':5, sabado:6, 'sábado':6 };
  const quevem = /que\s*vem|próxim[oa]|proxim[oa]/i.test(txt);
  for (const [nome, alvo] of Object.entries(diasMap)) {
    if (new RegExp('\\b' + nome + '\\b', 'i').test(txt)) {
      let diff = (alvo - dow + 7) % 7;
      if (diff === 0 || quevem) diff += 7;
      return mkData(ano, mes, dia + diff);
    }
  }
  const dm = txt.match(/(\d{1,2})\/(\d{1,2})/);
  if (dm) return mkData(ano, parseInt(dm[2])-1, parseInt(dm[1]));
  const diaNum = txt.match(/\bdia\s+(\d{1,2})\b/i);
  if (diaNum) return mkData(ano, mes, parseInt(diaNum[1]));
  return null;
}


function _parsarValor(txt) {
  // 1. Mil / k
  const mMil = txt.match(/([\d.,]+)\s*(?:mil|k)\b/i);
  if (mMil) return parseFloat(mMil[1].replace(/\./g,'').replace(',','.')) * 1000;
  // 2. Milhão
  const mMilhao = txt.match(/([\d.,]+)\s*(?:milh[aã]o|milh[oõ]es|M)\b/i);
  if (mMilhao) {
    const base = parseFloat(mMilhao[1].replace(/\./g,'').replace(',','.'));
    return base * 1000000;
  }
  // 3. Formato numérico normal
  const mNum = txt.match(/R?\$\s*([\d.,]+)|([\d.,]+)\s*(?:reais?|conto|reai)?/i);
  const raw = mNum ? (mNum[1]||mNum[2]) : null;
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length >= 2) {
    const cents = parts[parts.length - 1];
    const whole = parts.slice(0, parts.length - 1).join('').replace(/\./g, '');
    if (cents.length <= 2) return parseFloat(whole + '.' + cents);
    return parseFloat(raw.replace(/[.,]/g, ''));
  }
  return parseFloat(raw.replace(/\./g, ''));
}
function _parseHora(txt) {
  // 0. "daqui X minutos/horas" — hora relativa ao momento atual
  const mDaqui = txt.match(/daqui\s+(?:a\s+)?(\d+|uma?|dois|duas|tr[eê]s|quatro|cinco|dez|quinze|vinte|trinta)\s*(minuto|hora|min|h)s?/i);
  if (mDaqui) {
    const numMap = {'um':1,'uma':1,'dois':2,'duas':2,'três':3,'tres':3,'quatro':4,'cinco':5,'dez':10,'quinze':15,'vinte':20,'trinta':30};
    const qtd = parseInt(mDaqui[1]) || numMap[mDaqui[1].toLowerCase()] || 1;
    const unidade = mDaqui[2].toLowerCase();
    const agora = new Date();
    const brMs = agora.getTime() - (3*60*60*1000);
    const brNow = new Date(brMs);
    let totalMin = brNow.getUTCHours()*60 + brNow.getUTCMinutes();
    if (/hora|^h$/i.test(unidade)) totalMin += qtd * 60;
    else totalMin += qtd;
    return { h: Math.floor(totalMin/60) % 24, min: totalMin % 60, relativo: true, msOffset: (/hora|^h$/i.test(unidade) ? qtd*60 : qtd)*60*1000 };
  }
  // 1. Formato original: 10h, 10h30, 10:30 — ignorar 'dia N' antes
  const _txtSemDia = txt.replace(/\bdia\s+\d{1,2}\b/gi, '');
  const m = _txtSemDia.match(/(\d{1,2})h(?:(\d{2})?)?/i) || _txtSemDia.match(/(\d{1,2}):(\d{2})/);
  if (m) return { h: parseInt(m[1]), min: parseInt(m[2]||'0') };
  // 2. "às 22", "as 8", "à 15" — número após preposição
  const mNum = txt.match(/(?:às?|as?|à)\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (mNum) return { h: parseInt(mNum[1]), min: parseInt(mNum[2]||'0') };
  // 3. "meia noite", "meio dia"
  if (/meia\s*noite/i.test(txt)) return { h: 0, min: 0 };
  if (/meio\s*dia/i.test(txt)) return { h: 12, min: 0 };
  // 4. "e meia" após hora: "às 3 e meia"
  const mMeia = txt.match(/(\d{1,2})\s*e\s*meia/i);
  if (mMeia) return { h: parseInt(mMeia[1]), min: 30 };
  // 5. "nove e meia", "três e um quarto" por extenso
  const palavras = {
    'uma':1,'duas':2,'três':3,'tres':3,'quatro':4,'cinco':5,'seis':6,
    'sete':7,'oito':8,'nove':9,'dez':10,'onze':11,'doze':12,
    'treze':13,'quatorze':14,'quinze':15,'dezesseis':16,'dezessete':17,
    'dezoito':18,'dezenove':19,'vinte':20
  };
  const mP = txt.match(/\b(uma|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)\b/i);
  if (mP) {
    let h = palavras[mP[1].toLowerCase()];
    if (/tarde|noite/i.test(txt) && h < 12) h += 12;
    const min = /e\s*meia/i.test(txt) ? 30 : /e\s*um\s*quarto/i.test(txt) ? 15 : 0;
    return { h, min };
  }
  return null;
}

function _fmtData(d) {
  return d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit', timeZone:'America/Sao_Paulo' });
}

function _fmtHora(d) {
  // Render roda em UTC — forçar timezone Brasil (GMT-3)
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' });
}

// ── Processar comando do dono ────────────────────────────────────────────────
async function processarComandoDono(telefone, mensagem, adminId, instanciaResposta = null) {
  const msg = (mensagem || '').trim();
  const msgL = msg.toLowerCase();
  console.log('[DEBUG-INICIO] msgL:', msgL);
  console.log('[DEBUG-INICIO] msgL:', msgL);
  // ── SESSION: registrar mensagem e recuperar estado ──
  const _session = SM.addUserMsg(adminId, telefone, msg);
  const _isConfirm = SM.isConfirmacao(msg);
  const _isNeg = SM.isNegacao(msg);
  const _assuntoDetectado = SM.detectarAssunto(msg) || _session.assuntoAtual;
  SM.updateSession(adminId, telefone, { assuntoAtual: _assuntoDetectado });
  const adminObjId = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;

  const admin = await AdminAgenda.findById(adminObjId).lean();
  if (!admin) return null;

  const instancia = await InstanciaWhatsapp.findOne({ adminId: adminObjId, adminTipo: 'agenda' }).lean();
  if (!instancia && !instanciaResposta) return null; // Meta API nao precisa de instancia Evolution

  async function responder(texto) {
    const _inst = instanciaResposta || instancia;
    const _num  = instanciaResposta?.numero || telefone;
    await _enviarMsg(_inst, _num, texto);
  }

  // ── AGENDA DE HOJE ─────────────────────────────────────────────────────────
  if (/\bagenda\s*(de\s*)?(hoje|amanhã|amanha)\b|\bmostra\s*(minha\s*)?agenda|\bquem\s*(tenho|tem)\s*(hoje|amanhã|amanha)\b|\bhor[aá]rios?\s*(de\s*)?(hoje|amanhã|amanha)\b|\btem\s*algu[eé]m\s*(hoje|amanhã|amanha)\b|\bcomo\s*t[áa]\s*(hoje|amanhã|amanha)\b|\bvou\s*atender\s*quem\b|\bquem\s*[eé]\s*(hoje|amanhã)\b|\bminha\s*agenda\b|\bquantos\s*(clientes\s*)?(tenho|tem)\s*(hoje|amanhã)\b/i.test(msgL)) {
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

  // ── BLOQUEAR HORÁRIO ─────────────────────────────────────────────────────
  if (/bloquei[ao]|bloquear|bloqueia|tira\s*(hor[aá]rio|tempo|per[ií]odo)|reserva\s*(hor[aá]rio|tempo)|almo[çc]o|paus[ao]|intervalo/i.test(msgL) && /hor[aá]rio|agenda|tempo|per[ií]odo|das?\s*\d|\d+h/i.test(msgL)) {
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
  if (/\bvou\s*trabalhar\b|\btrabalho\s*hoje\b|\babre?\s*hoje\b|\bfecho\s*hoje\b|\bexpediente\b|\bjornada\b|\bvou\s*abrir\b|\bvou\s*fechar\b/i.test(msgL) || /\bhor[aá]rio\s*(de\s*)?(hoje|trabalho|funcionamento|atendimento)\b/i.test(msgL)) {
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

  // ── APAGAR ÚLTIMO LANÇAMENTO ──────────────────────────────────────────────
  if (/apag[ae]|apagu|exclu[ii]|delet|remov|cancela|desfaz|tira|zera|limpa|volta|n[aã]o era|errei|errou|foi erro|coloquei errado|lancei errado|botei errado|coloca errado|mandei errado/i.test(msgL) &&
      /entrada|receit|receb|gasto|despesa|lan[cç]amento|registro|[uú]ltim[ao]|minha|meu|nossa|essa|esse|isso|aquela|aquele|aqui|anterior|de agora|acabei|acabou|que fiz|que coloquei|que registrei|que mandei|que botei|que lancei|que anotei|que marquei/i.test(msgL)) {
    const tipoApagar = /entrada|receita|receb/i.test(msgL) ? 'receita'
                     : /gasto|despesa|saida|sa[ií]da/i.test(msgL) ? 'despesa'
                     : null;
    console.log('[DEBUG-APAGAR] msgL:', msgL, 'adminObjId:', adminObjId);
    const filtro = { adminId: adminObjId };
    if (tipoApagar) filtro.tipo = tipoApagar;
    const ultimo = await FinanceiroAgenda.findOne(filtro).sort({ data: -1 }).lean();
    if (!ultimo) {
      await responder('Não encontrei nenhum lançamento pra apagar. 🤔');
      return true;
    }
    await FinanceiroAgenda.findByIdAndDelete(ultimo._id);
    const tipoLabel = ultimo.tipo === 'receita' ? 'Entrada' : 'Saída';
    await responder(`✅ ${tipoLabel} de R$ ${ultimo.valor.toFixed(2)} em "${ultimo.categoria || 'outros'}" apagada! Se precisar registrar de novo é só falar. 💙`);
    return true;
  }
  // ── REGISTRAR ENTRADA FINANCEIRA ───────────────────────────────────────────
  if (/\bregistra\b.*\bentrada\b|\bmarca\b.*\bentrada\b|\banota\b.*\bentrada\b|\bcoloca\b.*\bentrada\b|\breceb[ei]\b|\bentrada\b|\bganhei\b|\bcaiu\b|\bentr[ou]\b|\breceit[ao]\b|\bpix\b.*\d|\bR?\$.*\bpix\b|\btransfer[eê]ncia\b|\bdinheiro\b.*\bentrou\b|\bfiz\b.*\d|\bvendi\b|\brecebi\b|\bbateu\b|\bcadastrou\b|\bveio\b.*\bdinheiro\b|\bdinheiro\b.*\bveio\b|\bcorreu\b.*\bbem\b|\bfechei\b.*\bvenda\b|\bvenda\b.*\bfechada\b/i.test(msgL) && !/\bquanto\b/i.test(msgL) &&
      !/\bpaguei\b|\bgastei\b|\bsaida\b|\bsa[ií]da\b|\bdespesa\b|\bcombust[ií]vel\b|\bgasolina\b|\baluguel\b|\binternet\b|\bluz\b|\bagua\b|\buber\b/i.test(msgL) &&
      !/apag[ae]u?|exclu[ii]|delet|remov|cancela|desfaz|tira|zera|limpa|[uú]ltim|errei|errou/i.test(msgL)) {
    const _msgLimpa = msg.replace(/[?!]+$/, '').trim();
    // ── Parse de valor: suporta "4 mil", "4k", "4.000,00", "4,000,00" ──
    const val = _parsarValor(_msgLimpa);
    const descEntrada = _extrairDescricao(msg, 'receita');
    const catEntrada  = _extrairCategoria(msg);
    if (val) {
      await FinanceiroAgenda.create({
        adminId: adminObjId,
        tipo: 'receita',
        valor: val,
        descricao: descEntrada,
        categoria: catEntrada,
        data: new Date(),
        origem: 'whatsapp_dono'
      });
      await responder(`Feito! Entrada de R$ ${val.toFixed(2)} registrada em "${catEntrada}"${descEntrada !== 'Entrada via WhatsApp' ? ' — '+descEntrada : ''}. 💰`);
      return true;
    }
    await responder(`${_erro()} Me fala assim: *Rebeca, registra uma entrada de R$120 no Pix* 💰`);
    return true;
  }

  // ── REGISTRAR GASTO ────────────────────────────────────────────────────────
  if (/\bregistra\b.*\bgasto\b|\bmarca\b.*\bgasto\b|\banota\b.*\bgasto\b|\bmarca\b.*\bdespesa\b|\bregistra\b.*\bdespesa\b|\bpaguei\b|\bcomprei\b|\bsaída\b|\bsaida\b|\bdespesa\b|\bgastei\b|\btive\s*gasto\b|\bsaiu\b|\bdebita\b|\bdescontou\b|\baluguel\b|\bluz\b|\bagua\b|\bcombust[ií]vel\b|\bgasolina\b|\buber\b|\binternet\b|\baliment[ao]\b|\blanche\b|\bcaf[eé]\b|\bmaterial\b|\bequipamento\b/i.test(msgL) && !/\bquanto\b/i.test(msgL)) {
    const _msgLimpaS = msg.replace(/[?!]+$/, '').trim();
    const val = _parsarValor(_msgLimpaS);
    const descSaida = _extrairDescricao(msg, 'despesa');
    const catSaida  = _extrairCategoria(msg);
    if (val) {
      await FinanceiroAgenda.create({
        adminId: adminObjId,
        tipo: 'despesa',
        valor: val,
        descricao: descSaida,
        categoria: catSaida,
        data: new Date(),
        origem: 'whatsapp_dono'
      });
      await responder(`Anotado! Saída de R$ ${val.toFixed(2)} em "${catSaida}"${descSaida !== 'Gasto via WhatsApp' ? ' — '+descSaida : ''}. 📝`);
      return true;
    }
    await responder(`${_erro()} Me fala assim: *Rebeca, registra um gasto de R$50 em produtos* 💸`);
    return true;
  }


  // ── FATURAMENTO POR SERVIÇO ──────────────────────────────────────────────────
  if (/quanto\s*(fiz|faturei|ganhei)\s*(de|com|no)\s+([A-Za-zÀ-ú]+)/i.test(msgL)) {
    const servicoM = msg.match(/quanto\s*(?:fiz|faturei|ganhei)\s*(?:de|com|no)\s+([A-Za-zÀ-ú\s]+?)(?:\s*(?:esse|este|no|nesse)\s*m[eê]s|\s*hoje|\s*essa\s*semana|$)/i);
    const servicoBusca = servicoM ? servicoM[1].trim() : null;
    if (servicoBusca) {
      const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
      const fim = new Date(); fim.setHours(23,59,59,999);
      const ags = await AgendamentoAgenda.find({
        adminId: adminObjId,
        nomeServico: { $regex: servicoBusca, $options: 'i' },
        dataHora: { $gte: ini, $lte: fim },
        status: { $in: ['confirmado','concluido'] }
      }).lean();
      const lanc = await FinanceiroAgenda.find({
        adminId: adminObjId,
        descricao: { $regex: servicoBusca, $options: 'i' },
        data: { $gte: ini, $lte: fim },
        tipo: 'receita'
      }).lean();
      const totalAgs  = ags.length;
      const totalLanc = lanc.reduce((s,l) => s+l.valor, 0);
      await responder(`${_saudacao()}, ${_chefe()}! 📊

✂️ *${servicoBusca}* esse mês:
• ${totalAgs} atendimento(s)
• R$ ${totalLanc.toFixed(2)} registrado(s)

${totalAgs > 0 ? 'Tá saindo bem! 💪' : 'Ainda sem registros esse mês.'}`);
      return true;
    }
  }

  // ── FATURAMENTO ────────────────────────────────────────────────────────────
  if (/\bfaturei\b|\bfaturamento\b|\bquanto\s*(entrou|fiz|ganhei|recebi|caiu)\b|\bquanto\s*(fiz|ganhei|recebi)\s*hoje\b|\bquanto\s*(?:eu\s*)?(gastei|saiu|foram|ganhei|recebi|faturei)\b|\bquanto\s*entrou\s*(hoje|de|essa|esta)\b|\bquanto\s*(eu\s*)?(gastei|saiu)\s*(hoje|essa|esta|semana)?\b|\bcaixa\s*de\s*hoje\b|\bresultado\s*de\s*hoje\b|\bsaldo\s*de\s*hoje\b|\bquanto\s*t[eê]m?\s*hoje\b|\bcomo\s*t[áa]\s*o\s*caixa\b|\bfiz\s*quanto\b|\bganhei\s*quanto\b|\bessa\s*semana\b.*\b(entrou|gastei|saiu|faturei)\b|\b(entrou|gastei|saiu|faturei)\b.*\bessa\s*semana\b/i.test(msgL)) {
    // Período: semana ou dia — fuso Brasil (UTC-3)
    const _agoraBR = new Date(Date.now() - 3*60*60*1000);
    const _isSemana = /essa\s*semana|esta\s*semana|semana\s*(toda|inteira)?/i.test(msgL);
    const dia = _parseDia(msgL) || _agoraBR;
    // ini/fim em UTC: dia BR 00:00 = UTC 03:00, dia BR 23:59 = UTC+1 02:59:59
    const _diaStr = dia.toISOString().slice(0,10); // YYYY-MM-DD no fuso do _parseDia
    // Para hoje: usar data BR real
    const _usarBR = !msgL.match(/amanhã|amanha|segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo|\d{1,2}\/\d/i);
    const _base = _usarBR ? _agoraBR : dia;
    const _y = _base.getUTCFullYear(), _m = _base.getUTCMonth(), _d = _base.getUTCDate();
    let iniUTC, fimUTC;
    if (_isSemana) {
      // Semana BR: segunda até hoje
      const _dow = _base.getUTCDay(); // 0=dom,1=seg,...
      const _diasDesdeSegunda = (_dow === 0) ? 6 : _dow - 1;
      const _seg = new Date(Date.UTC(_y, _m, _d - _diasDesdeSegunda, 3, 0, 0));
      iniUTC = _seg;
      fimUTC = new Date(Date.UTC(_y, _m, _d+1, 2, 59, 59, 999));
    } else {
      iniUTC = new Date(Date.UTC(_y, _m, _d, 3, 0, 0));        // 00:00 BR = 03:00 UTC
      fimUTC = new Date(Date.UTC(_y, _m, _d+1, 2, 59, 59, 999)); // 23:59 BR = 02:59 UTC+1
    }

    const lancamentos = await FinanceiroAgenda.find({
      adminId: adminObjId,
      data: { $gte: iniUTC, $lte: fimUTC }
    }).lean();
    const entradas = lancamentos.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const saidas = lancamentos.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
    const agendamentos = await AgendamentoAgenda.countDocuments({
      adminId: adminObjId, dataHora: { $gte: iniUTC, $lte: fimUTC }, status: { $in: ['confirmado','concluido'] }
    });
    const catE = {}; lancamentos.filter(l=>l.tipo==='receita').forEach(l=>{ const c=l.categoria||'outros'; catE[c]=(catE[c]||0)+l.valor; });
    const catS = {}; lancamentos.filter(l=>l.tipo==='despesa').forEach(l=>{ const c=l.categoria||'outros'; catS[c]=(catS[c]||0)+l.valor; });
    const leE = Object.entries(catE).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2)}`).join('\n');
    const leS = Object.entries(catS).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2)}`).join('\n');
    const _labelPeriodo = _isSemana ? `semana de ${_fmtData(iniUTC)} a ${_fmtData(_agoraBR)}` : _fmtData(_agoraBR);
    let rel = `Resumo de ${_labelPeriodo}:\n`;
    rel += `\nEntradas: R$ ${entradas.toFixed(2)}${leE ? '\n'+leE : ''}`;
    rel += `\nSaídas: R$ ${saidas.toFixed(2)}${leS ? '\n'+leS : ''}`;
    rel += `\nResultado: R$ ${(entradas-saidas).toFixed(2)} | Atendimentos: ${agendamentos}`;
    await responder(rel);
    return true;
  }

  // ── CANCELAR AGENDAMENTO ─────────────────────────────────────────────────
  if (/\bcancela\b|\bcancelado\b|\bn[aã]o\s+vem\b|\bdesistiu\b|\bdesmarca\b|\bn[aã]o\s+vai\s+vir\b|\bcliente\s+cancelou\b/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL) || new Date();
    if (hora) {
      const ini = new Date(dia); ini.setHours(hora.h, hora.min - 5, 0, 0);
      const fim = new Date(dia); fim.setHours(hora.h, hora.min + 5, 0, 0);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId, dataHora: { $gte: ini, $lte: fim },
        status: { $ne: 'cancelado' }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'cancelado' });
        await responder(`Feito, ${_chefe()}! 🔓\n\n*${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))} cancelado. Horário livre! 😊`);
        return true;
      }
    }
    const nomeM2 = msg.match(/cancela\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i)
                || msg.match(/desmarca\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i)
                || msg.match(/([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s+(?:n[aã]o\s+vem|cancelou|desistiu|n[aã]o\s+vai\s+vir)/i);
    const nomeCli2 = nomeM2 ? nomeM2[1].trim() : null;
    if (nomeCli2) {
      const ini = new Date(dia); ini.setHours(0,0,0,0);
      const fim = new Date(dia); fim.setHours(23,59,59,999);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId,
        nomeCliente: { $regex: nomeCli2, $options: 'i' },
        dataHora: { $gte: ini, $lte: fim },
        status: { $ne: 'cancelado' }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'cancelado' });
        await responder(`Cancelado, ${_chefe()}! 🔓\n\n*${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))} removido. Horário livre! 😊`);
        return true;
      }
      await responder(`Não achei agendamento de *${nomeCli2}* hoje não, ${_chefe()}. Confere o nome? 🤔`);
      return true;
    }
    await responder(`Me fala o horário ou o nome, ${_chefe()}!\nTipo: *cancela as 14h* ou *a Maria não vem* 😊`);
    return true;
  }

  // ── CONFIRMAR AGENDAMENTO ────────────────────────────────────────────────
  if (/\bconfirma\b|\bconfirmado\b|\bpode\s+vir\b|\bvai\s+vir\b|\bcliente\s+confirmou\b/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL) || new Date();
    if (hora) {
      const ini = new Date(dia); ini.setHours(hora.h, hora.min - 5, 0, 0);
      const fim = new Date(dia); fim.setHours(hora.h, hora.min + 5, 0, 0);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId, dataHora: { $gte: ini, $lte: fim },
        status: { $in: ['pendente','confirmado'] }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'confirmado' });
        await responder(`Maravilha, ${_chefe()}! 🎉\n\n✅ *${ag.nomeCliente}* confirmado às ${_fmtHora(new Date(ag.dataHora))}. Pode esperar! 💙`);
        return true;
      }
    }
    const nomeM = msg.match(/confirma\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i)
               || msg.match(/([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s+(?:confirmou|vai\s+vir|pode\s+vir)/i);
    const nomeCli = nomeM ? nomeM[1].trim() : null;
    if (nomeCli) {
      const ini = new Date(dia); ini.setHours(0,0,0,0);
      const fim = new Date(dia); fim.setHours(23,59,59,999);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId,
        nomeCliente: { $regex: nomeCli, $options: 'i' },
        dataHora: { $gte: ini, $lte: fim },
        status: { $in: ['pendente','confirmado'] }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'confirmado' });
        await responder(`Confirmado, ${_chefe()}! ✅\n\n*${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))} — anotado! 💙`);
        return true;
      }
      await responder(`Não achei agendamento pra *${nomeCli}* hoje não, ${_chefe()}. Confere o nome? 🤔`);
      return true;
    }
    await responder(`Me fala o horário ou o nome, ${_chefe()}!\nTipo: *confirma as 14h* ou *a Maria confirmou* 😊`);
    return true;
  }

  // ── CLIENTES INATIVOS ──────────────────────────────────────────────────────
  if (/\bclientes?\s*inativo\b|\binativos?\b|\bquem\s*(n[aã]o\s*vem|sumiu|desapareceu)\b|\bclientes?\s*(que\s*)?(n[aã]o\s*voltaram|n[aã]o\s*aparecem)\b|\bsumiram\b|\bperdidos?\b/i.test(msgL)) {
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
  // ── Verificar contexto pendente: usuario respondendo "qual dia?" ou "qual hora?" ──
  const _sesLemb = SM.getSession(adminId, telefone);
  const _pendLemb = _sesLemb.aguardandoLembrete;

  if (_pendLemb && !(/me\s*lembr[ae]|lembrete|n[aã]o\s*me\s*deixa?\s*esquecer|anota\s*(a[ií])?/i.test(msgL))) {
    // Usuario respondeu uma pergunta de lembrete pendente
    const _diaPend  = _parseDia(msgL);
    const _horaPend = _parseHora(msgL);

    if (_pendLemb.aguardando === 'dia' && _diaPend) {
      // Tinha hora, agora tem dia: criar lembrete
      const _h = _pendLemb.hora;
      const _brMs = _diaPend.getTime() - (3*60*60*1000);
      const _brD  = new Date(_brMs);
      const _dt   = new Date(Date.UTC(_brD.getUTCFullYear(), _brD.getUTCMonth(), _brD.getUTCDate(), _h.h+3, _h.min, 0));
      const _dav  = new Date(_dt.getTime() - 15*60000);
      const _txt  = _pendLemb.texto || 'Lembrete';
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: { 'config.lembretes': { texto: _txt, dataEvento: _dt, dataAviso: _dav, enviado: false, criadoEm: new Date() } }
      });
      SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
      const _conf = _pendLemb.texto
        ? ('Anotado! Lembro voce de "' + _txt + '" em ' + _fmtData(_diaPend) + ' as ' + _fmtHora(_dt))
        : ('Anotado! Lembrete salvo para ' + _fmtData(_diaPend) + ' as ' + _fmtHora(_dt));
      await responder(_conf);
      SM.addAssistantMsg(adminId, telefone, _conf);
      return true;
    }

    if (_pendLemb.aguardando === 'hora' && _horaPend && !_horaPend.relativo) {
      // Tinha dia, agora tem hora: criar lembrete
      const _d = _pendLemb.dia;
      const _brMs = _d.getTime() - (3*60*60*1000);
      const _brD  = new Date(_brMs);
      const _dt   = new Date(Date.UTC(_brD.getUTCFullYear(), _brD.getUTCMonth(), _brD.getUTCDate(), _horaPend.h+3, _horaPend.min, 0));
      const _dav  = new Date(_dt.getTime() - 15*60000);
      const _txt  = _pendLemb.texto || 'Lembrete';
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: { 'config.lembretes': { texto: _txt, dataEvento: _dt, dataAviso: _dav, enviado: false, criadoEm: new Date() } }
      });
      SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
      const _conf = _pendLemb.texto
        ? ('Anotado! Lembro voce de "' + _txt + '" em ' + _fmtData(_d) + ' as ' + _fmtHora(_dt))
        : ('Anotado! Lembrete salvo para ' + _fmtData(_d) + ' as ' + _fmtHora(_dt));
      await responder(_conf);
      SM.addAssistantMsg(adminId, telefone, _conf);
      return true;
    }
  }

  if (/me\s*lembr[ae]|lembrete|n[aã]o\s*me\s*deixa?\s*esquecer|anota\s*(a[ií])?/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL);

    // ── Extrair texto: remover gatilho + tudo temporal, pegar o que sobra ────
    const _semGatilho = msg
      .replace(/^.*?(?:lembrete\s*:?|me\s*lembr[ae]|lembr[ae]|avisa?|anota)\s*(?:de\s+|que\s+)?/i, '')
      .trim();
    const _limpo = _semGatilho
      .replace(/(?:^|\s)amanh[aã](?:\s|$)/gi, ' ')
      .replace(/(?:^|\s)hoje(?:\s|$)/gi, ' ')
      .replace(/(?:^|\s)(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(-feira)?(?:\s|$)/gi, ' ')
      .replace(/\bdia\s+\d{1,2}\b/gi, '')
      .replace(/\bdaqui\s+\S+\s+\S+/gi, '')
      .replace(/(?:[àa]s?\s*)?\d{1,2}\s+hora[s]?\b/gi, '')
      .replace(/(?:[àa]s?)\s*\d{1,2}(:\d{2})?(h|hs)?\b/gi, '')
      .replace(/\b\d{1,2}(:\d{2})?(h|hs)\b/gi, '')
      .replace(/^[:\s]+/, '')
      .replace(/(?<=[^a-záàâãéêíóôõúç]|^)(de|do|da)(?=[^a-záàâãéêíóôõúç]|$)/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/[.!?,;]+$/, '')
      .replace(/^\s+/, '')
      .replace(/^(que\s+)?(eu\s+)?(tenho\s+que\s+)?(preciso\s+)?/i, '')
      .replace(/[.!?,;]+$/, '')
      .trim();
    const textoLembrete = (_limpo && _limpo.length > 1) ? _limpo : null;

    // ── CASO A: hora sem dia → perguntar dia, salvar estado ─────────────────
    if (hora && !hora.relativo && !dia) {
      const _brNow = new Date(Date.now() - 3*60*60*1000);
      const _sem = ['domingo','segunda-feira','terca-feira','quarta-feira','quinta-feira','sexta-feira','sabado'];
      const _dow = _brNow.getUTCDay();
      const _dowAm = (_dow + 1) % 7;
      const _dd  = String(_brNow.getUTCDate()).padStart(2,'0') + '/' + String(_brNow.getUTCMonth()+1).padStart(2,'0');
      const _brAm = new Date(_brNow.getTime() + 24*60*60*1000);
      const _ddAm = String(_brAm.getUTCDate()).padStart(2,'0') + '/' + String(_brAm.getUTCMonth()+1).padStart(2,'0');
      SM.updateSession(adminId, telefone, { aguardandoLembrete: { aguardando: 'dia', hora, texto: textoLembrete } });
      const _r = 'Claro! Qual dia voce quer esse lembrete?\n\nHoje e ' + _sem[_dow] + ', ' + _dd + '\nAmanha e ' + _sem[_dowAm] + ', ' + _ddAm + '\n\nMe fala o dia e confirmo!';
      await responder(_r);
      SM.addAssistantMsg(adminId, telefone, _r);
      return true;
    }

    // ── CASO B: dia sem hora → perguntar hora, salvar estado ────────────────
    if (dia && !hora) {
      const _diaStr = dia.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit', timeZone:'America/Sao_Paulo' });
      SM.updateSession(adminId, telefone, { aguardandoLembrete: { aguardando: 'hora', dia, texto: textoLembrete } });
      const _r = 'Anotei o dia! Que horario voce quer o lembrete em ' + _diaStr + '?';
      await responder(_r);
      SM.addAssistantMsg(adminId, telefone, _r);
      return true;
    }

    // ── CASO C: hora + dia → criar direto ───────────────────────────────────
    if (hora && !hora.relativo && dia) {
      const _brMs  = dia.getTime();
      const _brD   = new Date(_brMs);
      const dataLembrete = new Date(Date.UTC(_brD.getUTCFullYear(), _brD.getUTCMonth(), _brD.getUTCDate(), hora.h+3, hora.min, 0));
      const dataAviso = new Date(dataLembrete.getTime() - 15*60000);
      SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
      console.log('[LEMBRETE NLP] texto="' + (textoLembrete||'(sem texto)') + '" hora_br=' + hora.h + ':' + String(hora.min).padStart(2,'0') + ' utc=' + dataLembrete.toISOString());
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: { 'config.lembretes': { texto: textoLembrete||'Lembrete', dataEvento: dataLembrete, dataAviso, enviado: false, criadoEm: new Date() } }
      });
      const _conf = textoLembrete
        ? ('Anotado! Lembro voce de "' + textoLembrete + '" em ' + _fmtData(dia) + ' as ' + _fmtHora(dataLembrete))
        : ('Anotado! Lembrete salvo para ' + _fmtData(dia) + ' as ' + _fmtHora(dataLembrete));
      await responder(_conf);
      SM.addAssistantMsg(adminId, telefone, _conf);
      return true;
    }

    // ── CASO D: relativo → criar direto ─────────────────────────────────────
    if (hora && hora.relativo) {
      const dataLembrete = new Date(Date.now() + hora.msOffset);
      const dataAviso    = new Date(dataLembrete.getTime() - 1*60000);
      SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: { 'config.lembretes': { texto: textoLembrete||'Lembrete', dataEvento: dataLembrete, dataAviso, enviado: false, criadoEm: new Date() } }
      });
      const _minutos = Math.round(hora.msOffset / 60000);
      const _conf = textoLembrete
        ? ('Anotado! Te aviso em ' + _minutos + ' minuto(s): "' + textoLembrete + '"')
        : ('Anotado! Te aviso em ' + _minutos + ' minuto(s)');
      await responder(_conf);
      SM.addAssistantMsg(adminId, telefone, _conf);
      return true;
    }

    // ── CASO E: sem hora sem dia → anotacao simples ──────────────────────────
    const _textoFinal = textoLembrete || msg.replace(/rebeca[,\s]*/i,'').replace(/me\s*lembr[ae]\s*(de\s*)?/i,'').trim();
    SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
    await AdminAgenda.findByIdAndUpdate(adminObjId, {
      $push: { 'config.lembretes': { texto: _textoFinal, dataEvento: null, dataAviso: null, enviado: false, criadoEm: new Date() } }
    });
    const _rE = 'Anotei, ' + _chefe() + '! Me fala o dia e horario tambem pra eu te avisar antes.';
    await responder(_rE);
    SM.addAssistantMsg(adminId, telefone, _rE);
    return true;
  }

      // ── VER / EXCLUIR LEMBRETES ─────────────────────────────────────────────
  if (/ver.*lembrete|meus.*lembrete|quais.*lembrete|lista.*lembrete/i.test(msgL)) {
    const admin2 = await AdminAgenda.findById(adminObjId).lean();
    const lembs = (admin2?.config?.lembretes || []).filter(l => !l.enviado).sort((a,b) => new Date(a.dataEvento)-new Date(b.dataEvento));
    if (!lembs.length) { await responder("Nenhum lembrete pendente."); return true; }
    const lista = lembs.map((l,i) => `${i+1}. ${l.texto} — ${_fmtData(new Date(l.dataEvento))} ${l.dataEvento ? "às "+_fmtHora(new Date(l.dataEvento)) : ""}`).join("\n");
    await responder(`Seus lembretes pendentes:\n${lista}\n\nPara excluir: "cancela lembrete 1"`);
    return true;
  }

  if (/cancela.*lembrete|apaga.*lembrete|exclu.*lembrete|deleta.*lembrete|remove.*lembrete/i.test(msgL)) {
    const numM = msgL.match(/(\d+)/);
    const admin2 = await AdminAgenda.findById(adminObjId).lean();
    const lembs = (admin2?.config?.lembretes || []).filter(l => !l.enviado).sort((a,b) => new Date(a.dataEvento)-new Date(b.dataEvento));
    if (!numM) { await responder("Qual número do lembrete quer cancelar? Manda \"ver lembretes\" pra ver a lista."); return true; }
    const idx = parseInt(numM[1]) - 1;
    if (idx < 0 || idx >= lembs.length) { await responder(`Não achei o lembrete ${numM[1]}. Manda "ver lembretes" pra ver a lista.`); return true; }
    const lembId = lembs[idx]._id;
    await AdminAgenda.findByIdAndUpdate(adminObjId, { $pull: { "config.lembretes": { _id: lembId } } });
    await responder(`Lembrete cancelado: "${lembs[idx].texto}".`);
    return true;
  }

  // ── ÁUDIO — transcrito pelo webhook como texto ────────────────────────────
  // Audio com transcricao nativa do WhatsApp — processa como texto normal
  if (msg.startsWith('[AUDIO_TEXTO]')) {
    const textoTranscrito = msg.replace('[AUDIO_TEXTO]', '').trim();
    console.log('[ModoDono] 🎤 Audio transcrito:', textoTranscrito);
    return await processarComandoDono(numero, textoTranscrito, adminId, instanciaResposta);
  }

  // Audio sem transcricao
  if (msg.startsWith('[AUDIO_SEM_TEXTO]') || msg.startsWith('[AUDIO]')) {
    await responder(`🎤 Recebi seu áudio, ${_chefe()}! Mas não consegui transcrever. Me manda em texto que resolvo na hora! 💙`);
    return true;
  }

  // ── PRÓXIMO CLIENTE ──────────────────────────────────────────────────────────
  if (/pr[oó]ximo\s*cliente|quem\s*(é\s*)?o\s*pr[oó]ximo|pr[oó]ximo\s*da\s*fila|\bquem\s*[eé]\s*agora\b|\bquem\s*[eé]\s*o\s*seguinte\b|\bagora\s*quem\s*[eé]\b|\btem\s*algu[eé]m\s*agora\b|\bpr[oó]ximo\s*hor[aá]rio\b/i.test(msgL)) {
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
  if (/encaixa|marca\s*(um\s*)?hor[aá]rio|adiciona\s*(um\s*)?cliente|\bagenda\b.*\b(cliente|para|pra|amanhã|amanha|hoje|às|as)\b|\bagendar\b/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL) || new Date();
    // Extrai nome independente do verbo: encaixa/agenda/marca + [a/o] + Nome + amanhã/às/pra
    const nomeM = msg.match(/(?:encaixa|agenda|agendar|adiciona|marca)\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s+(?:amanhã|amanha|hoje|às?|as|pra|para|no dia|\d)/i);
    const nome = nomeM ? nomeM[1].trim() : null;
    if (hora && nome) {
      const dataHora = new Date(dia); dataHora.setHours(hora.h, hora.min, 0, 0);
      await AgendamentoAgenda.create({
        adminId: adminObjId, nomeCliente: nome,
        nomeServico: (() => {
          const srvM = msg.match(/(?:pra|para|de|corte|tintura|escova|manicure|pedicure|barba|sobrancelha|massagem|limpeza|hidrata[çc][aã]o)\s+([A-Za-zÀ-ú\s]+?)(?:\s*$)/i);
          const servicos = ['corte','tintura','escova','manicure','pedicure','barba','sobrancelha','massagem','limpeza','hidratação','progressiva','botox','penteado','maquiagem'];
          const encontrado = servicos.find(s => msgL.includes(s));
          return encontrado ? encontrado.charAt(0).toUpperCase()+encontrado.slice(1) : 'A definir';
        })(), dataHora,
        status: 'confirmado', origem: 'whatsapp_dono'
      });
      // Verificar se tem telefone na mensagem
      const telM = msg.match(/(?:telefone|fone|cel|celular|número|numero|whatsapp)[:\s]*(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})/i)
                || msg.match(/(\(?\d{2}\)?\s*9\d{4}[-\s]?\d{4})/);
      const telCliente = telM ? telM[1].replace(/\D/g,'') : null;

      if (telCliente) {
        await AgendamentoAgenda.findOneAndUpdate(
          { adminId: adminObjId, nomeCliente: nome, dataHora },
          { telefoneCliente: '55' + telCliente }
        );
      }

      // Montar mensagem de notificação para o ADM — estilo natural
      const servicoEncaixe = (() => {
        const servicos = ['corte','tintura','escova','manicure','pedicure','barba','sobrancelha','massagem','limpeza','hidratação','progressiva','botox','penteado','maquiagem','cílios','cilios','design'];
        return servicos.find(s => msgL.includes(s)) || 'a definir';
      })();

      const msgAdm =
        `📅 *Novo agendamento!*

` +
        `👤 *${nome}*
` +
        `✂️ Serviço: ${servicoEncaixe.charAt(0).toUpperCase() + servicoEncaixe.slice(1)}
` +
        `📆 ${_fmtData(diaFinal)} às ${_fmtHora(dataHora)}
` +
        (telCliente ? `📱 ${telCliente}
` : '') +
        `
Agendado via WhatsApp. 💙`;

      await responder(`Maravilha, ${_chefe()}! 🎉\n\n✅ *${nome}* encaixado às *${_fmtHora(dataHora)}* de ${_fmtData(dia)}!\n\nJá tá na agenda! 💙${telCliente ? '' : '\n\n📱 Se tiver o número dele me passa pra eu enviar lembretes!'}`); 
    } else if (nome && !hora) {
      await responder(`Certo, ${_chefe()}! *${nome}* — que horas? 😊`);
    } else if (hora && !nome) {
      await responder(`Combinado, ${_chefe()}! Às *${_fmtHora((() => { const d = new Date(); d.setHours(hora.h, hora.min, 0, 0); return d; })())}* — qual o nome do cliente?`);
    } else {
      await responder(`Me fala o nome e o horário, ${_chefe()}! Tipo: *Rebeca, agenda a Maria amanhã às 10h* 😊`);
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
  if (/hist[oó]rico\s*(do|da|de)\s+|[uú]ltimas?\s*visitas?\s*(do|da|de)\s+|\bquando\s*(veio|foi|atendi)\s+(a\s+|o\s+)?[A-Z]|\bficha\s+(do|da|de)\s+|\bcliente\s+(foi|veio)\s+quando\b/i.test(msgL)) {
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
  if (/resumo\s*d[ao]\s*semana|faturamento\s*d[ao]\s*semana|quanto\s*(fiz|faturei|ganhei|recebi)\s*(essa|na|esta)\s*semana|\bsemana\s*toda\b|\bcomo\s*foi\s*(a\s*)?semana\b|\bbalanço\s*d[ao]\s*semana\b/i.test(msgL)) {
    const ini = new Date(); ini.setDate(ini.getDate() - 7); ini.setHours(0,0,0,0);
    const fim = new Date(); fim.setHours(23,59,59,999);
    const lanc = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean();
    const entradas = lanc.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const saidas   = lanc.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
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
  if (/resumo\s*d[ao]\s*m[eê]s|faturamento\s*d[ao]\s*m[eê]s|quanto\s*(fiz|faturei|ganhei|recebi)\s*(esse|no|este|do)\s*m[eê]s|\bcomo\s*foi\s*(o\s*)?m[eê]s\b|\bbalanço\s*d[ao]\s*m[eê]s\b|\bfechamento\s*d[ao]\s*m[eê]s\b|\bm[eê]s\s*todo\b/i.test(msgL)) {
    const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
    const fim = new Date(); fim.setHours(23,59,59,999);
    const lanc = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean();
    const entradas = lanc.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const saidas   = lanc.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
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
  if (/\bajuda\b|\bcomandos?\b|\bo\s*que\s*(vc|você)\s*(faz|pode|sabe|consegue)\b|\bmenu\b|\bhelp\b|\bo\s*que\s*d[áa]\b|\boque\s*voc[eê]\b|\bfun[çc][õo]es?\b|\bcomo\s*us[ao]\b|\bcomo\s*funciona\b|\bpra\s*que\s*serve\b/i.test(msgL)) {
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
      `⏰ *LEMBRETES*
` +
      `• Rebeca, me lembra de ligar pro fornecedor às 14h
` +
      `• Rebeca, lembrete amanhã às 9h reunião

` +
      `💬 *MENSAGENS*
` +
      `• Rebeca, manda mensagem pra [nome]: texto aqui
` +
      `• Rebeca, avisa o [nome] que confirmou

` +
      `⏰ *HORÁRIOS*
` +
      `• Rebeca, hoje vou trabalhar das 8h às 18h

` +
      `Pode mandar qualquer coisa, tô aqui! 😊💙`
    );
    return true;
  }

  // ── MANDAR MENSAGEM PARA CLIENTE ────────────────────────────────────────────
  if (/manda\s*(uma\s*)?mensagem|fala\s+(pra|para|com)|avisa\s+(a\s+|o\s+)?|escreve\s+(pra|para)|contata|mandou\s+mensagem/i.test(msgL)) {
    // Extrair nome do cliente
    const nomeM = msg.match(/(?:manda\s+(?:uma\s+)?mensagem\s+(?:pra|para)|fala\s+(?:pra|para|com)|avisa\s+(?:a\s+|o\s+)?|escreve\s+(?:pra|para)|contata)\s+([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i);
    const nomeCliente = nomeM ? nomeM[1].trim() : null;

    // Extrair texto da mensagem (após "falando que", "dizendo que", "que", ":")
    const textoM = msg.match(/(?:falando\s+que|dizendo\s+que|que\s+(?:ela|ele|você)|:\s*|mensagem[:\s]+)(.+?)$/i)
                || msg.match(/(?:pra|para)\s+[A-Za-zÀ-ú]+\s+(.+?)$/i);
    const textoMsg = textoM ? textoM[1].trim() : null;

    if (!nomeCliente) {
      await responder(`Claro, ${_chefe()}! Me fala pra quem: *Rebeca, manda mensagem pra Maria que o horário foi confirmado* 😊`);
      return true;
    }

    // Buscar cliente no banco
    const cliente = await ClienteAgenda.findOne({
      adminId: adminObjId,
      nome: { $regex: nomeCliente, $options: 'i' }
    }).lean();

    if (!cliente || !cliente.telefone) {
      await responder(`Hmm, não achei o contato de *${nomeCliente}* aqui não, ${_chefe()}. Tem o número salvo no cadastro? 🤔`);
      return true;
    }

    // Montar mensagem natural
    if (!textoMsg) {
      await responder(`Certo, ${_chefe()}! O que quer que eu fale pra *${nomeCliente.split(' ')[0]}*? 😊`);
      return true;
    }
    const textoFinal = textoMsg;

    // Buscar instância para envio
    const inst = await InstanciaWhatsapp.findOne({ adminId: String(adminObjId), status: 'conectado' }).lean()
              || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };

    await _enviarMsg(inst, _normalizarTel(cliente.telefone), textoFinal);
    await responder(`Mandei pra *${nomeCliente}*, ${_chefe()}! ✅`);
    return true;
  }

  // ── SAUDAÇÃO INFORMAL ────────────────────────────────────────────────────────
  const _isSaudacao = (t) =>
    /^(oi+|ol[aá]|hey+|ei|e\s*a[íi]|eai+|opa+|salve+|fala+|beleza|tudo\s*(bem|bom|certo)|como\s*(vai|t[aá])|tchau|at[eé]\s*(logo|mais)|valeu|obrigad|tks|thx|ok|certo|entendi|perfeito|show|[oó]timo|maravilha|legal|massa|bom\s*dia|boa\s*(tarde|noite))/i.test(t.trim())
    || /^(fala\s*(rebeca|a[ií]|comigo|logo)?|e\s*a[ií])\b/i.test(t.trim())
    || (t.trim().length <= 15 && /^(ok|certo|show|legal|massa|[oó]timo|perfeito|maravilha|valeu|obrigad|tks|thx)/i.test(t.trim()));

  if (_isSaudacao(msgL)) {
    const _h = new Date().getHours();
    const _p = _h < 12 ? 'Bom dia' : _h < 18 ? 'Boa tarde' : 'Boa noite';
    let _resp;
    if (/tchau|at[eé]\s*(logo|mais)/i.test(msgL))         _resp = `Até mais! Qualquer coisa é só chamar 💙`;
    else if (/obrigad|valeu|thx|tks/i.test(msgL))           _resp = `De nada! Tô aqui sempre que precisar 😊`;
    else if (/ok|certo|entendi|perfeito|show|legal|massa|[oó]timo|maravilha/i.test(msgL)) _resp = `Ótimo! Se precisar de mais alguma coisa é só falar 💙`;
    else if (/bom\s*dia/i.test(msgL))                       _resp = `Bom dia! 🌅 Tô aqui prontinha. O que precisa hoje?`;
    else if (/boa\s*tarde/i.test(msgL))                     _resp = `Boa tarde! ☀️ Pode mandar o que precisar!`;
    else if (/boa\s*noite/i.test(msgL))                     _resp = `Boa noite! 🌙 Ainda aqui! O que precisa?`;
    else if (/fala|e\s*a[íi]|eai/i.test(msgL))             _resp = `Fala! 👋 Tô aqui, pode mandar!`;
    else if (/beleza|tudo\s*(bem|bom|certo)|como\s*(vai|t[aá])/i.test(msgL)) _resp = `Tudo certo por aqui! 😊 E aí, o que precisa?`;
    else {
      const _opts = [`${_p}! 😊 Tô aqui, pode mandar!`,`Fala! 👋 Tô de olho, pode falar!`,`Oi! Tô aqui prontinha. O que precisa? 💙`,`${_p}, ${_chefe()}! Me fala o que precisa 😊`];
      _resp = _opts[Math.floor(Math.random() * _opts.length)];
    }
    await responder(_resp);
    return true;
  }


  // ── AI ACTION ENGINE — Intent Parser + Action Router ────────────────────────
  // Claude retorna apenas JSON de intenção. Sistema executa o handler real.
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const _claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const LembreteAgenda = require('../models/LembreteAgenda');
    const { ClienteAgenda, RetornoAgenda } = require('../models/AgendaServico');

    const hoje = new Date();
    const ini  = new Date(hoje); ini.setHours(0,0,0,0);
    const fim  = new Date(hoje); fim.setHours(23,59,59,999);
    const iniAmanha = new Date(hoje); iniAmanha.setDate(iniAmanha.getDate()+1); iniAmanha.setHours(0,0,0,0);
    const fimAmanha = new Date(hoje); fimAmanha.setDate(fimAmanha.getDate()+1); fimAmanha.setHours(23,59,59,999);
    const iniSem = new Date(hoje); iniSem.setDate(iniSem.getDate()-6); iniSem.setHours(0,0,0,0);

    const [agsHoje, agsAmanha, lancHoje, lancSemana, lembretes, totalClientes, retornosPend] = await Promise.all([
      AgendamentoAgenda.find({ adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['pendente','confirmado'] } }).sort({ dataHora: 1 }).lean(),
      AgendamentoAgenda.find({ adminId: adminObjId, dataHora: { $gte: iniAmanha, $lte: fimAmanha }, status: { $in: ['pendente','confirmado'] } }).sort({ dataHora: 1 }).lean(),
      FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean(),
      FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: iniSem, $lte: fim }, tipo: 'receita' }).lean(),
      LembreteAgenda.find({ adminId: String(adminObjId), enviado: false, dataEvento: { $gte: ini } }).sort({ dataEvento: 1 }).limit(5).lean(),
      ClienteAgenda.countDocuments({ adminId: adminObjId }).catch(()=>0),
      RetornoAgenda ? RetornoAgenda.countDocuments({ adminId: adminObjId, statusContato: 'pendente' }).catch(()=>0) : Promise.resolve(0)
    ]);

    const faltaramHoje  = await AgendamentoAgenda.find({ adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: 'faltou' }).lean();
    const entradasHoje  = lancHoje.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const saidasHoje    = lancHoje.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
    const receitaSemana = lancSemana.reduce((s,l)=>s+l.valor,0);
    const admin2        = await AdminAgenda.findById(adminObjId).select('nomeNegocio config').lean();
    const nomeNegocio   = admin2?.nomeNegocio || 'seu negócio';
    const hrAbre        = admin2?.config?.horarioAbertura  || '08:00';
    const hrFecha       = admin2?.config?.horarioFechamento || '18:00';

    const resumoHoje = agsHoje.length
      ? agsHoje.map(a=>`  ${_fmtHora(new Date(a.dataHora))} - ${a.nomeCliente} (${a.nomeServico||'serviço'})`).join('\n')
      : '  nenhum agendamento hoje';
    const resumoAmanha = agsAmanha.length
      ? agsAmanha.map(a=>`  ${_fmtHora(new Date(a.dataHora))} - ${a.nomeCliente} (${a.nomeServico||'serviço'})`).join('\n')
      : '  nenhum agendamento amanhã';
    const resumoLembretes = lembretes.length
      ? lembretes.map(l=>`  ⏰ ${_fmtHora(new Date(l.dataEvento))} - ${l.texto}`).join('\n')
      : '  nenhum';
    const resumoFaltaram = faltaramHoje.length
      ? faltaramHoje.map(f=>`  ${f.nomeCliente} (${f.nomeServico||'serviço'})`).join('\n')
      : '  nenhum';
    const totalAgsHoje = agsHoje.length;

    // ── Trava financeira: salvar valores atuais na sessão ──
    SM.updateSession(adminId, telefone, {
      ultimoValorFinanceiro: { entradas: entradasHoje, saidas: saidasHoje, resultado: entradasHoje - saidasHoje, novaConsulta: true }
    });

    // ── Recuperar sessão ──
    const _sesAtual = SM.getSession(adminId, telefone);
    const _pendingAction = _sesAtual.ultimaAcaoPendente;

    // ── Confirmação/Cancelamento ANTES do parser ──
    if (_isConfirm && _pendingAction) {
      SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
      const rConf = `${_confirmacao()} Feito, ${_chefe()}! ✅`;
      await responder(rConf);
      SM.addAssistantMsg(adminId, telefone, rConf);
      return true;
    }
    if (_isNeg && _pendingAction) {
      SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
      const rNeg = `Ok, ${_chefe()}! Cancelei. 👍`;
      await responder(rNeg);
      SM.addAssistantMsg(adminId, telefone, rNeg);
      return true;
    }

    // ── STEP 1: Intent Parser ──
    const _intent = await IntentParser.parseIntent(msg, {
      assuntoAtual: _sesAtual.assuntoAtual,
      ultimaAcaoPendente: _pendingAction,
      historico: SM.getHistoricoParaAPI(adminId, telefone, 4)
    });

    SM.updateSession(adminId, telefone, {
      assuntoAtual: _intent.intencao,
      entidadesExtraidas: _intent.entidades || {}
    });

    // ── STEP 2: Action Router — registry declarativo ──
    const _dadosCtx = {
      dados: { entradasHoje, saidasHoje, receitaSemana, agsHoje, agsAmanha,
               resumoHoje, resumoAmanha, resumoLembretes, resumoFaltaram,
               totalAgsHoje, totalClientes, retornosPend, nomeNegocio, hrAbre, hrFecha },
      intent: _intent,
      session: _sesAtual,
      adminId, telefone
    };

    const _resultado = ActionRouter.rotear(_intent, _dadosCtx);

    if (_resultado !== null) {
      await responder(_resultado);
      SM.addAssistantMsg(adminId, telefone, _resultado);
      return true;
    }

    // ── STEP 3: Fallback SEGURO — sem IA livre ──
    const _seguro = ActionRouter.respostaSegura();
    await responder(_seguro);
    SM.addAssistantMsg(adminId, telefone, _seguro);
    return true;
  } catch(e) {
    console.error('[ModoDono] Claude fallback erro:', e.message);
  }
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
    // Buscar total da semana para contexto
    const iniSem = new Date(); iniSem.setDate(iniSem.getDate() - iniSem.getDay()); iniSem.setHours(0,0,0,0);
    const fimSem = new Date(); fimSem.setHours(23,59,59,999);
    const totalSemana = await AgendamentoAgenda.countDocuments({
      adminId, dataHora: { $gte: iniSem, $lte: fimSem },
      status: { $in: ['pendente','confirmado','concluido'] }
    });
    const receitaSemana = await FinanceiroAgenda.find({
      adminId, data: { $gte: iniSem, $lte: fimSem }, tipo: 'receita'
    }).lean().then(l => l.reduce((s,x) => s+x.valor, 0));

    const frases = [
      `Mais um chegando! 🎉`,
      `Agenda enchendo! 💪`,
      `Tá bombando! 🚀`,
      `Cliente novo na fila! 💙`,
    ];
    const frase = frases[Math.floor(Math.random() * frases.length)];

    const msg =
      `📅 *Novo agendamento!* ${frase}

` +
      `👤 *${dadosAg.nomeCliente}*
` +
      `✂️ ${dadosAg.nomeServico || 'Serviço'}
` +
      `📆 ${_fmtData(dataHora)} às ${_fmtHora(dataHora)}
` +
      (dadosAg.valor ? `💰 R$ ${Number(dadosAg.valor).toFixed(2)}
` : '') +
      (dadosAg.nomeProfissional ? `👩 ${dadosAg.nomeProfissional}
` : '') +
      `
📊 Essa semana: ${totalSemana} agendamento(s) | R$ ${receitaSemana.toFixed(2)}`;

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

        // Fallback Meta API se não tiver Evolution conectado
        const instParaEnvio = inst || {
          _enviarVia: 'meta',
          apiUrl: 'meta',
          nomeInstancia: 'meta_oficial'
        };

        const hora = _fmtHora(new Date(ag.dataHora));
        await _enviarMsg(instParaEnvio, telDono,
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
    const LembreteAgenda = require('../models/LembreteAgenda');
    const admins = await require('../models/AgendaServico').AdminAgenda.find({
      ativo: true,
      'config.relatorioDiario': { $ne: false }
    }).lean();

    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const hoje  = new Date();
    const iniOn = new Date(ontem); iniOn.setHours(0,0,0,0);
    const fimOn = new Date(ontem); fimOn.setHours(23,59,59,999);
    const iniHj = new Date(hoje);  iniHj.setHours(0,0,0,0);
    const fimHj = new Date(hoje);  fimHj.setHours(23,59,59,999);

    for (const admin of admins) {
      try {
        const telDono = _normalizarTel(admin.whatsapp || admin.telefone);
        if (!telDono) continue;

        const inst = await InstanciaWhatsapp.findOne({ adminId: String(admin._id), adminTipo: 'agenda', status: 'conectado' }).lean();
        const instParaEnvio = inst || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };
        if (!inst && !process.env.META_WA_TOKEN) continue;

        // Dados de ontem
        const lancamentos = await FinanceiroAgenda.find({ adminId: String(admin._id), data: { $gte: iniOn, $lte: fimOn } }).lean();
        const entradas    = lancamentos.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0);
        const saidas      = lancamentos.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0);
        const atendidos   = await AgendamentoAgenda.countDocuments({ adminId: String(admin._id), dataHora: { $gte: iniOn, $lte: fimOn }, status: { $in: ['confirmado','concluido'] } });

        // Agenda de hoje
        const agsHoje = await AgendamentoAgenda.find({ adminId: String(admin._id), dataHora: { $gte: iniHj, $lte: fimHj }, status: { $in: ['pendente','confirmado'] } }).sort({ dataHora: 1 }).lean();

        // Lembretes do dia
        const lembretesDia = await LembreteAgenda.find({ adminId: String(admin._id), enviado: false, dataEvento: { $gte: iniHj, $lte: fimHj } }).sort({ dataEvento: 1 }).lean();

        // Montar mensagem
        const resultado   = entradas - saidas;
        const sinalRes    = resultado >= 0 ? '📈' : '📉';
        const resumoOntem = atendidos > 0
          ? `✅ Atendimentos: *${atendidos}*\n💰 Entradas: *R$ ${entradas.toFixed(2)}*\n💸 Gastos: *R$ ${saidas.toFixed(2)}*\n${sinalRes} Resultado: *R$ ${resultado.toFixed(2)}*`
          : `📭 Nenhum atendimento registrado`;

        const resumoHoje = agsHoje.length > 0
          ? agsHoje.map(a => `  ${_fmtHora(new Date(a.dataHora))} - ${a.nomeCliente} (${a.nomeServico||'serviço'})`).join('\n')
          : '  Agenda livre hoje! 🎉';

        const resumoLembretes = lembretesDia.length > 0
          ? '\n\n⏰ *Lembretes de hoje:*\n' + lembretesDia.map(l => `  ${_fmtHora(new Date(l.dataEvento))} - ${l.texto}`).join('\n')
          : '';

        const motivacao = atendidos > 0 ? 'Arrasou ontem! 🚀' : 'Hoje vai bombar! 💪';

        await _enviarMsg(instParaEnvio, telDono,
          `🌅 *Bom dia, ${_chefe()}!*\n\n` +
          `📊 *Ontem (${_fmtData(ontem)}):*\n${resumoOntem}\n\n` +
          `📅 *Agenda de hoje (${_fmtData(hoje)}):*\n${resumoHoje}` +
          resumoLembretes +
          `\n\n${motivacao} 💙`
        );
      } catch(e) {
        console.error('[ModoDono] Erro relatório admin:', admin._id, e.message);
      }
    }
  } catch(e) {
    console.error('[ModoDono] Erro rodarRelatorioDiario:', e.message);
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

  // ── LEMBRETES PESSOAIS (config.lembretes) ──────────────────────────────────
  try {
    const agora2 = new Date();
    const adminsL = await AdminAgenda.find({
      'config.lembretes': { $elemMatch: { enviado: { $ne: true }, dataAviso: { $lte: agora2 } } }
    }).lean();
    for (const adm of adminsL) {
      const pendentes = (adm.config?.lembretes || []).filter(
        l => !l.enviado && l.dataAviso && new Date(l.dataAviso) <= agora2
      );
      for (const l of pendentes) {
        const telDono = _normalizarTel(adm.whatsappOficial || adm.whatsapp || adm.telefone);
        if (!telDono) continue;
        const inst = await InstanciaWhatsapp.findOne({ adminId: String(adm._id), status: 'conectado' }).lean();
        const horaEvento = l.dataEvento ? _fmtHora(new Date(l.dataEvento)) : '';
        await _enviarMsg(
          inst || { _enviarVia: 'meta', nomeInstancia: 'meta_oficial' },
          telDono,
          `🔔 *Lembrete!*\n\n${l.texto}${horaEvento ? '\n\n📅 ' + horaEvento : ''}`,
        );
        // Marcar enviado por criadoEm (subdocs sem _id gerado pelo schema antigo)
        if (l._id) {
          await AdminAgenda.updateOne(
            { _id: adm._id, 'config.lembretes._id': l._id },
            { $set: { 'config.lembretes.$.enviado': true } }
          );
        } else {
          // Fallback: marcar pelo criadoEm
          await AdminAgenda.updateOne(
            { _id: adm._id, 'config.lembretes.criadoEm': l.criadoEm },
            { $set: { 'config.lembretes.$.enviado': true } }
          );
        }
        console.log('[LembretesConfig] Enviado para', telDono, ':', l.texto?.slice(0,40));
      }
    }
  } catch(e) {
    console.error('[LembretesConfig] Erro:', e.message);
  }
}

module.exports.rodarLembretesPessoais = rodarLembretesPessoais;


// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICAÇÕES AUTOMÁTICAS PARA CLIENTES (zero IA — texto fixo carismático)
// ══════════════════════════════════════════════════════════════════════════════

async function notificarCliente(instancia, telefoneCliente, tipo, dados) {
  if (!telefoneCliente || !instancia) return;

  const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nome  = dados.nome ? dados.nome.split(' ')[0] : 'amor';
  const dh    = dados.dataHora ? new Date(dados.dataHora) : null;
  const data  = dh ? dh.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' }) : '';
  const hora  = dh ? dh.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
  const serv  = dados.servico || 'Serviço';

  const msgs = {
    confirmacao: () => _pick([
      `Oi *${nome}*! 🥳

Tá na agenda, pode deixar!

📅 *${data}* às *${hora}*
✂️ *${serv}*

Qualquer coisa é só chamar, tá bom? 💙`,
      `Oi *${nome}*! 💙

Confirmado certinho aqui!

📅 *${data}*
⏰ *${hora}*
✂️ *${serv}*

Te esperamos! 🥰`,
      `*${nome}*, tudo certo! ✅

Seu horário tá marcado:

📅 *${data}* às *${hora}*
✂️ *${serv}*

Qualquer dúvida pode mandar mensagem! 😊`
    ]),

    lembrete_1dia: () => _pick([
      `Oi *${nome}*! 🌟

Tô passando pra te lembrar que amanhã você tem horário marcado!

⏰ *${hora}*
✂️ *${serv}*

Tá esquecendo não né? 😄 Te esperamos! 💙`,
      `*${nome}*, oi! 😊

Só passando pra te avisar que amanhã é dia de se cuidar! 💅

⏰ *${hora}*
✂️ *${serv}*

Qualquer coisa é só falar! 🥰`,
      `Oi *${nome}*! 👋

Amanhã tem horário com a gente, lembrou?

⏰ *${hora}*
✂️ *${serv}*

Se precisar remarcar é só chamar 😉💙`,
      `*${nome}*, amanhã é dia! 🎉

⏰ *${hora}*
✂️ *${serv}*

Já deixa a roupa separada! 😂 Brincadeira... mas o horário tá confirmado! 💙`
    ]),

    lembrete_2h: () => _pick([
      `*${nome}*! 🏃 Daqui a pouquinho é hora!

⏰ *${hora}*
✂️ *${serv}*

Vem chegando que tô te esperando! 💙`,
      `Oi *${nome}*! ⏰

Só lembrando que em *2 horas* é seu horário:

✂️ *${serv}* às *${hora}*

Nem precisa correr, mas pode vir chegando! 😄💙`,
      `*${nome}*, chegou a hora! 🥳

Seu horário é daqui a pouco:

⏰ *${hora}*
✂️ *${serv}*

Qualquer imprevisto fala comigo 😊`,
      `Oi *${nome}*! 💅

Preparada(o) pra arrasar?

⏰ *${hora}* — já chegando!
✂️ *${serv}*

Te vejo logo mais! 💙🥰`
    ]),

    cancelamento: () => _pick([
      `Oi *${nome}*, tudo bem? 😔

Precisamos cancelar seu horário de *${data}* às *${hora}*.

Sinto muito pelo inconveniente! Quando quiser reagendar é só chamar, tá? 💙`,
      `*${nome}*, oi! Infelizmente seu horário de *${hora}* no dia *${data}* foi cancelado. 😔

Mas não some não! Quando quiser marcar de novo é só falar aqui 😊💙`,
      `Oi *${nome}*! 💙

Chateada de falar, mas seu horário de *${data}* precisou ser cancelado.

Qualquer coisa pra reagendar é só mandar mensagem! 🥰`
    ]),

    reagendamento: () => _pick([
      `Oi *${nome}*! 🔄

Seu horário foi reagendado, fica tranquila(o)!

📅 *${data}* às *${hora}*
✂️ *${serv}*

Qualquer dúvida pode chamar! 💙`,
      `*${nome}*, tudo resolvido! ✅

Novo horário marcado pra você:

📅 *${data}*
⏰ *${hora}*
✂️ *${serv}*

Te espero! 😊💙`
    ]),

    aniversario: () => _pick([
      `*${nome}*, FELIZ ANIVERSÁRIO! 🎂🎉🥳

Que dia especial! Que esse ano seja cheio de saúde, alegria e muito sucesso!

Tem uma surpresinha especial esperando por você hoje 🎁 Passa por aqui! 💙`,
      `Oi *${nome}*! Hoje é SEU DIA! 🎂✨

Feliz aniversário! Que você seja muito feliz!

Temos um mimo especial pra você hoje 🥰 Vem comemorar com a gente! 💙🎉`,
      `🎉🎂 FELIZ ANIVERSÁRIO, *${nome}*! 🎂🎉

Saudades de você por aqui! Hoje tem desconto especial esperando pra te ver mais linda(o) ainda! 💅

Felicidades! 💙`
    ]),

    inativo: () => _pick([
      `Oi *${nome}*! 😊

Saudades de você por aqui!

Faz um tempinho que não aparece... tudo bem? 🥺

Quer marcar um horário? Tô aqui! 💙`,
      `*${nome}*, sumiu! 😄

A gente tá com saudades! Que tal dar uma passadinha? 💅

É só chamar pra marcar! 💙🥰`,
      `Oi *${nome}*! 👋

Passando pra dar oi e ver se tá tudo bem!

Faz um tempo que não aparece... temos novidades esperando! Quer marcar um horário? 😊💙`
    ])
  };

  const texto = msgs[tipo] ? msgs[tipo]() : null;
  if (!texto) return;

  try {
    const axios   = require('axios');
    const apiUrl  = instancia.apiUrl  || process.env.EVOLUTION_API_URL;
    const apiKey  = instancia.apiKey  || process.env.EVOLUTION_API_KEY;
    const instNm  = instancia.nomeInstancia;
    const telFmt  = telefoneCliente.replace(/\D/g,'') + '@s.whatsapp.net';

    await axios.post(`${apiUrl}/message/sendText/${instNm}`, {
      number: telFmt, text: texto
    }, {
      headers: { apikey: apiKey },
      timeout: 10000
    });
    console.log('[NotifCliente] ✅', tipo, '->', telefoneCliente.slice(-4));
  } catch(e) {
    console.error('[NotifCliente] ❌ Erro:', e.message);
  }
}

// ── Rodar lembretes automáticos para CLIENTES ────────────────────────────────
async function rodarLembretesClientes() {
  try {
    const agora = new Date();
    const AdminAgenda        = require('../models/AgendaServico').AdminAgenda       || require('../models/AgendaServico');
    const AgendamentoAgenda  = require('../models/AgendaServico').AgendamentoAgenda;

    const admins = await AdminAgenda.find({ ativo: true }).select('_id').lean();

    for (const admin of admins) {
      try {
        const adminId = String(admin._id);
        const inst = await InstanciaWhatsapp.findOne({
          adminId, status: { $in: ['conectado','open','connected'] }
        }).lean();
        // Fallback Meta API se não tiver Evolution conectado
        const instParaEnvio = inst || {
          _enviarVia: 'meta',
          apiUrl: 'meta',
          nomeInstancia: 'meta_oficial'
        };

        // ── Lembrete 1 dia antes ─────────────────────────────────────────
        const amanha_ini = new Date(agora); amanha_ini.setDate(agora.getDate()+1); amanha_ini.setHours(0,0,0,0);
        const amanha_fim = new Date(amanha_ini); amanha_fim.setHours(23,59,59,999);

        const ags1dia = await AgendamentoAgenda.find({
          adminId,
          dataHora: { $gte: amanha_ini, $lte: amanha_fim },
          status: { $in: ['pendente','confirmado'] },
          lembrete1diaEnviado: { $ne: true }
        }).lean();

        for (const ag of ags1dia) {
          if (!ag.telefoneCliente) continue;
          await notificarCliente(instParaEnvio, ag.telefoneCliente, 'lembrete_1dia', {
            nome: ag.nomeCliente, dataHora: ag.dataHora, servico: ag.nomeServico
          });
          await AgendamentoAgenda.findByIdAndUpdate(ag._id, { lembrete1diaEnviado: true });
          await new Promise(r => setTimeout(r, 1500)); // evitar spam
        }

        // ── Lembrete 2 horas antes ───────────────────────────────────────
        const daqui2h_ini = new Date(agora.getTime() + 1.5*60*60*1000);
        const daqui2h_fim = new Date(agora.getTime() + 2.5*60*60*1000);

        const ags2h = await AgendamentoAgenda.find({
          adminId,
          dataHora: { $gte: daqui2h_ini, $lte: daqui2h_fim },
          status: { $in: ['pendente','confirmado'] },
          lembrete2hEnviado: { $ne: true }
        }).lean();

        for (const ag of ags2h) {
          if (!ag.telefoneCliente) continue;
          await notificarCliente(instParaEnvio, ag.telefoneCliente, 'lembrete_2h', {
            nome: ag.nomeCliente, dataHora: ag.dataHora, servico: ag.nomeServico
          });
          await AgendamentoAgenda.findByIdAndUpdate(ag._id, { lembrete2hEnviado: true });
          await new Promise(r => setTimeout(r, 1500));
        }

      } catch(eAdmin) {
        console.error('[LembretesClientes] Erro admin:', eAdmin.message);
      }
    }
  } catch(e) {
    console.error('[LembretesClientes] Erro geral:', e.message);
  }
}

module.exports.notificarCliente       = notificarCliente;
module.exports.rodarLembretesClientes = rodarLembretesClientes;
