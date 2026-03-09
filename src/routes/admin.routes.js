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


// ========== CONTATOS DE EMERGÊNCIA ==========
// Listar contatos de emergência do adm
router.get('/emergencia', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body.adminId;
        const { ContatoEmergencia } = require('../models');
        const contatos = await ContatoEmergencia.find({ adminId, ativo: true }).sort({ categoria: 1 });
        res.json({ sucesso: true, contatos });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar contato de emergência
router.post('/emergencia', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body.adminId;
        const { nome, telefone, tipo } = req.body;
        if (!nome || !telefone) return res.status(400).json({ erro: 'Nome e telefone obrigatórios' });
        const { ContatoEmergencia } = require('../models');
        const contato = await ContatoEmergencia.create({ nome, telefone, tipo: tipo || 'admin', adminId, ativo: true });
        res.json({ sucesso: true, contato });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Deletar contato de emergência
router.delete('/emergencia/:id', async (req, res) => {
    try {
        const { ContatoEmergencia } = require('../models');
        await ContatoEmergencia.findByIdAndUpdate(req.params.id, { ativo: false });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
