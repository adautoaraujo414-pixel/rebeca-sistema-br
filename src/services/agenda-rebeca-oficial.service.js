// agenda-rebeca-oficial.service.js
// WhatsApp Oficial da Rebeca — canal exclusivo para admins/donos
// NÃO atende clientes finais. NÃO substitui WhatsApp do negócio.

'use strict';

const axios = require('axios');
const { AdminAgenda } = require('../models/AgendaServico');
const { getAgendaPlanFeatures } = require('../utils/agenda-plan-features');

const OFICIAL_INSTANCE = (process.env.REBECA_OFICIAL_EVOLUTION_INSTANCE || '').trim();
const OFICIAL_KEY      = (process.env.REBECA_OFICIAL_EVOLUTION_KEY || process.env.EVOLUTION_API_KEY || '').trim();
const EVOLUTION_URL    = (process.env.EVOLUTION_API_URL || 'https://evolution-api-production-794f.up.railway.app').replace(/\/$/, '');

const _apresentados = new Set();

function _norm(tel) {
  if (!tel) return '';
  return String(tel).replace(/\D/g, '').replace(/^0/, '');
}

function _mask(tel) {
  if (!tel || tel.length < 4) return '****';
  return '*'.repeat(Math.max(0, tel.length - 4)) + tel.slice(-4);
}

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

async function _responderOficial(numero, texto) {
  if (!OFICIAL_INSTANCE || !OFICIAL_KEY) {
    console.warn('[Oficial] ⚠️  Defina REBECA_OFICIAL_EVOLUTION_INSTANCE e REBECA_OFICIAL_EVOLUTION_KEY');
    return;
  }
  try {
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${OFICIAL_INSTANCE}`,
      { number: numero, text: texto },
      { headers: { apikey: OFICIAL_KEY, 'Content-Type': 'application/json' }, timeout: 12000 }
    );
    console.log(`[Oficial] ✅ Enviado → ${_mask(_norm(numero.replace('@s.whatsapp.net', '')))}`);
  } catch (e) {
    console.error('[Oficial] ❌ Erro ao enviar:', e.response?.data || e.message);
  }
}

async function _buscarAdminsPorTelefone(telNorm) {
  const admins = await AdminAgenda.find({ ativo: true })
    .select('_id nome nomeNegocio telefone whatsapp celular plano modoWhatsappDono')
    .lean();

  return admins.filter(a => {
    const candidatos = [
      a.telefone, a.whatsapp, a.celular,
      ...((a.modoWhatsappDono?.telefonesAutorizados) || [])
    ].filter(Boolean).map(_norm);

    return candidatos.some(c =>
      c && (telNorm === c || telNorm.endsWith(c) || c.endsWith(telNorm))
    );
  });
}

function _planoPermite(plano) {
  const f = getAgendaPlanFeatures(plano);
  return !!(f?.canUseWhatsappAutomation);
}

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

async function _tratarMidia(tipo, telBruto) {
  const r = {
    audio    : 'Recebi seu áudio, mas transcrição ainda não está disponível. Me envie por texto. 😊',
    imagem   : 'Recebi a imagem. Se quiser registrar um gasto, manda valor e categoria por texto. 😊',
    video    : 'Recebi o vídeo. Por enquanto só processo comandos de texto. 😊',
    documento: 'Recebi o documento. Me manda o que precisa em texto. 😊'
  };
  await _responderOficial(telBruto, r[tipo] || 'Só processo texto por aqui. 😊');
}

async function _delegarAoModoDono(telBruto, texto, adminId) {
  try {
    const ModoDono = require('./agenda-modo-dono.service');
    if (typeof ModoDono.processarComandoAdmin === 'function') {
      return await ModoDono.processarComandoAdmin(texto, adminId, {
        canal    : 'rebeca_oficial',
        instance : OFICIAL_INSTANCE,
        apiKey   : OFICIAL_KEY,
        apiUrl   : EVOLUTION_URL,
        numero   : telBruto
      });
    }
    console.warn('[Oficial] ⚠️  agenda-modo-dono.service.js ainda não exporta processarComandoAdmin');
    return false;
  } catch (e) {
    console.error('[Oficial] Erro ao delegar ao ModoDono:', e.message);
    return false;
  }
}

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

    if (!_planoPermite(admin.plano)) {
      console.log(`[Oficial] 🔒 Plano sem permissão: ${admin.plano}`);
      await _responderOficial(telBruto,
        '🔒 Esse recurso faz parte do plano Rebeca Agenda completo. 💙\n\n' +
        'Fale com a equipe da Rebeca para liberar o *Modo Rebeca pelo WhatsApp*.'
      );
      return;
    }

    const foiApresentado = await _apresentarSeNecessario(admin, telBruto);
    if (foiApresentado && (!texto || texto.trim().length < 5)) return;

    if (midia) { await _tratarMidia(midia, telBruto); return; }
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

function isInstanciaOficial(nomeInstancia) {
  return !!(OFICIAL_INSTANCE && nomeInstancia && nomeInstancia === OFICIAL_INSTANCE);
}

module.exports = { processarMensagemOficial, isInstanciaOficial, OFICIAL_INSTANCE };
