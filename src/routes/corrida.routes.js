const express = require('express');
const router = express.Router();
const CorridaService = require('../services/corrida.service');

router.get('/', (req, res) => {
    const filtros = {
        status: req.query.status,
        motoristaId: req.query.motoristaId,
        clienteId: req.query.clienteId
    };
    const corridas = CorridaService.listarTodas(filtros);
    res.json(corridas);
});

router.get('/estatisticas', (req, res) => {
    const estatisticas = CorridaService.obterEstatisticas();
    res.json(estatisticas);
});

router.get('/pendentes', (req, res) => {
    const corridas = CorridaService.listarPendentes();
    res.json(corridas);
});

router.get('/ativas', (req, res) => {
    const corridas = CorridaService.listarAtivas();
    res.json(corridas);
});

router.get('/:id', (req, res) => {
    const corrida = CorridaService.buscarPorId(req.params.id);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.post('/', (req, res) => {
    try {
        const corrida = CorridaService.criar(req.body);
        res.status(201).json(corrida);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id/atribuir', (req, res) => {
    const { motoristaId, motoristaNome } = req.body;
    const corrida = CorridaService.atribuirMotorista(req.params.id, motoristaId, motoristaNome);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.put('/:id/iniciar', (req, res) => {
    const corrida = CorridaService.iniciar(req.params.id);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.put('/:id/finalizar', (req, res) => {
    const { precoFinal } = req.body;
    const corrida = CorridaService.finalizar(req.params.id, precoFinal);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.put('/:id/cancelar', (req, res) => {
    const { motivo } = req.body;
    const corrida = CorridaService.cancelar(req.params.id, motivo);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

module.exports = router;
