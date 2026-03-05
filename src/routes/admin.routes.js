const express = require('express');
const router = express.Router();
const PrecoSimplesService = require('../services/preco-simples.service');

// ==================== FILA DE ESPERA ====================
router.get('/fila-espera', async (req, res) => {
    try {
        const { FilaEspera } = require('../models');
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        
        const fila = await FilaEspera.find({ 
            adminId, 
            status: { $in: ['aguardando', 'notificado'] } 
        }).sort({ posicao: 1 });
        
        res.json({ fila, total: fila.length });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

router.delete('/fila-espera/:id', async (req, res) => {
    try {
        const { FilaEspera } = require('../models');
        await FilaEspera.findByIdAndUpdate(req.params.id, { status: 'expirado' }, { new: true });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// ========== PREÇOS SIMPLES ==========
router.get('/precos-simples', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        const config = await PrecoSimplesService.getConfig(adminId);
        res.json(config);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

router.post('/precos-simples', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body.adminId;
        const resultado = await PrecoSimplesService.salvarPrecos(adminId, req.body);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

router.get('/preco-atual', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        const preco = await PrecoSimplesService.calcularPreco(adminId);
        res.json(preco);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;
