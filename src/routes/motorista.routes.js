const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');

router.get('/', (req, res) => {
    const filtros = {
        status: req.query.status,
        ativo: req.query.ativo === 'true' ? true : req.query.ativo === 'false' ? false : undefined,
        busca: req.query.busca
    };
    const motoristas = MotoristaService.listarTodos(filtros);
    res.json(motoristas);
});

router.get('/estatisticas', (req, res) => {
    const estatisticas = MotoristaService.obterEstatisticas();
    res.json(estatisticas);
});

router.get('/:id', (req, res) => {
    const motorista = MotoristaService.buscarPorId(req.params.id);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json(motorista);
});

router.post('/', (req, res) => {
    try {
        const motorista = MotoristaService.criar(req.body);
        res.status(201).json(motorista);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id', (req, res) => {
    const motorista = MotoristaService.atualizar(req.params.id, req.body);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json(motorista);
});

router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    try {
        const motorista = MotoristaService.atualizarStatus(req.params.id, status);
        if (!motorista) {
            return res.status(404).json({ error: 'Motorista não encontrado' });
        }
        res.json(motorista);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/:id', (req, res) => {
    const motorista = MotoristaService.buscarPorId(req.params.id);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    MotoristaService.atualizar(req.params.id, { ativo: false });
    res.json({ sucesso: true, mensagem: 'Motorista desativado' });
});

module.exports = router;
