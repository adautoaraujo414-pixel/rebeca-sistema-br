const express = require('express');
const router = express.Router();
const PrecoAdminService = require('../services/preco-admin.service');

// Buscar configuração de preços do admin — retorna config completa
router.get('/config', async (req, res) => {
    try {
        const adminId = req.headers['x-admin-id'] || req.query.adminId;
        if (!adminId) return res.status(400).json({ erro: 'AdminId obrigatório' });
        const config = await PrecoAdminService.getConfig(adminId);
        const faixaAtual = await PrecoAdminService.getFaixaAtual(adminId);
        res.json({ ...config, faixaAtual });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Salvar configuração de preços
router.post('/config', async (req, res) => {
    try {
        // Bug 6 fix: nunca aceitar adminId do body — só header ou query (evita sobrescrita cross-admin)
        const adminId = req.headers['x-admin-id'] || req.query.adminId;
        if (!adminId) return res.status(400).json({ erro: 'AdminId obrigatório' });
        
        const resultado = await PrecoAdminService.salvarConfig(adminId, req.body);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Calcular preço
router.post('/calcular', async (req, res) => {
    try {
        const adminId = req.headers['x-admin-id'];
        const { distanciaKm, tempoMinutos } = req.body;
        const resultado = await PrecoAdminService.calcularPreco(adminId, distanciaKm, tempoMinutos);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Buscar modo de despacho
router.get('/despacho/modo', async (req, res) => {
    try {
        const adminId = req.headers['x-admin-id'];
        const modo = await PrecoAdminService.getModoDespacho(adminId);
        res.json({ modo });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Salvar modo de despacho
router.post('/despacho/modo', async (req, res) => {
    try {
        const adminId = req.headers['x-admin-id'];
        if (!adminId) return res.status(400).json({ erro: 'AdminId obrigatório' });
        
        const { modo } = req.body;
        const resultado = await PrecoAdminService.salvarModoDespacho(adminId, modo);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Faixa atual
router.get('/faixa', async (req, res) => {
    try {
        const adminId = req.headers['x-admin-id'];
        const faixa = await PrecoAdminService.getFaixaAtual(adminId);
        res.json(faixa);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;