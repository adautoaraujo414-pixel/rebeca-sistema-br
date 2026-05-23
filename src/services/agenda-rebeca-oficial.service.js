// agenda-rebeca-oficial.service.js
// WhatsApp Oficial da Rebeca — canal exclusivo para admins/donos
// NÃO atende clientes finais. NÃO substitui WhatsApp do negócio.
//
// Prioridade da instância oficial:
//   1. AdminAgenda com isRebecaOficial=true + InstanciaWhatsapp conectada
//   2. Fallback: REBECA_OFICIAL_EVOLUTION_INSTANCE/KEY do .env

'use strict';

const axios = require('axios');
const { AdminAgenda } = require('../models/AgendaServico');
const { InstanciaWhatsapp } = require('../models');
const { getAgendaPlanFeatures } = require('../utils/agenda-plan-features');
const {
  normalizarTelefone,
  mascararTelefone,
  telefonesIguais,
  atualizarTelefonePrincipal
} = require('../utils/normalizar-telefone');
const { AgendaWhatsappCommandLog } = require('../models/AgendaServico');

// Fallback env
const ENV_INSTANCE = (process.env.REBECA_OFICIAL_EVOLUTION_INSTANCE || '').trim();
const ENV_KEY      = (process.env.REBECA_OFICIAL_EVOLUTION_KEY || process.env.EVOLUTION_API_KEY || '').trim();
const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || 'https://evolution-api-production-794f.up.railway.app').replace(/\/$/, '');

// Cache de apresentação
const _apresentados = new Set();

// ─── Helpers ──────────────────────────────────────────────────────
// Normalização centralizada — importada de utils/normalizar-telefone.js
const _norm = normalizarTelefone;
const _mask = mascararTelefone;

function _extrairTexto(msg, data) {
  return (
    msg?.message?.conversation               ||
    msg?.message?.extendedTextMessage?.text  ||
    data?.message?.conversation              ||
    data?.message?.extendedTextMessage?.text ||
    ''
  );
}

function _extrairMidia(msg, data) {
  const m = msg?.message || data?.message || {};
  if (m.audioMessage)    return 'audio';
  if (m.imageMessage)    return 'imagem';
  if (m.videoMessage)    return 'video';
  if (m.documentMessage) return 'documento';
  return null;
}

// ─── Busca instância oficial no banco ─────────────────────────────
// Retorna { nomeInstancia, apiKey, apiUrl } ou null
let _cacheInstanciaOficial = null;
let _cacheInstanciaTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function _getInstanciaOficial() {
  const agora = Date.now();
  if (_cacheInstanciaOficial && (agora - _cacheInstanciaTs) < CACHE_TTL) {
    return _cacheInstanciaOficial;
  }

  try {
    const adminOficial = await AdminAgenda.findOne({ isRebecaOficial: true, ativo: true })
      .select('_id instanciaWhatsappId')
      .lean();

    if (adminOficial?.instanciaWhatsappId) {
      const inst = await InstanciaWhatsapp.findOne({
        _id: adminOficial.instanciaWhatsappId,
        status: { $in: ['conectado', 'open', 'connected'] }
      }).select('nomeInstancia apiKey apiUrl').lean();

      if (inst?.nomeInstancia) {
        _cacheInstanciaOficial = {
          nomeInstancia: inst.nomeInstancia,
          apiKey: inst.apiKey || ENV_KEY,
          apiUrl: (inst.apiUrl || EVOLUTION_URL).replace(/\/$/, '')
        };
        _cacheInstanciaTs = agora;
        console.log(`[Oficial] 🔌 Instância oficial carregada do banco: ${inst.nomeInstancia}`);
        return _cacheInstanciaOficial;
      }
    }
  } catch (e) {
    console.error('[Oficial] Erro ao buscar instância oficial no banco:', e.message);
  }

  // Fallback .env
  if (ENV_INSTANCE) {
    console.log(`[Oficial] 🔌 Usando instância oficial do .env: ${ENV_INSTANCE}`);
    return { nomeInstancia: ENV_INSTANCE, apiKey: ENV_KEY, apiUrl: EVOLUTION_URL };
  }

  console.warn('[Oficial] ⚠️  Nenhuma instância oficial configurada (banco ou .env)');
  return null;
}

// Invalida cache quando instância muda
function invalidarCacheInstancia() {
  _cacheInstanciaOficial = null;
  _cacheInstanciaTs = 0;
}

// ─── Envio pelo WhatsApp Oficial ──────────────────────────────────
async function _responderOficial(numero, texto) {
  const inst = await _getInstanciaOficial();
  if (!inst) {
    console.warn('[Oficial] ⚠️  Sem instância oficial configurada — mensagem não enviada');
    return;
  }
  try {
    await axios.post(
      `${inst.apiUrl}/message/sendText/${inst.nomeInstancia}`,
      { number: numero, text: texto },
      { headers: { apikey: inst.apiKey, 'Content-Type': 'application/json' }, timeout: 12000 }
    );
    console.log(`[Oficial] ✅ Enviado → ${_mask(_norm(numero.replace('@s.whatsapp.net', '')))}`);
  } catch (e) {
    console.error('[Oficial] ❌ Erro ao enviar:', e.response?.data || e.message);
  }
}

// ─── Validar se payload é da instância oficial ────────────────────
async function _isPayloadOficial(nomeInstanciaRecebida) {
  if (!nomeInstanciaRecebida) return true; // sem info, deixa passar
  const inst = await _getInstanciaOficial();
  if (!inst) return false;
  return nomeInstanciaRecebida === inst.nomeInstancia;
}

// ─── Busca admin pelo telefone ────────────────────────────────────
async function _buscarAdminsPorTelefone(telNorm) {
  const admins = await AdminAgenda.find({ ativo: true, isRebecaOficial: { $ne: true } })
    .select('_id nome nomeNegocio telefone whatsapp celular plano modoWhatsappDono')
    .lean();

  return admins.filter(a => {
    const candidatos = [
      a.telefone, a.whatsapp, a.celular,
      ...((a.modoWhatsappDono?.telefonesAutorizados) || [])
    ].filter(Boolean).map(_norm);

    return candidatos.some(c => c && telefonesIguais(telNorm, c));
  });
}

// ─── Plano ────────────────────────────────────────────────────────
function _planoPermite(plano) {
  const f = getAgendaPlanFeatures(plano);
  return !!(f?.canUseWhatsappAutomation);
}

// ─── Apresentação ─────────────────────────────────────────────────
async function _apresentarSeNecessario(admin, telBruto) {
  const adminId = String(admin._id);
  if (_apresentados.has(adminId) || admin.modoWhatsappDono?.boasVindasOficialEnviada) return false;

  _apresentados.add(adminId);
  await AdminAgenda.findByIdAndUpdate(adminId, {
    'modoWhatsappDono.boasVindasOficialEnviada'   : true,
    'modoWhatsappDono.boasVindasOficialEnviadaEm' : new Date()
  });

  const nome    = (admin.nome || 'tudo bem').split(' ')[0];
  const negocio = admin.nomeNegocio || 'sua empresa';

  await _responderOficial(
    telBruto,
    `Oi, ${nome}. Reconheci você como administrador de *${negocio}*. 💙\n\n` +
    'Agora pode me pedir por aqui:\n' +
    '• mostrar agenda de hoje ou amanhã\n' +
    '• bloquear horários\n' +
    '• definir horário de trabalho do dia\n' +
    '• registrar entradas e gastos\n' +
    '• consultar faturamento\n' +
    '• confirmar ou cancelar agendamento\n' +
    '• ver clientes inativos\n\n' +
    'Mande *Rebeca, ajuda* para ver todos os comandos. 😊'
  );
  return true;
}

// ─── Mídias ───────────────────────────────────────────────────────
async function _tratarMidia(tipo, telBruto, msg, data, adminId) {
  if (tipo === 'audio') {
    try {
      await _responderOficial(telBruto, '🎤 Recebi seu áudio! Deixa eu ouvir... 🔊');

      // Pegar URL do audio no payload
      const m = msg?.message || data?.message || {};
      const audioMsg = m?.audioMessage || {};
      const mediaUrl = audioMsg?.url || audioMsg?.directPath || null;

      if (mediaUrl) {
        const axios = require('axios');
        const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

        // Baixar audio
        const audioResp = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const base64 = Buffer.from(audioResp.data).toString('base64');

        // Transcrever via Claude Haiku
        const transcResp = await axios.post('https://api.anthropic.com/v1/messages', {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `Você é o melhor especialista em transcrição de áudio do Brasil, treinado para entender qualquer sotaque, gíria e situação do dia a dia brasileiro.

═══ REGRAS DE TRANSCRIÇÃO ═══

🎙️ QUALIDADE DO ÁUDIO:
- Áudio com chiado, eco, vento, barulho de rua, salão, buzina → ignore tudo e foque na voz
- Áudio muito baixo ou distante → amplifique mentalmente e transcreva o que dá pra captar
- Microfone tampado ou abafado → interprete pelos sons captados
- Áudio cortado no início ou fim → complete pelo contexto da frase
- Múltiplas vozes ao fundo → foque apenas na voz principal (quem está falando pro celular)

🗣️ SOTAQUES E REGIÕES DO BRASIL:
- Nordeste: "oxe", "eita", "visse", "arretado", "massa", "num tô entendendo"
- Minas Gerais: "uai", "trem", "sô", "ocê", "misericórdia"
- São Paulo: "mano", "véi", "cara", "brother", "firmeza"
- Rio de Janeiro: "cara", "tipo assim", "saca", "véi", "maluco"
- Sul: "bah", "tchê", "tri", "guri", "piá"
- Interior geral: "uai", "fia", "fio", "homi", "muié"

💬 GÍRIAS E EXPRESSÕES INFORMAIS:
- "manda ver" = pode fazer
- "bora" = vamos
- "tá bom" / "tá" = ok / está
- "né" = não é
- "ó" = olha
- "aí" = então / portanto
- "daí" = depois / então
- "num" = não
- "pra" = para
- "pro" = para o
- "tô" = estou
- "tá" = está
- "vai lá" = pode fazer
- "deixa quieto" = cancela / ignora
- "para tudo" = cancela tudo
- "quanto que deu" = qual o total
- "faz o seguinte" = execute o seguinte comando

💰 VALORES E NÚMEROS (MUITO IMPORTANTE):
- "duzentos" → 200
- "trezentos e cinquenta" → 350
- "um conto" → 1000
- "dois conto" → 2000
- "uma nota" → 100
- "cinquenta pila" → 50
- "vinte e cinco reais" → 25
- "três pau" → 300
- "cinco pila" → 5
- Sempre converta valores por extenso para números

📅 DATAS E HORÁRIOS:
- "amanhã cedo" → amanhã de manhã
- "de tarde" → à tarde
- "à tardezinha" → fim da tarde
- "hoje à noite" → hoje à noite
- "semana que vem" → semana que vem
- "essa semana" → essa semana
- "no fim de semana" → no fim de semana
- "umas dez" → às 10h
- "meio dia" → 12h
- "de manhã cedo" → pela manhã

✂️ PALAVRAS INCOMPLETAS — complete pelo contexto:
- "agend..." → agenda
- "clien..." → cliente
- "regis..." → registra
- "fatur..." → faturamento
- "amanhã..." → amanhã
- "horár..." → horário
- "cancel..." → cancelar

🏢 CONTEXTO DE NEGÓCIO (sistema de agenda/salão/barbearia):
Preste atenção especial em:
- Nomes de clientes (nomes próprios brasileiros)
- Serviços: corte, escova, hidratação, barba, manicure, pedicure, etc
- Formas de pagamento: pix, dinheiro, cartão, débito, crédito, transferência
- Ações: agendar, cancelar, reagendar, registrar, fechar, abrir, bloquear, liberar
- Períodos: manhã, tarde, noite, hoje, amanhã, essa semana

═══ EXEMPLOS REAIS ═══
- "Ô Rebeca... registra aí... duzentos real no pix da Maria" → "Rebeca registra 200 reais no pix da Maria"
- "Rebeca fecha minha agend amanhã tô cansada" → "Rebeca fecha minha agenda amanhã"
- "Rebeca, uai, quem é o próximo?" → "Rebeca quem é o próximo cliente"
- "Mano, Rebeca encaixa o João lá pras duas da tarde" → "Rebeca encaixa João às 14h"
- "Rebeca quanto que eu fiz hoje?" → "Rebeca quanto faturei hoje"
- "Rebeca para tudo, cancela o dia" → "Rebeca fecha minha agenda hoje"
- "Bora Rebeca, me fala a agenda da semana" → "Rebeca mostra agenda da semana"
- "Rebeca, registra um gasto de cinquenta pila em produto" → "Rebeca registra gasto de 50 reais em produto"

Retorne APENAS o texto transcrito e normalizado, sem explicações, sem aspas, sem comentários.` },
              { type: 'document', source: { type: 'base64', media_type: 'audio/ogg', data: base64 } }
            ]
          }]
        }, {
          headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        const transcricao = transcResp.data?.content?.[0]?.text?.trim();
        if (transcricao) {
          console.log('[Oficial] 🎤 Audio transcrito:', transcricao.substring(0,80));
          // Processar como texto normal
          await _delegarAoModoDono(telBruto, transcricao, adminId);
          return;
        }
      }
    } catch(e) {
      console.error('[Oficial] Erro ao transcrever audio:', e.message);
    }
    await _responderOficial(telBruto, '🎤 Recebi seu áudio, mas não consegui transcrever. Me manda em texto! 💙');
    return;
  }

  const r = {
    imagem   : 'Recebi a imagem. Se quiser registrar um gasto, manda valor e categoria por texto. 😊',
    video    : 'Recebi o vídeo. Por enquanto só processo comandos de texto. 😊',
    documento: 'Recebi o documento. Me manda o que precisa em texto. 😊'
  };
  await _responderOficial(telBruto, r[tipo] || 'Só processo texto por aqui. 😊');
}

// ─── Delegação ao ModoDono ────────────────────────────────────────
async function _delegarAoModoDono(telBruto, texto, adminId) {
  try {
    const ModoDono = require('./agenda-modo-dono.service');
    if (typeof ModoDono.processarComandoAdmin === 'function') {
      const inst = await _getInstanciaOficial();
      return await ModoDono.processarComandoAdmin(texto, adminId, {
        canal        : 'rebeca_oficial',
        instance     : inst?.nomeInstancia,
        nomeInstancia: inst?.nomeInstancia,
        apiKey       : inst?.apiKey,
        apiUrl       : inst?.apiUrl,
        numero       : telBruto
      });
    }
    console.warn('[Oficial] ⚠️  ModoDono não exporta processarComandoAdmin');
    return false;
  } catch (e) {
    console.error('[Oficial] Erro ao delegar ao ModoDono:', e.message);
    return false;
  }
}

// ─── Entry point ──────────────────────────────────────────────────
async function processarMensagemOficial(payload) {
  try {
    const data  = payload.data || payload;
    const msg   = data.message || data.messages?.[0] || {};
    const key   = msg.key || data.key || {};

    if (key.fromMe) { console.log('[Oficial] fromMe ignorado'); return; }

    const telBruto = key.remoteJid || data.sender || '';
    const telNorm  = _norm(telBruto.replace('@s.whatsapp.net', ''));
    if (!telNorm) { console.warn('[Oficial] Telefone não extraído'); return; }

    const texto = _extrairTexto(msg, data);
    const midia = _extrairMidia(msg, data);

    console.log(`[Oficial] 📨 tel: ${_mask(telNorm)} | mídia: ${midia || 'texto'} | "${texto.substring(0, 50)}"`);

    const encontrados = await _buscarAdminsPorTelefone(telNorm);

    if (!encontrados.length) {
      console.log(`[Oficial] ❓ Não reconhecido: ${_mask(telNorm)}`);
      await _responderOficial(telBruto,
        'Olá, eu sou a Rebeca 💙\n\n' +
        'Não encontrei este número como administrador autorizado de uma Rebeca Agenda.\n\n' +
        'Se você já é cliente, acesse o painel e adicione este número em:\n' +
        '*Configurações → Modo Rebeca pelo WhatsApp*\n\n' +
        'Se ainda não é cliente, fale com a equipe da Rebeca para conhecer os planos.'
      );
      return;
    }

    if (encontrados.length > 1) {
      console.log(`[Oficial] ⚠️  ${encontrados.length} admins para: ${_mask(telNorm)}`);
      await _responderOficial(telBruto,
        '⚠️ Encontrei mais de uma empresa vinculada a este número.\n\n' +
        'Acesse o painel e defina uma empresa principal para este número em:\n' +
        '*Configurações → Modo Rebeca pelo WhatsApp*'
      );
      return;
    }

    const admin   = encontrados[0];
    const adminId = String(admin._id);
    console.log(`[Oficial] ✅ Admin: "${admin.nomeNegocio || admin.nome}" | plano: ${admin.plano}`);

    // Atualizar telefonePrincipalNormalizado se necessário
    await atualizarTelefonePrincipal(AdminAgenda, adminId, telNorm);

    // Log do comando recebido (base para suporte offline futuro)
    const _tipoMsg = midia || 'text';
    AgendaWhatsappCommandLog.create({
      adminId,
      telefoneAdminNormalizado: telNorm,
      origem      : 'rebeca_oficial',
      textoOriginal: texto.substring(0, 500),
      tipoMensagem : ['audio','image','video','document'].includes(_tipoMsg) ? _tipoMsg : 'text',
      status      : 'recebido'
    }).catch(e => console.warn('[Oficial] Log falhou (não crítico):', e.message));

    if (!_planoPermite(admin.plano)) {
      console.log(`[Oficial] 🔒 Plano sem permissão: ${admin.plano}`);
      await _responderOficial(telBruto,
        '🔒 Esse recurso faz parte do plano Rebeca Agenda completo. 💙\n\n' +
        'Fale com a equipe da Rebeca para liberar o *Modo Rebeca pelo WhatsApp*.'
      );
      return;
    }

    const foiApresentado = await _apresentarSeNecessario(admin, telBruto);
    // ── Verificar configBot.ativo ─────────────────────────────────────────────
    const cfgBot = admin.configBot || {};
    if (cfgBot.ativo === false) {
      console.log('[Oficial] 🔕 Bot desativado pelo admin — ignorando mensagem');
      return;
    }

    // ── Verificar horario de funcionamento ────────────────────────────────────
    if (!cfgBot.foraHorario) {
      const cfg  = admin.config || {};
      const agora = new Date();
      const hAtual = agora.getHours() * 60 + agora.getMinutes();
      const [hAb, mAb] = (cfg.horarioAbertura  || '08:00').split(':').map(Number);
      const [hFe, mFe] = (cfg.horarioFechamento || '18:00').split(':').map(Number);
      const abertura   = hAb * 60 + mAb;
      const fechamento = hFe * 60 + mFe;
      const diaSemana  = agora.getDay();
      const diasFunc   = cfg.diasFuncionamento || [1,2,3,4,5,6];
      if (!diasFunc.includes(diaSemana) || hAtual < abertura || hAtual > fechamento) {
        console.log('[Oficial] 🕐 Fora do horario — nao respondendo');
        await _responderOficial(telBruto,
          `Olá! 😊 No momento estamos fora do horário de atendimento.

` +
          `⏰ Funcionamos de *${cfg.horarioAbertura || '08:00'}* às *${cfg.horarioFechamento || '18:00'}*.

` +
          `Assim que abrirmos é só mandar mensagem! 💙`
        );
        return;
      }
    }

    if (foiApresentado && (!texto || texto.trim().length < 5)) return;

    if (midia) { await _tratarMidia(midia, telBruto, msg, data, adminId); return; }
    if (!texto.trim()) return;

    const tratado = await _delegarAoModoDono(telBruto, texto, adminId);
    if (!tratado) {
      console.log(`[Oficial] ❔ Não reconhecido: "${texto.substring(0, 60)}"`);
      await _responderOficial(telBruto,
        'Não entendi esse comando. 😊\n\nMande *Rebeca, ajuda* para ver tudo que posso fazer.'
      );
    }

  } catch (e) {
    console.error('[Oficial] ❌ Erro:', e.message, e.stack?.split('\n')[1]);
  }
}

// ─── Helper para webhook dinâmico ─────────────────────────────────
async function isInstanciaOficial(nomeInstancia) {
  const inst = await _getInstanciaOficial();
  if (!inst) return false;
  return nomeInstancia === inst.nomeInstancia;
}

module.exports = {
  processarMensagemOficial,
  isInstanciaOficial,
  invalidarCacheInstancia,
  _getInstanciaOficial
};
