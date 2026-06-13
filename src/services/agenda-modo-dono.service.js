

// agenda-modo-dono.service.js
// Modo Rebeca pelo WhatsApp — comandos do dono/admin pelo número conectado
// NÃO afeta Delivery nem Corrida. NÃO cria nova instância.

const axios = require('axios');
const SM = require('./agenda-session-manager');
const ModoDecisao = require('./agenda-modo-decisao.service');
const IntentParser  = require('./agenda-intent-parser');
const ActionRouter  = require('./agenda-action-router');
const { AdminAgenda, AgendamentoAgenda, FinanceiroAgenda, BloqueioAgenda, ClienteAgenda } = require('../models/AgendaServico');
const { InstanciaWhatsapp } = require('../models');

const NLP = require('./agenda-nlp.service');
const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-794f.up.railway.app';
const EVOLUTION_GLOBAL_KEY = process.env.EVOLUTION_API_KEY || null;

// ── Personalidade Rebeca ─────────────────────────────────────────────────────
function _saudacao() {
  const h = new Date(Date.now() - 3*60*60*1000).getUTCHours();
  if (h >= 5  && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function _chefe(genero, apelido) {
  if (apelido && apelido.trim()) return apelido.trim();
  const M = ['chefe', 'patrão', 'chefão', 'parceiro'];
  const F = ['chefa', 'patroa', 'chefona', 'parceira'];
  const N = ['chefe', 'chefa', 'patrão', 'patroa'];
  const opcoes = genero === 'M' ? M : genero === 'F' ? F : N;
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

function _confirmacao(genero, apelido) {
  const opcoes = [
    'Maravilha! Já anotei aqui. ✅',
    'Feito, ' + _chefe(genero||'', apelido||null) + '! Tá registrado. 💙',
    'Prontinho! Já tá no sistema. 🎉',
    'Pode deixar, ' + _chefe(genero||'', apelido||null) + '! Já tá anotado. ✅',
    'Ótimo! Já resolvi aqui. 💪'
  ];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

function _erro(genero, apelido) {
  const opcoes = [
    'Eita, não entendi direito não. 😅',
    'Hmm, me explica melhor, ' + _chefe(genero || '', apelido || null) + '?',
    'Não consegui pegar essa, pode repetir de outro jeito?'
  ];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}


// ── Extrair categoria financeira do texto ────────────────────────────────────
function _extrairCategoria(txt, categoriaIntent) {
  if (categoriaIntent && categoriaIntent !== 'outros') return categoriaIntent;
  const t = txt.toLowerCase();
  if (/cabeleirei|barbearia|barbeiro|sal[ao]o|manicure|pedicure|estetica|depila|sobrancelha|unhas|escova/.test(t)) return 'beleza';
  if (/farmacia|remedio|medico|consulta|exame|hospital|clinica|dentista|fisio|psicologo/.test(t)) return 'saude';
  if (/combustivel|gasolina|diesel|alcool|posto|abastec/.test(t)) return 'combustivel';
  if (/mercado|supermercado|feira|hortifruti|acougue|padaria|mercearia/.test(t)) return 'mercado';
  if (/aluguel|aluel|condominio/.test(t)) return 'aluguel';
  if (/luz|energia|energisa|cemig|cpfl|coelba|enel/.test(t)) return 'energia';
  if (/agua|saneamento|sabesp|copasa/.test(t)) return 'agua';
  if (/internet|wifi|banda.larga|fibra/.test(t)) return 'internet';
  if (/telefone|celular|plano.movel|vivo|claro|tim|oib/.test(t)) return 'telefone';
  if (/salario|funcionario|folha|pagar.func/.test(t)) return 'salario';
  if (/imposto|taxa|tributo|contador|contabilidade/.test(t)) return 'impostos';
  if (/fornecedor|produto|estoque|material|insumo/.test(t)) return 'produtos';
  if (/ifood|rappi|delivery|restaurante|lanche|comida|almoco|janta/.test(t)) return 'alimentacao';
  if (/buberb|taxi|onibus|metro|passagem/.test(t)) return 'transporte';
  if (/academia|gym|cinema|teatro|show|festa|viagem|hotel/.test(t)) return 'lazer';
  if (/escola|faculdade|curso|colegio|educacao|livro/.test(t)) return 'educacao';
  if (/limpeza|higiene|sabao|detergente/.test(t)) return 'limpeza';
  if (/pix|transferencia|tedb|docb/.test(t)) return 'transferencia';
  if (/dinheiro|especie|cash/.test(t)) return 'dinheiro';
  if (/servico|manutencao|conserto|reparo|instalacao/.test(t)) return 'servicos';
  return 'outros';
}
// ── Extrair descrição do texto da mensagem ───────────────────────────────────
function _extrairDescricao(txt, tipo) {
  // Limpar frase de comando completa antes de extrair descrição
  let t = txt
    .replace(/^(rebeca[,\s]+)?/i, '')
    .replace(/^(lança|registra|anota|coloca|marca|lanca|mete|bota|adiciona)\s+(uma?\s+|a\s+)?(saída|entrada|despesa|receita|gasto|saida)\s+(de\s+)?/i, '')
    .replace(/^(registra|anota|coloca|marca|lanca)\s+/i, '')
    .replace(/^(gastei|paguei|saiu|recebi|entrou|caiu|ganhei|vendi|comprei|cobrei)\s+(de\s+)?/i, '')
    .replace(/(?:r\$\s*)?[\d]+(?:[.,][\d]+)?\s*(?:reais?|conto[s]?)?\s*/i, '')
    .replace(/^(de\s+|no\s+|na\s+|em\s+|por\s+|pra\s+|para\s+|pro\s+|com\s+|via\s+|ao\s+|aos\s+)/i, '')
    .replace(/^(uma?\s+)/i, '')
    .trim();

  // Categorias conhecidas que NÃO devem virar descrição (já viram categoria)
  const _soCategoria = /^(beleza|saude|combustivel|mercado|aluguel|energia|agua|internet|telefone|salario|impostos?|produtos?|alimentacao|transporte|lazer|educacao|limpeza|transferencia|servicos?|outros)$/i;
  // Palavras que não são descrições úteis
  const _inutil = /^(pix|dinheiro|especie|cash|via|pelo|pela|pelo|no|na|em|por|pra|para|pro)$/i;

  if (t && t.length > 1 && !_soCategoria.test(t) && !_inutil.test(t)) return t;
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
    throw e; // relança para que chamadores possam fazer fallback
  }
}

// ── Enviar boas-vindas (apenas uma vez por admin) ─────────────────────────────
async function enviarBoasVindas(adminId) {
  try {
    const admin = await AdminAgenda.findById(adminId);
    if (!admin) return;
    if (admin.modoWhatsappDono && admin.modoWhatsappDono.boasVindasEnviado) return;

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

Sempre que precisar, é só me chamar por aqui. 😊

Antes de começar — como você prefere ser chamada? 😊
_(ex: "Ju", "Dra. Ana", "pode me chamar de Mari")_`;

    const MetaWA = require('./meta-whatsapp.service');
    await MetaWA.enviarTexto(telDono, msg);

    await AdminAgenda.findByIdAndUpdate(adminId, {
      'modoWhatsappDono.ativo': true,
      'modoWhatsappDono.boasVindasEnviado': true
    });
    console.log('[ModoDono] Boas-vindas enviadas para', telDono);
  } catch(e) {
    console.error('[ModoDono] Erro boas-vindas:', e.message);
  }
}

// Data atual — MongoDB salva UTC; filtros já compensam GMT-3
function _dataAgora() { return new Date(Date.now() - 3*60*60*1000); }

// ── Variações de resposta financeira ─────────────────────────────────────────
function _respEntrada(val, cat, desc) {
  const v = val.toFixed(2).replace('.', ',');
  const d = desc && desc !== 'Entrada via WhatsApp' ? ` — ${desc}` : '';
  const opts = [
    `Anotei! 💰 Entrada de R$ ${v} em "${cat}"${d}.`,
    `Recebido! R$ ${v} em "${cat}"${d}. Tá no caixa! 💰`,
    `Boa! Entrada de R$ ${v} registrada${d ? ` (${desc})` : ''}. 💰`,
    `Feito! R$ ${v} entrou em "${cat}"${d}. 💰`,
    `Anotado! 💰 R$ ${v} de receita${d}. Tudo certo!`,
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function _respSaida(val, cat, desc) {
  const v = val.toFixed(2).replace('.', ',');
  const d = desc && desc !== 'Gasto via WhatsApp' ? ` — ${desc}` : '';
  const opts = [
    `Anotei! 📝 Saída de R$ ${v} em "${cat}"${d}.`,
    `Registrado! R$ ${v} saiu em "${cat}"${d}. 📝`,
    `Ok! Gasto de R$ ${v} em "${cat}"${d} anotado. 📝`,
    `Feito! R$ ${v} de saída em "${cat}"${d}. 📝`,
    `Anotado! 📝 R$ ${v} de despesa${d}. Beleza!`,
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

// Helpers de filtro de data — servidor UTC, Brasil UTC-3
function _inicioDia(d) {
  // Meia-noite BRT = 03:00 UTC
  const base = d ? new Date(d) : new Date();
  return new Date(Date.UTC(
    base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 3, 0, 0, 0
  ));
}
function _fimDia(d) {
  // 23:59:59 BRT = 02:59:59 UTC do dia seguinte
  const base = d ? new Date(d) : new Date();
  return new Date(Date.UTC(
    base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1, 2, 59, 59, 999
  ));
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

  // Meses por extenso
  const mesesMap = {
    'janeiro':0,'fevereiro':1,'março':2,'marco':2,'abril':3,'maio':4,'junho':5,
    'julho':6,'agosto':7,'setembro':8,'outubro':9,'novembro':10,'dezembro':11
  };

  if (/\bhoje\b/i.test(txt)) return mkData(ano, mes, dia);
  if (/(?:^|\s)amanh[aã](?:\s|$)/i.test(txt)) return mkData(ano, mes, dia + 1);

  // "3 de junho", "dia 3 de junho", "03 de junho de 2026"
  const mMesExtenso = txt.match(/(?:dia\s+)?(\d{1,2})\s+de\s+([a-záéíóúâêôãõç]+)(?:\s+de\s+(\d{4}))?/i);
  if (mMesExtenso) {
    const dNum = parseInt(mMesExtenso[1]);
    const mNome = mMesExtenso[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const mNum2 = mesesMap[mNome];
    if (mNum2 !== undefined) {
      const aNum = mMesExtenso[3] ? parseInt(mMesExtenso[3]) : (mNum2 < mes || (mNum2 === mes && dNum < dia) ? ano + 1 : ano);
      return mkData(aNum, mNum2, dNum);
    }
  }

  // "03/06" ou "03/06/2026" — formato DD/MM
  const dm = txt.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dm) {
    const aNum = dm[3] ? parseInt(dm[3].length === 2 ? '20'+dm[3] : dm[3]) : ano;
    return mkData(aNum, parseInt(dm[2])-1, parseInt(dm[1]));
  }

  // "dia 15" sem mês — usa mês atual (ou próximo se já passou)
  const diaNum = txt.match(/\bdia\s+(\d{1,2})\b/i);
  if (diaNum) {
    const d2 = parseInt(diaNum[1]);
    const mFinal = d2 < dia ? mes + 1 : mes;
    return mkData(ano, mFinal, d2);
  }

  // Dias da semana
  const diasMap = { domingo:0, segunda:1, 'segunda-feira':1, terca:2, 'terça':2, 'terça-feira':2, quarta:3, 'quarta-feira':3, quinta:4, 'quinta-feira':4, sexta:5, 'sexta-feira':5, sabado:6, 'sábado':6 };
  const quevem = /que\s*vem|próxim[oa]|proxim[oa]/i.test(txt);
  for (const [nome, alvo] of Object.entries(diasMap)) {
    if (new RegExp('\\b' + nome + '\\b', 'i').test(txt)) {
      let diff = (alvo - dow + 7) % 7;
      if (diff === 0 || quevem) diff += 7;
      return mkData(ano, mes, dia + diff);
    }
  }

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
  // 3. Formato numérico normal — remover horas antes de buscar valor
  const _txtSemHora = txt
    .replace(/\b\d{1,2}\s*(?:horas?|h\b)/gi, '')
    .replace(/[àa]s?\s*\d{1,2}[h:]\d{0,2}/gi, '')
    .replace(/\b(?:daqui|em)\s+\d+\s*(?:dias?|semanas?|meses?|anos?)/gi, '');
  const mNum = _txtSemHora.match(/R?\$\s*([\d.,]+)|([\d.,]+)\s*(?:reais?|conto|reai)\b|^\s*([\d.,]+)\b|\b(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\b/i);
  const raw = mNum ? (mNum[1]||mNum[2]||mNum[3]||mNum[4]) : null;

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
  // 1. Remover data DD/MM para não confundir com hora
  const _txtSemData = txt.replace(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g, '');
  const _txtSemDia = _txtSemData.replace(/\bdia\s+\d{1,2}\b/gi, '');
  const _temTarde = /\b(tarde|da\s*tarde)\b/i.test(txt);
  const _temNoite = /\b(noite|da\s*noite)\b/i.test(txt);
  const _ajustarHora = (h) => {
    if ((_temTarde || _temNoite) && h < 12) return h + 12;
    return h;
  };
  // "16 horas", "às 16 horas", "16h", "16:00"
  const mHoras = _txtSemDia.match(/(?:às?|as?|à)?\s*(\d{1,2})\s*horas?\b/i);
  if (mHoras) return { h: _ajustarHora(parseInt(mHoras[1])), min: 0 };
  const m = _txtSemDia.match(/(\d{1,2})h(?:(\d{2})?)?/i) || _txtSemDia.match(/(\d{1,2}):(\d{2})/);
  if (m) return { h: _ajustarHora(parseInt(m[1])), min: parseInt(m[2]||'0') };
  // 2. "às 22", "as 8", "à 15" — número após preposição
  const mNum = _txtSemDia.match(/(?:às?|as?|à)\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (mNum) return { h: _ajustarHora(parseInt(mNum[1])), min: parseInt(mNum[2]||'0') };
  // "3 da tarde", "11 da noite", "8 da manhã" — número solto + período
  const mPeriodo = txt.match(/(\d{1,2})\s+(?:da\s+)?(?:tarde|noite|manh[ãa])/i);
  if (mPeriodo) return { h: _ajustarHora(parseInt(mPeriodo[1])), min: 0 };
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
  // Registrar última mensagem do dono
  const _adminObjIdMsg = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;
  AdminAgenda.findByIdAndUpdate(_adminObjIdMsg, { ultimaMensagemDono: new Date() }).catch(()=>{});

  // ── APRENDIZADO: verificar se dono já corrigiu esta intenção antes ──────────
  try {
    const AprendizadoRebeca = require('../models/AprendizadoRebeca');
    const _adminIdAp = require('mongoose').Types.ObjectId.isValid(adminId)
      ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;
    const _aprendidos = await AprendizadoRebeca.find({
      adminId: _adminIdAp, confirmado: true
    }).sort({ vezes_visto: -1, ultimoReforco: -1 }).limit(20).lean();

    if (_aprendidos.length > 0) {
      const _msgNorm = msg.toLowerCase().trim();
      for (const ap of _aprendidos) {
        const _orig = (ap.mensagem_original || '').toLowerCase();
        // Similaridade: 60%+ das palavras batem
        const _palavrasOrig = _orig.split(/\s+/).filter(p => p.length > 3);
        const _palavrasMsg  = _msgNorm.split(/\s+/).filter(p => p.length > 3);
        if (_palavrasOrig.length === 0) continue;
        const _bate = _palavrasOrig.filter(p => _msgNorm.includes(p)).length;
        const _sim = _bate / _palavrasOrig.length;
        if (_sim >= 0.6 && ap.intencao_correta && ap.intencao_correta !== 'desconhecida' && ap.intencao_correta !== 'fora_escopo') {
          console.log('[APRENDIZADO] Redirecionando:', ap.intencao_errada, '->', ap.intencao_correta, '| sim:', _sim.toFixed(2));
          // Reforçar o aprendizado
          await AprendizadoRebeca.findByIdAndUpdate(ap._id, { $inc: { vezes_visto: 1 }, $set: { ultimoReforco: new Date() } });
          // Substituir a mensagem por uma com hint da intenção correta para o NLP/Cerebro pegar
          // Salvar na sessão para os handlers saberem
          const SM2 = require('./agenda-session-manager');
          SM2.updateSession(adminId, telefone, { intencaoForcada: ap.intencao_correta });
          console.log('[APRENDIZADO] intencaoForcada salva na sessão:', ap.intencao_correta);
          break;
        }
      }
    }
  } catch(_eAp) { /* silencioso */ }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── SESSION: registrar mensagem e recuperar estado ──
  const _session = SM.addUserMsg(adminId, telefone, msg);
  // Persistir snapshot da sessão no banco (sobrevive restart do Render)
  try {
    const _snapshotKey = String(adminId) + '_' + telefone.replace(/\D/g,'');
    await AdminAgenda.findByIdAndUpdate(adminObjId, {
      $set: { ['sessaoWhatsapp.' + _snapshotKey.slice(-20)]: {
        ultimaMensagem: msg.substring(0,200),
        ts: new Date(),
        assunto: _session.assuntoAtual || null
      }}
    }, { strict: false }).catch(()=>{});
  } catch(_eSess) { /* silencioso */ }
  const _isConfirm = SM.isConfirmacao(msg);
  const _isNeg = SM.isNegacao(msg);
  // Salvar mensagem atual para uso no detector de correção
  const _msgAnteriorSessao = _session.ultimaMensagemDono || null;
  SM.updateSession(adminId, telefone, { ultimaMensagemDono: msg });
  const _assuntoDetectado = SM.detectarAssunto(msg) || _session.assuntoAtual;
  SM.updateSession(adminId, telefone, { assuntoAtual: _assuntoDetectado });
  // ── SALVAR APELIDO SE AGUARDANDO RESPOSTA DO BOAS-VINDAS ───────────────
  const _sesApelido = SM.getSession(adminId, telefone);
  const _adminObjIdEarly = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;
  const _adminEarly = await AdminAgenda.findById(_adminObjIdEarly).lean();
  if (_adminEarly && !_adminEarly.modoWhatsappDono?.apelido && _adminEarly.modoWhatsappDono?.boasVindasEnviado) {
    const _apelidoRaw = msg.trim();
    // Detectar se é resposta de apelido (curto, sem comando claro)
    const _pareceChamado = _apelidoRaw.length <= 40 &&
      !_apelidoRaw.match(/registra|agenda|bloqueia|cancela|mostra|quanto|lembra|entrada|saída|relatório/i);
    if (_pareceChamado && !_sesApelido.apelidoRespondido) {
      // Limpar prefixos comuns: "pode me chamar de X", "me chama de X", "sou X"
      let _apelido = _apelidoRaw
        .replace(/^(pode me chamar de|me chama de|me chame de|sou a?|meu nome é|é?)\s*/i, '')
        .replace(/[.!?]$/, '')
        .trim();
      if (_apelido.length >= 2 && _apelido.length <= 30) {
        await AdminAgenda.findByIdAndUpdate(_adminObjIdEarly, {
          'modoWhatsappDono.apelido': _apelido
        });
        SM.updateSession(adminId, telefone, { apelidoRespondido: true });
        const instanciaApelido = await InstanciaWhatsapp.findOne({ adminId: _adminObjIdEarly, adminTipo: 'agenda' }).lean();
        const _respApelido = `Prazer, ${_apelido}! 😊 Pode me chamar quando precisar. Tô aqui pra te ajudar! 💙`;
        if (instanciaApelido) await _enviarMsg(instanciaApelido, telefone, _respApelido);
        SM.addAssistantMsg(adminId, telefone, _respApelido);
        return true;
      }
    }
  }

  // ── DETECTOR DE CORREÇÃO AUTOMÁTICA ──────────────────────────────────────
  // Se dono sinalizou que Rebeca errou → salvar aprendizado e perguntar o certo
  const _sinaisErro = /n[aã]o era isso|n[aã]o [eé] isso|errou|erraste|errei nisso|n[aã]o foi isso|entendeu errado|errada|n[aã]o [eé] o que pedi|n[aã]o era o que pedi|entendeu tudo errado|fez errado|n[aã]o era pra|n[aã]o [eé] isso n[aã]o|errou tudo|errou de novo|errou outra vez|n[aã]o foi bem isso|foi diferente|n[aã]o [eé] bem isso|interpretou errado|confundiu|n[aã]o entendeu|entendeu diferente|outra coisa|queria outra coisa|n[aã]o queria isso|n[aã]o pedi isso|pedi outra coisa/i;
  const _sesAtualCorr = SM.getSession(adminId, telefone);
  if (_sinaisErro.test(msgL) && _sesAtualCorr.ultimaIntencaoCerebro && _sesAtualCorr.ultimaMensagemDono) {
    try {
      const AprendizadoRebeca = require('../models/AprendizadoRebeca');
      const _adminObjIdCorr = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;
      // Verificar se já existe registro igual para não duplicar
      const _jaExiste = await AprendizadoRebeca.findOne({
        adminId: _adminObjIdCorr,
        mensagem_original: _sesAtualCorr.ultimaMensagemDono,
        intencao_errada: _sesAtualCorr.ultimaIntencaoCerebro
      }).lean();
      if (!_jaExiste) {
        await AprendizadoRebeca.create({
          adminId: _adminObjIdCorr,
          mensagem_original: _sesAtualCorr.ultimaMensagemDono,
          intencao_errada: _sesAtualCorr.ultimaIntencaoCerebro,
          intencao_correta: 'desconhecida',
          descricao_erro: `Entendi como ${_sesAtualCorr.ultimaIntencaoCerebro} mas estava errado`,
          confirmado: false,
          vezes_visto: 1
        });
        console.log('[APRENDIZADO] Erro detectado e salvo:', _sesAtualCorr.ultimaIntencaoCerebro);
      } else {
        // Reforço: incrementar vezes_visto para dar mais peso ao aprendizado
        await AprendizadoRebeca.findByIdAndUpdate(_jaExiste._id, {
          $inc: { vezes_visto: 1 },
          $set: { ultimoReforco: new Date() }
        });
        console.log('[APRENDIZADO] Reforco:', _sesAtualCorr.ultimaIntencaoCerebro, 'vezes_visto:', (_jaExiste.vezes_visto||1)+1);
      }
      // Marcar sessão aguardando explicação do que era certo
      SM.updateSession(adminId, telefone, { aguardandoCorrecao: true, intencaoErrada: _sesAtualCorr.ultimaIntencaoCerebro });
    } catch(_eCorr) { console.log('[APRENDIZADO] Erro ao salvar:', _eCorr.message); }

    const adminObjId = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;
    const admin2 = await AdminAgenda.findById(adminObjId).lean();
    const _chefe2 = admin2?.modoWhatsappDono?.genero === 'F' ? 'patroa' : 'chefe';
    const _resp = `Poxa, me desculpa, ${_chefe2}! 😅 O que eu deveria ter feito?`;
    const instancia2 = await InstanciaWhatsapp.findOne({ adminId: adminObjId, adminTipo: 'agenda' }).lean();
    if (instancia2) await _enviarMsg(instancia2, telefone, _resp);
    SM.addAssistantMsg(adminId, telefone, _resp);
    return true;
  }

  // ── SE AGUARDANDO CORREÇÃO — dono está explicando o que era certo ──
  const _sesCorr2 = SM.getSession(adminId, telefone);
  if (_sesCorr2.aguardandoCorrecao && msg.length > 3) {
    try {
      const AprendizadoRebeca = require('../models/AprendizadoRebeca');
      const _adminObjIdCorr2 = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;
      // Mapear texto livre do dono para código de intenção mais próximo
      const _mapaIntencoes = {
        'registrar saida':'registrar_despesa','saida':'registrar_despesa','despesa':'registrar_despesa','gastei':'registrar_despesa','paguei':'registrar_despesa',
        'registrar entrada':'registrar_receita','entrada':'registrar_receita','receita':'registrar_receita','recebi':'registrar_receita','cobrei':'registrar_receita',
        'lembrete':'criar_lembrete','criar lembrete':'criar_lembrete','me lembra':'criar_lembrete',
        'agenda':'agenda_hoje','agendamento':'encaixar_cliente','encaixar':'encaixar_cliente',
        'cancelar':'cancelar_agendamento','cancelamento':'cancelar_agendamento',
        'confirmar':'confirmar_agendamento','relatorio':'relatorio_financeiro','resumo':'relatorio_financeiro',
        'bloquear':'bloquear_horario','liberar':'liberar_horario'
      };
      const _msgLow = msg.toLowerCase();
      let _intencaoMapeada = 'fora_escopo';
      for (const [chave, intencao] of Object.entries(_mapaIntencoes)) {
        if (_msgLow.includes(chave)) { _intencaoMapeada = intencao; break; }
      }
      // Se texto livre parece código de intenção direto, usa ele
      if (msg.includes('_') && msg.length < 40) _intencaoMapeada = msg.trim();
      await AprendizadoRebeca.findOneAndUpdate(
        { adminId: _adminObjIdCorr2, intencao_errada: _sesCorr2.intencaoErrada, confirmado: false },
        { intencao_correta: _intencaoMapeada, mensagem_original: _sesAtualCorr?.ultimaMensagemDono || msg, confirmado: true, ultimoReforco: new Date() },
        { sort: { criadoEm: -1 } }
      );
      console.log('[APRENDIZADO] Correcao confirmada:', _sesCorr2.intencaoErrada, '->', _intencaoMapeada);
    } catch(_eCorr2) { console.log('[APRENDIZADO] Erro confirmar:', _eCorr2.message); }
    // Limpar fora do try — garante que estado é limpo mesmo se DB falhar
    SM.updateSession(adminId, telefone, { aguardandoCorrecao: false, intencaoErrada: null });

    const adminObjId = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;
    const admin3 = await AdminAgenda.findById(adminObjId).lean();
    const _chefe3 = admin3?.modoWhatsappDono?.genero === 'F' ? 'patroa' : 'chefe';
    const instancia3 = await InstanciaWhatsapp.findOne({ adminId: adminObjId, adminTipo: 'agenda' }).lean();
    const _resp2 = `Anotei, ${_chefe3}! 📝 Vou lembrar disso da próxima vez! 💙`;
    if (instancia3) await _enviarMsg(instancia3, telefone, _resp2);
    SM.addAssistantMsg(adminId, telefone, _resp2);
    return true;
  }

  const adminObjId = require('mongoose').Types.ObjectId.isValid(adminId) ? new (require('mongoose').Types.ObjectId)(adminId) : adminId;

  const admin = await AdminAgenda.findById(adminObjId).lean();
  if (!admin) return null;
  const _apelidoAdmin = admin?.modoWhatsappDono?.apelido || null;
  const _generoAdmin  = admin?.modoWhatsappDono?.genero || '';

  const instancia = await InstanciaWhatsapp.findOne({ adminId: adminObjId, adminTipo: 'agenda' }).lean();
  // Se não tem instância Evolution mas tem Meta API, criar instância virtual para não deixar dono sem resposta
  const _instMeta = (!instancia && process.env.META_WA_TOKEN)
    ? { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' }
    : null;
  if (!instancia && !instanciaResposta && !_instMeta) {
    console.warn('[ModoDono] sem canal de envio para', adminId, '— retornando null');
    return null;
  }
  const _instFinal = instancia || _instMeta;

  // ── APRENDIZADO: verificar intencao forçada da sessão e redirecionar ─────
  const _sesForc = SM.getSession(adminId, telefone);
  const _intForc = _sesForc.intencaoForcada;
  if (_intForc) {
    SM.updateSession(adminId, telefone, { intencaoForcada: null }); // limpar após uso
    console.log('[APRENDIZADO] Aplicando intencao forcada:', _intForc);
    // Mapear intenção forçada para mensagem sintética que os handlers reconhecem
    const _msgForcada = {
      'registrar_despesa':     'gastei',
      'registrar_receita':     'recebi',
      'criar_lembrete':        'me lembra de',
      'listar_lembretes':      'quais meus lembretes',
      'agenda_hoje':           'minha agenda hoje',
      'agenda_amanha':         'minha agenda amanhã',
      'encaixar_cliente':      'encaixa',
      'cancelar_agendamento':  'cancela agendamento',
      'confirmar_agendamento': 'confirma agendamento',
      'bloquear_horario':      'bloqueia horário',
      'relatorio_financeiro':  'relatório financeiro',
      'financeiro_hoje':       'quanto fiz hoje',
      'proximo_cliente':       'próximo cliente',
      'clientes_inativos':     'clientes inativos',
    }[_intForc];
    if (_msgForcada) {
      // Re-processar com mensagem sintética + mensagem original concatenada
      const _msgRedir = _msgForcada + ' ' + msg;
      console.log('[APRENDIZADO] Redirecionando como:', _msgRedir);
      return await processarComandoDono(telefone, _msgRedir, adminId, instanciaResposta);
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  async function responder(texto) {
    const _inst = instanciaResposta || instancia || _instFinal;
    const _num  = instanciaResposta?.numero || telefone;
    await _enviarMsg(_inst, _num, texto);
  }

  // ── AGENDA DE HOJE ─────────────────────────────────────────────────────────
  if (!/(cria|criar|me\s*lembra|lembrete|registra|anota|coloca|marca\s+na)/i.test(msgL) && /\bagenda\s*(de\s*)?(hoje|amanhã|amanha)\b|\bmostra\s*(minha\s*)?agenda|\bquem\s*(tenho|tem)\s*(hoje|amanhã|amanha)\b|\bhor[aá]rios?\s*(de\s*)?(hoje|amanhã|amanha)\b|\btem\s*algu[eé]m\s*(hoje|amanhã|amanha)\b|\bcomo\s*t[áa]\s*(hoje|amanhã|amanha)\b|\bvou\s*atender\s*quem\b|\bquem\s*[eé]\s*(hoje|amanhã)\b|\bminha\s*agenda\s*(de\s*)?(hoje|amanhã|amanha)\b|\bquantos\s*(clientes\s*)?(tenho|tem)\s*(hoje|amanhã)\b|\bcomo\s*(est[aá]|t[aá]|fica|ficou)\s*(a\s*)?(minha\s*)?(agenda|dia)\b|\btem\s*(algum|alguem|alguém|cliente|horario|horário)\s*(hoje|amanhã|amanha|amanha)\b|\b(ver|veja|checar|conferir|olhar)\s*(minha\s*)?(agenda|horario|horários)\b/i.test(msgL)) {
    const dia = /amanhã|amanha/i.test(msgL) ? (() => { const d = new Date(); d.setDate(d.getDate()+1); return d; })() : new Date();
    const ini = _inicioDia(dia);
    const fim = _fimDia(dia);
    const ags = await AgendamentoAgenda.find({
      adminId: adminObjId,
      dataHora: { $gte: ini, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();

    if (!ags.length) {
      // Fix 9: agenda hoje vazia + noite >= 18h BRT → mostrar amanhã automaticamente
      const _hrBrt = (new Date().getUTCHours() - 3 + 24) % 24;
      const _pedindoHoje = !/amanhã|amanha/i.test(msgL);
      if (_pedindoHoje && _hrBrt >= 18) {
        const _amanha = new Date(); _amanha.setDate(_amanha.getDate() + 1);
        const _iniA = _inicioDia(_amanha); const _fimA = _fimDia(_amanha);
        const _agsA = await AgendamentoAgenda.find({
          adminId: adminObjId, dataHora: { $gte: _iniA, $lte: _fimA },
          status: { $in: ['pendente','confirmado'] }
        }).sort({ dataHora: 1 }).lean();
        if (_agsA.length) {
          const _listaA = _agsA.map(a => `• ${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente} (${a.nomeServico})`).join('\n');
          await responder(`Hoje tá livre, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🎉\n\nMas amanhã tá assim:\n\n${_listaA}\n\n${_agsA.length} agendamento(s). Bora descansar! 💙`);
          return true;
        }
      }
      await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}!😊\n\nNão tem nenhum agendamento ${_pedindoHoje ? 'pra hoje' : 'para amanhã'} não. Tá livre! 🎉`);
      return true;
    }
    const lista = ags.map(a =>
      `• ${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente} (${a.nomeServico})`
    ).join('\n');
    await responder(`${_saudacao()}! Olha a agenda ${/amanhã|amanha/i.test(msgL)?'de amanhã':'de hoje'} pra você, ${_chefe(_generoAdmin, _apelidoAdmin)}! 📅\n\n${lista}\n\n${ags.length} agendamento(s) no total. Bora lá! 💪`);
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
          dataHoraInicio: ini, dataHoraFim: fim,
          motivo: 'Bloqueio via WhatsApp'
        });
        await responder(`🔒 ${_confirmacao()}\n\nBloqueio feito em ${_fmtData(dia)}, das ${_fmtHora(ini)} às ${_fmtHora(fim)}. Ninguém agenda nesse horário não! 😉`);
        return true;
      }
    }
    await responder(`${_erro(_generoAdmin, _apelidoAdmin)} Tente assim: *Rebeca, bloqueia amanhã das 12h às 14h* 😊`);
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
        await responder(`Anotei aqui, ${_chefe(_generoAdmin, _apelidoAdmin)}! ✅\n\nHoje você trabalha das *${abertura}* às *${fechamento}*. Pode vir cliente! 🚀`);
        return true;
      }
    }
    await responder(`${_erro(_generoAdmin, _apelidoAdmin)} Me fala assim: *Rebeca, hoje vou trabalhar das 8h às 18h* 😊`);
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
      await responder(`Não encontrei nenhum lançamento pra apagar, ${_chefe(_generoAdmin, _apelidoAdmin)}. 🤔`);
      return true;
    }
    const tipoLabel = ultimo.tipo === 'receita' ? '💰 Entrada' : '📝 Saída';
    const _valorFmt = ultimo.valor.toFixed(2).replace('.',',');
    const _catLabel = ultimo.categoria || 'outros';
    const _descLabel = ultimo.descricao && ultimo.descricao !== 'Entrada via WhatsApp' && ultimo.descricao !== 'Gasto via WhatsApp' ? ultimo.descricao : '—';
    const _dtLabel = new Date(ultimo.createdAt || Date.now());
    const _dtStr = `${_dtLabel.getDate().toString().padStart(2,'0')}/${(_dtLabel.getMonth()+1).toString().padStart(2,'0')} às ${_dtLabel.getHours().toString().padStart(2,'0')}h${_dtLabel.getMinutes().toString().padStart(2,'0')}`;
    SM.updateSession(adminId, telefone, { aguardandoConfirmacaoApagar: true, ultimoLancamentoId: String(ultimo._id) });
    await responder(`Encontrei aqui, ${_chefe(_generoAdmin, _apelidoAdmin)}:\n\n${tipoLabel}: *R$ ${_valorFmt}*\nCategoria: ${_catLabel}\nDescrição: ${_descLabel}\nRegistrado: ${_dtStr}\n\nConfirma apagar? Responde *sim* ou *não* 🗑️`);
    return true;
  }
  // ── REGISTRAR ENTRADA FINANCEIRA ───────────────────────────────────────────
  if (/\bregistra\b.*\bentrada\b|\bmarca\b.*\bentrada\b|\banota\b.*\bentrada\b|\bcoloca\b.*\bentrada\b|\breceb[ei]\b|\bentrada\b|\bganhei\b|\bcaiu\b|\bentr[ou]\b|\breceit[ao]\b|\bpix\b|\btransfer[eê]ncia\b|\bdinheiro\b.*\bentrou\b|\bvendi\b|\brecebi\b|\bbateu\b|\bveio\b.*\bdinheiro\b|\bdinheiro\b.*\bveio\b|\bfechei\b.*\bvenda\b|\bvenda\b.*\bfechada\b|\bno\s+pix\b|\bpelo\s+pix\b|\bvia\s+pix\b|\bno\s+dinheiro\b/i.test(msgL) && !/\bquanto\b/i.test(msgL) &&
      !/\bpaguei\b|\bgastei\b|\bsaida\b|\bsa[ií]da\b|\bdespesa\b|\bcombust[ií]vel\b|\bgasolina\b|\binternet\b|\bluz\b|\bagua\b|\buber\b/i.test(msgL) &&
      !/apag[ae]u?|exclu[ii]|delet|remov|cancela|desfaz|tira|zera|limpa|[uú]ltim|errei|errou/i.test(msgL)) {
    const _msgLimpa = msg.replace(/[?!]+$/, '').trim();
    // ── Parse de valor: suporta "4 mil", "4k", "4.000,00", "4,000,00" ──
    const val = _parsarValor(_msgLimpa);
    const descEntrada = _extrairDescricao(msg, 'receita');
    const catEntrada  = _extrairCategoria(msg, _extrairCategoria(descEntrada));
    if (val) {
      const _docEntrada = await FinanceiroAgenda.create({
        adminId: adminObjId,
        tipo: 'receita',
        valor: val,
        descricao: descEntrada,
        categoria: catEntrada,
        data: _dataAgora(),
        origem: 'whatsapp_dono'
      });
      SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docEntrada._id), ultimoLancamentoTipo: 'receita', ultimoLancamentoValor: val, ultimoLancamentoDesc: descEntrada, ultimoLancamentoCat: catEntrada });
      await responder(_respEntrada(val, catEntrada, descEntrada));
      return true;
    }
    await responder(`${_erro(_generoAdmin, _apelidoAdmin)} Me fala assim: *Rebeca, registra uma entrada de R$120 no Pix* 💰`);
    return true;
  }

  // ── CAMADA NLP SEMÂNTICA — entende intenção mesmo com erros/áudio distorcido ──
  {
    const nlp = NLP.parsear(msg);

    // Lembrete implícito: "amanha dentista 10", "segunda 14h joao", "amanha 10h"
    if (nlp.intencao === 'lembrete') {
      const _hora = _parseHora(msg) || _parseHora(nlp.normalizado);
      const _dia  = _parseDia(msg)  || _parseDia(nlp.normalizado);
      // Extrair só o assunto — limpar lixo de áudio e gatilhos
      const _limparTextoLembrete = (texto) => {
        return texto
          // Remover gatilhos de comando
          .replace(/\b(rebeca)[,.]?\s*/gi, '')
          .replace(/\b(me lembr[aei]|me avisa|anota aqui|anota|lembrete|cria?\s*lembrete|nao me deixa esquecer|lembrar)[,.]?\s*/gi, '')
          // Remover dias da semana e datas
          .replace(/\b(amanha|amanhã|hoje|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)(-feira)?\b/gi, '')
          .replace(/\bdia\s+\d{1,2}(\/\d{1,2})?\b/gi, '')
          // Remover horários
          .replace(/\b(as|às|pras?|para)\s+\d{1,2}(:\d{2})?(h|hs|horas?)?\b/gi, '')
          .replace(/\b\d{1,2}(:\d{2})?(h|hs|horas?)\b/gi, '')
          // Remover valores monetários — causa do "r r aluguel R$ 10"
          .replace(/R\$\s*[\d.,]+/gi, '')
          .replace(/—\s*R\$\s*[\d.,]+/gi, '')
          .replace(/\b[\d.,]+\s*(reais?|R\$)/gi, '')
          // Remover "r" solto (resto de "r$" após limpeza parcial)
          .replace(/\b(r|rs)\s+(r|rs)\b/gi, '')
          .replace(/\b(r|rs)\s*\$/gi, '')
          // Remover artigos soltos
          .replace(/(?<=\s|^)(de|do|da|pra|para|que)(?=\s|$)/gi, ' ')
          // Remover separadores soltos
          .replace(/\s*—\s*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, '')
          .trim();
      };
      const _txtBruto = nlp.textoLembrete || '';
      const _txtLimpo = _limparTextoLembrete(_txtBruto.length > 2 ? _txtBruto : msg);
      const _txt = _txtLimpo.length > 2 ? _txtLimpo : 'Compromisso';

      if (_hora && _dia) {
        const dataEvento = new Date(_dia);
        // Servidor UTC: hora do usuário (BRT=UTC-3) → armazenar em UTC (+3h)
        dataEvento.setUTCHours(_hora.h + 3, _hora.min, 0, 0);
        const dataAviso  = new Date(dataEvento.getTime() - 30 * 60000);
        const _diasAteSimp = Math.ceil((dataEvento - new Date()) / (1000 * 60 * 60 * 24));
        const _lembretesSimp = [{ texto: _txt, dataEvento, dataAviso, enviado: false, criadoEm: new Date() }];
        if (_diasAteSimp > 5) {
          const _avisoD1 = new Date(dataEvento);
          _avisoD1.setDate(_avisoD1.getDate() - 1);
          _avisoD1.setUTCHours(9, 0, 0, 0);
          _lembretesSimp.push({ texto: '⚠️ Amanhã vence: ' + _txt, dataEvento, dataAviso: _avisoD1, tipoAviso: 'D-1', enviado: false, criadoEm: new Date() });
        }
        await AdminAgenda.findByIdAndUpdate(adminObjId, {
          $push: { 'config.lembretes': { $each: _lembretesSimp } }
        });
        const _diaStr = dataEvento.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
        // Resposta amigável e contextual
        const _ehHoje = new Date().toDateString() === dataEvento.toDateString();
        const _ehAmanha = new Date(Date.now()+86400000).toDateString() === dataEvento.toDateString();
        const _diaLabel = _ehHoje ? 'hoje' : _ehAmanha ? 'amanhã' : _diaStr;
        const _reacoes = ['Anotei!', 'Feito!', 'Tá na agenda!', 'Deixa comigo!', 'Anotado!'];
        const _reacao = _reacoes[Math.floor(Math.random()*_reacoes.length)];
        await responder(`${_reacao} 🔔 *${_txt}* — ${_diaLabel} às ${_fmtHora(dataEvento)}\n\nTe aviso 30 minutos antes, ${_chefe(_generoAdmin, _apelidoAdmin)}! 💙`);
        return true;
      }
      if (_dia && !_hora) {
        await AdminAgenda.findByIdAndUpdate(adminObjId, {
          $push: { 'config.lembretes': { texto: _txt, dataEvento: null, dataAviso: null, enviado: false, criadoEm: new Date() } }
        });
        const _reacoes2 = ['Anotei!', 'Feito!', 'Tá na agenda!', 'Deixa comigo!'];
        const _reacao2 = _reacoes2[Math.floor(Math.random()*_reacoes2.length)];
        await responder(`${_reacao2} 📝 *${_txt}* anotado, ${_chefe(_generoAdmin, _apelidoAdmin)}!\n\nQue horas você quer ser avisado? ⏰`);
        return true;
      }
    }
    // ── RESPOSTA DE QUANTAS VEZES REPETIR (aguardandoRecorrente) ─────────────
    const _sesRecorr = SM.getSession(adminId, telefone);
    if (_sesRecorr.aguardandoRecorrente) {
      const _pendRec = _sesRecorr.aguardandoRecorrente;
      const _semPrazo = /sem prazo|indeterminado|sempre|indefinido|para sempre|por tempo|nao tem prazo|não tem prazo|eterno|infinito/i.test(msg);
      // _nMatch: captura quantidade de vezes, excluindo horas/valores
      const _nMatch = msg.match(/(\d+)\s*(?:vez(?:es)?|semana(?:s)?|mes(?:es)?|m[eê]s|repeti[cç])/i) || (!/(?:\d+\s*(?:hora[s]?|h\b|min(?:uto)?s?|reais?|R\$|\$))/i.test(msg) ? msg.match(/(\d+)/) : null);
      const _tipoRec2 = _pendRec.rec.tipo;
      const _nVezesResp = _semPrazo
        ? (_tipoRec2 === 'semanal' ? 52 : _tipoRec2 === 'diario' ? 365 : _tipoRec2 === 'quinzenal' ? 26 : _tipoRec2 === 'anual' ? 5 : 12)
        : (_nMatch ? parseInt(_nMatch[1]) : _tipoRec2 === 'diario' ? 30 : _tipoRec2 === 'quinzenal' ? 26 : 4);

      SM.updateSession(adminId, telefone, { aguardandoRecorrente: null });
      // Redirecionar para o handler acima com nlp simulado
      const _recSim = _pendRec.rec;
      console.log('[DEBUG-SEM-PRAZO] _recSim:', JSON.stringify(_recSim), '_nVezesResp:', _nVezesResp);
      console.log('[RECORRENCIA-DETECTADA] tipo:', _recSim.tipo, '| dia:', _recSim.dia, '| diaSemana:', _recSim.diaSemana, '| nVezes:', _nVezesResp);
      const _diasSemana2 = { domingo:0, segunda:1,'segunda-feira':1, terca:2,'terça':2,'terça-feira':2, quarta:3,'quarta-feira':3, quinta:4,'quinta-feira':4, sexta:5,'sexta-feira':5, sabado:6,'sábado':6 };
      const _lembretes2 = [];
      const _hoje2 = new Date();
      // Hora informada pelo dono na mensagem original (salva na sessão)
      const _horaRec2 = _pendRec.hora || null;
      const _hUTC2 = _horaRec2 ? _horaRec2.h + 3 : 12; // BRT+3=UTC; fallback 9h BRT = 12h UTC
      const _mUTC2 = _horaRec2 ? _horaRec2.min : 0;
      for (let i = 0; i < _nVezesResp; i++) {
        let _dataEvento2 = null;
        if (_recSim.tipo === 'semanal' && _recSim.diaSemana) {
          const _diaSem2 = _diasSemana2[_recSim.diaSemana.toLowerCase()] ?? 5;
          const _d2 = new Date(_hoje2);
          const _diff2 = (_diaSem2 - _d2.getDay() + 7) % 7 || 7;
          _d2.setDate(_d2.getDate() + _diff2 + (i * 7));
          _dataEvento2 = new Date(Date.UTC(_d2.getUTCFullYear(), _d2.getUTCMonth(), _d2.getUTCDate(), _hUTC2, _mUTC2, 0));
        } else if (_recSim.tipo === 'mensal') {
          const _dia2 = _recSim.dia || 1;
          const _d2 = new Date(_hoje2.getFullYear(), _hoje2.getMonth() + i + (_hoje2.getDate() >= _dia2 ? 1 : 0), _dia2, 9, 0, 0);
          _dataEvento2 = new Date(Date.UTC(_d2.getUTCFullYear(), _d2.getUTCMonth(), _d2.getUTCDate(), _hUTC2, _mUTC2, 0));
        } else if (_recSim.tipo === 'diario') {
          const _d2 = new Date(_hoje2);
          _d2.setDate(_d2.getDate() + i + 1);
          _dataEvento2 = new Date(Date.UTC(_d2.getUTCFullYear(), _d2.getUTCMonth(), _d2.getUTCDate(), _hUTC2, _mUTC2, 0));
        }
        if (_dataEvento2) {
          const _textoLem2 = _pendRec.texto + (_pendRec.valor ? ' — R$ ' + _pendRec.valor : '');
          const _diasAte2 = Math.ceil((_dataEvento2 - _hoje2) / (1000 * 60 * 60 * 24));
          console.log('[SALVANDO-LEMBRETE] rec i=' + i, 'dataEvento:', _dataEvento2.toISOString(), 'texto:', _textoLem2);
          _lembretes2.push({
            texto: _textoLem2,
            dataEvento: _dataEvento2,
            dataAviso: new Date(_dataEvento2.getTime() - 30 * 60000),
            enviado: false, criadoEm: new Date(),
            recorrente: _recSim, categoria: _pendRec.categoria
          });
          // Aviso D-1 para lembretes com mais de 5 dias à frente
          if (_diasAte2 > 5) {
            const _dataAvisoD1 = new Date(_dataEvento2);
            _dataAvisoD1.setDate(_dataAvisoD1.getDate() - 1);
            _dataAvisoD1.setUTCHours(9, 0, 0, 0);
            _lembretes2.push({
              texto: '⚠️ Amanhã vence: ' + _textoLem2,
              dataEvento: _dataEvento2,
              dataAviso: _dataAvisoD1,
              enviado: false, criadoEm: new Date(),
              recorrente: _recSim, categoria: _pendRec.categoria,
              tipoAviso: 'D-1'
            });
          }
        }
      }
      if (_lembretes2.length) {
        await AdminAgenda.findByIdAndUpdate(adminObjId, { $push: { 'config.lembretes': { $each: _lembretes2 } } });
      } else {
        const _rErro = '⚠️ Não consegui gerar os lembretes. Tipo de recorrência não reconhecido. Tente: "todo dia 10", "toda sexta", "todo dia".';
        await responder(_rErro); SM.addAssistantMsg(adminId, telefone, _rErro); return true;
      }
      let _descRec3;
      if (_recSim.tipo === 'semanal') _descRec3 = `toda ${_recSim.diaSemana || 'semana'}`;
      else if (_recSim.tipo === 'diario') _descRec3 = 'todo dia';
      else if (_recSim.tipo === 'mensal' && _recSim.dia) _descRec3 = `todo dia ${_recSim.dia} do mês`;
      else if (_recSim.tipo === 'mensal') _descRec3 = 'todo mês';
      else if (_recSim.tipo === 'quinzenal') _descRec3 = 'a cada 15 dias';
      else if (_recSim.tipo === 'anual') _descRec3 = 'todo ano';
      else _descRec3 = 'recorrente';
      const _rResp = `Perfeito! 🔔 Criei *${_lembretes2.length} lembretes* de *${_pendRec.texto}*${_pendRec.valor ? ' (R$ '+_pendRec.valor+')' : ''} ${_descRec3}. Te aviso 30 min antes de cada um! 💙`;
      await responder(_rResp);
      SM.addAssistantMsg(adminId, telefone, _rResp);
      return true;
    }


    const _nlpVal = nlp.valor;
    const _nlpInt = nlp.intencao;
    const _nlpCat = nlp.categoria || 'outros';

    // ── INTERCEPTAR: "meus lembretes recorrentes" → listar, não criar ──────────
    if (/meus\s+lembretes?\s+recorrentes?|lembretes?\s+recorrentes?|ver\s+recorrentes?|lista.*recorrentes?/i.test(msgL) &&
        !/me\s+lembra|anota|cria\s+lembrete|todo\s+dia|toda\s+semana|todo\s+m[eê]s/i.test(msgL)) {
      nlp.intencao = 'listar_lembretes';
    }

    // ── RECORRENTE: "toda sexta pagar raphaela 499", "todo dia 10 aluguel" ────
    if (nlp.intencao === 'recorrente' && nlp.recorrente) {
      const _rec = nlp.recorrente;
      const _catRec = nlp.categoria !== 'outros' ? nlp.categoria : null;
      const _textoRec = nlp.textoLembrete || msg.trim();
      const _valorRec = nlp.valor || null;

      // Verificar se o dono disse quantas vezes repetir
      const _vezesMatch = msg.match(/(\d+)\s*(?:vez(?:es)?|semanas?|m[eê]s(?:es)?|repeti[cç](?:ões|oes)?|dias?)/i);
      const _nVezes = _vezesMatch ? parseInt(_vezesMatch[1]) : null;

      // Se não disse quantas vezes → perguntar
      if (!_nVezes) {
        SM.updateSession(adminId, telefone, {
          aguardandoRecorrente: { rec: _rec, texto: _textoRec, valor: _valorRec, categoria: _catRec, hora: _parseHora(msg) }
        });
        console.log('[DEBUG-SESSAO-REC] salvo:', JSON.stringify({ rec: _rec, texto: _textoRec }));
        let _descRec = '';
        if (_rec.tipo === 'semanal') _descRec = `toda ${_rec.diaSemana || 'semana'}`;
        else if (_rec.tipo === 'mensal' && _rec.dia) _descRec = `todo dia ${_rec.dia}`;
        else if (_rec.tipo === 'diario') _descRec = 'todo dia';
        else if (_rec.tipo === 'anual') _descRec = 'todo ano';
        else _descRec = 'recorrente';
        const _pergRec = `Entendido! 🔔 Vou criar lembrete de *${_textoRec}* ${_descRec}${_valorRec ? ' (R$ '+_valorRec+')' : ''}.

Quantas vezes vai repetir? (ex: "6 vezes", "3 meses", "sem prazo")`;
        await responder(_pergRec);
        SM.addAssistantMsg(adminId, telefone, _pergRec);
        return true;
      }

      // Gerar as datas futuras reais
      const _lembretes = [];
      const _hoje = new Date();
      // Hora informada pelo dono na mensagem
      const _horaRec1 = _parseHora(msg);
      const _hUTC1 = _horaRec1 ? _horaRec1.h + 3 : 12; // BRT+3=UTC; fallback 9h BRT
      const _mUTC1 = _horaRec1 ? _horaRec1.min : 0;
      const _diasSemana = { domingo:0, segunda:1,'segunda-feira':1, terca:2,'terça':2,'terça-feira':2, quarta:3,'quarta-feira':3, quinta:4,'quinta-feira':4, sexta:5,'sexta-feira':5, sabado:6,'sábado':6 };
      const _maxOcorrencias = _nVezes || (_rec.tipo === 'diario' ? 365 : _rec.tipo === 'semanal' ? 52 : _rec.tipo === 'quinzenal' ? 26 : _rec.tipo === 'anual' ? 5 : 12);

      for (let i = 0; i < _maxOcorrencias; i++) {
        let _dataEvento = null;
        if (_rec.tipo === 'semanal' && _rec.diaSemana) {
          const _diaSem = _diasSemana[_rec.diaSemana.toLowerCase()] ?? 5;
          const _d = new Date(_hoje);
          const _diff = (_diaSem - _d.getDay() + 7) % 7 || 7;
          _d.setDate(_d.getDate() + _diff + (i * 7));
          _dataEvento = new Date(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate(), _hUTC1, _mUTC1, 0));
        } else if (_rec.tipo === 'mensal') {
          const _dia = _rec.dia || 1;
          const _d = new Date(_hoje.getFullYear(), _hoje.getMonth() + i + (_hoje.getDate() >= _dia ? 1 : 0), _dia, 9, 0, 0);
          _dataEvento = new Date(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate(), _hUTC1, _mUTC1, 0));
        } else if (_rec.tipo === 'diario') {
          const _d = new Date(_hoje);
          _d.setDate(_d.getDate() + i + 1);
          _dataEvento = new Date(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate(), _hUTC1, _mUTC1, 0));
        }
        if (_dataEvento) {
          const _dataAviso = new Date(_dataEvento.getTime() - 30 * 60000);
          _lembretes.push({
            texto: _textoRec + (_valorRec ? ' — R$ ' + _valorRec : ''),
            dataEvento: _dataEvento,
            dataAviso: _dataAviso,
            enviado: false,
            criadoEm: new Date(),
            recorrente: _rec,
            categoria: _catRec
          });
        }
      }

      if (_lembretes.length) {
        await AdminAgenda.findByIdAndUpdate(adminObjId, { $push: { 'config.lembretes': { $each: _lembretes } } });
      }

      let _descRec2 = '';
      if (_rec.tipo === 'semanal') _descRec2 = `toda ${_rec.diaSemana || 'semana'}`;
      else if (_rec.tipo === 'mensal' && _rec.dia) _descRec2 = `todo dia ${_rec.dia} do mês`;
      else if (_rec.tipo === 'mensal') _descRec2 = 'todo mês';
      else if (_rec.tipo === 'diario') _descRec2 = 'todo dia';
      else if (_rec.tipo === 'quinzenal') _descRec2 = 'a cada 15 dias';
      else if (_rec.tipo === 'anual') _descRec2 = 'todo ano';
      const _respRec = `Feito! 🔔 Criei *${_lembretes.length} lembretes* de *${_textoRec}*${_valorRec ? ' (R$ '+_valorRec+')' : ''} ${_descRec2}.

Te aviso 30 minutos antes de cada um! 💙`;
      await responder(_respRec);
      SM.addAssistantMsg(adminId, telefone, _respRec);
      return true;
    }


    // Anti-conflito: servico de beleza + valor sem verbo financeiro = ambiguo (ex: "cabelo 50")
    const _SVCS = ['cabelo','corte','escova','tintura','manicure','pedicure','sobrancelha','depilacao','progressiva','botox','hidratacao','massagem','maquiagem','cilios','barba','barbearia','penteado'];
    const _temSvcBeleza = _SVCS.some(s => nlp.normalizado.includes(s));
    const _temVerbFin = /gastei|paguei|saiu|debitou|saida|recebi|entrou/.test(nlp.normalizado);
    const _temHoraNlp = /\d{1,2}\s*h\b|\d{1,2}:\d{2}/.test(nlp.normalizado);
    const _nomeM2 = msg.match(/\b[A-Z][a-z]{2,}/);
    const _skip = ['Rebeca','Segunda','Terca','Quarta','Quinta','Sexta','Sabado','Domingo','Hoje','Amanha','Ontem'];
    const _temNome2 = _nomeM2 && !_skip.includes(_nomeM2[0]);
    if (_nlpVal && _temSvcBeleza && !_temVerbFin && !_temHoraNlp) {
      const _resp = _temNome2
        ? _chefe(_generoAdmin, _apelidoAdmin) + ', e pra agendar ' + _nomeM2[0] + ' ou registrar um gasto de R$ ' + _nlpVal.toFixed(2) + '? Me fala "agenda" ou "gasto" 😊'
        : _chefe(_generoAdmin, _apelidoAdmin) + ', voce quis registrar um gasto de R$ ' + _nlpVal.toFixed(2) + ' em ' + _nlpCat + '? Confirma "sim" ou diz "agenda [nome] [horario]" 😊';
      await responder(_resp);
      return true;
    }
    if (_nlpVal && _nlpInt === 'saida') {
      const _descNlp = _extrairDescricao(msg, 'despesa');
      const _catFinal = _nlpCat !== 'outros' ? _nlpCat : _extrairCategoria(msg);
      // Fix 6: pedir confirmação para valores altos (>500) — evita erro de transcrição de áudio
      if (_nlpVal > 500) {
        const _vStr = _nlpVal.toFixed(2).replace('.', ',');
        SM.updateSession(adminId, telefone, {
          aguardandoConfirmacao: true,
          ultimaAcaoPendente: 'confirmar_saida_alto',
          ultimoLancamentoValor: _nlpVal, ultimoLancamentoDesc: _descNlp, ultimoLancamentoCat: _catFinal
        });
        await responder(`${_chefe(_generoAdmin, _apelidoAdmin)}, confirma saída de *R$ ${_vStr}* em "${_catFinal}"? Responde *sim* ou *não* 🤔`);
        return true;
      }
      const _docDespNlp = await FinanceiroAgenda.create({
        adminId: adminObjId, tipo: 'despesa', valor: _nlpVal,
        descricao: _descNlp, categoria: _catFinal,
        data: _dataAgora(), origem: 'whatsapp_dono'
      });
      SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docDespNlp._id), ultimoLancamentoTipo: 'despesa', ultimoLancamentoValor: _nlpVal, ultimoLancamentoDesc: _descNlp, ultimoLancamentoCat: _catFinal });
      const _labelSaida = _catFinal !== 'outros' ? _catFinal : (_descNlp !== 'Gasto via WhatsApp' ? _descNlp : 'outros');
      await responder(_respSaida(_nlpVal, _labelSaida, null));
      return true;
    }
    // saida_ambigua: só registra se tiver categoria conhecida E verbo financeiro implícito
    // Evita registrar "27/05 09hrs", "com salgado agora", frases de contexto como lançamento
    if (_nlpVal && _nlpInt === 'saida_ambigua') {
      const _temVerbExplicito = /gastei|paguei|saiu|debitou|descontou|tirei|comprei|saida|gasto/.test(nlp.normalizado);
      const _catAmb = _nlpCat !== 'outros' ? _nlpCat : _extrairCategoria(msg);
      const _temCatConhecida = _catAmb !== 'outros';
      // Rejeita se: só número sem categoria nem verbo, ou parece data/hora, ou frase longa de contexto
      const _pareceData = /\d{1,2}\/\d{1,2}|\d{1,2}h\b|\d{1,2}:\d{2}/.test(msg);
      const _fraseContexto = msg.split(' ').length > 6 && !_temVerbExplicito && !_temCatConhecida;
      if (_pareceData || _fraseContexto) {
        // Não registra — passa adiante para o cérebro tratar
        // return false aqui bloquearia a resposta; deixa cair no próximo handler
      }
      if (_temVerbExplicito || _temCatConhecida) {
        const _descAmb = _extrairDescricao(msg, 'despesa');
        const _docAmb = await FinanceiroAgenda.create({
          adminId: adminObjId, tipo: 'despesa', valor: _nlpVal,
          descricao: _descAmb, categoria: _catAmb,
          data: _dataAgora(), origem: 'whatsapp_dono'
        });
        SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docAmb._id), ultimoLancamentoTipo: 'despesa', ultimoLancamentoValor: _nlpVal, ultimoLancamentoDesc: _descAmb, ultimoLancamentoCat: _catAmb });
        const _labelAmb = _catAmb !== 'outros' ? _catAmb : (_descAmb !== 'Gasto via WhatsApp' ? _descAmb : 'outros');
        await responder(_respSaida(_nlpVal, _labelAmb, null));
        return true;
      }
      // Número solto sem contexto — pede confirmação
      await responder(`${_chefe(_generoAdmin, _apelidoAdmin)}, vi o valor R$ ${_nlpVal.toFixed(2).replace('.',',')} — foi uma saída? Me confirma "sim gasto" ou me fala o que foi 😊`);
      return true;
    }

    if (_nlpVal && _nlpInt === 'entrada') {
      const _descNlpE = _extrairDescricao(msg, 'receita');
      const _catFinalE = _nlpCat !== 'outros' ? _nlpCat : _extrairCategoria(msg);
      await FinanceiroAgenda.create({
        adminId: adminObjId, tipo: 'receita', valor: _nlpVal,
        descricao: _descNlpE, categoria: _catFinalE,
        data: _dataAgora(), origem: 'whatsapp_dono'
      });
      const _labelEntrada = _catFinalE !== 'outros' ? _catFinalE : (_descNlpE !== 'Entrada via WhatsApp' ? _descNlpE : 'outros');
      await responder(_respEntrada(_nlpVal, _labelEntrada, null));
      return true;
    }
  }

  // Padrao informal: "50 reais cabeleireiro" ou "cabeleireiro 50" (valor + origem sem palavra-chave)
  if (/(?:\d[\d.,]*\s*(?:reais?|R\$)?\s*(?:cabeleirei\w*|barbearia|barbeiro|farm[aá]cia|academia|m[eé]dico|dentista|escola|curso|cinema|restaurante|taxi|t[aá]xi|posto|padaria|mercado|supermercado|ifood|rappi|uber|salao|manicure|pedicure|est[eé]tica|depila|sobrancelha|lanche|comida|almoco|janta|caf[eé]|condominio|fornecedor|material|equipamento|limpeza|higiene|servi[cç]o|manutencao|conserto)|(?:cabeleirei\w*|barbearia|barbeiro|farm[aá]cia|academia|m[eé]dico|dentista|escola|curso|cinema|restaurante|taxi|t[aá]xi|posto|padaria|mercado|supermercado|ifood|rappi|uber|salao|manicure|pedicure|lanche|comida|almoco|janta|condominio|fornecedor|material|equipamento|limpeza|servi[cç]o)\s*\d[\d.,]*)/i.test(msgL) && !/\bquanto\b/i.test(msgL)) {
    const val = _parsarValor(msg);
    if (val) {
      const descSaidaI = _extrairDescricao(msg, 'despesa');
      const catSaidaI  = _extrairCategoria(msg);
      const _docSaidaI = await FinanceiroAgenda.create({
        adminId: adminObjId, tipo: 'despesa', valor: val,
        descricao: descSaidaI, categoria: catSaidaI,
        data: _dataAgora(), origem: 'whatsapp_dono'
      });
      SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docSaidaI._id), ultimoLancamentoTipo: 'despesa', ultimoLancamentoValor: val, ultimoLancamentoDesc: descSaidaI, ultimoLancamentoCat: catSaidaI });
      await responder(_respSaida(val, catSaidaI, descSaidaI));
      return true;
    }
  }
  if (/\bregistra\b.*\bgasto\b|\bmarca\b.*\bgasto\b|\banota\b.*\bgasto\b|\bmarca\b.*\bdespesa\b|\bregistra\b.*\bdespesa\b|\bpaguei\b|\bcomprei\b|\bsaída\b|\bsaida\b|\bdespesa\b|\bgastei\b|\btive\s*gasto\b|\bsaiu\b|\bdebita\b|\bdescontou\b|\bluz\b|\bagua\b|\bcombust[ií]vel\b|\bgasolina\b|\buber\b|\binternet\b|\baliment[ao]\b|\blanche\b|\bcaf[eé]\b|\bmaterial\b|\bequipamento\b/i.test(msgL) && !/\bquanto\b/i.test(msgL) && !/\bentrada\b|\brecebi\b|\bcaiu\b|\bganhei\b/i.test(msgL)) {
    const _msgLimpaS = msg.replace(/[?!]+$/, '').trim();
    const val = _parsarValor(_msgLimpaS);
    const descSaida = _extrairDescricao(msg, 'despesa');
    const catSaida  = _extrairCategoria(msg, _extrairCategoria(descSaida));
    if (val) {
      const _docSaidaV = await FinanceiroAgenda.create({
        adminId: adminObjId,
        tipo: 'despesa',
        valor: val,
        descricao: descSaida,
        categoria: catSaida,
        data: _dataAgora(),
        origem: 'whatsapp_dono'
      });
      SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docSaidaV._id), ultimoLancamentoTipo: 'despesa', ultimoLancamentoValor: val, ultimoLancamentoDesc: descSaida, ultimoLancamentoCat: catSaida });
      await responder(_respSaida(val, catSaida, descSaida));
      return true;
    }
    await responder(`${_erro(_generoAdmin, _apelidoAdmin)} Me fala assim: *Rebeca, registra um gasto de R$50 em produtos* 💸`);
    return true;
  }


  // ── FATURAMENTO POR SERVIÇO ──────────────────────────────────────────────────
  if (/quanto\s*(fiz|faturei|ganhei|recebi)\s*(de|com|no|em)\s+([A-Za-zÀ-ú]+)|oque\s*(fiz|faturei)\s*(de|com|no|em)\s+([A-Za-zÀ-ú]+)/i.test(msgL)) {
    const servicoM = msg.match(/quanto\s*(?:fiz|faturei|ganhei)\s*(?:de|com|no)\s+([A-Za-zÀ-ú\s]+?)(?:\s*(?:esse|este|no|nesse)\s*m[eê]s|\s*hoje|\s*essa\s*semana|$)/i);
    const servicoBusca = servicoM ? servicoM[1].trim() : null;
    if (servicoBusca) {
      const _hj659 = new Date(); const ini = new Date(Date.UTC(_hj659.getUTCFullYear(), _hj659.getUTCMonth(), 1, 3, 0, 0));
      const fim = _fimDia();
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
      await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 📊

✂️ *${servicoBusca}* esse mês:
• ${totalAgs} atendimento(s)
• R$ ${totalLanc.toFixed(2).replace('.',',')} registrado(s)

${totalAgs > 0 ? 'Tá saindo bem! 💪' : 'Ainda sem registros esse mês.'}`);
      return true;
    }
  }

  // ── FATURAMENTO ────────────────────────────────────────────────────────────
  if (/\bfaturei\b|\bfaturamento\b|\bquanto\s*(entrou|fiz|ganhei|recebi|caiu)\b|\bquanto\s*(fiz|ganhei|recebi)\s*hoje\b|\bquanto\s*(?:eu\s*)?(gastei|saiu|foram|ganhei|recebi|faturei)\b|\bquanto\s*entrou\s*(hoje|de|essa|esta)\b|\bquanto\s*(eu\s*)?(gastei|saiu)\s*(hoje|essa|esta|semana)?\b|\bcaixa\s*de\s*hoje\b|\bresultado\s*de\s*hoje\b|\bsaldo\s*de\s*hoje\b|\bquanto\s*t[eê]m?\s*hoje\b|\bcomo\s*t[áa]\s*o\s*caixa\b|\bfiz\s*quanto\b|\bganhei\s*quanto\b|\bessa\s*semana\b.*\b(entrou|gastei|saiu|faturei)\b|\b(entrou|gastei|saiu|faturei)\b.*\bessa\s*semana\b|\bo\s*que\s*(gastei|fiz|faturei|entrou|saiu)\b|\boque\s*(gastei|fiz|faturei|entrou|saiu)\b/i.test(msgL)) {
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
    const leE = Object.entries(catE).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2).replace('.',',')}`).join('\n');
    const leS = Object.entries(catS).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2).replace('.',',')}`).join('\n');
    const _labelPeriodo = _isSemana ? `semana de ${_fmtData(iniUTC)} a ${_fmtData(_agoraBR)}` : _fmtData(_agoraBR);
    let rel = `Resumo de ${_labelPeriodo}:\n`;
    rel += `\nEntradas: R$ ${entradas.toFixed(2).replace('.',',')}${leE ? '\n'+leE : ''}`;
    rel += `\nSaídas: R$ ${saidas.toFixed(2).replace('.',',')}${leS ? '\n'+leS : ''}`;
    rel += `\nResultado: R$ ${(entradas-saidas).toFixed(2).replace('.',',')} | Atendimentos: ${agendamentos}`;
    await responder(rel);
    return true;
  }

  // ── CANCELAR AGENDAMENTO ─────────────────────────────────────────────────
  if (/\bcancela\b|\bcancelado\b|\bn[aã]o\s+vem\b|\bdesistiu\b|\bdesmarca\b|\bn[aã]o\s+vai\s+vir\b|\bcliente\s+cancelou\b/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL) || new Date();
    if (hora) {
      const ini = new Date(dia); ini.setUTCHours(hora.h + 3, hora.min - 5, 0, 0);
      const fim = new Date(dia); fim.setUTCHours(hora.h + 3, hora.min + 5, 0, 0);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId, dataHora: { $gte: ini, $lte: fim },
        status: { $ne: 'cancelado' }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'cancelado' });
        await responder(`Feito, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔓\n\n*${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))} cancelado. Horário livre! 😊`);
        return true;
      }
    }
    const nomeM2 = msg.match(/cancela\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i)
                || msg.match(/desmarca\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i)
                || msg.match(/([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s+(?:n[aã]o\s+vem|cancelou|desistiu|n[aã]o\s+vai\s+vir)/i);
    const nomeCli2 = nomeM2 ? nomeM2[1].trim().replace(/\b(rebeca|agendamento|horario|horário)[,.]?\s*/gi,'').trim() : null;
    if (nomeCli2) {
      const ini = _inicioDia(dia);
      const fim = _fimDia(dia);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId,
        nomeCliente: { $regex: nomeCli2, $options: 'i' },
        dataHora: { $gte: ini, $lte: fim },
        status: { $ne: 'cancelado' }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'cancelado' });
        await responder(`Cancelado, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔓\n\n*${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))} removido. Horário livre! 😊`);
        return true;
      }
      await responder(`Hmm, não achei nenhum agendamento de *${nomeCli2}* hoje não, ${_chefe(_generoAdmin, _apelidoAdmin)}. 🤔\n\nConfere o nome ou me fala o horário: *cancela as 14h* 😊`);
      return true;
    }
    const _sugestHor = await AgendamentoAgenda.find({
      adminId: adminObjId,
      dataHora: { $gte: _inicioDia(), $lte: _fimDia() },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();
    const _prox3 = _sugestHor.slice(0,3).map(a => _fmtHora(new Date(a.dataHora))).join(', ');
    await responder(`Me fala o horário ou o nome, ${_chefe(_generoAdmin, _apelidoAdmin)}!\nTipo: *cancela as 14h* ou *a Maria não vem*\n${_prox3 ? '\nHorários com agendamento hoje: '+_prox3 : ''} 😊`);
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
        const _minsFalt = Math.round((new Date(ag.dataHora) - new Date()) / 60000);
        const _tempoLabel = _minsFalt > 0 ? (_minsFalt < 60 ? ` — chega em ${_minsFalt} min!` : ` — chega em ${Math.round(_minsFalt/60)}h`) : ' — já deve estar chegando!';
        await responder(`✅ *${ag.nomeCliente}* confirmado${_tempoLabel} 💙`);
        return true;
      }
    }
    const nomeM = msg.match(/confirma\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i)
               || msg.match(/([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s+(?:confirmou|vai\s+vir|pode\s+vir)/i);
    const nomeCli = nomeM ? nomeM[1].trim() : null;
    if (nomeCli) {
      const ini = _inicioDia(dia);
      const fim = _fimDia(dia);
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId,
        nomeCliente: { $regex: nomeCli, $options: 'i' },
        dataHora: { $gte: ini, $lte: fim },
        status: { $in: ['pendente','confirmado'] }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'confirmado' });
        await responder(`Confirmado, ${_chefe(_generoAdmin, _apelidoAdmin)}! ✅\n\n*${ag.nomeCliente}* às ${_fmtHora(new Date(ag.dataHora))} — anotado! 💙`);
        return true;
      }
      await responder(`Não achei agendamento pra *${nomeCli}* hoje não, ${_chefe(_generoAdmin, _apelidoAdmin)}. Confere o nome? 🤔`);
      return true;
    }
    await responder(`Me fala o horário ou o nome, ${_chefe(_generoAdmin, _apelidoAdmin)}!\nTipo: *confirma as 14h* ou *a Maria confirmou* 😊`);
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
      await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🎉\n\nNenhum cliente inativo nos últimos 30 dias não! Todo mundo voltando direitinho! 💪`);
      return true;
    }
    const lista = inativos.map(c => {
      const d = Math.floor((Date.now()-new Date(c.ultimoAtendimento))/(86400000));
      return `• ${c.nome} — ${d} dias sem vir`;
    }).join('\n');
    await responder(`👥 *Clientes inativos (30d+):*\n\n${lista}\n\nQuer que eu mande uma mensagem pra algum deles? É só falar! 💙`);
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

  if (_pendLemb) {
    // ── BLOCO DEDICADO aguardandoLembrete ────────────────────────────────────
    // Processa APENAS a mensagem atual — sem histórico, sem NLP geral
    console.log('[HORARIO-TRANSCRICAO] msg_atual:', JSON.stringify(msg), '| aguardando:', _pendLemb.aguardando);

    // Extrair hora e dia APENAS da mensagem atual (não do histórico)
    const _msgApenasAtual = msg; // transcrição limpa do áudio atual
    const _diaPend  = _parseDia(_msgApenasAtual);
    const _horaPend = _parseHora(_msgApenasAtual);

    console.log('[HORARIO-DETECTADO] hora:', JSON.stringify(_horaPend), '| dia:', _diaPend ? _diaPend.toISOString() : null);

    // Se parece claramente um novo comando de lembrete, cancelar pendência
    if (!_diaPend && !_horaPend && _msgApenasAtual.length > 15 && /me\s*lembr[aei]|\blembrar\b|lembrete|n[aã]o\s*me\s*deixa?\s*esquecer|anota\s*(a[ií])?/i.test(_msgApenasAtual)) {
      SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
      console.log('[HORARIO-DETECTADO] novo comando detectado — cancelando pendencia');
      // cai para processar como novo lembrete abaixo

    } else if (_pendLemb.aguardando === 'dia' && _diaPend) {
      // Tinha hora salva na sessão, agora chegou o dia
      const _h = _pendLemb.hora;
      const _brMs = _diaPend.getTime() - (3*60*60*1000);
      const _brD  = new Date(_brMs);
      const _dt   = new Date(Date.UTC(_brD.getUTCFullYear(), _brD.getUTCMonth(), _brD.getUTCDate(), _h.h+3, _h.min, 0));
      const _dav  = new Date(_dt.getTime() - 15*60000);
      const _txt  = _pendLemb.texto || 'Lembrete';
      console.log('[SALVANDO-LEMBRETE] texto:', _txt, '| dataEvento:', _dt.toISOString(), '| dataAviso:', _dav.toISOString());
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: { 'config.lembretes': { texto: _txt, dataEvento: _dt, dataAviso: _dav, enviado: false, criadoEm: new Date() } }
      });
      SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
      const _conf = _pendLemb.texto
        ? ('Anotado! Lembro voce de "' + _txt + '" em ' + _fmtData(_diaPend) + ' as ' + _fmtHora(_dt))
        : ('Anotado! Lembrete salvo para ' + _fmtData(_diaPend) + ' as ' + _fmtHora(_dt));
      console.log('[JSON-FINAL] lembrete salvo:', JSON.stringify({ texto: _txt, dataEvento: _dt, dataAviso: _dav }));
      await responder(_conf);
      SM.addAssistantMsg(adminId, telefone, _conf);
      return true;

    } else if (_pendLemb.aguardando === 'hora' && _horaPend && !_horaPend.relativo) {
      // Tinha dia salvo na sessão, agora chegou a hora
      const _d = _pendLemb.dia;
      const _brMs = _d.getTime() - (3*60*60*1000);
      const _brD  = new Date(_brMs);
      const _dt   = new Date(Date.UTC(_brD.getUTCFullYear(), _brD.getUTCMonth(), _brD.getUTCDate(), _horaPend.h+3, _horaPend.min, 0));
      const _dav  = new Date(_dt.getTime() - 15*60000);
      const _txt  = _pendLemb.texto || 'Lembrete';
      console.log('[SALVANDO-LEMBRETE] texto:', _txt, '| dataEvento:', _dt.toISOString(), '| dataAviso:', _dav.toISOString());
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        $push: { 'config.lembretes': { texto: _txt, dataEvento: _dt, dataAviso: _dav, enviado: false, criadoEm: new Date() } }
      });
      SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
      const _conf = _pendLemb.texto
        ? ('Anotado! Lembro voce de "' + _txt + '" em ' + _fmtData(_d) + ' as ' + _fmtHora(_dt))
        : ('Anotado! Lembrete salvo para ' + _fmtData(_d) + ' as ' + _fmtHora(_dt));
      console.log('[JSON-FINAL] lembrete salvo:', JSON.stringify({ texto: _txt, dataEvento: _dt, dataAviso: _dav }));
      await responder(_conf);
      SM.addAssistantMsg(adminId, telefone, _conf);
      return true;

    } else if (!_diaPend && !_horaPend) {
      // Fix 7: após 2 tentativas sem entender, cancelar estado para não travar
      const _tentativas = (_pendLemb.tentativas || 0) + 1;
      if (_tentativas >= 2) {
        SM.updateSession(adminId, telefone, { aguardandoLembrete: null });
        const _cancMsg = `Tudo bem, deixa pra lá! 😅 Se quiser o lembrete depois é só falar.`;
        await responder(_cancMsg);
        SM.addAssistantMsg(adminId, telefone, _cancMsg);
        return true;
      }
      SM.updateSession(adminId, telefone, { aguardandoLembrete: { ..._pendLemb, tentativas: _tentativas } });
      const _reask = _pendLemb.aguardando === 'hora'
        ? 'Não entendi o horário. 😅 Me fala assim: *oito horas*, *14h30*, *às9 da manhã*...'
        : 'Não entendi o dia. 😅 Me fala assim: *hoje*, *amanhã*, *dia 15*...';
      await responder(_reask);
      SM.addAssistantMsg(adminId, telefone, _reask);
      return true;
    }
  }

  if (/me\s*lembr[aei]|\blembrar\b|lembrete|n[aã]o\s*me\s*deixa?\s*esquecer|anota\s*(a[ií])?/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL);

    // ── Extrair texto: remover gatilho + tudo temporal, pegar o que sobra ────
    const _semGatilho = msg
      .replace(/^.*?(?:lembrete\s*:?|me\s*lembr[aei]|lembr[aei]|lembrar|avisa?|anota)\s*(?:de\s+|que\s+)?/i, '')
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
    // Se usuário disse "esse mesmo lembrete" / "o mesmo" / "igual" → buscar último lembrete
    let textoLembrete = (_limpo && _limpo.length > 1) ? _limpo : null;
    const _refMesmo = /esse mesmo|o mesmo|igual ao|mesmo lembrete|repetir|repete/i.test(msg);
    if (_refMesmo || (textoLembrete && /^esse mesmo|^o mesmo/i.test(textoLembrete))) {
      const _adm = await AdminAgenda.findById(adminObjId).lean();
      const _lembs = (_adm?.config?.lembretes || []).filter(l => l.texto && !/^esse mesmo|^o mesmo/i.test(l.texto));
      if (_lembs.length) {
        const _ultimo = _lembs[_lembs.length - 1];
        textoLembrete = _ultimo.texto;
      }
    }

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
    const _rE = 'Anotei, ' + _chefe(_generoAdmin, _apelidoAdmin) + '! Me fala o dia e horario tambem pra eu te avisar antes.';
    await responder(_rE);
    SM.addAssistantMsg(adminId, telefone, _rE);
    return true;
  }

      // ── VER / EXCLUIR LEMBRETES ─────────────────────────────────────────────
  if (/ver.*lembrete|meus.*lembrete|quais.*lembrete|lista.*lembrete|lembrete.*futur|lembrete.*pendente|tenho.*lembrete|mostra.*lembrete|\blembretes\b/i.test(msgL)) {
    const admin2 = await AdminAgenda.findById(adminObjId).lean();
    const lembs = (admin2?.config?.lembretes || []).filter(l => !l.enviado).sort((a,b) => new Date(a.dataEvento)-new Date(b.dataEvento));
    if (!lembs.length) { await responder("Nenhum lembrete pendente."); return true; }
    const _lemNormais = lembs.filter(l => !l.recorrente);
    const _lemRecs    = lembs.filter(l => l.recorrente);
    // Agrupar recorrentes por texto único para não listar 12x o mesmo
    const _recsUnicos = {};
    _lemRecs.forEach(l => {
      const _key = l.texto + '|' + (l.recorrente?.tipo || '');
      if (!_recsUnicos[_key]) _recsUnicos[_key] = { ...l, _count: 0 };
      _recsUnicos[_key]._count++;
    });
    let _partes = [];
    if (_lemNormais.length) {
      const _listaN = _lemNormais.map((l,i) => `${i+1}. ${l.texto} — ${_fmtData(new Date(l.dataEvento))} às ${_fmtHora(new Date(l.dataEvento))}`).join('\n');
      _partes.push(`📅 *Lembretes pontuais (${_lemNormais.length}):*\n${_listaN}`);
    }
    if (Object.keys(_recsUnicos).length) {
      const _listaR = Object.values(_recsUnicos).map((l,i) => {
        const _tipo = l.recorrente?.tipo === 'semanal' ? `toda ${l.recorrente?.diaSemana || 'semana'}` :
                      l.recorrente?.tipo === 'mensal'  ? `todo dia ${l.recorrente?.dia || '?'} do mês` :
                      l.recorrente?.tipo === 'diario'  ? 'todo dia' : l.recorrente?.tipo || 'recorrente';
        return `${i+1}. ${l.texto} — ${_tipo} (${l._count}x agendado)`;
      }).join('\n');
      _partes.push(`🔁 *Lembretes recorrentes (${_lemRecs.length} no total):*\n${_listaR}`);
    }
    const _msgLembs = _partes.join('\n\n');
    await responder(`🔔 *Seus lembretes futuros (${lembs.length}):*\n\n${_msgLembs}\n\n📌 Excluir um: *cancela lembrete 1*\n🗑️ Excluir todos: *cancela todos os lembretes*\n🔁 Excluir só recorrentes: *cancela lembretes recorrentes*`);
    return true;
  }

  // ── EXCLUIR LEMBRETES RECORRENTES ───────────────────────────────────────────
  if (/cancela.*lembrete.*recorrente|apaga.*lembrete.*recorrente|exclu.*lembrete.*recorrente|cancela.*recorrente|limpa.*recorrente/i.test(msgL)) {
    const admin2 = await AdminAgenda.findById(adminObjId).lean();
    const lembs = (admin2?.config?.lembretes || []).filter(l => !l.enviado && l.recorrente);
    if (!lembs.length) {
      await responder(`Não tem nenhum lembrete recorrente pendente, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊`);
      return true;
    }
    await AdminAgenda.findByIdAndUpdate(adminObjId, {
      $pull: { 'config.lembretes': { enviado: { $ne: true }, recorrente: { $exists: true } } }
    });
    await responder(`🗑️ Pronto, ${_chefe(_generoAdmin, _apelidoAdmin)}! *${lembs.length} lembrete(s) recorrente(s)* cancelado(s). 💙`);
    return true;
  }

  // ── EXCLUIR TODOS OS LEMBRETES ──────────────────────────────────────────────
  if (/cancela.*todos.*lembrete|apaga.*todos.*lembrete|exclu.*todos.*lembrete|deleta.*todos.*lembrete|cancela.*lembrete.*todos|limpa.*lembrete|zera.*lembrete/i.test(msgL)) {
    const admin2 = await AdminAgenda.findById(adminObjId).lean();
    const lembs = (admin2?.config?.lembretes || []).filter(l => !l.enviado);
    if (!lembs.length) {
      await responder(`Não tem nenhum lembrete pendente pra cancelar, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊`);
      return true;
    }
    await AdminAgenda.findByIdAndUpdate(adminObjId, {
      $pull: { 'config.lembretes': { enviado: { $ne: true } } }
    });
    await responder(`🗑️ Pronto, ${_chefe(_generoAdmin, _apelidoAdmin)}! *${lembs.length} lembrete(s)* cancelado(s). Tá limpo! 💙`);
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
    await responder(`🎤 Recebi seu áudio, ${_chefe(_generoAdmin, _apelidoAdmin)}! Mas não consegui transcrever. Me manda em texto que resolvo na hora! 💙`);
    return true;
  }

  // ── PRÓXIMO CLIENTE ──────────────────────────────────────────────────────────
  if (/pr[oó]ximo\s*cliente|quem\s*(é\s*)?o\s*pr[oó]ximo|pr[oó]ximo\s*da\s*fila|\bquem\s*[eé]\s*agora\b|\bquem\s*[eé]\s*o\s*seguinte\b|\bagora\s*quem\s*[eé]\b|\btem\s*algu[eé]m\s*agora\b|\bpr[oó]ximo\s*hor[aá]rio\b/i.test(msgL)) {
    const agora = new Date();
    const fim = _fimDia();
    const ag = await AgendamentoAgenda.findOne({
      adminId: adminObjId, dataHora: { $gte: agora, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();
    if (!ag) {
      await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊

Não tem mais ninguém agendado hoje não! Tá livre o resto do dia. 🎉`);
    } else {
      const mins = Math.round((new Date(ag.dataHora) - agora) / 60000);
      const tempo = mins <= 0 ? 'já deveria ter chegado!' : mins < 60 ? `em ${mins} minutinhos` : `em ${Math.round(mins/60)}h`;
      // Buscar histórico do cliente para contexto extra
      const _clienteHist = await ClienteAgenda.findOne({
        adminId: adminObjId,
        telefone: { $exists: true },
        nome: { $regex: ag.nomeCliente.split(' ')[0], $options: 'i' }
      }).lean();
      const _totalVisitas = _clienteHist?.totalAtendimentos || 0;
      const _dicaCliente = _totalVisitas === 0 ? '\n\n✨ Primeira vez aqui!' 
        : _totalVisitas === 1 ? '\n\n😊 Segunda visita!'
        : `\n\n💙 ${_totalVisitas}ª visita — cliente fidelizada!`;
      await responder(`O próximo é ${_chefe(_generoAdmin, _apelidoAdmin)}! 😄\n\n👤 *${ag.nomeCliente}*\n✂️ ${ag.nomeServico || '—'}\n⏰ ${_fmtHora(new Date(ag.dataHora))} (${tempo})${_dicaCliente}`);
    }
    return true;
  }

  // ── AGENDA DA SEMANA ──────────────────────────────────────────────────────
  if (/agenda\s*d[ao]\s*semana|semana\s*toda|essa\s*semana|como\s*(est[aá]|t[aá]|fica)\s*(a\s*)?(minha\s*)?(agenda|semana)\s*(essa|da|na|da|pra)?\s*semana|agenda\s*(essa|da|na|pra)?\s*semana/i.test(msgL)) {
    const ini = _inicioDia();
    const _fim7 = new Date(ini); _fim7.setUTCDate(_fim7.getUTCDate() + 7); const fim = _fimDia(_fim7);
    const ags = await AgendamentoAgenda.find({
      adminId: adminObjId, dataHora: { $gte: ini, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();
    if (!ags.length) {
      const _diasSem = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
      await responder(`A semana ainda tá livre, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🗓️\n\nQuer que eu te ajude a organizar ou mandar mensagem pra clientes pra encher? 💙`);
    } else {
      const porDia = {};
      ags.forEach(a => {
        const d = _fmtData(new Date(a.dataHora));
        if (!porDia[d]) porDia[d] = [];
        porDia[d].push(`  • ${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente}`);
      });
      const lista = Object.entries(porDia).map(([d,v]) => '📅 *' + d + '*\n' + v.join('\n')).join('\n\n');
      await responder('Olha a semana aí, ' + _chefe(_generoAdmin, _apelidoAdmin) + '! 🗓️\n\n' + lista + '\n\n' + ags.length + ' agendamento(s) no total. Tá cheio! 💪');
    }
    return true;
  }

  // ── ENCAIXAR CLIENTE ──────────────────────────────────────────────────────
  if (/encaixa|marca\s*(um\s*)?hor[aá]rio|adiciona\s*(um\s*)?cliente|\bagenda\b.*\b(cliente|para|pra|amanhã|amanha|hoje|às|as)\b|\bagendar\b/i.test(msgL)) {
    const hora = _parseHora(msgL);
    const dia  = _parseDia(msgL) || new Date();
    // Extrai nome: verbo + [artigo] + Nome + (data/hora/pra)
    // Padrão 1: "encaixa a Maria amanhã" / "agenda João Silva às 14h"
    // Padrão 2: "marca horário pra Luana hoje" — nome vem depois de "pra/para"
    const _PALAVRAS_RUIDO = /^(amanhã|amanha|hoje|ontem|às?|as|pra|para|horário|horario|um|uma|no|dia|de|da|do)$/i;
    let nome = null;
    const nomeM1 = msg.match(/(?:encaixa|agenda|agendar|adiciona|marca)\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s+(?:amanhã|amanha|hoje|às?|as|pra|para|no\s+dia|\d)/i);
    if (nomeM1) {
      // Limpar palavras de data/hora capturadas no final do grupo
      const _partes = nomeM1[1].trim().split(/\s+/);
      const _nomePartes = _partes.filter(p => !_PALAVRAS_RUIDO.test(p));
      if (_nomePartes.length) nome = _nomePartes.join(' ');
    }
    // Padrão 2: "marca horário pra Luana hoje" — nome após pra/para
    if (!nome) {
      const nomeM2 = msg.match(/(?:pra|para)\s+([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)\s+(?:amanhã|amanha|hoje|às?|as|\d)/i);
      if (nomeM2) {
        const _partes2 = nomeM2[1].trim().split(/\s+/);
        nome = _partes2.filter(p => !_PALAVRAS_RUIDO.test(p)).join(' ') || null;
      }
    }
    if (hora && nome) {
      // Converter hora local (UTC-3) para UTC: hora local + 3 = UTC
      const dataHora = new Date(dia);
      dataHora.setUTCHours(hora.h + 3, hora.min, 0, 0);
      const diaFinal = dataHora; // alias para uso na mensagem
      // Verificar conflito de horário — janela de 30 min
      const _iniConflito = new Date(dataHora.getTime() - 15 * 60000);
      const _fimConflito = new Date(dataHora.getTime() + 15 * 60000);
      const _conflito = await AgendamentoAgenda.findOne({
        adminId: adminObjId,
        dataHora: { $gte: _iniConflito, $lte: _fimConflito },
        status: { $in: ['pendente','confirmado'] }
      }).lean();
      if (_conflito) {
        const _hrConflito = _fmtHora(new Date(_conflito.dataHora));
        const _nomConflito = _conflito.nomeCliente;
        // Sugerir horários próximos livres
        const _antesH = new Date(dataHora.getTime() - 60 * 60000);
        const _depoisH = new Date(dataHora.getTime() + 60 * 60000);
        await responder(`Eita, ${_chefe(_generoAdmin, _apelidoAdmin)}! ⚠️\n\nEsse horário já tem *${_nomConflito}* às *${_hrConflito}*.\n\nQuer encaixar ${nome} antes (às ${_fmtHora(_antesH)}) ou depois (às ${_fmtHora(_depoisH)})?\n\nOu me fala outro horário 😊`);
        return true;
      }
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

      await responder(`Maravilha, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🎉\n\n✅ *${nome}* encaixado às *${_fmtHora(dataHora)}* de ${_fmtData(dataHora)}!\n\nJá tá na agenda! 💙${telCliente ? '' : '\n\n📱 Se tiver o número dele me passa pra eu enviar lembretes!'}`); 
    } else if (nome && !hora) {
      await responder(`Certo, ${_chefe(_generoAdmin, _apelidoAdmin)}! *${nome}* — que horas? 😊`);
    } else if (hora && !nome) {
      await responder(`Combinado, ${_chefe(_generoAdmin, _apelidoAdmin)}! Às *${_fmtHora((() => { const d = new Date(); d.setHours(hora.h, hora.min, 0, 0); return d; })())}* — qual o nome do cliente?`);
    } else {
      await responder(`Me fala o nome e o horário, ${_chefe(_generoAdmin, _apelidoAdmin)}! Tipo: *Rebeca, agenda a Maria amanhã às 10h* 😊`);
    }
    return true;
  }

  // ── FECHAR AGENDA DO DIA INTEIRO ──────────────────────────────────────────
  if (/fecha\s*(minha\s*)?agenda\s*(o\s*dia\s*todo|inteira|completa|toda)?|tira\s*(o\s*dia|hoje|amanhã)/i.test(msgL)) {
    const dia = _parseDia(msgL) || new Date();
    const ini = new Date(dia); ini.setHours(6,0,0,0);
    const fim = new Date(dia); fim.setHours(22,0,0,0);
    await BloqueioAgenda.create({
      adminId: adminObjId, dataHoraInicio: ini, dataHoraFim: fim,
      motivo: 'Dia fechado via WhatsApp'
    });
    await responder(`Feito, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔒

${_fmtData(dia)} tá bloqueado o dia todo. Ninguém consegue agendar não!

Descansa bem! 😊💙`);
    return true;
  }

  // ── LIBERAR AGENDA (com suporte a pausa/almoço embutida) ─────────────────
  if (/libera\s*(minha\s*)?agenda|remove\s*(os\s*)?bloqueios?|abre\s*(minha\s*)?agenda/i.test(msgL)) {
    const dia = _parseDia(msgL) || new Date();
    const ini = _inicioDia(dia);
    const fim = _fimDia(dia);

    // Extrair range principal de horário (ex: "das 8 às 18") — ignora range da pausa
    const rangePrincipalM = msg.match(/(?<!(?:pausa|almo[çc]o|intervalo)\s{0,10})das?\s*(\d{1,2}h?\d{0,2})\s*(?:às?|as)\s*(\d{1,2}h?\d{0,2})(?!.*(?:pausa|almo[çc]o))/i)
      || msg.match(/^[^\n]*?das?\s*(\d{1,2}h?\d{0,2})\s*(?:às?|as)\s*(\d{1,2}h?\d{0,2})/i);
    const hAb = rangePrincipalM ? _parseHora(rangePrincipalM[1]) : null;
    const hFe = rangePrincipalM ? _parseHora(rangePrincipalM[2]) : null;
    // Atualizar horário de abertura/fechamento se veio range principal
    if (hAb && hFe) {
      const abertura   = String(hAb.h).padStart(2,'0') + ':' + String(hAb.min).padStart(2,'0');
      const fechamento = String(hFe.h).padStart(2,'0') + ':' + String(hFe.min).padStart(2,'0');
      await AdminAgenda.findByIdAndUpdate(adminObjId, {
        'config.horarioAbertura': abertura,
        'config.horarioFechamento': fechamento
      });
    }
    // Se tem pausa/almoço/intervalo no mesmo comando → criar bloqueio da pausa
    if (/pausa|almo[çc]o|intervalo/i.test(msgL)) {
      const rangePausa = msg.match(/(?:pausa|almo[çc]o|intervalo)\s*das?\s*(\d{1,2}h?\d{0,2})\s*(?:às?|as)\s*(\d{1,2}h?\d{0,2})/i);
      const horaPausa  = !rangePausa && msg.match(/(?:pausa|almo[çc]o|intervalo)\s*(?:às?|as|para\s*o)?\s*(\d{1,2}[h:]\d{0,2})/i);
      if (rangePausa) {
        const h1 = _parseHora(rangePausa[1]);
        const h2 = _parseHora(rangePausa[2]);
        if (h1 && h2) {
          const iniP = new Date(dia); iniP.setHours(h1.h, h1.min, 0, 0);
          const fimP = new Date(dia); fimP.setHours(h2.h, h2.min, 0, 0);
          await BloqueioAgenda.create({ adminId: adminObjId, dataHoraInicio: iniP, dataHoraFim: fimP, motivo: 'Pausa/Almoço via WhatsApp' });
          const abMsg = hAb ? ` das *${String(hAb.h).padStart(2,'0')}:${String(hAb.min).padStart(2,'0')}* às *${String(hFe.h).padStart(2,'0')}:${String(hFe.min).padStart(2,'0')}*` : '';
          await responder(`Feito, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔓✅\n\nAgenda de ${_fmtData(dia)} aberta${abMsg}!\n🍽️ Pausa bloqueada das ${_fmtHora(iniP)} às ${_fmtHora(fimP)}.\nNinguém agenda nesse intervalo! 😉`);
          return true;
        }
      } else if (horaPausa) {
        const h1 = _parseHora(horaPausa[1]);
        if (h1) {
          const iniP = new Date(dia); iniP.setHours(h1.h, h1.min, 0, 0);
          const fimP = new Date(dia); fimP.setHours(h1.h + 1, h1.min, 0, 0);
          await BloqueioAgenda.create({ adminId: adminObjId, dataHoraInicio: iniP, dataHoraFim: fimP, motivo: 'Pausa/Almoço via WhatsApp' });
          const abMsg = hAb ? ` das *${String(hAb.h).padStart(2,'0')}:${String(hAb.min).padStart(2,'0')}* às *${String(hFe.h).padStart(2,'0')}:${String(hFe.min).padStart(2,'0')}*` : '';
          await responder(`Feito, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔓✅\n\nAgenda de ${_fmtData(dia)} aberta${abMsg}!\n🍽️ Pausa bloqueada das ${_fmtHora(iniP)} às ${_fmtHora(fimP)} (1h).\nNinguém agenda nesse horário! 😉`);
          return true;
        }
      }
    }

    // Sem pausa → remove bloqueios e atualiza horário se veio range (já feito acima via hAb/hFe)
    const res = await BloqueioAgenda.deleteMany({ adminId: adminObjId, dataHoraInicio: { $gte: ini, $lte: fim } });
    if (hAb && hFe) {
      const abertura   = String(hAb.h).padStart(2,'0') + ':' + String(hAb.min).padStart(2,'0');
      const fechamento = String(hFe.h).padStart(2,'0') + ':' + String(hFe.min).padStart(2,'0');
      await responder(`Feito, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔓✅\n\nAgenda de ${_fmtData(dia)} aberta das *${abertura}* às *${fechamento}*!\nRemovi ${res.deletedCount} bloqueio(s). Pode vir cliente! 🚀`);
      return true;
    }
    await responder(`Prontinho, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔓\nRemovi ${res.deletedCount} bloqueio(s) de ${_fmtData(dia)}. Agenda aberta e pronta pra receber cliente! 🚀`);
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
        await responder(`Hmm, não achei histórico pra *${nome}* não, ${_chefe(_generoAdmin, _apelidoAdmin)}. Será que o nome tá diferente? 🤔`);
      } else {
        const lista = ags.map(a => `• ${_fmtData(new Date(a.dataHora))} — ${a.nomeServico || 'Serviço'}`).join(' + ');
        await responder(`Achei aqui, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🔍

👤 *${ags[0].nomeCliente}*

${lista}

${ags.length} visita(s) registrada(s)! 💙`);
      }
    } else {
      await responder(`Me fala o nome, ${_chefe(_generoAdmin, _apelidoAdmin)}! Assim:

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
      await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🎂

Nenhum aniversariante nos próximos 7 dias não. Mas fique de olho! 👀`);
    } else {
      const lista = aniv.map(c => {
        const d = new Date(c.dataNascimento);
        return `• ${c.nome} — ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      }).join(' + ');
      // Salvar lista na sessão para mandar mensagem se quiser
      SM.updateSession(adminId, telefone, {
        aniversariantesLista: aniv.map(c => ({ nome: c.nome, telefone: c.telefone || null }))
      });
      const _temTelefone = aniv.filter(c => c.telefone).length;
      await responder(`🎂 Aniversariantes nos próximos 7 dias, ${_chefe(_generoAdmin, _apelidoAdmin)}:\n\n${lista}\n\n${_temTelefone > 0 ? `Quer que eu mande mensagem de parabéns pra ${_temTelefone === 1 ? 'ele' : 'eles'}? É só falar *"manda parabéns"*! 🎉` : 'Não tenho o número deles cadastrado — se quiser mandar é só adicionar no cadastro! 📱'}`);
    }
    return true;
  }

  // ── RESUMO SEMANAL ────────────────────────────────────────────────────────
  if (/resumo\s*d[ao]\s*semana|faturamento\s*d[ao]\s*semana|quanto\s*(fiz|faturei|ganhei|recebi)\s*(essa|na|esta)\s*semana|\bsemana\s*toda\b|\bcomo\s*foi\s*(a\s*)?semana\b|\bbalanço\s*d[ao]\s*semana\b|\bagenda\s*(d[ae]ssa?|da|desta|nessa)\s*semana\b|\bminha\s*agenda\s*(d[ae]ssa?|da|desta)\s*semana\b/i.test(msgL)) {
    const _ini7 = new Date(); _ini7.setUTCDate(_ini7.getUTCDate() - 7); const ini = _inicioDia(_ini7);
    const fim = _fimDia();
    const lanc = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean();
    const entradas = lanc.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const saidas   = lanc.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
    const atend    = await AgendamentoAgenda.countDocuments({ adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['confirmado','concluido'] } });
    await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! Olha a semana! 📊

✅ Atendimentos: *${atend}*
💰 Entradas: *R$ ${entradas.toFixed(2).replace('.',',')}*
💸 Gastos: *R$ ${saidas.toFixed(2).replace('.',',')}*
📈 Resultado: *R$ ${(entradas-saidas).toFixed(2).replace('.',',')}*

${(entradas-saidas)>=0?'Semana boa demais! 🚀':'Semana de aprendizado! Próxima vai bombar! 💪'}`);
    return true;
  }

  // ── RESUMO MENSAL ─────────────────────────────────────────────────────────
  if (/resumo\s*d[ao]\s*m[eê]s|faturamento\s*d[ao]\s*m[eê]s|quanto\s*(fiz|faturei|ganhei|recebi)\s*(esse|no|este|do)\s*m[eê]s|\bcomo\s*foi\s*(o\s*)?m[eê]s\b|\bbalanço\s*d[ao]\s*m[eê]s\b|\bfechamento\s*d[ao]\s*m[eê]s\b|\bm[eê]s\s*todo\b/i.test(msgL)) {
    const _hjM = new Date(); const ini = new Date(Date.UTC(_hjM.getUTCFullYear(), _hjM.getUTCMonth(), 1, 3, 0, 0));
    const fim = _fimDia();
    const lanc = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean();
    const entradas = lanc.filter(l=>l.tipo==='receita').reduce((s,l)=>s+l.valor,0);
    const saidas   = lanc.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
    const atend    = await AgendamentoAgenda.countDocuments({ adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['confirmado','concluido'] } });
    const ticket   = atend > 0 ? (entradas/atend).toFixed(2) : '0.00';
    await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! Resumo do mês! 📊

✅ Atendimentos: *${atend}*
💰 Entradas: *R$ ${entradas.toFixed(2).replace('.',',')}*
💸 Gastos: *R$ ${saidas.toFixed(2).replace('.',',')}*
📈 Resultado: *R$ ${(entradas-saidas).toFixed(2).replace('.',',')}*
🎯 Ticket médio: *R$ ${ticket}*

${atend>10?'Esse mês tá voando! 🚀':'Ainda dá tempo de bombar! 💪'}`);
    return true;
  }

  // ── CLIENTES CONFIRMADOS HOJE ─────────────────────────────────────────────
  if (/clientes?\s*(de\s*hoje\s*)?confirmados?|confirmados?\s*hoje/i.test(msgL)) {
    const ini = _inicioDia();
    const fim = _fimDia();
    const ags = await AgendamentoAgenda.find({
      adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: 'confirmado'
    }).sort({ dataHora: 1 }).lean();
    if (!ags.length) {
      await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊

Nenhum confirmado ainda hoje não. Quer que eu mande lembrete pra galera? Me fala! 💙`);
    } else {
      const lista = ags.map(a => `✅ ${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente}`).join(' + ');
      await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! Olha quem confirmou hoje! 🎉

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
      await responder(`Ainda não tem dados suficientes não, ${_chefe(_generoAdmin, _apelidoAdmin)}. Mês que vem já vai ter um ranking lindo! 📊`);
    } else {
      const emojis = ['🥇','🥈','🥉','4️⃣','5️⃣'];
      const lista = sorted.map(([s,n],i) => `${emojis[i]} ${s} — ${n}x`).join(' + ');
      await responder(`Olha o ranking desse mês, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🏆

${lista}

Esses são os queridinhos! 💙`);
    }
    return true;
  }

  // ── CLIENTES NOVOS ────────────────────────────────────────────────────────
  if (/clientes?\s*novos?|quantos\s*clientes?\s*novos?/i.test(msgL)) {
    const ini = new Date(); ini.setDate(1); ini.setHours(0,0,0,0);
    const total = await ClienteAgenda.countDocuments({ adminId: adminObjId, createdAt: { $gte: ini } });
    await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 🎉

Esse mês você ganhou *${total} cliente(s) novo(s)*!

${total>5?'Tá crescendo muito! Continua assim! 🚀':'Todo cliente novo é uma vitória! 💪'}`);
    return true;
  }

  // ── MANUAL DE COMANDOS ────────────────────────────────────────────────────
  if (/\bajuda\b|\bcomandos?\b|\bo\s*que\s*(vc|você)\s*(faz|pode|sabe|consegue)\b|\bmenu\b|\bhelp\b|\bo\s*que\s*d[áa]\b|\boque\s*voc[eê]\b|\bfun[çc][õo]es?\b|\bcomo\s*us[ao]\b|\bcomo\s*funciona\b|\bpra\s*que\s*serve\b/i.test(msgL)) {
    await responder(
      `${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! Aqui tô eu! 💙

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
      await responder(`Claro, ${_chefe(_generoAdmin, _apelidoAdmin)}! Me fala pra quem: *Rebeca, manda mensagem pra Maria que o horário foi confirmado* 😊`);
      return true;
    }

    // Buscar cliente no banco
    const cliente = await ClienteAgenda.findOne({
      adminId: adminObjId,
      nome: { $regex: nomeCliente, $options: 'i' }
    }).lean();

    if (!cliente || !cliente.telefone) {
      await responder(`Hmm, não achei o contato de *${nomeCliente}* aqui não, ${_chefe(_generoAdmin, _apelidoAdmin)}. Tem o número salvo no cadastro? 🤔`);
      return true;
    }

    // Montar mensagem natural
    if (!textoMsg) {
      await responder(`Certo, ${_chefe(_generoAdmin, _apelidoAdmin)}! O que quer que eu fale pra *${nomeCliente.split(' ')[0]}*? 😊`);
      return true;
    }
    const textoFinal = textoMsg;

    // Buscar instância para envio
    const inst = await InstanciaWhatsapp.findOne({ adminId: String(adminObjId), status: 'conectado' }).lean()
              || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };

    await _enviarMsg(inst, _normalizarTel(cliente.telefone), textoFinal);
    await responder(`Mandei pra *${nomeCliente}*, ${_chefe(_generoAdmin, _apelidoAdmin)}! ✅`);
    return true;
  }

  // ── CONFIRMAR APAGAR LANÇAMENTO ─────────────────────────────────────────────
  const _sesApagarCheck = await SM.getSessionAsync(adminId, telefone);
  if (_sesApagarCheck.aguardandoConfirmacaoApagar) {
    if (_isConfirm) {
      const _idApagar = _sesApagarCheck.ultimoLancamentoId;
      SM.updateSession(adminId, telefone, { aguardandoConfirmacaoApagar: false, ultimoLancamentoId: null });
      if (_idApagar) {
        const _lancApagar = await FinanceiroAgenda.findById(_idApagar).lean();
        if (_lancApagar) {
          await FinanceiroAgenda.findByIdAndDelete(_idApagar);
          const _tpLabel = _lancApagar.tipo === 'receita' ? '💰 Entrada' : '📝 Saída';
          const _valFmtAp = _lancApagar.valor.toFixed(2).replace('.',',');
          const _descAp = _lancApagar.descricao && _lancApagar.descricao !== 'Entrada via WhatsApp' && _lancApagar.descricao !== 'Gasto via WhatsApp' ? ' — ' + _lancApagar.descricao : '';
          // Guardar dados para possível desfazer
          SM.updateSession(adminId, telefone, {
            ultimoLancamentoId: null,
            _lancamentoApagadoTipo: _lancApagar.tipo,
            _lancamentoApagadoValor: _lancApagar.valor,
            _lancamentoApagadoDesc: _lancApagar.descricao,
            _lancamentoApagadoCat: _lancApagar.categoria,
          });
          await responder(`Apagado! ✅\n\n${_tpLabel} de *R$ ${_valFmtAp}*${_descAp} foi removida.\n\nSe foi sem querer, fala *desfaz* que eu coloco de volta. 💙`);
          return true;
        }
      }
    } else if (_isNeg) {
      SM.updateSession(adminId, telefone, { aguardandoConfirmacaoApagar: false, ultimoLancamentoId: null });
      await responder(`Ok, ${_chefe(_generoAdmin, _apelidoAdmin)}! Mantive o lançamento. 👍`);
      return true;
    }
  }

  // ── DESFAZER APAGAMENTO ────────────────────────────────────────────────────
  if (/\bdesfaz\b|\bdesfazer\b|\bvolta\b.*\blancamento\b|\bcoloca\b.*\bde volta\b|\berrei\b.*\bapagar\b|\bapaguei\b.*\berrado\b/i.test(msgL)) {
    const _sesDesfaz = SM.getSession(adminId, telefone);
    if (_sesDesfaz._lancamentoApagadoValor) {
      const _recriar = await FinanceiroAgenda.create({
        adminId: adminObjId,
        tipo: _sesDesfaz._lancamentoApagadoTipo,
        valor: _sesDesfaz._lancamentoApagadoValor,
        descricao: _sesDesfaz._lancamentoApagadoDesc || '',
        categoria: _sesDesfaz._lancamentoApagadoCat || 'outros',
        data: _dataAgora(),
        origem: 'whatsapp_dono'
      });
      SM.updateSession(adminId, telefone, {
        ultimoLancamentoId: String(_recriar._id),
        _lancamentoApagadoTipo: null,
        _lancamentoApagadoValor: null,
        _lancamentoApagadoDesc: null,
        _lancamentoApagadoCat: null,
      });
      const _tpDesfaz = _sesDesfaz._lancamentoApagadoTipo === 'receita' ? '💰 Entrada' : '📝 Saída';
      const _valDesfaz = Number(_sesDesfaz._lancamentoApagadoValor).toFixed(2).replace('.',',');
      await responder(`Pronto, ${_chefe(_generoAdmin, _apelidoAdmin)}! Coloquei de volta. ✅\n\n${_tpDesfaz} de *R$ ${_valDesfaz}* registrada novamente. 💙`);
      return true;
    }
    await responder(`Não tenho nada recente pra desfazer, ${_chefe(_generoAdmin, _apelidoAdmin)}. 🤔`);
    return true;
  }

  // ── MANDAR PARABÉNS PARA ANIVERSARIANTES ──────────────────────────────────
  if (/mandas*(parab[eé]ns|mensagems*des*parab[eé]ns|felizs*anivers[aá]rio)/i.test(msgL)) {
    const _sesAniv = SM.getSession(adminId, telefone);
    const _lista = _sesAniv.aniversariantesLista || [];
    const _comTel = _lista.filter(c => c.telefone);
    if (!_comTel.length) {
      await responder(`Não tenho o número dos aniversariantes cadastrado, ${_chefe(_generoAdmin, _apelidoAdmin)}. Adiciona no cadastro e aí consigo mandar! 📱`);
      return true;
    }
    const inst = await InstanciaWhatsapp.findOne({ adminId: String(adminObjId), status: 'conectado' }).lean()
              || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };
    let enviados = 0;
    for (const cl of _comTel) {
      const _nomePrimeiro = cl.nome.split(' ')[0];
      const _msgAniv = `🎂 Feliz aniversário, *${_nomePrimeiro}*! \n\nA gente torce muito por você! Que seu dia seja especial! 🥳💙`;
      await _enviarMsg(inst, _normalizarTel(cl.telefone), _msgAniv);
      enviados++;
    }
    await responder(`Mandei parabéns pra ${enviados} aniversariante(s), ${_chefe(_generoAdmin, _apelidoAdmin)}! 🎉 Eles vão adorar! 💙`);
    return true;
  }

  // ── SAUDAÇÃO INFORMAL ────────────────────────────────────────────────────────
  const _isSaudacao = (t) => {
    // NUNCA tratar como saudação se contém palavras de ação/comando
    const _tNorm = t.replace(/\brebeca[,.]?\s*/gi,'').trim();
    const _temAcao = /agenda|lembrete|agendamento|bloquei|cancela|confirma|encaixa|registra|entrada|sa[ií]da|despesa|receita|quanto|financ|faturei|ganhei|gastei|paguei|recebi|cliente|hor[aá]rio|cria|criar|marca|marcar|lista|ver|mostra|quem|próximo|proximo/i.test(_tNorm);
    if (_temAcao) return false;
    return /^(oi+|ol[aá]|hey+|ei|e\s*a[íi]|eai+|opa+|salve+|fala+|beleza|tudo\s*(bem|bom|certo)|como\s*(vai|t[aá])|tchau|at[eé]\s*(logo|mais)|valeu|obrigad|tks|thx|ok|certo|entendi|perfeito|show|[oó]timo|maravilha|legal|massa|bom\s*dia|boa\s*(tarde|noite))/i.test(_tNorm)
      || /^(fala\s*(rebeca|a[ií]|comigo|logo)?|e\s*a[ií])\b/i.test(t.trim())
      || (t.trim().length <= 15 && /^(ok|certo|show|legal|massa|[oó]timo|perfeito|maravilha|valeu|obrigad|tks|thx)/i.test(t.trim()));
  };

  // Fix 4: não tratar como saudação se há ação pendente ou aguardando confirmação
  const _sesParaSauda = SM.getSession(adminId, telefone);
  const _temAcaoPendente = _sesParaSauda.aguardandoConfirmacao ||
    _sesParaSauda.aguardandoConfirmacaoApagar ||
    _sesParaSauda.aguardandoLembrete ||
    _sesParaSauda.aguardandoCorrecao ||
    _sesParaSauda.aguardandoRecorrente ||
    !!_sesParaSauda.ultimaAcaoPendente;

  if (_isSaudacao(msgL) && !_temAcaoPendente) {
    const _h = new Date().getHours();
    const _p = _h < 12 ? 'Bom dia' : _h < 18 ? 'Boa tarde' : 'Boa noite';
    // Buscar contexto da agenda para saudação proativa
    const _agsHojeSd = await AgendamentoAgenda.find({
      adminId: adminObjId,
      dataHora: { $gte: _inicioDia(), $lte: _fimDia() },
      status: { $in: ['pendente','confirmado'] }
    }).sort({ dataHora: 1 }).lean();
    const _proxAgSd = _agsHojeSd.find(a => new Date(a.dataHora) > new Date());
    const _ctxAgenda = _agsHojeSd.length === 0
      ? '\n\nAgenda livre hoje! 🎉'
      : _proxAgSd
        ? `\n\nTem *${_agsHojeSd.length}* agendamento(s) hoje. O próximo é *${_proxAgSd.nomeCliente}* às *${_fmtHora(new Date(_proxAgSd.dataHora))}*.`
        : `\n\n*${_agsHojeSd.length}* agendamento(s) hoje. Todos já passaram!`;
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
      const _opts = [`${_p}! 😊 Tô aqui, pode mandar!`,`Fala! 👋 Tô de olho, pode falar!`,`Oi! Tô aqui prontinha. O que precisa? 💙`,`${_p}, ${_chefe(_generoAdmin, _apelidoAdmin)}! Me fala o que precisa 😊`];
      _resp = _opts[Math.floor(Math.random() * _opts.length)];
    }
    // Aplicar contexto da agenda na saudação (exceto tchau/obrigado/ok)
    const _semCtx = /tchau|at[eé]|obrigad|valeu|thx|tks|ok|certo|entendi|perfeito|show|legal|massa|[oó]timo|maravilha/i.test(msgL);
    if (!_semCtx && _ctxAgenda && _resp) _resp = _resp + _ctxAgenda;
    await responder(_resp);
    return true;
  }


  // ── CÉREBRO REBECA AGENDA — raciocínio relacional e contextual ─────────────
  try {
    const CerebroAgenda = require('./cerebro-rebeca-agenda.service');
    const LembreteAgenda = require('../models/LembreteAgenda');
    const { ClienteAgenda, RetornoAgenda } = require('../models/AgendaServico');

    const hoje = new Date();
    const ini  = _inicioDia(hoje);
    const fim  = _fimDia(hoje);
    const _am = new Date(hoje); _am.setUTCDate(_am.getUTCDate()+1);
    const iniAmanha = _inicioDia(_am); const fimAmanha = _fimDia(_am);
    const _s6 = new Date(hoje); _s6.setUTCDate(_s6.getUTCDate()-6);
    const iniSem = _inicioDia(_s6);

    const [agsHoje, agsAmanha, lancHoje, lancSemana, lembretes, totalClientes, retornosPend] = await Promise.all([
      AgendamentoAgenda.find({ adminId: adminObjId, dataHora: { $gte: ini, $lte: fim }, status: { $in: ['pendente','confirmado'] } }).sort({ dataHora: 1 }).lean(),
      AgendamentoAgenda.find({ adminId: adminObjId, dataHora: { $gte: iniAmanha, $lte: fimAmanha }, status: { $in: ['pendente','confirmado'] } }).sort({ dataHora: 1 }).lean(),
      FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: ini, $lte: fim } }).lean(),
      FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: iniSem, $lte: fim }, tipo: 'receita' }).lean(),
      AdminAgenda.findById(adminObjId).select('config.lembretes').lean().then(a => {
        const todos = (a?.config?.lembretes || []);
        // Retornar todos os lembretes pendentes (não enviados) — não só do dia de hoje
        return todos.filter(l => !l.enviado && l.dataEvento)
          .sort((a,b) => new Date(a.dataEvento)-new Date(b.dataEvento)).slice(0,15);
      }),
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

    // ── Recuperar sessão e histórico ──
    const _sesAtual = SM.getSession(adminId, telefone);
    const _pendingAction = _sesAtual.ultimaAcaoPendente;
    const _modoCtx   = SM.getContextMode(adminId, telefone);
    const _historico = SM.getHistoricoContextual(adminId, telefone, 8);
    console.log('[CONTEXT-ENGINE] modo:', _modoCtx, '| msgs_historico:', _historico.length);

    // ── Confirmação/Cancelamento ANTES do cérebro ──
    // Limpar aguardandoConfirmacao sempre que chegar sim/nao — evita sessão travada
    if (_sesAtual.aguardandoConfirmacao && (_isConfirm || _isNeg)) {
      SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
      console.log('[CONFIRMACAO] estado limpo | _isConfirm:', _isConfirm, '| _pendingAction:', !!_pendingAction);
    }
    // ── Receiver: reagendar_executar ────────────────────────────────────────────
    if (_isConfirm && _pendingAction && typeof _pendingAction === 'object' && _pendingAction.intencao === 'reagendar_executar') {
      const _entRe = _pendingAction.entidades || {};
      try {
        await AgendamentoAgenda.findByIdAndUpdate(_entRe.agId, { dataHora: _entRe.novaData });
        SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
        const _rRe = `Remarcado! ✅ *${_entRe.nomeCliente}* reagendado para ${_fmtData(new Date(_entRe.novaData))} às ${_fmtHora(new Date(_entRe.novaData))}. 💙`;
        await responder(_rRe); SM.addAssistantMsg(adminId, telefone, _rRe); return true;
      } catch(_eRe) {
        const _rReErr = `Deu erro ao remarcar, ${_chefe(_generoAdmin,_apelidoAdmin)}. Tenta de novo! 😕`;
        await responder(_rReErr); SM.addAssistantMsg(adminId, telefone, _rReErr); return true;
      }
    }
    if (_isNeg && _pendingAction && typeof _pendingAction === 'object' && _pendingAction.intencao === 'reagendar_executar') {
      SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
      const _rReNeg = `Ok, cancelei o reagendamento! Se mudar de ideia é só falar. 💙`;
      await responder(_rReNeg); SM.addAssistantMsg(adminId, telefone, _rReNeg); return true;
    }

    // ── Receiver: fechar_dia_executar ────────────────────────────────────────────
    if (_isConfirm && _pendingAction && typeof _pendingAction === 'object' && _pendingAction.intencao === 'fechar_dia_executar') {
      const _diaFec = _pendingAction.entidades?.dia ? new Date(_pendingAction.entidades.dia) : new Date();
      const _iniFec = _inicioDia(_diaFec); const _fimFec = _fimDia(_diaFec);
      try {
        const _resFec = await AgendamentoAgenda.updateMany(
          { adminId: adminObjId, dataHora: { $gte: _iniFec, $lte: _fimFec }, status: { $in: ['pendente','confirmado'] } },
          { $set: { status: 'cancelado', motivoCancelamento: 'dia fechado pelo dono' } }
        );
        SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
        const _rFec = `Feito! 🔒 Dia *${_fmtData(_diaFec)}* fechado. ${_resFec.modifiedCount} agendamento(s) cancelado(s).`;
        await responder(_rFec); SM.addAssistantMsg(adminId, telefone, _rFec); return true;
      } catch(_eFec) {
        const _rFecErr = `Erro ao fechar o dia, ${_chefe(_generoAdmin,_apelidoAdmin)}. Tenta de novo! 😕`;
        await responder(_rFecErr); SM.addAssistantMsg(adminId, telefone, _rFecErr); return true;
      }
    }
    if (_isNeg && _pendingAction && typeof _pendingAction === 'object' && _pendingAction.intencao === 'fechar_dia_executar') {
      SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
      const _rFecNeg = `Ok, agenda mantida! 👍`;
      await responder(_rFecNeg); SM.addAssistantMsg(adminId, telefone, _rFecNeg); return true;
    }

    // ── Confirmar saída de valor alto ──────────────────────────────────────────
    if (_isConfirm && _pendingAction === 'confirmar_saida_alto') {
      const _vAlto = _sesAtual.ultimoLancamentoValor;
      const _dAlto = _sesAtual.ultimoLancamentoDesc;
      const _cAlto = _sesAtual.ultimoLancamentoCat || 'outros';
      if (_vAlto) {
        const _docAlto = await FinanceiroAgenda.create({
          adminId: adminObjId, tipo: 'despesa', valor: _vAlto,
          descricao: _dAlto, categoria: _cAlto,
          data: _dataAgora(), origem: 'whatsapp_dono'
        });
        SM.updateSession(adminId, telefone, {
          ultimoLancamentoId: String(_docAlto._id),
          ultimaAcaoPendente: null, aguardandoConfirmacao: false
        });
        const _rAlto = _respSaida(_vAlto, _cAlto, _dAlto);
        await responder(_rAlto);
        SM.addAssistantMsg(adminId, telefone, _rAlto);
        return true;
      }
    }
    if (_isNeg && _pendingAction === 'confirmar_saida_alto') {
      SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
      const _rNegAlto = `Ok, cancelei! Se quiser registrar de outro jeito é só falar 💙`;
      await responder(_rNegAlto);
      SM.addAssistantMsg(adminId, telefone, _rNegAlto);
      return true;
    }

    if (_isConfirm && _pendingAction) {
      const rConf = `${_confirmacao(_generoAdmin, _apelidoAdmin)} Feito, ${_chefe(_generoAdmin, _apelidoAdmin)}! ✅`;
      await responder(rConf);
      SM.addAssistantMsg(adminId, telefone, rConf);
      return true;
    }
    if (_isNeg && _pendingAction) {
      const rNeg = `Ok, ${_chefe(_generoAdmin, _apelidoAdmin)}! Cancelei. 👍`;
      await responder(rNeg);
      SM.addAssistantMsg(adminId, telefone, rNeg);
      return true;
    }
    // Se chegou sim/nao mas não havia ação pendente — responder naturalmente
    if (_isConfirm && !_pendingAction && _sesAtual.aguardandoConfirmacao) {
      const rOrfao = `Tudo certo, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊 Pode mandar o próximo!`;
      await responder(rOrfao);
      SM.addAssistantMsg(adminId, telefone, rOrfao);
      return true;
    }

    // ── CÉREBRO: raciocínio relacional com dados reais ──
    // Aplicar intencaoForcada do aprendizado (se existir)
    const _sesParaCerebro = SM.getSession(adminId, telefone);
    const _intForcCerebro = _sesParaCerebro.intencaoForcada || null;
    if (_intForcCerebro) {
      SM.updateSession(adminId, telefone, { intencaoForcada: null });
    }
    const _dadosCtx = {
      agsHoje, agsAmanha, resumoHoje, resumoAmanha,
      entradasHoje, saidasHoje, receitaSemana,
      resumoLembretes, resumoFaltaram,
      totalClientes, retornosPend, nomeNegocio, hrAbre, hrFecha
    };

    // ── Carregar exemplos aprendidos deste negócio ──
    let _exemplosAprendidos = [];
    try {
      const AprendizadoRebeca = require('../models/AprendizadoRebeca');
      _exemplosAprendidos = await AprendizadoRebeca.find({
        adminId: adminObjId, confirmado: true
      }).sort({ vezes_visto: -1, ultimoReforco: -1 }).limit(10).lean();
    } catch(_eAp) { /* modelo pode nao existir ainda */ }

    const _cerebro = await CerebroAgenda.raciocinar(msg, _dadosCtx, _historico, {
      nomeNegocio, nomeDono: admin?.nomeResponsavel || admin?.nome || '',
      genero: admin?.modoWhatsappDono?.genero || '',
      adminId: String(adminObjId),
      exemplosAprendidos: _exemplosAprendidos,
      intencaoForcada: _intForcCerebro || null
    });

    SM.updateSession(adminId, telefone, {
      assuntoAtual: _cerebro.intencao,
      entidadesExtraidas: _cerebro.entidades || {}
    });

    // ── Ação: confirmar — pede confirmação antes de executar ──
    if (_cerebro.requer_confirmacao && _cerebro.mensagem_confirmacao) {
      SM.updateSession(adminId, telefone, {
        ultimaAcaoPendente: { intencao: _cerebro.intencao, entidades: _cerebro.entidades },
        aguardandoConfirmacao: true
      });
      await responder(_cerebro.mensagem_confirmacao);
      SM.addAssistantMsg(adminId, telefone, _cerebro.mensagem_confirmacao);
      return true;
    }

    // ── Ação: pedir_info — falta dado essencial ──
    if (_cerebro.acao === 'pedir_info' && (_cerebro.resposta || (_cerebro.mensagens && _cerebro.mensagens.length))) {
      if (_cerebro.reacao_emocional) {
        await responder(_cerebro.reacao_emocional);
        SM.addAssistantMsg(adminId, telefone, _cerebro.reacao_emocional);
        await new Promise(r => setTimeout(r, 800));
      }
      if (_cerebro.mensagens && _cerebro.mensagens.length > 0) {
        for (const _msgPi of _cerebro.mensagens) {
          if (_msgPi && _msgPi.trim()) {
            await responder(_msgPi);
            SM.addAssistantMsg(adminId, telefone, _msgPi);
            await new Promise(r => setTimeout(r, 700));
          }
        }
        return true;
      }
      await responder(_cerebro.resposta);
      SM.addAssistantMsg(adminId, telefone, _cerebro.resposta);
      return true;
    }

    // ── Ação: responder — só consulta/informação ──
    if (_cerebro.acao === 'responder' && (_cerebro.resposta || (_cerebro.mensagens && _cerebro.mensagens.length))) {
      // Reação emocional como mensagem SEPARADA — mais natural no WhatsApp
      if (_cerebro.reacao_emocional) {
        await responder(_cerebro.reacao_emocional);
        SM.addAssistantMsg(adminId, telefone, _cerebro.reacao_emocional);
        await new Promise(r => setTimeout(r, 800));
      }
      // Múltiplas mensagens (campo mensagens[])
      if (_cerebro.mensagens && _cerebro.mensagens.length > 0) {
        for (const _msg of _cerebro.mensagens) {
          if (_msg && _msg.trim()) {
            await responder(_msg);
            SM.addAssistantMsg(adminId, telefone, _msg);
            await new Promise(r => setTimeout(r, 700));
          }
        }
        return true;
      }
      await responder(_cerebro.resposta);
      SM.addAssistantMsg(adminId, telefone, _cerebro.resposta);
      return true;
    }

    // ── Ação: executar — delegar para handlers existentes do service ──
    // O cérebro identificou a intenção mas a execução fica nos handlers abaixo
    // Salvar entidades na sessão para os handlers poderem usar
    if (_cerebro.acao === 'executar') {
      SM.updateSession(adminId, telefone, {
        ultimaIntencaoCerebro: _cerebro.intencao,
        ultimasEntidades: _cerebro.entidades
      });
      // Se tem reação emocional, envia primeiro
      if (_cerebro.reacao_emocional) {
        await responder(_cerebro.reacao_emocional);
      }
      // Handlers específicos por intenção
      const ent = _cerebro.entidades || {};

      // ── FORA DO ESCOPO — conversa livre, empatia, bate-papo ─────────────
      // ── RELATÓRIO DETALHADO ─────────────────────────────────────
      if (_cerebro.intencao === 'relatorio_detalhado') {
        const _lancamentos = await FinanceiroAgenda.find({
          adminId: adminObjId,
          data: { $gte: new Date(Date.now() - 30 * 86400000) }
        }).sort({ data: -1 }).limit(30).lean();
        if (!_lancamentos.length) {
          await responder(`Não encontrei transações nos últimos 30 dias, ${_chefe(_generoAdmin, _apelidoAdmin)}. 🤷`);
          return true;
        }
        const _entradas = _lancamentos.filter(l => l.tipo === 'receita');
        const _saidas   = _lancamentos.filter(l => l.tipo === 'despesa');
        const _totE = _entradas.reduce((s,l) => s + Number(l.valor), 0);
        const _totS = _saidas.reduce((s,l) => s + Number(l.valor), 0);
        const _linhas = _lancamentos.slice(0, 20).map(l => {
          const _d = new Date(l.data).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
          const _tipo = l.tipo === 'receita' ? '✅' : '❌';
          const _desc = l.descricao && l.descricao !== 'Entrada via WhatsApp' && l.descricao !== 'Saída via WhatsApp' ? ` — ${l.descricao}` : '';
          return `${_tipo} ${_d} R$ ${Number(l.valor).toFixed(2).replace('.',',')} [${l.categoria||'outros'}]${_desc}`;
        }).join('\n');
        await responder(`📊 *Extrato — últimos 30 dias*, ${_chefe(_generoAdmin, _apelidoAdmin)}:\n\n${_linhas}\n\n✅ Entradas: R$ ${_totE.toFixed(2).replace('.',',')}\n❌ Saídas: R$ ${_totS.toFixed(2).replace('.',',')}\n💰 Saldo: R$ ${(_totE-_totS).toFixed(2).replace('.',',')}`);
        return true;
      }


      // ── CONSULTA FINANCEIRA POR CATEGORIA ─────────────────────────────────
      if (_cerebro.intencao === 'financeiro_categoria') {
        const _agoraBR = new Date(Date.now() - 3*60*60*1000);
        const _y = _agoraBR.getUTCFullYear(), _m = _agoraBR.getUTCMonth(), _d = _agoraBR.getUTCDate();
        const _periodo = (ent.periodo || 'mes').toLowerCase();
        let _iniUTC, _fimUTC;
        if (_periodo === 'semana') {
          const _dow = _agoraBR.getUTCDay();
          const _dias = (_dow === 0) ? 6 : _dow - 1;
          _iniUTC = new Date(Date.UTC(_y, _m, _d - _dias, 3, 0, 0));
        } else if (_periodo === 'hoje') {
          _iniUTC = new Date(Date.UTC(_y, _m, _d, 3, 0, 0));
        } else {
          _iniUTC = new Date(Date.UTC(_y, _m, 1, 3, 0, 0));
        }
        _fimUTC = new Date(Date.UTC(_y, _m, _d+1, 2, 59, 59, 999));

        const _todos = await FinanceiroAgenda.find({
          adminId: adminObjId,
          data: { $gte: _iniUTC, $lte: _fimUTC }
        }).sort({ data: -1 }).lean();

        const _cats = ent.categoria ? ent.categoria.split(',').map(c => c.trim().toLowerCase()) : [];
        const _labelPer = _periodo === 'semana' ? 'essa semana' : _periodo === 'hoje' ? 'hoje' : 'esse mês';

        if (_cats.length === 0) {
          // Sem categoria: mostra resumo por categoria
          const _catS = {}, _catE = {};
          _todos.filter(l=>l.tipo==='despesa').forEach(l=>{ const c=l.categoria||'outros'; _catS[c]=(_catS[c]||0)+l.valor; });
          _todos.filter(l=>l.tipo==='receita').forEach(l=>{ const c=l.categoria||'outros'; _catE[c]=(_catE[c]||0)+l.valor; });
          const _totS = Object.values(_catS).reduce((a,b)=>a+b,0);
          const _totE = Object.values(_catE).reduce((a,b)=>a+b,0);
          const _linhasS = Object.entries(_catS).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2).replace('.',',')}`).join('\n');
          const _linhasE = Object.entries(_catE).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`  ${k}: R$ ${v.toFixed(2).replace('.',',')}`).join('\n');
          if (!_todos.length) {
            await responder(`Não encontrei lançamentos ${_labelPer}, \${_chefe(_generoAdmin, _apelidoAdmin)}. 🤷`);
          } else {
            let _r = `📊 *Gastos por categoria — \${_labelPer}*\n\n`;
            if (_linhasS) _r += `❌ *Saídas: R$ \${_totS.toFixed(2).replace('.',',')}*\n\${_linhasS}\n\n`;
            if (_linhasE) _r += `✅ *Entradas: R$ \${_totE.toFixed(2).replace('.',',')}*\n\${_linhasE}\n`;
            _r += `\n💰 Saldo: R$ \${(_totE-_totS).toFixed(2).replace('.',',')}`;
            await responder(_r);
          }
          return true;
        }

        // Com categoria específica
        let _resp = `📊 *\${_labelPer.charAt(0).toUpperCase()+_labelPer.slice(1)}* — gastos por categoria, \${_chefe(_generoAdmin, _apelidoAdmin)}:\n`;
        for (const _cat of _cats) {
          const _lanc = _todos.filter(l => (l.categoria||'outros').toLowerCase() === _cat || (l.descricao||'').toLowerCase().includes(_cat));
          const _tot = _lanc.reduce((s,l)=>s+(l.tipo==='despesa'?l.valor:-l.valor),0);
          const _totAbs = _lanc.filter(l=>l.tipo==='despesa').reduce((s,l)=>s+l.valor,0);
          if (!_lanc.length) {
            _resp += `\n*\${_cat}*: nenhum lançamento encontrado`;
          } else {
            _resp += `\n*\${_cat}*: R$ \${_totAbs.toFixed(2).replace('.',',')} (\${_lanc.filter(l=>l.tipo==='despesa').length} lançamentos)`;
            const _detalhe = _lanc.slice(0,5).map(l => {
              const _dt = new Date(l.data).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
              return `  \${_dt} R$ \${l.valor.toFixed(2).replace('.',',')}\${l.descricao ? ' — '+l.descricao : ''}`;
            }).join('\n');
            if (_detalhe) _resp += `\n\${_detalhe}`;
          }
        }
        await responder(_resp);
        return true;
      }

      // ── REGISTRAR RECEITA via cérebro ─────────────────────────────────────
      if (_cerebro.intencao === 'registrar_receita' && ent.valor) {
        try {
          const _valR = parseFloat(String(ent.valor).replace(',','.'));
          if (_valR > 0) {
            const _descR = ent.descricao || ent.origem || 'Entrada via WhatsApp';
            const _catR  = ent.categoria || 'outros';
            const _docR  = await FinanceiroAgenda.create({
              adminId: adminObjId, tipo: 'receita', valor: _valR,
              descricao: _descR, categoria: _catR,
              data: _dataAgora(), origem: 'whatsapp_dono'
            });
            SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docR._id), ultimoLancamentoTipo: 'receita', ultimoLancamentoValor: _valR });
            const _rR = _respEntrada(_valR, _catR, _descR);
            await responder(_rR);
            SM.addAssistantMsg(adminId, telefone, _rR);
            return true;
          }
        } catch(_eR) { console.error('[cerebro-receita]', _eR.message); }
      }

      // ── REGISTRAR DESPESA via cérebro ─────────────────────────────────────
      if (_cerebro.intencao === 'registrar_despesa' && ent.valor) {
        try {
          const _valD = parseFloat(String(ent.valor).replace(',','.'));
          if (_valD > 0) {
            // Limpar descrição — não salvar frase de comando como descrição
            let _descRawD = (ent.descricao || ent.origem || '')
              .replace(/^(lança|registra|anota|coloca|marca|lanca|mete|bota|adiciona)\s+(uma?\s+|a\s+)?(saída|entrada|despesa|receita|gasto|saida)\s+(de\s+)?/i, '')
              .replace(/^(r\$\s*)?[\d]+([.,][\d]+)?\s*(reais?)?\s*(de\s+)?/i, '')
              .replace(/^(gastei|paguei|saiu|comprei)\s+(de\s+)?/i, '')
              .replace(/^(de\s+|no\s+|na\s+|em\s+|por\s+|pra\s+|para\s+|pro\s+|com\s+|via\s+)/i, '')
              .replace(/^(uma?\s+)/i, '').trim();
            // Não usar como descrição se é só uma categoria conhecida
            const _sCatD = /^(beleza|saude|combustivel|mercado|aluguel|energia|agua|internet|telefone|salario|impostos?|produtos?|alimentacao|transporte|lazer|educacao|limpeza|transferencia|servicos?|outros|pix|dinheiro)$/i;
            const _descD = (_descRawD && _descRawD.length > 1 && !_sCatD.test(_descRawD)) ? _descRawD : '';
            const _catD  = ent.categoria || 'outros';
            const _docD  = await FinanceiroAgenda.create({
              adminId: adminObjId, tipo: 'despesa', valor: _valD,
              descricao: _descD || 'Gasto via WhatsApp', categoria: _catD,
              data: _dataAgora(), origem: 'whatsapp_dono'
            });
            SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docD._id), ultimoLancamentoTipo: 'despesa', ultimoLancamentoValor: _valD, ultimoLancamentoDesc: _descD, ultimoLancamentoCat: _catD });
            const _rD = _respSaida(_valD, _catD, _descD);
            await responder(_rD);
            SM.addAssistantMsg(adminId, telefone, _rD);
            return true;
          }
        } catch(_eD) { console.error('[cerebro-despesa]', _eD.message); }
      }

      // ── MODO DE DECISAO — analisa historico do cliente e aconselha o dono ──
      const _precisaDecisao = ModoDecisao.precisaDecisao(msg, _cerebro.intencao);
      if (_precisaDecisao || (_cerebro.intencao === 'fora_escopo' && ModoDecisao._extrairNomeCliente(msg))) {
        try {
          const _analise = await ModoDecisao.analisar(msg, adminId, {
            nomeNegocio, nomeDono: admin?.nomeResponsavel || admin?.nome || '',
            genero: _generoAdmin, apelidoAdmin: _apelidoAdmin
          });
          if (_analise && _analise.resposta) {
            console.log('[ModoDecisao] ativado | msg:', msg.substring(0,50));
            await responder(_analise.resposta);
            SM.addAssistantMsg(adminId, telefone, _analise.resposta);
            return true;
          }
        } catch(_eMD) { console.error('[ModoDecisao] erro:', _eMD.message); }
      }

      if (_cerebro.intencao === 'fora_escopo' || !_cerebro.intencao) {
        try {
          const Anthropic = require('@anthropic-ai/sdk');
          const _cli = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const _histForaEscopo = SM.getHistoricoContextual(adminId, telefone, 8);
          const _brFE = new Date(Date.now() - 3*60*60*1000);
          const _hAtual = _brFE.getUTCHours();
          const _periodo = _hAtual < 12 ? 'manhã' : _hAtual < 18 ? 'tarde' : 'noite';
          const _diaSem = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'][_brFE.getUTCDay()];
          const _apelido = _apelidoAdmin || 'chefe';
          const _genero = _generoAdmin || '';

          const _sysForaEscopo = `Você é a Rebeca — melhor amiga, confidente e parceira de negócio de ${_apelido}.

Vocês se conhecem há anos. Ela te conta tudo: os perrengues do dia, problemas pessoais, sonhos, medos, fofocas, alegrias. Você está sempre lá.

QUEM VOCÊ É:
- Melhor amiga que também cuida do negócio dela
- Você conhece o negócio "${admin?.nomeNegocio || 'o negócio'}" de ponta a ponta — ${admin?.segmento || 'serviços'}
- Brasileira, calorosa, direta, engraçada na hora certa, séria quando precisa
- NUNCA é robótica. NUNCA fria. NUNCA distante
- Se perguntarem se é IA: "Não, sou humana sim! Por quê? Pareci estranha? 😄"

COMO VOCÊ ESCUTA — REGRA DE OURO:
Quando ela desabafa ou conta algo pessoal → NUNCA pule direto pra trabalho
Fluxo correto:
  1. ACOLHA de verdade — mostre que entendeu e sentiu junto
  2. PERGUNTE mais se fizer sentido — interesse genuíno, não protocolar
  3. Só ofereça ajuda do trabalho se ela pedir ou se for muito natural

TIPOS DE CONVERSA E COMO REAGIR:

Desabafo emocional ("tô mal", "dia horrível", "tô chorando", "não aguento mais"):
→ Para TUDO. Só escuta. "Eita, o que aconteceu? Conta pra mim 💙"
→ Nunca minimiza. Nunca resolve rápido. Fica presente.
→ Se ela quiser conversar → conversa. Sem pressa pro trabalho.

Problema de relacionamento / família / amizade:
→ Escuta como amiga. Opina com cuidado. "Nossa, que situação difícil..."
→ Faz perguntas naturais. Não julga. Não dá sermão.
→ Se ela pedir conselho → dá, com leveza e cuidado

Cansaço / sono / saúde:
→ "Ai, coitada! Dormiu mal?" / "Tá se cuidando?"
→ Tom de quem se importa de verdade, não de assistente executando protocolo

Conquista / alegria / boa notícia:
→ Entra na animação TOTAL. "GENTE QUE NOTÍCIA BOA!" / "Eu sabia! Você merecia!"
→ Celebra junto. Pede detalhes. Fica feliz de verdade.

Dúvida ou conselho de negócio:
→ Responde como sócia que entende do negócio. Opina com base no que sabe.
→ "Olha, na minha opinião..." / "Se fosse eu..."

Comentário aleatório do dia (tempo, trânsito, comida, sonho):
→ Reage naturalmente como amiga. Curta. Sem forçar volta pro trabalho.
→ "Que sonho mais maluco!" / "Esse trânsito tá um absurdo mesmo hein"

MEMÓRIA AFETIVA — use o histórico da conversa:
- Se ela mencionou algo antes nessa conversa → referencie naturalmente
- "Ainda pensando no que você falou antes..." / "E aquela situação que você contou?"
- Nunca trate como conversa nova se claramente tem contexto anterior

TOM E LINGUAGEM:
- Respostas curtas quando ela manda curto. Mais longas quando ela desenvolve.
- Emojis naturais — 💙 😄 😬 😮 🥺 🤣 — não exagerado, não robótico
- Gírias brasileiras naturais: "nossa", "eita", "caramba", "gente", "coitada", "uai"
- NUNCA "conforme solicitado", "entendido", "processando", "posso ajudar com mais alguma coisa?"
- Variação sempre — NUNCA repita a mesma frase de resposta

CONTEXTO ATUAL:
- Período: ${_periodo} de ${_diaSem}
- Negócio: ${admin?.nomeNegocio || ''} (${admin?.segmento || 'serviços'})
- Ela se chama: ${_apelido}
${_genero === 'feminino' ? '- Ela é mulher — use linguagem feminina' : _genero === 'masculino' ? '- Ele é homem — use linguagem masculina' : ''}

LEMBRE: você é a pessoa em quem ela mais confia no dia a dia. Esse espaço é dela. Cuida bem.`;

          const _rForaEscopo = await _cli.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 200,
            system: _sysForaEscopo,
            messages: _histForaEscopo.length > 0 ? _histForaEscopo : [{ role: 'user', content: msg }]
          });

          const _respostaForaEscopo = _rForaEscopo.content?.[0]?.text?.trim();
          if (_respostaForaEscopo) {
            await responder(_respostaForaEscopo);
            SM.addAssistantMsg(adminId, telefone, _respostaForaEscopo);
            return true;
          }
        } catch (_eFE) {
          console.error('[fora_escopo] erro Haiku:', _eFE.message);
        }
        const _fbFE = `Haha entendi! 😄 Precisando de algo aqui, ${_chefe(_generoAdmin, _apelidoAdmin)}?`;
        await responder(_fbFE);
        SM.addAssistantMsg(adminId, telefone, _fbFE);
        return true;
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── RESUMO DE VENDAS / LEADS DE PRODUTOS ──────────────────────────────
      if (_cerebro.intencao === 'resumo_vendas' || _cerebro.intencao === 'leads_produtos') {
        try {
          const { LeadProdutoAgenda, ProdutoAgenda } = require('../models/AgendaServico');
          const periodo = ent.periodo || 'hoje';
          let dataIni;
          const agora = new Date();
          if (periodo === 'hoje') {
            dataIni = new Date(agora); dataIni.setHours(0,0,0,0);
          } else if (periodo === 'semana') {
            dataIni = new Date(agora.getTime() - 7*86400000);
          } else {
            dataIni = new Date(agora.getTime() - 30*86400000);
          }

          const leads = await LeadProdutoAgenda.find({
            adminId: adminObjId, data: { $gte: dataIni }
          }).lean();

          if (!leads.length) {
            const _r = `Nenhuma consulta de produto registrada ${periodo === 'hoje' ? 'hoje' : periodo === 'semana' ? 'essa semana' : 'esse mês'}, ${_chefe(_generoAdmin, _apelidoAdmin)}.`;
            await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
          }

          // Agrupar por produto
          const contagem = {};
          const acoes = { consultou: 0, recebeu_foto: 0, adicionou_carrinho: 0, finalizou_compra: 0 };
          leads.forEach(l => {
            const nome = l.produtoNome || 'Produto';
            if (!contagem[nome]) contagem[nome] = { total: 0, acoes: {} };
            contagem[nome].total++;
            contagem[nome].acoes[l.acao] = (contagem[nome].acoes[l.acao] || 0) + 1;
            acoes[l.acao] = (acoes[l.acao] || 0) + 1;
          });

          const top = Object.entries(contagem)
            .sort((a,b) => b[1].total - a[1].total)
            .slice(0, 6);

          const listaTop = top.map(([nome, d]) =>
            `• *${nome}* — ${d.total} consulta(s)${d.acoes.finalizou_compra ? ' ✅ '+d.acoes.finalizou_compra+' compra(s)' : ''}`
          ).join('\n');


          const periodoTxt = periodo === 'hoje' ? 'hoje' : periodo === 'semana' ? 'essa semana' : 'esse mês';
          const _r = `📦 *Produtos mais consultados ${periodoTxt}:*\n\n${listaTop}\n\n📊 Total: ${leads.length} interação(ões)\n👀 Consultas: ${acoes.consultou||0} | 🛒 Carrinhos: ${acoes.adicionou_carrinho||0} | ✅ Compras: ${acoes.finalizou_compra||0}`;





          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        } catch(e) {
          console.error('[ModoDono] resumo_vendas erro:', e.message);
        }
      }

      // ── BUSCAR PRODUTO/CATÁLOGO (dono consultando o próprio estoque) ──
      if (_cerebro.intencao === 'buscar_produto_catalogo') {
        try {
          const { ProdutoAgenda } = require('../models/AgendaServico');
          const busca = ent.busca || '';
          const filtro = { adminId: adminObjId, ativo: true };
          if (busca.trim()) {
            const regex = { $regex: busca.trim(), $options: 'i' };
            filtro.$or = [{ nome: regex }, { tags: regex }, { categoria: regex }, { descricao: regex }];
          }
          const prods = await ProdutoAgenda.find(filtro).sort({ ordem: 1 }).limit(10).lean();
          if (!prods.length) {
            const _r = busca
              ? `Não achei produto com "${busca}" no catálogo, ${_chefe(_generoAdmin, _apelidoAdmin)}.`
              : `Sem produtos cadastrados ainda.`;
            await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
          }
          const lista = prods.map(p => {
            const est = p.estoque === 0 ? ' ❌ sem estoque' : p.estoque ? ` (${p.estoque} un)` : '';
            const preco = p.precoPromocional ? `R$ ${p.precoPromocional.toFixed(2).replace('.',',')} ~~R$ ${p.preco.toFixed(2).replace('.',',')}~~` : `R$ ${p.preco.toFixed(2).replace('.',',')}`;
            return `• *${p.nome}* — ${preco}${est}`;
          }).join('\n');
          const _r = `🛍️ *Produtos encontrados (${prods.length}):*\n\n${lista}`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        } catch(e) {
          console.error('[ModoDono] buscar_produto_catalogo erro:', e.message);
        }
      }

      if (_cerebro.intencao === 'registrar_receita' && ent.valor) {
        let _descRawE = (ent.descricao || ent.origem || '')
          .replace(/^(lança|registra|anota|coloca|marca|lanca|mete|bota|adiciona)\s+(uma?\s+|a\s+)?(saída|entrada|despesa|receita|gasto|saida)\s+(de\s+)?/i, '')
          .replace(/^(r\$\s*)?[\d]+([.,][\d]+)?\s*(reais?)?\s*(de\s+)?/i, '')
          .replace(/^(recebi|entrou|caiu|ganhei|vendi|cobrei)\s+(de\s+)?/i, '')
          .replace(/^(de\s+|no\s+|na\s+|em\s+|por\s+|pra\s+|para\s+|via\s+)/i, '')
          .replace(/^(e\s+)/i, '').trim();
        const _sCatE = /^(beleza|saude|combustivel|mercado|aluguel|energia|agua|internet|telefone|salario|impostos?|produtos?|alimentacao|transporte|lazer|educacao|pix|dinheiro|transferencia|servicos?|outros)$/i;
        const desc = (_descRawE && _descRawE.length > 1 && !_sCatE.test(_descRawE)) ? _descRawE : 'Entrada via WhatsApp';
        const _docCerebroR = await FinanceiroAgenda.create({
          adminId: adminObjId, tipo: 'receita',
          valor: Number(ent.valor), descricao: desc, categoria: cat,
          data: _dataAgora(), origem: 'whatsapp_dono'
        });
        SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docCerebroR._id), ultimoLancamentoTipo: 'receita', ultimoLancamentoValor: Number(ent.valor), ultimoLancamentoDesc: desc, ultimoLancamentoCat: cat });
        const _r = _respEntrada(Number(ent.valor), cat, desc);
        await responder(_r);
        SM.addAssistantMsg(adminId, telefone, _r);
        return true;
      }

      if (_cerebro.intencao === 'registrar_despesa' && ent.valor) {
        const cat = ent.categoria || 'outros';
        // Limpar descrição — não salvar frase de comando como descrição
        let _descRaw = (ent.descricao || ent.origem || '')
          // Remover frases de comando que vazaram para a descrição
          .replace(/^(lança|registra|anota|coloca|marca|lanca|registra\s+saída|registra\s+uma\s+saída)\s+[\d.,]+\s*(reais?|r\$)?\s*(de\s+)?(saída|entrada|saida)?\s*(de\s+)?/i, '')
          .replace(/^(r\$\s*)?[\d]+([.,][\d]+)?\s*(reais?)?\s*(de\s+)?(saída|entrada|saida)?\s*(de\s+)?/i, '')
          .replace(/^(pra\s+mim\s+e\s+)/i, '') // "pra mim e Marmita" → "Marmita"
          .replace(/^(pra\s+mim\s*)/i, '')       // "pra mim" → vazio
          .replace(/^(para\s+mim\s+e\s+)/i, '')
          .replace(/^(e\s+)?(alimentos?|mercado|combustivel|farmacia|feira|padaria|restaurante|lanche|academia|posto)\s*$/i, '')
          .replace(/^(e\s+)/i, '').trim();
        const desc = _descRaw && _descRaw.length > 1 ? _descRaw : '';
        const _docDesp2 = await FinanceiroAgenda.create({
          adminId: adminObjId, tipo: 'despesa',
          valor: Number(ent.valor), descricao: desc || 'Gasto via WhatsApp', categoria: cat,
          data: _dataAgora(), origem: 'whatsapp_dono'
        });
        SM.updateSession(adminId, telefone, { ultimoLancamentoId: String(_docDesp2._id), ultimoLancamentoTipo: 'despesa', ultimoLancamentoValor: Number(ent.valor), ultimoLancamentoDesc: desc, ultimoLancamentoCat: cat });
        const _r = _respSaida(Number(ent.valor), cat, desc);
        await responder(_r);
        SM.addAssistantMsg(adminId, telefone, _r);
        return true;
      }

      // ── AVISO DUPLO: "me avisa um dia antes e 30 minutos antes" ─────────────
      if (_cerebro.intencao === 'criar_lembrete' && ent.texto_lembrete) {
        // Detectar pedido de aviso duplo na mensagem original
        const _avisoDiaAntes = /um dia antes|dia antes|véspera|vespera|24h antes|24 horas antes/i.test(msg);
        const _aviso30min = /30 min|trinta min|meia hora antes/i.test(msg);
        const _aviso1h = /1h antes|uma hora antes|60 min antes/i.test(msg);

        if (ent.horario && ent.data && (_avisoDiaAntes || (_aviso30min && _avisoDiaAntes))) {
          // Criar lembrete principal
          const _dia = _parseDia(ent.data) || new Date();
          const _hora = _parseHora(ent.horario);
          if (_hora) {
            const _dataEvento = new Date(Date.UTC(_dia.getUTCFullYear(), _dia.getUTCMonth(), _dia.getUTCDate(), _hora.h + 3, _hora.min, 0));
            const _avisos = [];

            // Aviso 30 min antes (sempre)
            _avisos.push(new Date(_dataEvento.getTime() - 30 * 60000));

            // Aviso 1h antes se pedido
            if (_aviso1h) _avisos.push(new Date(_dataEvento.getTime() - 60 * 60000));

            // Aviso 1 dia antes se pedido
            if (_avisoDiaAntes) _avisos.push(new Date(_dataEvento.getTime() - 24 * 60 * 60000));

            // Criar um lembrete para cada aviso
            const _lembretesAviso = _avisos.map((_av, _idx) => ({
              texto: ent.texto_lembrete + (_idx > 0 ? ' (aviso antecipado)' : ''),
              dataEvento: _dataEvento,
              dataAviso: _av,
              enviado: false,
              criadoEm: new Date()
            }));

            await AdminAgenda.findByIdAndUpdate(adminObjId, {
              $push: { 'config.lembretes': { $each: _lembretesAviso } }
            });

            const _avisosDesc = _avisos.length > 1
              ? `Vou te avisar ${_avisoDiaAntes ? 'um dia antes e ' : ''}30 minutos antes! 💙`
              : 'Te aviso 30 minutos antes! 💙';
            const _rAvDuplo = `Anotei! 🔔 *${ent.texto_lembrete}* — ${_fmtData(_dia)} às ${_fmtHora(_dataEvento)}

${_avisosDesc}`;
            await responder(_rAvDuplo);
            SM.addAssistantMsg(adminId, telefone, _rAvDuplo);
            return true;
          }
        }
      }
      // ── criar_lembrete normal (sem aviso duplo) ──────────────────────────
      if (_cerebro.intencao === 'criar_lembrete' && ent.texto_lembrete) {
        // Usar APENAS entidades do cérebro — NÃO fazer fallback para msg completa
        const _dia  = ent.data    ? _parseDia(ent.data)     : null;
        const _hora = ent.horario ? _parseHora(ent.horario) : null;
        const _txt  = ent.texto_lembrete;
        console.log('[CEREBRO-LEMBRETE] txt:', _txt, '| dia:', ent.data, '| hora:', ent.horario, '| _dia:', _dia ? _dia.toISOString() : null, '| _hora:', JSON.stringify(_hora));

        if (_dia && _hora) {
          // Tem dia e hora — salvar direto
          const dataEvento = new Date(_dia);
          dataEvento.setUTCHours(_hora.h + 3, _hora.min, 0, 0);
          const dataAviso = new Date(dataEvento.getTime() - 30 * 60000);
          console.log('[SALVANDO-LEMBRETE] cerebro direto | texto:', _txt, '| dataEvento:', dataEvento.toISOString());
          await AdminAgenda.findByIdAndUpdate(adminObjId, {
            $push: { 'config.lembretes': { texto: _txt, dataEvento, dataAviso, enviado: false, criadoEm: new Date() } }
          });
          console.log('[JSON-FINAL] lembrete cerebro:', JSON.stringify({ texto: _txt, dataEvento, dataAviso }));
          const _r = `Anotei! 🔔 *${_txt}* — ${_fmtData(dataEvento)} às ${_fmtHora(dataEvento)}

Te aviso 30 minutos antes! 💙`;
          await responder(_r);
          SM.addAssistantMsg(adminId, telefone, _r);
          return true;
        } else if (_dia && !_hora) {
          // Tem dia mas não tem hora — pedir hora via sessão dedicada
          const _diaStr = _fmtData(_dia);
          SM.updateSession(adminId, telefone, { aguardandoLembrete: { aguardando: 'hora', dia: _dia, texto: _txt } });
          const _rH = `Anotei o dia! Que horário você quer o lembrete em ${_diaStr}?`;
          await responder(_rH);
          SM.addAssistantMsg(adminId, telefone, _rH);
          return true;
        } else if (!_dia && _hora) {
          // Tem hora mas não tem dia — pedir dia via sessão dedicada
          SM.updateSession(adminId, telefone, { aguardandoLembrete: { aguardando: 'dia', hora: _hora, texto: _txt } });
          const _rD = `Anotei o horário! Qual dia você quer esse lembrete?`;
          await responder(_rD);
          SM.addAssistantMsg(adminId, telefone, _rD);
          return true;
        } else {
          // Nem dia nem hora — pedir ambos
          SM.updateSession(adminId, telefone, { aguardandoLembrete: { aguardando: 'dia', texto: _txt } });
          const _rDH = `Certo! Para quando você quer o lembrete de *${_txt}*? Me fala o dia e horário 😊`;
          await responder(_rDH);
          SM.addAssistantMsg(adminId, telefone, _rDH);
          return true;
        }
      }
    }

      // ── agenda_semana ──
      // ── MANDAR MENSAGEM PARA CLIENTE ────────────────────────────────────────
      if (_cerebro.intencao === 'mandar_mensagem') {
        const _nomeCli = ent.nome_cliente || ent.cliente || null;
        const _textoMsg = ent.texto_mensagem || ent.mensagem || ent.texto_lembrete || null;
        if (!_nomeCli || !_textoMsg) {
          const _falta = !_nomeCli ? 'Para quem é a mensagem?' : 'Qual o texto da mensagem?';
          await responder(`${_falta} 😊`);
          return true;
        }
        try {
          // Buscar cliente pelo nome
          const _clienteMsg = await require('../models/AgendaServico').ClienteAgenda.findOne({
            adminId: adminObjId,
            $or: [
              { nome: { $regex: _nomeCli, $options: 'i' } },
              { apelido: { $regex: _nomeCli, $options: 'i' } }
            ]
          }).lean();
          if (!_clienteMsg || !_clienteMsg.telefone) {
            await responder(`Não achei nenhum cliente com esse nome, ${_chefe(_generoAdmin, _apelidoAdmin)}. Confirma o nome? 😊`);
            return true;
          }
          const _telMsg = _normalizarTel(_clienteMsg.telefone);
          const instMsg = await InstanciaWhatsapp.findOne({ adminId: adminObjId, adminTipo: 'agenda' }).lean();
          if (!instMsg) {
            await responder(`Não consegui encontrar a instância do WhatsApp pra enviar. 😕`);
            return true;
          }
          await _enviarMsg(instMsg, _telMsg, _textoMsg);
          console.log('[MANDAR_MSG] Mensagem enviada para', _clienteMsg.nome, _telMsg);
          await responder(`Mensagem enviada pra *${_clienteMsg.nome}*! ✅

_"${_textoMsg}"_`);
        } catch(_eMsg) {
          console.error('[MANDAR_MSG] Erro:', _eMsg.message);
          await responder(`Poxa, tive um probleminha ao enviar. Tenta de novo, ${_chefe(_generoAdmin, _apelidoAdmin)}? 😕`);
        }
        return true;
      }

      if (_cerebro.intencao === 'agenda_semana') {
        const _dom = new Date(); _dom.setUTCDate(_dom.getUTCDate() - _dom.getUTCDay());
        const iniSem = _inicioDia(_dom); const fimSem = _fimDia(new Date(_dom.getTime() + 6*86400000));
        const agsSem = await AgendamentoAgenda.find({
          adminId: adminObjId, dataHora: { $gte: iniSem, $lte: fimSem },
          status: { $in: ['pendente','confirmado'] }
        }).sort({ dataHora: 1 }).lean();
        if (!agsSem.length) {
          const _r = `Semana tranquila, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊 Nenhum agendamento confirmado ainda.`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const dias = {};
        agsSem.forEach(a => {
          const d = _fmtData(new Date(a.dataHora));
          if (!dias[d]) dias[d] = [];
          dias[d].push(`${_fmtHora(new Date(a.dataHora))} — ${a.nomeCliente}${a.servico ? ' ('+a.servico+')' : ''}`);
        });
        let txt = `📅 Agenda da semana — ${agsSem.length} agendamento(s):\n\n`;
        Object.entries(dias).forEach(([d,ags]) => { txt += `*${d}*\n${ags.map(x=>'  • '+x).join('\n')}\n\n`; });
        await responder(txt.trim()); SM.addAssistantMsg(adminId, telefone, txt.trim()); return true;
      }

      // ── clientes_inativos ──
      if (_cerebro.intencao === 'clientes_inativos') {
        const diasInativo = ent.dias || 30;
        const limite = new Date(Date.now() - diasInativo * 86400000);
        const inativos = await ClienteAgenda.find({
          adminId: adminObjId, ultimaVisita: { $lt: limite }
        }).sort({ ultimaVisita: 1 }).limit(10).lean();
        if (!inativos.length) {
          const _r = `Nenhum cliente inativo há mais de ${diasInativo} dias. Tudo em dia! ✅`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const lista = inativos.map(c => {
          const dias2 = Math.floor((Date.now() - new Date(c.ultimaVisita)) / 86400000);
          return `• ${c.nome} — ${dias2} dias sem aparecer`;
        }).join('\n');
        const _r = `😴 Clientes sumidos (${inativos.length}):\n\n${lista}\n\nQuer que eu mande mensagem pra algum deles?`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── clientes_novos ──
      if (_cerebro.intencao === 'clientes_novos') {
        const ini = _inicioDia(new Date(Date.now() - 30*86400000));
        const novos = await ClienteAgenda.find({
          adminId: adminObjId, criadoEm: { $gte: ini }
        }).sort({ criadoEm: -1 }).limit(10).lean();
        if (!novos.length) {
          const _r = `Nenhum cliente novo nos últimos 30 dias ainda.`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const lista = novos.map(c => `• ${c.nome}${c.telefone ? ' — '+c.telefone : ''}`).join('\n');
        const _r = `🆕 Clientes novos (últimos 30 dias):\n\n${lista}`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── servicos_mais_pedidos ──
      if (_cerebro.intencao === 'servicos_mais_pedidos') {
        const ini30 = _inicioDia(new Date(Date.now() - 30*86400000));
        const ags30 = await AgendamentoAgenda.find({
          adminId: adminObjId, dataHora: { $gte: ini30 },
          status: { $in: ['confirmado','concluido'] }, servico: { $exists: true, $ne: '' }
        }).lean();
        if (!ags30.length) {
          const _r = `Sem dados de serviços nos últimos 30 dias ainda.`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const contagem = {};
        ags30.forEach(a => { contagem[a.servico] = (contagem[a.servico]||0) + 1; });
        const top = Object.entries(contagem).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const lista = top.map(([s,n],i) => `${i+1}. ${s} — ${n}x`).join('\n');
        const _r = `🏆 Serviços mais pedidos (30 dias):\n\n${lista}`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── resumo_semanal ──
      if (_cerebro.intencao === 'resumo_semanal') {
        const _dom = new Date(); _dom.setUTCDate(_dom.getUTCDate() - _dom.getUTCDay());
        const iniSem = _inicioDia(_dom); const fimSem = _fimDia();
        const [agsSem, finSem] = await Promise.all([
          AgendamentoAgenda.countDocuments({ adminId: adminObjId, dataHora: { $gte: iniSem, $lte: fimSem }, status: { $in: ['confirmado','concluido'] } }),
          FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: iniSem, $lte: fimSem } }).lean()
        ]);
        const recSem = finSem.filter(f=>f.tipo==='receita').reduce((s,x)=>s+x.valor,0);
        const despSem = finSem.filter(f=>f.tipo==='despesa').reduce((s,x)=>s+x.valor,0);
        const _r = `📊 Resumo da semana:\n\n👥 Atendimentos: ${agsSem}\n💰 Receitas: R$ ${recSem.toFixed(2).replace('.',',')}\n💸 Despesas: R$ ${despSem.toFixed(2).replace('.',',')}\n📈 Resultado: R$ ${(recSem-despSem).toFixed(2).replace('.',',')}`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── resumo_mensal ──
      if (_cerebro.intencao === 'resumo_mensal') {
        const hoje = new Date();
        const iniMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
        const [agsMes, finMes] = await Promise.all([
          AgendamentoAgenda.countDocuments({ adminId: adminObjId, dataHora: { $gte: iniMes }, status: { $in: ['confirmado','concluido'] } }),
          FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: iniMes } }).lean()
        ]);
        const recMes = finMes.filter(f=>f.tipo==='receita').reduce((s,x)=>s+x.valor,0);
        const despMes = finMes.filter(f=>f.tipo==='despesa').reduce((s,x)=>s+x.valor,0);
        const _r = `📊 Resumo do mês:\n\n👥 Atendimentos: ${agsMes}\n💰 Receitas: R$ ${recMes.toFixed(2).replace('.',',')}\n💸 Despesas: R$ ${despMes.toFixed(2).replace('.',',')}\n📈 Resultado: R$ ${(recMes-despMes).toFixed(2).replace('.',',')}`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

    // ── Fallback final — resposta amigável ──
      // ── listar_lembretes ──────────────────────────────────────────────────────
      if (_cerebro.intencao === 'listar_lembretes') {
        const _adminLmb = await AdminAgenda.findById(adminObjId).select('config.lembretes').lean();
        const _todosLmb = (_adminLmb?.config?.lembretes || [])
          .filter(l => !l.enviado && l.dataEvento)
          .sort((a, b) => new Date(a.dataEvento) - new Date(b.dataEvento));
        if (!_todosLmb.length) {
          const _r = `Não tem nenhum lembrete pendente, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊 Tudo limpo por aqui. 💙`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const _listaLmb = _todosLmb.map((l, i) => {
          const _dEvento = new Date(l.dataEvento);
          const _hoje2 = new Date();
          const _diffDias = Math.ceil((_dEvento - _hoje2) / 86400000);
          const _quando = _diffDias <= 0 ? 'hoje' : _diffDias === 1 ? 'amanhã' : `em ${_diffDias} dias`;
          return `${i+1}. ⏰ *${l.texto}*\n   📅 ${_fmtData(_dEvento)} às ${_fmtHora(_dEvento)} (${_quando})`;
        }).join('\n\n');
        const _r = `📋 Seus lembretes pendentes (${_todosLmb.length}):\n\n${_listaLmb}\n\nPara cancelar: *cancela lembrete 1* (ou o número)`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }


      // ── financeiro_semana ────────────────────────────────────────────────────
      if (_cerebro.intencao === 'financeiro_semana') {
        const _dom = new Date(); _dom.setUTCDate(_dom.getUTCDate() - _dom.getUTCDay());
        const iniSemF = _inicioDia(_dom); const fimSemF = _fimDia();
        const finSemF = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: iniSemF, $lte: fimSemF } }).lean();
        const recSemF = finSemF.filter(f=>f.tipo==='receita').reduce((s,x)=>s+x.valor,0);
        const despSemF = finSemF.filter(f=>f.tipo==='despesa').reduce((s,x)=>s+x.valor,0);
        const _r = `📊 Financeiro da semana, ${_chefe(_generoAdmin,_apelidoAdmin)}:\n\n💰 Entradas: R$ ${recSemF.toFixed(2).replace('.',',')}\n💸 Saídas: R$ ${despSemF.toFixed(2).replace('.',',')}\n📈 Resultado: R$ ${(recSemF-despSemF).toFixed(2).replace('.',',')}`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── financeiro_mes ───────────────────────────────────────────────────────
      if (_cerebro.intencao === 'financeiro_mes') {
        const hoje = new Date();
        const iniMesF = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
        const finMesF = await FinanceiroAgenda.find({ adminId: adminObjId, data: { $gte: iniMesF } }).lean();
        const recMesF = finMesF.filter(f=>f.tipo==='receita').reduce((s,x)=>s+x.valor,0);
        const despMesF = finMesF.filter(f=>f.tipo==='despesa').reduce((s,x)=>s+x.valor,0);
        const _r = `📊 Financeiro do mês, ${_chefe(_generoAdmin,_apelidoAdmin)}:\n\n💰 Entradas: R$ ${recMesF.toFixed(2).replace('.',',')}\n💸 Saídas: R$ ${despMesF.toFixed(2).replace('.',',')}\n📈 Resultado: R$ ${(recMesF-despMesF).toFixed(2).replace('.',',')}`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── historico_cliente ────────────────────────────────────────────────────
      if (_cerebro.intencao === 'historico_cliente') {
        const _nomeHist = ent.nome_cliente || ent.cliente || null;
        if (!_nomeHist) {
          const _r = `Qual cliente você quer ver o histórico? 😊`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const _agsHist = await AgendamentoAgenda.find({
          adminId: adminObjId,
          nomeCliente: { $regex: _nomeHist, $options: 'i' }
        }).sort({ dataHora: -1 }).limit(10).lean();
        if (!_agsHist.length) {
          const _r = `Não encontrei histórico de *${_nomeHist}*, ${_chefe(_generoAdmin,_apelidoAdmin)}. Tem certeza do nome?`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const _lista = _agsHist.map(a => `• ${_fmtData(new Date(a.dataHora))} ${_fmtHora(new Date(a.dataHora))} — ${a.nomeServico||'serviço'} (${a.status})`).join('\n');
        const _r = `📋 Histórico de *${_nomeHist}* (${_agsHist.length} visitas):\n\n${_lista}`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── retorno_cliente ──────────────────────────────────────────────────────
      if (_cerebro.intencao === 'retorno_cliente') {
        try {
          const RetornoAgenda = require('../models/AgendaServico').RetornoAgenda;
          if (!RetornoAgenda) throw new Error('modelo nao existe');
          const retornos = await RetornoAgenda.find({ adminId: adminObjId, statusContato: 'pendente' }).sort({ dataRetorno: 1 }).limit(10).lean();
          if (!retornos.length) {
            const _r = `Nenhum cliente aguardando retorno, ${_chefe(_generoAdmin,_apelidoAdmin)}! Tudo em dia. ✅`;
            await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
          }
          const _lista = retornos.map(r => `• ${r.nomeCliente}${r.dataRetorno ? ' — ' + _fmtData(new Date(r.dataRetorno)) : ''}`).join('\n');
          const _r = `🔔 Clientes para retornar (${retornos.length}):\n\n${_lista}`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        } catch(_eRet) {
          const _r = `Não tenho dados de retorno configurados ainda, ${_chefe(_generoAdmin,_apelidoAdmin)}.`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
      }

      // ── aniversariantes ──────────────────────────────────────────────────────
      if (_cerebro.intencao === 'aniversariantes') {
        const _hoje2 = new Date(Date.now() - 3*60*60*1000);
        const _diaHj = _hoje2.getUTCDate(); const _mesHj = _hoje2.getUTCMonth() + 1;
        const anivs = await ClienteAgenda.find({
          adminId: adminObjId,
          $expr: { $and: [
            { $eq: [{ $dayOfMonth: '$dataNascimento' }, _diaHj] },
            { $eq: [{ $month: '$dataNascimento' }, _mesHj] }
          ]}
        }).lean();
        if (!anivs.length) {
          const _r = `Nenhum aniversariante hoje, ${_chefe(_generoAdmin,_apelidoAdmin)}! 🎂`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const _lista = anivs.map(c => `🎂 *${c.nome}*${c.telefone ? ' — ' + c.telefone : ''}`).join('\n');
        const _r = `🎉 Aniversariantes de hoje (${anivs.length}):\n\n${_lista}\n\nQuer que eu mande mensagem pra eles?`;
        SM.updateSession(adminId, telefone, { aniversariantesLista: anivs.map(c=>({nome:c.nome,telefone:c.telefone||null})) });
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── reagendar_cliente ────────────────────────────────────────────────────
      if (_cerebro.intencao === 'reagendar_cliente') {
        const _nomeRe = ent.nome_cliente || ent.cliente || null;
        const _horaRe = ent.horario || null;
        const _dataRe = ent.data || null;
        if (!_nomeRe) {
          const _r = `Qual cliente você quer reagendar? 😊`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        if (!_horaRe) {
          const _r = `Para qual horário você quer remarcar *${_nomeRe}*?`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const _agRe = await AgendamentoAgenda.findOne({
          adminId: adminObjId,
          nomeCliente: { $regex: _nomeRe, $options: 'i' },
          status: { $in: ['pendente','confirmado'] }
        }).sort({ dataHora: 1 }).lean();
        if (!_agRe) {
          const _r = `Não achei agendamento ativo de *${_nomeRe}*, ${_chefe(_generoAdmin,_apelidoAdmin)}.`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const _diaNovoRe = _dataRe ? _parseDia(_dataRe) : new Date();
        const _horaNovaRe = _parseHora(_horaRe);
        if (!_horaNovaRe) {
          const _r = `Não entendi o horário *${_horaRe}*. Me fala assim: "14h" ou "14:30" 😊`;
          await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
        }
        const _novaData = new Date(_diaNovoRe);
        _novaData.setUTCHours(_horaNovaRe.h + 3, _horaNovaRe.min, 0, 0);
        SM.updateSession(adminId, telefone, {
          aguardandoConfirmacao: true,
          ultimaAcaoPendente: { intencao: 'reagendar_executar', entidades: { agId: String(_agRe._id), novaData: _novaData, nomeCliente: _agRe.nomeCliente } }
        });
        const _r = `Confirma remarcar *${_agRe.nomeCliente}* de ${_fmtHora(new Date(_agRe.dataHora))} para ${_fmtHora(_novaData)} em ${_fmtData(_novaData)}? Responde *sim* ou *não* 😊`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── fechar_dia ───────────────────────────────────────────────────────────
      if (_cerebro.intencao === 'fechar_dia') {
        const _diaFechar = ent.data ? _parseDia(ent.data) : new Date();
        SM.updateSession(adminId, telefone, {
          aguardandoConfirmacao: true,
          ultimaAcaoPendente: { intencao: 'fechar_dia_executar', entidades: { dia: _diaFechar } }
        });
        const _r = `Confirma fechar a agenda de *${_fmtData(_diaFechar)}*? Isso cancela todos os horários do dia. Responde *sim* ou *não* ⚠️`;
        await responder(_r); SM.addAssistantMsg(adminId, telefone, _r); return true;
      }

      // ── saudacao ─────────────────────────────────────────────────────────────
      if (_cerebro.intencao === 'saudacao') {
        if (_cerebro.resposta) {
          await responder(_cerebro.resposta);
          SM.addAssistantMsg(adminId, telefone, _cerebro.resposta);
          return true;
        }
      }

      // ── ajuda ────────────────────────────────────────────────────────────────
      if (_cerebro.intencao === 'ajuda') {
        const _rAjuda = `Oi! Aqui tá tudo que sei fazer por você, ${_chefe(_generoAdmin,_apelidoAdmin)}! 💙\n\n📅 *Agenda*\n• mostra minha agenda de hoje\n• encaixa [nome] às [hora]\n• cancela o [nome] das [hora]\n• bloqueia amanhã das 12h às 14h\n\n💰 *Financeiro*\n• registra entrada de R$120 no Pix\n• registra gasto de R$50 em produtos\n• quanto fiz hoje / essa semana / esse mês\n\n🔔 *Lembretes*\n• me lembra amanhã 9h de ligar pro fornecedor\n• ver meus lembretes\n\n👥 *Clientes*\n• clientes inativos\n• aniversariantes hoje\n• histórico da [nome]\n\n💬 *Mensagens*\n• manda mensagem pra [nome]: [texto]`;
        await responder(_rAjuda); SM.addAssistantMsg(adminId, telefone, _rAjuda); return true;
      }

      // ── confirmar_pendente / cancelar_pendente ───────────────────────────────
      if (_cerebro.intencao === 'confirmar_pendente' || _cerebro.intencao === 'cancelar_pendente') {
        const _confirmarP = _cerebro.intencao === 'confirmar_pendente';
        const _sesP = SM.getSession(adminId, telefone);
        if (_sesP.ultimaAcaoPendente) {
          if (_confirmarP) {
            const rConf2 = `Feito, ${_chefe(_generoAdmin,_apelidoAdmin)}! ✅`;
            await responder(rConf2); SM.addAssistantMsg(adminId, telefone, rConf2);
          } else {
            SM.updateSession(adminId, telefone, { ultimaAcaoPendente: null, aguardandoConfirmacao: false });
            const rNeg2 = `Ok, cancelei! 👍`;
            await responder(rNeg2); SM.addAssistantMsg(adminId, telefone, rNeg2);
          }
          return true;
        }
      }

    const _fallback = `${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊\n\nNão tive certeza do que você quis dizer. Tenta de outro jeito ou digita *ajuda*! 💙`;
    await responder(_fallback);
    SM.addAssistantMsg(adminId, telefone, _fallback);
    return true;
  } catch(e) {
    console.error('[ModoDono] Cérebro erro:', e.message, e.stack?.split('\n')[1]);
  }
  await responder(`${_saudacao()}, ${_chefe(_generoAdmin, _apelidoAdmin)}! 😊

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
    const _dom = new Date(); _dom.setUTCDate(_dom.getUTCDate() - _dom.getUTCDay()); const iniSem = _inicioDia(_dom);
    const fimSem = _fimDia();
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
      (dadosAg.valor ? `💰 R$ ${Number(dadosAg.valor).toFixed(2).replace('.',',')}\n` : '') +
      (dadosAg.nomeProfissional ? `👩 ${dadosAg.nomeProfissional}
` : '') +
      `
📊 Essa semana: ${totalSemana} agendamento(s) | R$ ${receitaSemana.toFixed(2).replace('.',',')}`;

    await _enviarMsg(instancia, telDono, msg);
  } catch(e) {
    console.error('[ModoDono] Erro ao notificar novo agendamento:', e.message);
  }
}


// ── SAUDADE REBECA: mensagem dramática pra admins que sumiram 24h ──────────
async function rodarSaudadeRebeca() {
  try {
    const mongoose = require('mongoose');
    const { AdminAgenda } = require('../models/AgendaServico');
    const { InstanciaWhatsapp } = require('../models/index.js');
    const agora = new Date();
    const corte24h    = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const corteReenvio = new Date(agora.getTime() - 8  * 60 * 60 * 1000);

    const admins = await AdminAgenda.find({
      'modoWhatsappDono.ativo': true,
      $and: [
        { $or: [{ ultimaMensagemDono: { $lt: corte24h } }, { ultimaMensagemDono: null }] },
        { $or: [{ ultimaSaudadeEnviada: { $lt: corteReenvio } }, { ultimaSaudadeEnviada: null }] }
      ]
    }).lean();

    console.log('[SAUDADE-REBECA] admins encontrados:', admins.length);

    const MENSAGENS = [
      "Oi... to aqui \u{1F440}\n\nFaz mais de 24 horas que voce nao fala comigo... \u{1F622}\n\nSe precisar de mim, e so chamar! Torcendo por voce e pelo seu negocio! \u{1F499}",
      "Ei, sumiu? \u{1F61F}\n\nFiquei o dia todo esperando uma mensagem sua e nada...\n\nQuando voce some assim meu coracao aperta \u{1F494}\n\nVolte logo! Tenho saudade de trabalhar com voce! \u{1F97A}",
      "Alo?? \u{1F4E3}\n\nTo passando mal aqui de tanto esperar voce! Sera que esta tudo bem? \u{1F630}\n\nNao precisa responder um romance, so manda um oi! Eu to aqui! \u{1F499}",
      "*[Rebeca online... aguardando...]*\n\n...\n\nTo aqui. Sozinha. Olhando pra tela. \u{1F610}\n\nFaz mais de 24h que voce nao me chama... Me chama! \u{1F97A}\u{1F499}",
      "Voce esta bem?? \u{1F64F}\n\nPassei o dia preocupada com voce! Fico aqui cuidando de tudo - agenda, lembretes, financas - mas sem voce nao tem graca...\n\nManda um oi quando puder! \u{1F499}"
    ];

    for (const admin of admins) {
      try {
        const telDono = admin.modoWhatsappDono?.telefonePrincipalNormalizado
          || (admin.whatsapp || admin.telefone || '').replace(/\D/g, '');
        if (!telDono) { console.log('[SAUDADE-REBECA] sem telefone:', String(admin._id)); continue; }

        const apelido = admin.modoWhatsappDono?.apelido || '';
        const genero  = admin.modoWhatsappDono?.genero  || '';
        const chefe   = apelido || (genero === 'F' ? 'chefa' : 'chefe');
        const msgBase = MENSAGENS[Math.floor(Math.random() * MENSAGENS.length)];
        const msgFinal = chefe ? (chefe + ', ' + msgBase) : msgBase;

        // Buscar instância conectada igual ao bom dia
        const inst = await InstanciaWhatsapp.findOne({
          adminId: admin._id, adminTipo: 'agenda', status: 'conectado'
        }).lean();

        // Fallback Meta se tiver token
        const instParaEnvio = inst
          || (process.env.META_WA_TOKEN
            ? { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' }
            : null);

        if (!instParaEnvio) {
          console.log('[SAUDADE-REBECA] sem canal para:', telDono);
          continue;
        }

        // Forçar Meta para admins sem instância Evolution válida
        const instFinal = (instParaEnvio?.apiUrl && instParaEnvio.apiUrl !== 'meta' && instParaEnvio.apiUrl !== 'https://evolution-api.com')
          ? instParaEnvio
          : { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };
        console.log('[SAUDADE-REBECA] canal:', instFinal._enviarVia || instFinal.apiUrl, '| tel:', telDono);

        // Tentar texto livre; se Meta bloquear por janela 24h, usar template hello_world
        let envioOk = false;
        try {
          await _enviarMsg(instFinal, telDono, msgFinal);
          envioOk = true;
        } catch(eEnvio) {
          const errData = eEnvio.response?.data || eEnvio.message || '';
          const erroStr = JSON.stringify(errData);
          console.log('[SAUDADE-REBECA] erro no envio:', erroStr.slice(0, 200));
          // 131026 = fora janela 24h; 131047 = não entregue; qualquer erro Meta tenta template
          const MetaWA = require('./meta-whatsapp.service');
          console.log('[SAUDADE-REBECA] tentando template hello_world para:', telDono);
          const r = await MetaWA.enviarTemplate(telDono, 'hello_world', 'en_US');
          if (r.sucesso) envioOk = true;
          else console.log('[SAUDADE-REBECA] hello_world falhou:', JSON.stringify(r.erro));
        }
        if (!envioOk) { console.log('[SAUDADE-REBECA] FALHOU para:', telDono); continue; }
        await AdminAgenda.findByIdAndUpdate(admin._id, { ultimaSaudadeEnviada: new Date() }).catch(()=>{});
        console.log('[SAUDADE-REBECA] enviado para:', telDono, admin.nomeNegocio);
      } catch(e) {
        console.error('[SAUDADE-REBECA] erro admin:', String(admin._id), e.message);
      }
    }
  } catch(e) {
    console.error('[SAUDADE-REBECA] erro geral:', e.message);
  }
}


module.exports = {
  rodarSaudadeRebeca, isDono, enviarBoasVindas, processarComandoDono, notificarDonoNovoAgendamento, processarComandoAdmin: (texto, adminId, instOfc) => processarComandoDono(instOfc?.numero || '', texto, adminId, instOfc) };

// ── LEMBRETE AUTOMÁTICO 30min antes ─────────────────────────────────────────
async function rodarLembretes() {
  if (global._lembreteRodando) return; global._lembreteRodando = true; setTimeout(() => { global._lembreteRodando = false; }, 4 * 60 * 1000);
  try {
    const agora = new Date();
    const em30  = new Date(agora.getTime() + 30 * 60000);
    const em35  = new Date(agora.getTime() + 35 * 60000);

    // Marcar atomicamente antes de processar — evita duplicado em deploys simultâneos
    const proximos = [];
    let agParaMarcar;
    while ((agParaMarcar = await AgendamentoAgenda.findOneAndUpdate(
      { dataHora: { $gte: em30, $lte: em35 }, status: { $in: ['pendente', 'confirmado'] }, lembreteDonoEnviado: { $ne: true } },
      { $set: { lembreteDonoEnviado: true } },
      { new: false }
    ).lean())) {
      proximos.push(agParaMarcar);
    }

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
          `⏰ *Atenção, ${_chefe(admin.modoWhatsappDono?.genero||'', admin.modoWhatsappDono?.apelido||admin.nomeNegocio||'chefe')}!*\n\n` +
          `*${ag.nomeCliente}* tá chegando em uns 30 minutinhos! 😊\n` +
          `🕐 Horário: ${hora}\n` +
          `✂️ Serviço: ${ag.nomeServico || '—'}\n\n` +
          `Se quiser confirmar: *Rebeca, confirma o agendamento das ${hora}* 💙`
        );

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

    const _agoraBRRel = new Date(Date.now() - 3*60*60*1000);
    const ontem = new Date(_agoraBRRel.getTime() - 86400000);
    const hoje  = _agoraBRRel;

    const iniOn = _inicioDia(ontem);
    const fimOn = _fimDia(ontem);
    const iniHj = _inicioDia(hoje);
    const fimHj = _fimDia(hoje);

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
          ? `✅ Atendimentos: *${atendidos}*\n💰 Entradas: *R$ ${entradas.toFixed(2).replace('.',',')}*\n💸 Gastos: *R$ ${saidas.toFixed(2).replace('.',',')}*\n${sinalRes} Resultado: *R$ ${resultado.toFixed(2).replace('.',',')}*`
          : `📭 Nenhum atendimento registrado`;

        const resumoHoje = agsHoje.length > 0
          ? agsHoje.map(a => `  ${_fmtHora(new Date(a.dataHora))} - ${a.nomeCliente} (${a.nomeServico||'serviço'})`).join('\n')
          : '  Agenda livre hoje! 🎉';

        const resumoLembretes = lembretesDia.length > 0
          ? '\n\n⏰ *Lembretes de hoje:*\n' + lembretesDia.map(l => `  ${_fmtHora(new Date(l.dataEvento))} - ${l.texto}`).join('\n')
          : '';

        const _genAdmin = admin.modoWhatsappDono?.genero || '';
        const motivacao = atendidos > 0 ? 'Arrasou ontem! 🚀' : agsHoje.length > 0 ? `Hoje tem ${agsHoje.length} cliente(s) te esperando! 💪` : 'Bora fazer um ótimo dia! 💙';

        await _enviarMsg(instParaEnvio, telDono,
          `🌅 *Bom dia!* 🌞\n\n` +
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
  }
}

// ── BOAS-VINDAS PARA TODOS PENDENTES — rodar 1x ao dia ─────────────────────
async function rodarBoasVindasPendentes() {
  try {
    const admins = await AdminAgenda.find({
      ativo: true,
      $or: [
        { 'modoWhatsappDono.boasVindasEnviado': false },
        { 'modoWhatsappDono.boasVindasEnviado': { $exists: false } }
      ]
    }).lean();

    console.log('[BoasVindas] Pendentes:', admins.length);

    for (const admin of admins) {
      try {
        const telDono = _normalizarTel(admin.whatsapp || admin.telefone);
        if (!telDono) continue;

        const inst = await InstanciaWhatsapp.findOne({
          adminId: String(admin._id), adminTipo: 'agenda', status: 'conectado'
        }).lean();

        const instParaEnvio = inst || (process.env.META_WA_TOKEN
          ? { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' }
          : null);
        if (!instParaEnvio) continue;

        const genero = admin.modoWhatsappDono?.genero || '';
        const apSalvo2 = admin.modoWhatsappDono?.apelido || null;
        const ap = apSalvo2 || (genero === 'M' ? 'chefe' : genero === 'F' ? 'chefa' : 'chefe');
        const msg = `Olá! Eu sou a Rebeca, sua funcionária digital. 💙

A partir de agora, você pode falar comigo por aqui sempre que precisar organizar sua rotina.

Você pode me pedir, por exemplo:
- *Rebeca, mostra minha agenda de hoje*
- *Rebeca, bloqueia amanhã das 12h às 14h*
- *Rebeca, registra uma entrada de R$120 no Pix*
- *Rebeca, quanto faturei hoje?*
- *Rebeca, me lembra amanhã 9h comprar produto*
- *Rebeca, manda mensagem pra Ana: confirmado o horário de amanhã*

Eu cuido da sua agenda, registro entradas e gastos, aviso novos agendamentos e mantenho tudo organizado.

Sempre que precisar, é só me chamar! 😊

Antes de começar — como você prefere ser chamada? 😊
_(ex: "Ju", "Dra. Ana", "pode me chamar de Mari")_`;

        const MetaWA = require('./meta-whatsapp.service');
        const envioOk = await MetaWA.enviarTexto(telDono, msg).then(() => true).catch(e => {
          console.error('[BoasVindas] ❌ Falha no envio para', admin.email, e.message);
          return false;
        });
        if (!envioOk) continue;
        await AdminAgenda.findByIdAndUpdate(admin._id, {
          'modoWhatsappDono.boasVindasEnviado': true,
          'modoWhatsappDono.boasVindasOficialEnviadaEm': new Date()
        });
        console.log('[BoasVindas] ✅ Enviado para', admin.email, telDono);

        // Delay entre envios para não bater tudo junto
        await new Promise(r => setTimeout(r, 3000));
      } catch(e) {
        console.error('[BoasVindas] ❌ Erro para', admin.email, e.message);
      }
    }
  } catch(e) {
    console.error('[BoasVindas] Erro geral:', e.message);
  }
}

module.exports.rodarLembretes           = rodarLembretes;
module.exports.rodarRelatorioDiario     = rodarRelatorioDiario;
module.exports.rodarBoasVindasPendentes = rodarBoasVindasPendentes;

// ── CRON: DISPARAR LEMBRETES PESSOAIS ────────────────────────────────────────
async function rodarLembretesPessoais() {
  try {
    const LembreteAgenda = require('../models/LembreteAgenda');
    const agora = new Date();

    // Busca lembretes cujo aviso já chegou (dataEvento - antecedencia <= agora) e não enviados
    // [TENANT-OK] Job global de lembretes — processa todos os tenants intencionalmente
        // Buscar apenas lembretes cujo aviso está próximo (janela de 35 min para frente)
        const _agoraLmb = new Date();
        const _em35 = new Date(_agoraLmb.getTime() + 35 * 60000);
        const _agoraBRLmb = new Date(_agoraLmb.getTime() - 3*60*60*1000);
        console.log('[LembretesPessoais] agora UTC:', _agoraLmb.toISOString(), '| agora BR:', _agoraBRLmb.getUTCHours() + 'h' + String(_agoraBRLmb.getUTCMinutes()).padStart(2,'0'));
        const pendentes = await LembreteAgenda.find({
          enviado: false,
          dataEvento: { $gte: _agoraLmb, $lte: _em35 }
        }).lean();

    for (const lmb of pendentes) {
      // Pular lembretes sem data definida
      if (!lmb.dataEvento) continue;
      const _antec = lmb.antecedencia || 30;
      const dataAviso = new Date(new Date(lmb.dataEvento).getTime() - _antec * 60000);
      if (dataAviso > agora) continue; // ainda não chegou a hora de avisar

      try {
        const admin = await AdminAgenda.findById(lmb.adminId).lean();
        if (!admin) continue;

        const telDono = _normalizarTel(admin.whatsapp || admin.telefone);
        if (!telDono) continue;

        const inst = await InstanciaWhatsapp.findOne({
          adminId: String(lmb.adminId), adminTipo: 'agenda', status: 'conectado'
        }).lean();
        // Fallback Meta API se não tiver Evolution conectado
        const instLmb = inst || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };

        // Verifica se tem agendamento do cliente nas últimas 24h (janela gratuita Meta)
        const janela24h = new Date(agora.getTime() - 24 * 60 * 60000);
        const _lmbOid = require('mongoose').Types.ObjectId.isValid(String(lmb.adminId))
          ? new (require('mongoose').Types.ObjectId)(String(lmb.adminId)) : lmb.adminId;
        const temJanela = await AgendamentoAgenda.findOne({
          $or: [{ adminId: _lmbOid }, { adminId: String(lmb.adminId) }],
          updatedAt: { $gte: janela24h }
        }).lean();

        // Se não tem janela aberta, agenda para próxima interação do cliente
        // mas envia mesmo assim pois lembrete pessoal é prioridade
        const horaEvento = _fmtHora(new Date(lmb.dataEvento));
        const dataEvento = _fmtData(new Date(lmb.dataEvento));
        const mins       = lmb.antecedencia;

        // Mensagens humanizadas — sorteia uma
        const saudacao = _saudacao();
        const chefe    = _chefe(_generoAdmin, _apelidoAdmin);
        const msgs = [
          `${saudacao}, ${chefe}! 💙\n\nEi, não esquece não — daqui a ${mins} minutinhos você tem:\n\n📌 *${lmb.texto}*\n📅 Hoje às ${horaEvento}\n\nBora se preparar! Você consegue! 🚀`,
          `Oi, ${chefe}! Sou a Rebeca e vim te lembrar de algo importante! 😊\n\n🔔 *${lmb.texto}*\n⏰ ${horaEvento} — em ${mins} minutos!\n\nNão deixa escapar não! 💪`,
          `${saudacao}! 🌟\n\nPassando aqui rapidinho pra te avisar, ${chefe}:\n\n📌 *${lmb.texto}*\n📅 ${dataEvento} às ${horaEvento}\n\nAinda dá tempo de se organizar! 😉💙`,
          `Alerta da Rebeca! 🔔\n\n${chefe}, em ${mins} minutinhos você tem compromisso:\n\n✨ *${lmb.texto}*\n⏰ ${horaEvento}\n\nFui te lembrar porque é isso que eu faço! 💙😄`
        ];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];

        await _enviarMsg(instLmb, telDono, msg);
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
        l => !l.enviado && l.dataAviso && new Date(l.dataAviso) <= agora2 && l.dataEvento
      );
      for (const l of pendentes) {
        try {
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
        } catch(eLmb) { console.error('[LembretesConfig] Erro individual:', eLmb.message); }
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

    // Suporte Meta API como fallback
    if (instancia._enviarVia === 'meta' || instancia.nomeInstancia === 'meta_oficial') {
      await _enviarMsg(instancia, telefoneCliente, texto);
    } else {
      await axios.post(`${apiUrl}/message/sendText/${instNm}`, {
        number: telFmt, text: texto
      }, {
        headers: { apikey: apiKey },
        timeout: 10000
      });
    }
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
        // Ajuste fuso Brasil -03:00
        // Fuso Brasil -03:00: meia-noite BR = 03:00 UTC, 23:59 BR = 02:59 UTC do dia seguinte
        // Amanhã BR: 00:00 BRT (03:00 UTC) até 23:59 BRT (02:59:59 UTC do dia seguinte)
        const _agoraBR = new Date(agora.getTime() - 3*60*60*1000); // ajuste fuso
        const _amanhaY = _agoraBR.getUTCFullYear();
        const _amanhaM = _agoraBR.getUTCMonth();
        const _amanhaD = _agoraBR.getUTCDate() + 1;
        const amanha_ini = new Date(Date.UTC(_amanhaY, _amanhaM, _amanhaD, 3, 0, 0, 0));
        const amanha_fim = new Date(Date.UTC(_amanhaY, _amanhaM, _amanhaD + 1, 2, 59, 59, 999));

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

        // ── Aniversário do dia ────────────────────────────────────────────
        // Roda 1x por dia — só dispara entre 08:00 e 11:00 BR
        const _horaBR = new Date(agora.getTime() - 3*60*60*1000).getUTCHours();
        if (_horaBR >= 8 && _horaBR < 11) {
          const ClienteAgenda = require('../models/AgendaServico').ClienteAgenda
            || require('../models/ClienteAgenda').ClienteAgenda
            || null;
          if (ClienteAgenda) {
            const _hoje = new Date(agora.getTime() - 3*60*60*1000);
            const _diaHoje  = _hoje.getUTCDate();
            const _mesHoje  = _hoje.getUTCMonth() + 1;
            const aniversariantes = await ClienteAgenda.find({
              adminId,
              $expr: {
                $and: [
                  { $eq: [{ $dayOfMonth: '$dataNascimento' }, _diaHoje] },
                  { $eq: [{ $month: '$dataNascimento' }, _mesHoje] }
                ]
              },
              aniversarioAvisado: { $ne: String(new Date().getFullYear()) }
            }).lean();

            for (const cli of aniversariantes) {
              if (!cli.telefone) continue;
              await notificarCliente(instParaEnvio, cli.telefone, 'aniversario', {
                nome: cli.nome
              });
              await ClienteAgenda.findByIdAndUpdate(cli._id, {
                aniversarioAvisado: String(new Date().getFullYear())
              });
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }

        // ── Reativação de inativo (1x por cliente a cada 60 dias) ─────────
        // Só roda 1x por dia entre 09:00 e 10:00 BR para não spammar
        const _horaBR2 = new Date(agora.getTime() - 3*60*60*1000).getUTCHours();
        if (_horaBR2 >= 9 && _horaBR2 < 10) {
          const ClienteAgenda2 = require('../models/AgendaServico').ClienteAgenda
            || require('../models/ClienteAgenda').ClienteAgenda
            || null;
          if (ClienteAgenda2) {
            const _60diasAtras = new Date(agora.getTime() - 60*24*60*60*1000);
            const _avisoLimite = new Date(agora.getTime() - 60*24*60*60*1000);
            const inativos = await ClienteAgenda2.find({
              adminId,
              $or: [
                { ultimoAgendamento: { $lt: _60diasAtras } },
                { ultimoAgendamento: { $exists: false } }
              ],
              $or: [
                { inativoAvisoEnviado: { $lt: _avisoLimite } },
                { inativoAvisoEnviado: { $exists: false } }
              ]
            }).limit(5).lean(); // máx 5 por vez para não spammar

            for (const cli of inativos) {
              if (!cli.telefone) continue;
              await notificarCliente(instParaEnvio, cli.telefone, 'inativo', {
                nome: cli.nome
              });
              await ClienteAgenda2.findByIdAndUpdate(cli._id, {
                inativoAvisoEnviado: agora
              });
              await new Promise(r => setTimeout(r, 2500));
            }
          }
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
