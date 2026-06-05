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
        // Bug 1 fix: verificar que cliente pertence ao admin solicitante
        const adminId = getAdminId(req);
        if (adminId && cliente.adminId && String(cliente.adminId) !== String(adminId)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
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
        // Bug 2 fix: verificar posse antes de atualizar
        const _cli = await ClienteService.buscarPorId(req.params.id);
        if (!_cli) return res.status(404).json({ error: 'Cliente não encontrado' });
        const adminId = getAdminId(req);
        if (adminId && _cli.adminId && String(_cli.adminId) !== String(adminId)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const cliente = await ClienteService.atualizar(req.params.id, req.body);
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/bloquear', async (req, res) => {
    try {
        const { motivo } = req.body;
        const _cliB = await ClienteService.buscarPorId(req.params.id);
        if (!_cliB) return res.status(404).json({ error: 'Cliente não encontrado' });
        const adminId = getAdminId(req);
        if (adminId && _cliB.adminId && String(_cliB.adminId) !== String(adminId)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const cliente = await ClienteService.bloquear(req.params.id, motivo);
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/desbloquear', async (req, res) => {
    try {
        const _cliD = await ClienteService.buscarPorId(req.params.id);
        if (!_cliD) return res.status(404).json({ error: 'Cliente não encontrado' });
        const adminId = getAdminId(req);
        if (adminId && _cliD.adminId && String(_cliD.adminId) !== String(adminId)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const cliente = await ClienteService.desbloquear(req.params.id);
        res.json(cliente);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
