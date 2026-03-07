const cache = require('../middlewares/cache');
const express = require('express');
const router = express.Router();
const EstatisticasService = require('../services/estatisticas.service');

// Dashboard completo
router.get('/dashboard', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        const dashboard = await EstatisticasService.dashboardCompleto(adminId);
        res.json(dashboard);
    } catch (e) {
        res.status(500).json({ erro: e.message, stack: e.stack?.split('\n')[0] });
    }
});

// Corridas por dia
router.get('/corridas-por-dia', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        // adminId opcional — sem ele retorna dados globais
        const dias = parseInt(req.query.dias) || 7;
        const resultado = await EstatisticasService.corridasPorDia(dias, adminId);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Faturamento por período
router.get('/faturamento', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        // adminId opcional — sem ele retorna dados globais
        const periodo = req.query.periodo || 'hoje';
        const resultado = await EstatisticasService.faturamentoPorPeriodo(periodo, adminId);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Ranking motoristas
router.get('/ranking-motoristas', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        // adminId opcional — sem ele retorna dados globais
        const limite = parseInt(req.query.limite) || 5;
        const ranking = await EstatisticasService.rankingMotoristas(limite, adminId);
        res.json(ranking);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

router.get('/ranking', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        // adminId opcional — sem ele retorna dados globais
        const limite = parseInt(req.query.limite) || 10;
        const ranking = await EstatisticasService.rankingMotoristas(limite, adminId);
        res.json(ranking);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Horários de pico
router.get('/horarios-pico', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        // adminId opcional — sem ele retorna dados globais
        const horarios = await EstatisticasService.horariosPico(adminId);
        res.json(horarios);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Estatísticas de cancelamento
router.get('/cancelamentos', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        // adminId opcional — sem ele retorna dados globais
        const stats = await EstatisticasService.estatisticasCancelamento(adminId);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});




module.exports = router;
