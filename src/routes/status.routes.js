const express = require('express');
const router = express.Router();
const statusService = require('../services/status.service');

router.get('/', (req, res) => {
    const status = statusService.listarTodos();
    res.json(status);
});

router.get('/estatisticas', (req, res) => {
    const estatisticas = statusService.obterEstatisticas();
    res.json(estatisticas);
});

router.get('/validos', (req, res) => {
    res.json(statusService.getStatusValidos());
});

router.get('/disponiveis', (req, res) => {
    const disponiveis = statusService.listarDisponiveis();
    res.json(disponiveis);
});

router.get('/filtro/:status', (req, res) => {
    const lista = statusService.listarPorStatus(req.params.status);
    res.json(lista);
});

router.get('/:motoristaId', (req, res) => {
    const status = statusService.obterStatus(req.params.motoristaId);
    res.json(status);
});

router.put('/:motoristaId', (req, res) => {
    const { status, corridaId, motivo } = req.body;
    
    try {
        const resultado = statusService.definirStatus(req.params.motoristaId, status, { corridaId, motivo });
        res.json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
