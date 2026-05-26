'use strict';
const express = require('express');
const router  = express.Router();
const { ClienteCozinha, ImpressoraCozinha } = require('../models/cozinha.model');
const { imprimirPedido } = require('../services/cozinha-impressora.service');
const { AdminAgenda } = require('../models/AgendaServico');
const { AdminCozinha, ImpressoraCozinha, ClienteCozinha } = require('../models/cozinha.model');

// ── AUTH simples por token ────────────────────────────────────────
const COZINHA_TOKEN = process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026';
function auth(req, res, next) {
  const token = req.headers['x-cozinha-token'] || req.query.token;
  if (token !== COZINHA_TOKEN) return res.status(401).json({ erro: 'Token inválido' });
  next();
}

// ── CONFIG IMPRESSORA ────────────────────────────────────────────
router.get('/impressora/:adminId', auth, async (req, res) => {
  const imp = await ImpressoraCozinha.findOne({ adminId: req.params.adminId });
  res.json({ sucesso: true, impressora: imp || null });
});

router.post('/impressora/:adminId', auth, async (req, res) => {
  const { ip, porta, nome, ipImpressora, portaImpressora, modoLocal } = req.body;
  if (!ip) return res.status(400).json({ erro: 'IP obrigatório' });
  const imp = await ImpressoraCozinha.findOneAndUpdate(
    { adminId: req.params.adminId },
    { ip, porta: porta || 9100, nome: nome || 'Cozinha', ativo: true,
      ipImpressora: ipImpressora || '', portaImpressora: portaImpressora || 9100,
      modoLocal: !!modoLocal },
    { upsert: true, new: true }
  );
  res.json({ sucesso: true, impressora: imp });
});

// Testar impressora
router.post('/impressora/:adminId/testar', auth, async (req, res) => {
  const imp = await ImpressoraCozinha.findOne({ adminId: req.params.adminId });
  if (!imp) return res.status(404).json({ erro: 'Impressora não configurada' });
  try {
    await imprimirPedido({ ip: imp.ip, porta: imp.porta, texto: 'TESTE DE IMPRESSÃO\nRebeca Cozinha ✓', mesa: 'TESTE' });
    res.json({ sucesso: true, mensagem: 'Impresso com sucesso!' });
  } catch(e) {
    res.status(500).json({ erro: 'Falha ao imprimir: ' + e.message });
  }
});

// ── CLIENTES COZINHA ─────────────────────────────────────────────
router.get('/clientes/:adminId', auth, async (req, res) => {
  const clientes = await ClienteCozinha.find({ adminId: req.params.adminId }).sort({ criadoEm: -1 });
  res.json({ sucesso: true, clientes });
});

router.post('/clientes/:adminId', auth, async (req, res) => {
  const { telefone, nome, mesa } = req.body;
  if (!telefone) return res.status(400).json({ erro: 'Telefone obrigatório' });
  const tel = telefone.replace(/\D/g, '');
  const existe = await ClienteCozinha.findOne({ adminId: req.params.adminId, telefone: tel });
  if (existe) return res.status(409).json({ erro: 'Telefone já cadastrado' });
  const c = await ClienteCozinha.create({ adminId: req.params.adminId, telefone: tel, nome, mesa });

  // Enviar boas-vindas via WhatsApp oficial da Rebeca
  try {
    const MetaWA = require('../services/meta-whatsapp.service');
    const nomeCliente = nome || 'cliente';
    await MetaWA.enviarTexto(tel, `Olá, ${nomeCliente}! 👋 Sou sua assistente Rebeca. 🍽️\n\nA partir de agora, tudo que você me mandar vai direto para a sua cozinha! 🚀`);
  } catch(e) {
    console.error('[Cozinha] Erro ao enviar boas-vindas:', e.message);
  }

  res.json({ sucesso: true, cliente: c });
});

router.delete('/clientes/:adminId/:id', auth, async (req, res) => {
  await ClienteCozinha.findOneAndDelete({ _id: req.params.id, adminId: req.params.adminId });
  res.json({ sucesso: true });
});

// ── LISTAR ADMINS (para o painel saber o adminId) ────────────────
router.get('/admins', auth, async (req, res) => {
  const admins = await AdminCozinha.find({ ativo: true }).select('_id nomeNegocio usuario').lean();
  res.json({ sucesso: true, admins });
});

// Cadastrar novo admin da cozinha
router.post('/admins', auth, async (req, res) => {
  try {
    const { nomeNegocio, usuario, senha } = req.body;
    if (!nomeNegocio || !usuario || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
    const existe = await AdminCozinha.findOne({ usuario });
    if (existe) return res.status(409).json({ erro: 'Usuário já existe' });
    const admin = await AdminCozinha.create({ nomeNegocio, usuario, senha });
    res.json({ sucesso: true, admin: { _id: admin._id, nomeNegocio: admin.nomeNegocio, usuario: admin.usuario } });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// Servir arquivos do painel
const path = require('path');
router.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/cozinha-painel.html'));
});

module.exports = router;
