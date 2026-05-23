const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const getAdminId = (req) => req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || null;

// Schema inline caso PontoReferencia nao esteja nos models
let PontoReferencia;
try {
    PontoReferencia = require('../models').PontoReferencia;
} catch(e){ console.error("[pontos-referencia.routes.js]", e.message); }
if (!PontoReferencia) {
    const schema = new mongoose.Schema({
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        nome: String,
        tipo: { type: String, default: 'outro' },
        endereco: String,
        latitude: Number,
        longitude: Number,
        apelidos: [String],
        ativo: { type: Boolean, default: true }
    }, { timestamps: true });
    PontoReferencia = mongoose.models.PontoReferencia || mongoose.model('PontoReferencia', schema);
}

// Listar pontos
router.get('/', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) return res.json([]);
        const aid = new mongoose.Types.ObjectId(adminId);
        const pontos = await PontoReferencia.find({ adminId: aid, ativo: true }).sort({ nome: 1 });
        res.json(pontos);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Tipos disponiveis
router.get('/tipos', (req, res) => {
    res.json([
        { valor: 'shopping', label: 'Shopping' },
        { valor: 'hospital', label: 'Hospital' },
        { valor: 'escola', label: 'Escola' },
        { valor: 'terminal', label: 'Terminal/Estacao' },
        { valor: 'aeroporto', label: 'Aeroporto' },
        { valor: 'outro', label: 'Outro' }
    ]);
});

// Buscar por texto
router.get('/buscar', async (req, res) => {
    try {
        const { texto, adminId: qAdminId } = req.query;
        if (!texto) return res.status(400).json({ error: 'Texto obrigatorio' });
        const adminId = getAdminId(req);
        const query = { ativo: true, nome: { $regex: texto, $options: 'i' } };
        if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
            query.adminId = new mongoose.Types.ObjectId(adminId);
        }
        const pontos = await PontoReferencia.find(query).limit(10);
        res.json(pontos);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const ponto = await PontoReferencia.findById(req.params.id);
        if (!ponto) return res.status(404).json({ error: 'Nao encontrado' });
        res.json(ponto);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Criar ponto
router.post('/', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatorio' });
        const aid = new mongoose.Types.ObjectId(adminId);
        const ponto = await PontoReferencia.create({
            adminId: aid,
            nome: req.body.nome,
            tipo: req.body.tipo || 'outro',
            endereco: req.body.endereco || '',
            latitude: req.body.latitude || null,
            longitude: req.body.longitude || null,
            apelidos: req.body.apelidos || [],
            ativo: true
        });
        res.status(201).json(ponto);
    } catch(e) { res.status(400).json({ error: e.message }); }
});

// Atualizar ponto
router.put('/:id', async (req, res) => {
    try {
        const ponto = await PontoReferencia.findByIdAndUpdate(
            req.params.id, { $set: req.body }, { new: true }
        );
        if (!ponto) return res.status(404).json({ error: 'Nao encontrado' });
        res.json(ponto);
    } catch(e) { res.status(400).json({ error: e.message }); }
});

// Deletar ponto
router.delete('/:id', async (req, res) => {
    try {
        await PontoReferencia.findByIdAndUpdate(req.params.id, { ativo: false });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
