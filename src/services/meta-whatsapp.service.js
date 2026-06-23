'use strict';

const axios = require('axios');

// Credenciais globais (fallback quando não há instância específica)
const TOKEN_GLOBAL    = process.env.META_WA_TOKEN;
const PHONE_ID_GLOBAL = process.env.META_WA_PHONE_ID;

// Retorna token e phoneId corretos — prioriza credenciais da instância do admin
function _creds(inst) {
  const token   = inst?.apiKey      || TOKEN_GLOBAL;
  const phoneId = inst?.metaPhoneId || PHONE_ID_GLOBAL;
  return { token, phoneId, base: `https://graph.facebook.com/v20.0/${phoneId}` };
}

function _headers(token) {
  const t = token || TOKEN_GLOBAL;
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}

function _norm(tel) {
  tel = (tel || '').replace(/\D/g, '');
  if (tel.length === 11 && !tel.startsWith('55')) tel = '55' + tel;
  if (tel.length === 10 && !tel.startsWith('55')) tel = '55' + tel;
  return tel;
}

async function enviarTexto(telefone, texto, inst) {
  try {
    const { token, base } = _creds(inst);
    const r = await axios.post(`${base}/messages`, {
      messaging_product: 'whatsapp',
      to: _norm(telefone),
      type: 'text',
      text: { body: texto }
    }, { headers: _headers(token) });
    return { sucesso: true, messageId: r.data?.messages?.[0]?.id };
  } catch(e) {
    console.error('[MetaWA] enviarTexto erro:', e.response?.data || e.message);
    return { sucesso: false, erro: e.response?.data || e.message };
  }
}

async function enviarImagem(telefone, imageUrl, legenda, inst) {
  try {
    const { token, base } = _creds(inst);
    const r = await axios.post(`${base}/messages`, {
      messaging_product: 'whatsapp',
      to: _norm(telefone),
      type: 'image',
      image: { link: imageUrl, caption: legenda || '' }
    }, { headers: _headers() });
    return { sucesso: true, messageId: r.data?.messages?.[0]?.id };
  } catch(e) {
    console.error('[MetaWA] enviarImagem erro:', e.response?.data || e.message);
    return { sucesso: false, erro: e.response?.data || e.message };
  }
}
async function enviarTemplate(telefone, templateName, languageCode, components, inst) {
  try {
    const { token, base } = _creds(inst);
    const body = {
      messaging_product: 'whatsapp',
      to: _norm(telefone),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || 'pt_BR' },
      }
    };
    if (components?.length) body.template.components = components;
    const r = await axios.post(`${base}/messages`, body, { headers: _headers(token) });
    return { sucesso: true, messageId: r.data?.messages?.[0]?.id };
  } catch(e) {
    console.error('[MetaWA] enviarTemplate erro:', e.response?.data || e.message);
    return { sucesso: false, erro: e.response?.data || e.message };
  }
}


async function listarTemplates() {
  try {
    // Buscar WABA_ID via phone number info
    const r = await axios.get(
      `https://graph.facebook.com/v20.0/${PHONE_ID}`,
      { headers: _headers(), params: { fields: 'id,verified_name,quality_rating,platform_type,throughput,webhook_configuration,name_status,new_name_status,decision,requested_verified_name,display_phone_number,about' } }
    );
    // Buscar via business account
    const r2 = await axios.get(
      `https://graph.facebook.com/v20.0/${PHONE_ID}/whatsapp_business_profile`,
      { headers: _headers() }
    );
    // Tentar listar templates via PHONE_ID diretamente (alguns configs permitem)
    const wabaId = process.env.META_WA_WABA_ID || process.env.META_WA_BUSINESS_ACCOUNT_ID;
    if (!wabaId) {
      console.log('[MetaWA] META_WABA_ID nao configurado — retornando info do numero:', JSON.stringify(r.data));
      return [];
    }
    const r3 = await axios.get(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates`,
      { headers: _headers(), params: { limit: 50 } }
    );
    return r3.data?.data || [];
  } catch(e) {
    console.error('[MetaWA] listarTemplates erro:', e.response?.data || e.message);
    return [];
  }
}

async function marcarLido(messageId, inst) {
  try {
    const { token, base } = _creds(inst);
    await axios.post(`${base}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    }, { headers: _headers(token) });
    return { sucesso: true };
  } catch(e) {
    return { sucesso: false };
  }
}

async function testarConexao(inst) {
  try {
    const { token, phoneId } = _creds(inst);
    const r = await axios.get(
      `https://graph.facebook.com/v20.0/${phoneId}`,
      { headers: _headers(token) }
    );
    return { sucesso: true, dados: r.data };
  } catch(e) {
    return { sucesso: false, erro: e.response?.data || e.message };
  }
}

module.exports = { enviarTexto, enviarImagem, enviarTemplate, listarTemplates, marcarLido, testarConexao, _norm };
