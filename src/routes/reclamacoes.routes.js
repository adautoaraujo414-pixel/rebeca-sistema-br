const express = require('express');
const router = express.Router();
const LogsService = require('../services/logs.service');
const { Corrida, Motorista, Cliente } = require('../models');

const getAdminId = (req) => req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || null;

// Listar reclamações (corridas com avaliação ruim ou canceladas pelo cliente)
router.get('/', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
        const query = { adminId, motivoCancelamento: { $exists: true, $ne: null } };
        if (req.query.status) query.status = req.query.status;
        const reclamacoes = await Corrida.find(query).sort({ createdAt: -1 }).limit(100);
        res.json(reclamacoes);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Estatísticas
router.get('/estatisticas', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
        const total = await Corrida.countDocuments({ adminId, motivoCancelamento: { $exists: true, $ne: null } });
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const hoje_count = await Corrida.countDocuments({ adminId, motivoCancelamento: { $exists: true }, createdAt: { $gte: hoje } });
        res.json({ total, hoje: hoje_count });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
        const corrida = await Corrida.findOne({ _id: req.params.id, adminId });
        if (!corrida) return res.status(404).json({ error: 'Reclamação não encontrada' });
        res.json(corrida);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
