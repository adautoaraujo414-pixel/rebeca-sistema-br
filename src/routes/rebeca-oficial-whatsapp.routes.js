'use strict';

const express = require('express');
const router  = express.Router();
const {
  processarMensagemOficial,
  isInstanciaOficial,
  _getInstanciaOficial
} = require('../services/agenda-rebeca-oficial.service');

// Valida que o payload veio da instância oficial (banco ou env)
async function validarInstancia(req, res, next) {
  const recebida =
    req.body?.instance                   ||
    req.body?.instanceName               ||
    req.body?.data?.instance             ||
    req.headers['x-evolution-instance']  ||
    '';

  if (!recebida) return next(); // sem info, deixa processar (service filtra)

  const ok = await isInstanciaOficial(recebida);
  if (!ok) {
    console.warn(`[Oficial/Route] 🚫 Instância inválida: "${recebida}"`);
    return res.status(403).json({ ok: false, error: 'Instância não autorizada' });
  }
  next();
}

// POST /api/rebeca-oficial/whatsapp/webhook
router.post('/whatsapp/webhook', validarInstancia, async (req, res) => {
  res.status(200).json({ ok: true }); // responde imediato

  try {
    const payload = req.body;
    const evento  = (payload?.event || payload?.data?.event || '').toLowerCase();
    console.log(`[Oficial/Route] 📥 Evento: "${evento || 'sem event'}"`);

    const eventosMsg = ['messages_upsert', 'messages.upsert', 'message'];
    const temMsg     = !!(payload?.data?.message || payload?.data?.messages?.length || payload?.message);

    if (!eventosMsg.includes(evento) && !temMsg) {
      console.log(`[Oficial/Route] ⏭️  Ignorado: "${evento}"`);
      return;
    }

    await processarMensagemOficial(payload);
  } catch (e) {
    console.error('[Oficial/Route] ❌ Erro:', e.message);
  }
});

// GET /api/rebeca-oficial/whatsapp/status
router.get('/whatsapp/status', async (req, res) => {
  const inst = await _getInstanciaOficial();
  res.json({
    ok          : true,
    configurada : !!inst,
    instancia   : inst?.nomeInstancia || '(não configurada)',
    fonte       : inst ? 'banco/env' : 'nenhuma',
    timestamp   : new Date().toISOString()
  });
});


// GET /api/rebeca-oficial/whatsapp/webhook — verificacao Meta
router.get('/whatsapp/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected  = process.env.META_WA_VERIFY_TOKEN || 'rebeca-webhook-2026';

  console.log('[Oficial/Webhook] GET verify:', { mode, token, challenge });

  if (mode === 'subscribe' && token === expected) {
    console.log('[Oficial/Webhook] ✅ Webhook verificado!');
    return res.status(200).send(challenge);
  }
  console.warn('[Oficial/Webhook] ❌ Token invalido:', token);
  res.status(403).json({ erro: 'Token invalido' });
});

module.exports = router;
