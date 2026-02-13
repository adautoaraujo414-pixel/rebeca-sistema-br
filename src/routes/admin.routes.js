const express = require('express');
const router = express.Router();


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
        await FilaEspera.findByIdAndUpdate(req.params.id, { status: 'expirado' });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});


module.exports = router;

// ========== PREÇOS SIMPLES ==========
const PrecoSimplesService = require('../services/preco-simples.service');

router.get('/precos-simples', authAdmin, async (req, res) => {
    const config = await PrecoSimplesService.getConfig(req.adminId);
    res.json(config);
});

router.post('/precos-simples', authAdmin, async (req, res) => {
    const resultado = await PrecoSimplesService.salvarPrecos(req.adminId, req.body);
    res.json(resultado);
});

router.get('/preco-atual', authAdmin, async (req, res) => {
    const preco = await PrecoSimplesService.calcularPreco(req.adminId);
    res.json(preco);
});
