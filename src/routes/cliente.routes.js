const express = require('express');
const router = express.Router();
const ClienteService = require('../services/cliente.service');

// Middleware para extrair adminId
const getAdminId = (req) => {
    return req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || null;
};

router.get('/', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.json([]);
        const clientes = await ClienteService.listar(adminId);
        res.json(clientes);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/estatisticas', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.json({ total: 0, ativos: 0, bloqueados: 0, novos: 0 });
        const estatisticas = await ClienteService.estatisticas(adminId);
        res.json(estatisticas);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/telefone/:telefone', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        const cliente = await ClienteService.buscarPorTelefone(req.params.telefone, adminId);
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
    try {
        const cliente = await ClienteService.buscarPorId(req.params.id);
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
    try {
        const adminId = getAdminId(req) || req.body.adminId;
        const cliente = await ClienteService.criar({ ...req.body, adminId });
        res.status(201).json(cliente);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const cliente = await ClienteService.atualizar(req.params.id, req.body);
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/bloquear', async (req, res) => {
    try {
        const { motivo } = req.body;
        const cliente = await ClienteService.bloquear(req.params.id, motivo);
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/desbloquear', async (req, res) => {
    try {
        const cliente = await ClienteService.desbloquear(req.params.id);
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
