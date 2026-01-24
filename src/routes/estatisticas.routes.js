const express = require('express');
const router = express.Router();
const EstatisticasService = require('../services/estatisticas.service');

// Dashboard completo
router.get('/dashboard', (req, res) => {
    res.json(EstatisticasService.dashboardCompleto());
});

// Corridas por dia
router.get('/corridas-por-dia', (req, res) => {
    const dias = parseInt(req.query.dias) || 7;
    res.json(EstatisticasService.corridasPorDia(dias));
});

// Corridas por semana
router.get('/corridas-por-semana', (req, res) => {
    const semanas = parseInt(req.query.semanas) || 4;
    res.json(EstatisticasService.corridasPorSemana(semanas));
});

// Horários de pico
router.get('/horarios-pico', (req, res) => {
    res.json(EstatisticasService.horariosPico());
});

// Ranking motoristas
router.get('/ranking-motoristas', (req, res) => {
    const limite = parseInt(req.query.limite) || 10;
    const periodo = req.query.periodo || 'mes';
    res.json(EstatisticasService.rankingMotoristas(limite, periodo));
});

// Faturamento por dia
router.get('/faturamento-por-dia', (req, res) => {
    const dias = parseInt(req.query.dias) || 30;
    res.json(EstatisticasService.faturamentoPorDia(dias));
});

// Faturamento resumo
router.get('/faturamento-resumo', (req, res) => {
    res.json(EstatisticasService.faturamentoResumo());
});

module.exports = router;
