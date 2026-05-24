'use strict';

const express = require('express');
const router  = express.Router();
const MetaWA  = require('../services/meta-whatsapp.service');

const VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN || 'rebeca-webhook-2026';

// ── VERIFICAÇÃO WEBHOOK META ─────────────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[MetaWA] Webhook verificado ✅');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ erro: 'Token inválido' });
});

// ── RECEBER MENSAGENS ────────────────────────────────────────────
router.post('/webhook', express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes?.messages?.length) return;

    const msg      = changes.messages[0];
    const telefone = msg.from;
    const tipo     = msg.type;
    const texto    = msg?.text?.body || '';
    const msgId    = msg.id;

    console.log(`[MetaWA] msg de ${telefone}: "${texto}"`);

    await MetaWA.marcarLido(msgId);

    // Roteamento por módulo
    if (tipo === 'text') {
      await processarComando(telefone, texto, msgId);
    }
  } catch(e) {
    console.error('[MetaWA] webhook erro:', e.message);
  }
});

// ── PROCESSAR COMANDO ────────────────────────────────────────────
async function processarComando(telefone, texto, msgId) {
  try {
    const { AdminAgenda } = require('../models/AgendaServico');
    const admin = await AdminAgenda.findOne({
      $or: [
        { telefone: { $regex: telefone.replace('55',''), $options:'i' } },
        { whatsappOficial: telefone }
      ],
      ativo: true
    });

    if (!admin) {
      await MetaWA.enviarTexto(telefone,
        'Olá! Não encontrei sua conta na Rebeca. Acesse rebeca-sistema-br.onrender.com para se cadastrar.'
      );
      return;
    }

    // Passa para IA da Agenda
    const AgendaModo = require('../services/agenda-modo-dono.service');
    await AgendaModo.processarMensagemDono({
      adminId:  String(admin._id),
      telefone,
      texto,
      msgId,
      canal:    'meta'
    });

  } catch(e) {
    console.error('[MetaWA] processarComando erro:', e.message);
    await MetaWA.enviarTexto(telefone, 'Ocorreu um erro. Tente novamente em instantes.');
  }
}

// ── TESTAR CONEXÃO ───────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const r = await MetaWA.testarConexao();
  res.json(r);
});

// ── ENVIAR TESTE ─────────────────────────────────────────────────
router.post('/enviar-teste', async (req, res) => {
  const { telefone, mensagem } = req.body;
  const r = await MetaWA.enviarTexto(telefone, mensagem || 'Teste Rebeca Plataforma ✅');
  res.json(r);
});

module.exports = router;
