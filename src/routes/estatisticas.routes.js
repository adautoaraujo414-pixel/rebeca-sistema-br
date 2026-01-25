const express = require('express');
const router = express.Router();
const EstatisticasService = require('../services/estatisticas.service');

// Dashboard completo
router.get('/dashboard', async (req, res) => {
    try {
        const dashboard = await EstatisticasService.dashboardCompleto();
        res.json(dashboard);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Corridas por dia
router.get('/corridas-por-dia', async (req, res) => {
    try {
        const dias = parseInt(req.query.dias) || 7;
        const resultado = await EstatisticasService.corridasPorDia(dias);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Faturamento por período
router.get('/faturamento', async (req, res) => {
    try {
        const periodo = req.query.periodo || 'hoje';
        const resultado = await EstatisticasService.faturamentoPorPeriodo(periodo);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Ranking motoristas
router.get('/ranking', async (req, res) => {
    try {
        const limite = parseInt(req.query.limite) || 10;
        const ranking = await EstatisticasService.rankingMotoristas(limite);
        res.json(ranking);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Horários de pico
router.get('/horarios-pico', async (req, res) => {
    try {
        const horarios = await EstatisticasService.horariosPico();
        res.json(horarios);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Estatísticas de cancelamento
router.get('/cancelamentos', async (req, res) => {
    try {
        const stats = await EstatisticasService.estatisticasCancelamento();
        res.json(stats);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;
