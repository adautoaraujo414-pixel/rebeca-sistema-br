const express = require('express');
const router = express.Router();
const CorridaService = require('../services/corrida.service');

// Middleware para extrair adminId
const getAdminId = (req) => {
    return req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || null;
};

router.get('/', async (req, res) => {
    const adminId = getAdminId(req);
    if (!adminId) return res.json([]); // Sem adminId = array vazio (segurança)
    
    const filtros = {
        status: req.query.status,
        motoristaId: req.query.motoristaId,
        clienteId: req.query.clienteId
    };
    const corridas = await CorridaService.listar(adminId, filtros);
    res.json(corridas);
});

router.get('/estatisticas', async (req, res) => {
    const adminId = getAdminId(req);
    if (!adminId) return res.json({ total: 0, hoje: 0, pendentes: 0, emAndamento: 0, finalizadas: 0, canceladas: 0, faturamentoHoje: 0 });
    
    const estatisticas = await CorridaService.estatisticas(adminId);
    res.json(estatisticas);
});

router.get('/pendentes', async (req, res) => {
    const adminId = getAdminId(req);
    if (!adminId) return res.json([]);
    
    const corridas = await CorridaService.listarPendentes(adminId);
    res.json(corridas);
});

router.get('/ativas', async (req, res) => {
    const adminId = getAdminId(req);
    if (!adminId) return res.json([]);
    
    const corridas = await CorridaService.listarAtivas(adminId);
    res.json(corridas);
});

router.get('/:id', async (req, res) => {
    const corrida = await CorridaService.buscarPorId(req.params.id);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.post('/', async (req, res) => {
    try {
        const corrida = await CorridaService.criar(req.body);
        res.status(201).json(corrida);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id/atribuir', async (req, res) => {
    const { motoristaId, motoristaNome } = req.body;
    const corrida = await CorridaService.atribuirMotorista(req.params.id, motoristaId, motoristaNome);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.put('/:id/iniciar', async (req, res) => {
    const corrida = await CorridaService.iniciarCorrida(req.params.id);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.put('/:id/finalizar', async (req, res) => {
    const { precoFinal } = req.body;
    const corrida = await CorridaService.finalizarCorrida(req.params.id, precoFinal);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

router.put('/:id/cancelar', async (req, res) => {
    const { motivo } = req.body;
    const corrida = await CorridaService.cancelarCorrida(req.params.id, motivo);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    res.json(corrida);
});

module.exports = router;
