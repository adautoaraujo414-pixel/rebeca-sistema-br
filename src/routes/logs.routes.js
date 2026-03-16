const express = require('express');
const router = express.Router();
const LogsService = require('../services/logs.service');

// Listar logs
router.get('/', (req, res) => {
    const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId;
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    const filtros = {
        adminId,
        tipo: req.query.tipo,
        usuarioId: req.query.usuarioId,
        usuarioTipo: req.query.usuarioTipo,
        dataInicio: req.query.dataInicio,
        dataFim: req.query.dataFim,
        limite: req.query.limite || 100
    };
    res.json(LogsService.listar(filtros));
});

// Estatísticas
router.get('/estatisticas', (req, res) => {
    res.json(LogsService.obterEstatisticas());
});

// Buscar por ID
router.get('/:id', (req, res) => {
    const log = LogsService.buscarPorId(req.params.id);
    if (!log) return res.status(404).json({ error: 'Log não encontrado' });
    res.json(log);
});

module.exports = router;
