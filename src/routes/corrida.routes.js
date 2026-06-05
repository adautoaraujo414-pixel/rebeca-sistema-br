const express = require('express');
const router = express.Router();
const CorridaService = require('../services/corrida.service');

// Middleware para extrair adminId
const getAdminId = (req) => {
    return req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || null;
};

router.get('/', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.json([]);
        const filtros = { status: req.query.status, motoristaId: req.query.motoristaId, clienteId: req.query.clienteId };
        const corridas = await CorridaService.listar(adminId, filtros);
        res.json(corridas);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/estatisticas', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.json({ total: 0, hoje: 0, pendentes: 0, emAndamento: 0, finalizadas: 0, canceladas: 0, faturamentoHoje: 0 });
        const estatisticas = await CorridaService.estatisticas(adminId);
        res.json(estatisticas);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/pendentes', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.json([]);
        const corridas = await CorridaService.listarPendentes(adminId);
        res.json(corridas);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/ativas', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.json([]);
        const corridas = await CorridaService.listarAtivas(adminId);
        res.json(corridas);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
    try {
        const corrida = await CorridaService.buscarPorId(req.params.id);
        if (!corrida) return res.status(404).json({ error: 'Corrida não encontrada' });
        // Bug A fix: verificar que corrida pertence ao admin solicitante
        const adminId = getAdminId(req);
        if (adminId && corrida.adminId && String(corrida.adminId) !== String(adminId)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        res.json(corrida);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
    try {
        // Bug B fix: validar campos obrigatórios antes de criar
        const { origem, destino, clienteTelefone, adminId: bodyAdminId } = req.body;
        if (!origem) return res.status(400).json({ error: 'Campo obrigatório: origem' });
        if (!destino) return res.status(400).json({ error: 'Campo obrigatório: destino' });
        if (!clienteTelefone) return res.status(400).json({ error: 'Campo obrigatório: clienteTelefone' });
        const adminId = getAdminId(req) || bodyAdminId;
        if (!adminId) return res.status(400).json({ error: 'Campo obrigatório: adminId' });
        const corrida = await CorridaService.criar({ ...req.body, adminId });
        res.status(201).json(corrida);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id/atribuir', async (req, res) => {
    try {
        const { motoristaId, motoristaNome } = req.body;
        const corrida = await CorridaService.atribuirMotorista(req.params.id, motoristaId, motoristaNome);
        if (!corrida) return res.status(404).json({ error: 'Corrida não encontrada' });
        res.json(corrida);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/iniciar', async (req, res) => {
    try {
        const corrida = await CorridaService.iniciarCorrida(req.params.id);
        if (!corrida) return res.status(404).json({ error: 'Corrida não encontrada' });
        res.json(corrida);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/finalizar', async (req, res) => {
    try {
        const { precoFinal } = req.body;
        const corrida = await CorridaService.finalizarCorrida(req.params.id, precoFinal);
        if (!corrida) return res.status(404).json({ error: 'Corrida não encontrada' });
        res.json(corrida);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/cancelar', async (req, res) => {
    try {
        const { motivo } = req.body;
        const corrida = await CorridaService.cancelarCorrida(req.params.id, motivo);
        if (!corrida) return res.status(404).json({ error: 'Corrida não encontrada' });
        res.json(corrida);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
