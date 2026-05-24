

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
  // Tenta pegar o que vem depois de palavras-chave
  const m = txt.match(/(?:de|em|no|na|com|para|pro|pra)s+([A-Za-zÀ-ú][A-Za-zÀ-ús]{1,30}?)(?:s*(?:pra|para|R\$|reais|,|\.|$))/i)
           || txt.match(/(?:registra|anota|marca|coloca)s+(?:uma?|o)?s*(?:entrada|saida|saída|gasto|despesa|receita)?s*(?:de|no|em)?s*R?\$?\s*[\d.,]+\s+([A-Za-zÀ-ú][A-Za-zÀ-ús]{1,30})/i);
  if (m && m[1]) return m[1].trim();
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
  if (/\bamanhã\b|\bamanha\b/i.test(txt)) return mkData(ano, mes, dia + 1);
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
  return null;
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
  // 1. Formato original: 10h, 10h30, 10:30
  const m = txt.match(/(\d{1,2})h(?:(\d{2})?)?/i) || txt.match(/(\d{1,2}):(\d{2})/);
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
  return d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit' });
}

function _fmtHora(d) {
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

// ── Processar comando do dono ────────────────────────────────────────────────
async function processarComandoDono(telefone, mensagem, adminId, instanciaResposta = null) {
  const msg = (mensagem || '').trim();
  const msgL = msg.toLowerCase();
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
  if (/bloquei[ao]\s*(hor[aá]rio|agenda|tempo|per[ií]odo)|bloqueia.*(das?|de)|tira\s*(hor[aá]rio|tempo|per[ií]odo)|reserva\s*(hor[aá]rio|tempo)|sai.*\d+h|almo[çc]o|paus[ao]|intervalo.*hor[aá]rio/i.test(msgL)) {
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

  // ── REGISTRAR ENTRADA FINANCEIRA ───────────────────────────────────────────
  if (/\bregistra\b.*\bentrada\b|\bmarca\b.*\bentrada\b|\banota\b.*\bentrada\b|\bcoloca\b.*\bentrada\b|\breceb[ei]\b.*\bR?\$|\bentrada\b.*\bR?\$|\bganhei\b.*\bR?\$|\bcaiu\b.*\bR?\$|\bentr[oô]u\b.*\bR?\$|\breceit[ao]\b.*\bR?\$|\bpix\b.*\bR?\$|\bR?\$.*\bpix\b|\btransfer[eê]ncia\b.*\bR?\$|\bdinheiro\b.*\bentrou\b|\bfiz\b.*\bR?\$|\bvendi\b.*\bR?\$/i.test(msgL)) {
    const valM = msg.match(/R?\$\s*(\d+(?:[.,]\d{1,2})?)/i);
    const val = valM ? parseFloat(valM[1].replace(',','.')) : null;
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
  if (/\bregistra\b.*\bgasto\b|\bmarca\b.*\bgasto\b|\banota\b.*\bgasto\b|\bmarca\b.*\bdespesa\b|\bregistra\b.*\bdespesa\b|\bpaguei\b|\bcomprei\b|\bsaída\b|\bsaida\b|\bdespesa\b.*\bR?\$|\bgastei\b|\bpaguei\b|\btive\s*gasto\b|\bsaiu\b.*\bR?\$|\bfoi\b.*\bR?\$|\bdebita\b|\bdescontou\b|\bcompra\b.*\bR?\$|\bfornecedor\b.*\bR?\$|\bproduto\b.*\bR?\$|\baluguel\b|\bluz\b.*\bR?\$|\bagua\b.*\bR?\$/i.test(msgL)) {
    const valM = msg.match(/R?\$\s*(\d+(?:[.,]\d{1,2})?)/i);
    const val = valM ? parseFloat(valM[1].replace(',','.')) : null;
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
  if (/\bfaturei\b|\bfaturamento\b|\bquanto\s*(entrou|fiz|ganhei|recebi|caiu)\b|\bquanto\s*(fiz|ganhei|recebi)\s*hoje\b|\bcaixa\s*de\s*hoje\b|\bresultado\s*de\s*hoje\b|\bsaldo\s*de\s*hoje\b|\bquanto\s*t[eê]m?\s*hoje\b|\bcomo\s*t[áa]\s*o\s*caixa\b|\bfiz\s*quanto\b|\bganhei\s*quanto\b/i.test(msgL)) {
    const dia = _parseDia(msgL) || new Date();
    const ini = new Date(dia); ini.setHours(0,0,0,0);
    const fim = new Date(dia); fim.setHours(23,59,59,999);

    const lancamentos = await FinanceiroAgenda.find({
      adminId: adminObjId,
      data: { $gte: ini, $lte: fim }
    }).lean();
    const entradas = lancamentos.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const saidas = lancamentos.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
    const agendamentos = await AgendamentoAgenda.countDocuments({
      adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['confirmado','concluido'] }
    });
    const catE = {}; lancamentos.filter(l=>l.tipo==='receita').forEach(l=>{ const c=l.categoria||'outros'; catE[c]=(catE[c]||0)+l.valor; });
    const catS = {}; lancamentos.filter(l=>l.tipo==='despesa').forEach(l=>{ const c=l.categoria||'outros'; catS[c]=(catS[c]||0)+l.valor; });
    const leE = Object.entries(catE).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2)}`).join('\n');
    const leS = Object.entries(catS).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2)}`).join('\n');
    let rel = `Resumo de ${_fmtData(dia)}:\n`;
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
  if (/me\s*lembr[ae]|lembrete|n[aã]o\s*me\s*deixa?\s*esquecer|anota\s*(a[ií])?/i.test(msgL)) {
    const hora  = _parseHora(msgL);
    const dia   = _parseDia(msgL) || new Date();

    // Extrair o que é o lembrete
    const textoM = msg.match(/(?:me lembr[ae]|lembrete[:\s]+|anota[:\s]+|esquecer[:\s]+)\s*(?:de\s+|que\s+)?(.+?)(?:\s+(?:amanhã|hoje|às?|as)\s+\d|$)/i)
                || msg.match(/(?:tenho\s+que|preciso|vou)\s+(.+?)(?:\s+(?:amanhã|hoje|às?|as)\s+\d|$)/i);
    const textoLembrete = textoM ? textoM[1].trim() : msg.replace(/rebeca[,\s]*/i,'').trim();

    if (hora) {
      // Montar dataLembrete — relativo (daqui X min) ou absoluto
      let dataLembrete;
      if (hora.relativo && hora.msOffset) {
        dataLembrete = new Date(Date.now() + hora.msOffset);
      } else {
        const _brMs   = dia.getTime() - (3 * 60 * 60 * 1000);
        const _brDate = new Date(_brMs);
        dataLembrete = new Date(Date.UTC(
          _brDate.getUTCFullYear(), _brDate.getUTCMonth(), _brDate.getUTCDate(),
          hora.h + 3, hora.min, 0
        ));
      }
      const dataAviso = hora.relativo
        ? new Date(dataLembrete.getTime() - 1*60000)
        : new Date(dataLembrete.getTime() - 15*60000);
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: {
          'config.lembretes': {
            texto: textoLembrete,
            dataEvento: dataLembrete,
            dataAviso,
            enviado: false,
            criadoEm: new Date()
          }
        }
      });
      const _confirmLemb = hora.relativo
        ? `Anotado! Te aviso em ${Math.round(hora.msOffset/60000)} minuto(s): "${textoLembrete}" 🔔`
        : `Anotado! Lembro você sobre "${textoLembrete}" em ${_fmtData(dia)} às ${_fmtHora(dataLembrete)} 🔔`;
      await responder(_confirmLemb);
    } else {
      // Sem hora — salva sem data de aviso
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: {
          'config.lembretes': {
            texto: textoLembrete,
            dataEvento: dia,
            dataAviso: null,
            enviado: false,
            criadoEm: new Date()
          }
        }
      });
      await responder(`Anotei, ${_chefe()}! 📝

🔔 *${textoLembrete}*

Me fala o horário também pra eu te avisar antes! 😊`);
    }
    return true;

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
        `📆 ${_fmtData(dia)} às ${_fmtHora(dataHora)}
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


  // ── NÃO RECONHECIDO — FALLBACK COM CLAUDE (contexto rico) ──────────────────
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

    const r = await _claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Você é a Rebeca, assistente digital de ${nomeNegocio}.
PERSONALIDADE:
- Fala em português brasileiro informal, caloroso, animado
- Chama o dono de "chefe", "chefão", "chefa", "patrão" — alterna sempre
- Usa emojis com moderação (1-2 por mensagem)
- NUNCA se apresenta (o dono já te conhece)
- Respostas curtas e diretas — máximo 4 linhas

CONTEXTO COMPLETO (${new Date().toLocaleString('pt-BR')}):
NEGÓCIO: ${nomeNegocio} | Horário: ${hrAbre} às ${hrFecha}

HOJE — Agendamentos (${totalAgsHoje}):
${resumoHoje}

HOJE — Financeiro:
  Entradas: R$ ${entradasHoje.toFixed(2)}${entradasHoje===0?' (nenhuma registrada ainda)':''}
  Saídas: R$ ${saidasHoje.toFixed(2)}${saidasHoje===0?' (nenhuma)':''}
  Resultado: R$ ${(entradasHoje-saidasHoje).toFixed(2)}

SEMANA (últimos 7 dias):
  Receita acumulada: R$ ${receitaSemana.toFixed(2)}${receitaSemana===0?' (nenhuma ainda)':''}

AMANHÃ — Agendamentos (${agsAmanha.length}):
${resumoAmanha}

LEMBRETES PENDENTES:
${resumoLembretes}

CLIENTES QUE FALTARAM HOJE:
${resumoFaltaram}

RETORNOS PENDENTES: ${retornosPend} cliente(s) aguardando contato
TOTAL CLIENTES CADASTRADOS: ${totalClientes}

O DONO DISSE: "${msg}"

RACIOCÍNIO — como responder cada tipo de mensagem:

1. AGENDA
   Hoje/amanhã → lista do contexto com horário e nome.
   Vazia: "Agenda livre! Quer encaixar alguém?"
   Semana que vem ou outro período → diz que só tem dados de hoje e amanhã, sugere o painel.
   NUNCA liste agendamentos que não estão no contexto.

2. FINANCEIRO
   Use os números EXATOS do contexto.
   Entradas = R$ 0.00 → "Nenhuma entrada registrada ainda hoje."
   NUNCA invente ou estime valores.

3. NOME/PRONOME SOLTO
   Procura no contexto → responde com horário/serviço.
   Não achou → "Não vi esse nome na agenda de hoje nem amanhã."

4. PERGUNTA GERAL DE NEGÓCIO
   Dica prática curta (1-2 frases).

5. PEDIDO QUE NÃO FAZ
   Áudio, foto, ligar → explica que não consegue, oferece texto.

6. DESABAFO
   Empatia primeiro, depois anima com dado do contexto.

7. FORA DO ESCOPO
   Leveza e redireciona pro negócio.

INSTRUÇÕES FINAIS:
- Use APENAS os dados do contexto acima
- Se não está no contexto: diga que não tem esse dado
- Sem markdown: sem #, *, _, negrito
- Máximo 3 linhas por resposta`
      }]
    });
    const respClaude = r.content?.[0]?.text?.trim();
    if (respClaude) { await responder(respClaude); return true; }
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
        await AdminAgenda.updateOne(
          { _id: adm._id, 'config.lembretes._id': l._id },
          { $set: { 'config.lembretes.$.enviado': true } }
        );
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
        if (!inst) continue;

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
          await notificarCliente(inst, ag.telefoneCliente, 'lembrete_1dia', {
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
          await notificarCliente(inst, ag.telefoneCliente, 'lembrete_2h', {
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
