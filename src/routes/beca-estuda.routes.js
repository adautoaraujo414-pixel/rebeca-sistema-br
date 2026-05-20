const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Schema simples de assinante
const becaAssinanteSchema = new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  whatsapp: String,
  curso: String,
  status: { type: String, default: 'trial', enum: ['trial','ativo','cancelado','bloqueado'] },
  plano: { type: String, default: 'mensal' },
  valor: { type: Number, default: 59.90 },
  dataVencimento: Date,
  criadoEm: { type: Date, default: Date.now }
});

const BecaAssinante = mongoose.models.BecaAssinante || mongoose.model('BecaAssinante', becaAssinanteSchema);

// GET — listar todos
router.get('/', async (req, res) => {
  try {
    const lista = await BecaAssinante.find().sort({ criadoEm: -1 });
    res.json(lista);
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST — criar assinante
router.post('/', async (req, res) => {
  try {
    const doc = await BecaAssinante.create({
      ...req.body,
      dataVencimento: new Date(Date.now() + 30*24*60*60*1000)
    });
    res.json({ sucesso: true, _id: doc._id });
  } catch(e) {
    res.status(400).json({ erro: e.message });
  }
});

// PUT — atualizar assinante
router.put('/:id', async (req, res) => {
  try {
    await BecaAssinante.findByIdAndUpdate(req.params.id, req.body);
    res.json({ sucesso: true });
  } catch(e) {
    res.status(400).json({ erro: e.message });
  }
});

// DELETE — remover assinante
router.delete('/:id', async (req, res) => {
  try {
    await BecaAssinante.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true });
  } catch(e) {
    res.status(400).json({ erro: e.message });
  }
});

module.exports = router;
