const express = require('express');
const router = express.Router();
const ClienteService = require('../services/cliente.service');

router.get('/', (req, res) => {
    const filtros = {
        bloqueado: req.query.bloqueado === 'true' ? true : req.query.bloqueado === 'false' ? false : undefined,
        busca: req.query.busca
    };
    const clientes = ClienteService.listarTodos(filtros);
    res.json(clientes);
});

router.get('/estatisticas', (req, res) => {
    const estatisticas = ClienteService.obterEstatisticas();
    res.json(estatisticas);
});

router.get('/niveis', (req, res) => {
    res.json(ClienteService.NIVEIS);
});

router.get('/telefone/:telefone', (req, res) => {
    const cliente = ClienteService.buscarPorTelefone(req.params.telefone);
    if (!cliente) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(cliente);
});

router.get('/:id', (req, res) => {
    const cliente = ClienteService.buscarPorId(req.params.id);
    if (!cliente) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(cliente);
});

router.post('/', (req, res) => {
    try {
        const cliente = ClienteService.criar(req.body);
        res.status(201).json(cliente);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id', (req, res) => {
    const cliente = ClienteService.atualizar(req.params.id, req.body);
    if (!cliente) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(cliente);
});

router.put('/:id/bloquear', (req, res) => {
    const { motivo } = req.body;
    const cliente = ClienteService.bloquear(req.params.id, motivo);
    if (!cliente) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(cliente);
});

router.put('/:id/desbloquear', (req, res) => {
    const cliente = ClienteService.desbloquear(req.params.id);
    if (!cliente) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(cliente);
});

module.exports = router;
