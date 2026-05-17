'use strict';

const axios = require('axios');

const TOKEN    = process.env.META_WA_TOKEN;
const PHONE_ID = process.env.META_WA_PHONE_ID;
const BASE     = `https://graph.facebook.com/v20.0/${PHONE_ID}`;

function _headers() {
  return { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
}

function _norm(tel) {
  tel = (tel || '').replace(/\D/g, '');
  if (tel.length === 11 && !tel.startsWith('55')) tel = '55' + tel;
  if (tel.length === 10 && !tel.startsWith('55')) tel = '55' + tel;
  return tel;
}

async function enviarTexto(telefone, texto) {
  try {
    const r = await axios.post(`${BASE}/messages`, {
      messaging_product: 'whatsapp',
      to: _norm(telefone),
      type: 'text',
      text: { body: texto }
    }, { headers: _headers() });
    return { sucesso: true, messageId: r.data?.messages?.[0]?.id };
  } catch(e) {
    console.error('[MetaWA] enviarTexto erro:', e.response?.data || e.message);
    return { sucesso: false, erro: e.response?.data || e.message };
  }
}

async function enviarTemplate(telefone, templateName, languageCode, components) {
  try {
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
    const r = await axios.post(`${BASE}/messages`, body, { headers: _headers() });
    return { sucesso: true, messageId: r.data?.messages?.[0]?.id };
  } catch(e) {
    console.error('[MetaWA] enviarTemplate erro:', e.response?.data || e.message);
    return { sucesso: false, erro: e.response?.data || e.message };
  }
}

async function marcarLido(messageId) {
  try {
    await axios.post(`${BASE}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    }, { headers: _headers() });
    return { sucesso: true };
  } catch(e) {
    return { sucesso: false };
  }
}

async function testarConexao() {
  try {
    const r = await axios.get(
      `https://graph.facebook.com/v20.0/${PHONE_ID}`,
      { headers: _headers() }
    );
    return { sucesso: true, dados: r.data };
  } catch(e) {
    return { sucesso: false, erro: e.response?.data || e.message };
  }
}

module.exports = { enviarTexto, enviarTemplate, marcarLido, testarConexao, _norm };
