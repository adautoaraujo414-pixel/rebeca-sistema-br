const express = require('express');
const router = express.Router();
const RebecaIntegradaService = require('../services/rebeca-integrada.service');

router.get('/dashboard', (req, res) => {
    const dashboard = RebecaIntegradaService.obterDashboard();
    res.json(dashboard);
});

router.post('/solicitar-corrida', async (req, res) => {
    try {
        const resultado = await RebecaIntegradaService.solicitarCorrida(req.body);
        res.json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/aceitar-corrida', async (req, res) => {
    const { corridaId, motoristaId } = req.body;
    try {
        const resultado = await RebecaIntegradaService.aceitarCorrida(corridaId, motoristaId);
        res.json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/iniciar-corrida', async (req, res) => {
    const { corridaId } = req.body;
    try {
        const resultado = await RebecaIntegradaService.iniciarCorrida(corridaId);
        res.json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/finalizar-corrida', async (req, res) => {
    const { corridaId, precoFinal } = req.body;
    try {
        const resultado = await RebecaIntegradaService.finalizarCorrida(corridaId, precoFinal);
        res.json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/cancelar-corrida', async (req, res) => {
    const { corridaId, motivo } = req.body;
    try {
        const resultado = await RebecaIntegradaService.cancelarCorrida(corridaId, motivo);
        res.json(resultado);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/cotacao', (req, res) => {
    const { origem, destino } = req.body;
    
    if (!origem || !destino) {
        return res.status(400).json({ error: 'Origem e destino obrigatórios' });
    }

    const cotacao = RebecaIntegradaService.simularCotacao(origem, destino);
    res.json(cotacao);
});

module.exports = router;
