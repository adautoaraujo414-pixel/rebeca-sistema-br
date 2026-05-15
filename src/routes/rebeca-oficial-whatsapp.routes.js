// rebeca-oficial-whatsapp.routes.js
// POST /api/rebeca-oficial/whatsapp/webhook
// GET  /api/rebeca-oficial/whatsapp/status
//
// Registrar no server/app principal:
//   const oficialRoutes = require('./src/routes/rebeca-oficial-whatsapp.routes');
//   app.use('/api/rebeca-oficial', oficialRoutes);

'use strict';

const express = require('express');
const router  = express.Router();
const {
  processarMensagemOficial,
  OFICIAL_INSTANCE
} = require('../services/agenda-rebeca-oficial.service');

function validarInstancia(req, res, next) {
  const recebida =
    req.body?.instance                      ||
    req.body?.instanceName                  ||
    req.body?.data?.instance                ||
    req.headers['x-evolution-instance']     ||
    '';

  if (!OFICIAL_INSTANCE) {
    console.warn('[Oficial/Route] ⚠️  REBECA_OFICIAL_EVOLUTION_INSTANCE não definida');
    return next();
  }

  if (recebida && recebida !== OFICIAL_INSTANCE) {
    console.warn(`[Oficial/Route] 🚫 Instância inválida: "${recebida}"`);
    return res.status(403).json({ ok: false, error: 'Instância não autorizada' });
  }

  next();
}

router.post('/whatsapp/webhook', validarInstancia, async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const payload = req.body;
    const evento  = payload?.event || payload?.data?.event || '';

    console.log(`[Oficial/Route] 📥 Evento: "${evento || 'sem event'}"`);

    const eventosMsg   = ['messages_upsert', 'messages.upsert', 'message'];
    const isEvento     = eventosMsg.includes(evento.toLowerCase());
    const temMsg       = !!(
      payload?.data?.message            ||
      payload?.data?.messages?.length   ||
      payload?.message
    );

    if (!isEvento && !temMsg) {
      console.log(`[Oficial/Route] ⏭️  Evento "${evento}" ignorado`);
      return;
    }

    await processarMensagemOficial(payload);

  } catch (e) {
    console.error('[Oficial/Route] ❌ Erro:', e.message);
  }
});

router.get('/whatsapp/status', (req, res) => {
  res.json({
    ok         : true,
    instancia  : OFICIAL_INSTANCE || '(não configurada)',
    configurada: !!OFICIAL_INSTANCE,
    timestamp  : new Date().toISOString()
  });
});

module.exports = router;
