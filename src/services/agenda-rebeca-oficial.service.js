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

// Cache de apresentação (em memória + banco como fallback)
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
    const axios = require('axios');
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
    const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';
    const m = msg?.message || data?.message || {};
    const audioMsg = m?.audioMessage || {};
    const mimeType = audioMsg?.mimetype || 'audio/ogg; codecs=opus';
    const _mediaType = /mp4|m4a/.test(mimeType) ? 'audio/mp4' : 'audio/ogg';
    let base64 = null;
    try {
      // Método 1: getBase64FromMediaMessage via Evolution (mais confiável)
      const instDoc = await _getInstanciaOficial();
      const nomeInst = instDoc?.nomeInstancia || '';
      if (nomeInst && EVOLUTION_URL && EVOLUTION_KEY) {
        try {
          const r1 = await axios.post(
            `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${nomeInst}`,
            { message: msg, convertToMp4: false },
            { headers: { apikey: EVOLUTION_KEY }, timeout: 25000 }
          );
          base64 = r1.data?.base64 || r1.data?.data?.base64 || null;
          if (base64) console.log('[Oficial] Audio M1 OK bytes:', base64.length);
        } catch(e1) { console.log('[Oficial] Audio M1 falhou:', e1.message); }
      }
      // Método 2: url direta do payload
      if (!base64 && audioMsg?.url) {
        try {
          const r2 = await axios.get(audioMsg.url, {
            responseType: 'arraybuffer', timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          base64 = Buffer.from(r2.data).toString('base64');
          if (base64) console.log('[Oficial] Audio M2 OK bytes:', base64.length);
        } catch(e2) { console.log('[Oficial] Audio M2 falhou:', e2.message); }
      }
      // Método 3: getBase64 com key (Evolution v2+)
      if (!base64 && nomeInst && EVOLUTION_URL && EVOLUTION_KEY) {
        try {
          const msgKey = msg?.key || {};
          if (msgKey.id) {
            const r3 = await axios.post(
              `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${nomeInst}`,
              { message: { key: msgKey, message: m }, convertToMp4: false },
              { headers: { apikey: EVOLUTION_KEY }, timeout: 25000 }
            );
            base64 = r3.data?.base64 || r3.data?.data?.base64 || null;
            if (base64) console.log('[Oficial] Audio M3 OK');
          }
        } catch(e3) { console.log('[Oficial] Audio M3 falhou:', e3.message); }
      }
      if (!base64) {
        await _responderOficial(telBruto, '🎤 Recebi seu áudio, mas não consegui baixar. Me manda em texto! 💙');
        return;
      }
      await _responderOficial(telBruto, '🎤 Recebi seu áudio! Deixa eu ouvir... 🔊');
      // Detectar audio muito curto — provavel ruido/bolso (< 1KB = menos de ~0.1s)
      const _bufBytes = Buffer.from(base64, 'base64').length;
      if (_bufBytes < 1000) {
        console.log('[Oficial] Audio muito curto ignorado:', _bufBytes, 'bytes');
        return;
      }

      const _prompt = `Você é o melhor especialista em transcrição de áudio do Brasil, treinado para entender qualquer sotaque, gíria e situação do dia a dia brasileiro.

REGRAS:
- Áudio com chiado, eco, vento, barulho → ignore e foque na voz
- Múltiplas vozes → foque na voz principal (quem fala pro celular)
- Áudio cortado → complete pelo contexto

SOTAQUES: nordeste (oxe, eita), mineiro (uai, trem), paulista (mano, véi), carioca (cara, saca), sul (bah, tchê)

VALORES — converta SEMPRE por extenso em números:
- "duzentos" → 200 | "um conto" → 1000 | "uma nota" → 100
- "cinquenta pila" → 50 | "três pau" → 300 | "meio conto" → 500

DATAS: "amanhã cedo" → amanhã de manhã | "umas dez" → às 10h | "meio dia" → 12h

PALAVRAS INCOMPLETAS — complete: "agend..." → agenda | "cancel..." → cancelar | "regis..." → registra

CONTEXTO — sistema de agenda/salão/barbearia. Preste atenção em:
- Nomes de clientes brasileiros
- Serviços: corte, escova, hidratação, barba, manicure, pedicure
- Pagamento: pix, dinheiro, cartão, débito, crédito
- Ações: agendar, cancelar, registrar, fechar, bloquear

EXEMPLOS:
- "Ô Rebeca registra aí duzentos real no pix da Maria" → "Rebeca registra 200 reais no pix da Maria"
- "Rebeca fecha minha agend amanhã tô cansada" → "Rebeca fecha minha agenda amanhã"
- "Mano Rebeca encaixa o João pras duas da tarde" → "Rebeca encaixa João às 14h"
- "Rebeca quanto que eu fiz hoje" → "Rebeca quanto faturei hoje"
- "Rebeca registra gasto de cinquenta pila em produto" → "Rebeca registra gasto de 50 reais em produto"

RUÍDOS — se o áudio for só ruído/silêncio/música sem comando, retorne exatamente: AUDIO_RUIDO

Retorne APENAS o texto transcrito e normalizado, sem explicações, sem aspas.`;

      let transcricao = null;

      // Tentativa 1: transcrição normal
      const transcResp = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: _prompt },
            { type: 'document', source: { type: 'base64', media_type: _mediaType, data: base64 } }
          ]
        }]
      }, {
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        timeout: 60000
      });

      const _raw = transcResp.data?.content?.[0]?.text?.trim();

      // Limpar ruídos comuns de transcrição automática
      const _limpo = (_raw || '')
        .replace(/^(legendado por|traduzido por|transcri[çc][aã]o por|obrigado por assistir|inscreva-se).*/gi, '')
        .replace(/^(música|aplausos|risos|silêncio|barulho|ruído)$/gi, '')
        .replace(/\.{3,}/g, '.')
        .trim();

      if (_limpo && _limpo !== 'AUDIO_RUIDO' && _limpo.length > 1) {
        transcricao = _limpo;
      }

      // Tentativa 2: retry com modelo sonnet se transcricao ficou vazia ou muito curta
      if (!transcricao || transcricao.length < 3) {
        console.log('[Oficial] Transcricao vazia/curta, tentando Sonnet...');
        try {
          const transcResp2 = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-sonnet-4-5',
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: _prompt },
                { type: 'document', source: { type: 'base64', media_type: _mediaType, data: base64 } }
              ]
            }]
          }, {
            headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            timeout: 60000
          });
          const _raw2 = transcResp2.data?.content?.[0]?.text?.trim();
          const _limpo2 = (_raw2 || '')
            .replace(/^(legendado por|traduzido por|transcri[çc][aã]o por).*/gi, '')
            .replace(/^(música|aplausos|risos|silêncio|barulho)$/gi, '')
            .trim();
          if (_limpo2 && _limpo2 !== 'AUDIO_RUIDO' && _limpo2.length > 1) {
            transcricao = _limpo2;
            console.log('[Oficial] Transcricao Sonnet OK:', transcricao.substring(0,80));
          }
        } catch(eRetry) { console.log('[Oficial] Retry Sonnet falhou:', eRetry.message); }
      }

      if (transcricao) {
        console.log('[Oficial] Transcricao final:', transcricao.substring(0,100));
        // Logar transcricao para suporte
        try {
          const { AgendaWhatsappCommandLog } = require('../models/AgendaServico');
          AgendaWhatsappCommandLog.findOneAndUpdate(
            { adminId, origem: 'rebeca_oficial', tipoMensagem: 'audio', status: 'recebido' },
            { $set: { textoTranscrito: transcricao.substring(0,500), status: 'transcrito' } },
            { sort: { createdAt: -1 } }
          ).catch(() => {});
        } catch(_eLog) {}
        await _delegarAoModoDono(telBruto, transcricao, adminId);
        return;
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
        'Oi! Eu sou a Rebeca 💙\n\n' +
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
      const _agoraBR = new Date(agora.getTime() - 3*60*60*1000); // UTC-3
      const hAtual = _agoraBR.getUTCHours() * 60 + _agoraBR.getUTCMinutes();
      const [hAb, mAb] = (cfg.horarioAbertura  || '08:00').split(':').map(Number);
      const [hFe, mFe] = (cfg.horarioFechamento || '18:00').split(':').map(Number);
      const abertura   = hAb * 60 + mAb;
      const fechamento = hFe * 60 + mFe;
      const diaSemana  = _agoraBR.getUTCDay();
      const diasFunc   = cfg.diasFuncionamento || [1,2,3,4,5,6];
      if (!diasFunc.includes(diaSemana) || hAtual < abertura || hAtual > fechamento) {
        console.log('[Oficial] 🕐 Fora do horario — nao respondendo');
        await _responderOficial(telBruto,
          `Oi! 😊 No momento estamos fora do horário de atendimento.

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
