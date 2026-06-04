const express = require('express');
const { validarAdmin: authMiddleware } = require('../middlewares/auth.middleware');
const router = express.Router();
const PrecoSimplesService = require('../services/preco-simples.service');

// ==================== FILA DE ESPERA ====================
router.get('/fila-espera', async (req, res) => {
    try {
        const { FilaEspera } = require('../models');
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId;
        
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
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId;
        const config = await PrecoSimplesService.getConfig(adminId);
        res.json(config);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

router.post('/precos-simples', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || req.body.adminId;
        const resultado = await PrecoSimplesService.salvarPrecos(adminId, req.body);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

router.get('/preco-atual', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId;
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
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || req.body.adminId;
        const { ContatoEmergencia } = require('../models');
        const contatos = await ContatoEmergencia.find({ adminId, ativo: true }).sort({ categoria: 1 });
        res.json({ sucesso: true, contatos });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar contato de emergência
router.post('/emergencia', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || req.body.adminId;
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

// ========== TIPO VEICULO (moto/carro) ==========
router.get('/tipo-veiculo', authMiddleware, async (req, res) => {
    try {
        const { Admin } = require('../models');
        const admin = await Admin.findById(req.adminId).select('tipoVeiculo').lean();
        res.json({ tipoVeiculo: admin?.tipoVeiculo || 'carro' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/tipo-veiculo', authMiddleware, async (req, res) => {
    try {
        const { Admin } = require('../models');
        const { tipoVeiculo } = req.body;
        if (!['carro', 'moto'].includes(tipoVeiculo)) return res.status(400).json({ error: 'Tipo inválido' });
        await Admin.findByIdAndUpdate(req.adminId, { tipoVeiculo });
        res.json({ sucesso: true, tipoVeiculo });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// ===== PONTOS DE REFERÊNCIA =====
const { PontoReferencia } = require('../models');

router.get('/pontos-referencia', authMiddleware, async (req, res) => {
    try {
        const pontos = await PontoReferencia.find({ adminId: req.adminId, ativo: { $ne: false } }).sort({ nome: 1 }).lean();
        res.json({ pontos });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/pontos-referencia', authMiddleware, async (req, res) => {
    try {
        const { nome, apelidos, endereco, tipo } = req.body;
        if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
        const ponto = await PontoReferencia.create({ adminId: req.adminId, nome, apelidos: apelidos || [], endereco: endereco || '', tipo: tipo || 'outro' });
        res.json({ ponto });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/pontos-referencia/:id', authMiddleware, async (req, res) => {
    try {
        const ponto = await PontoReferencia.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, req.body, { new: true });
        if (!ponto) return res.status(404).json({ error: 'Não encontrado' });
        res.json({ ponto });
    } catch(e) { res.status(500).json({ error: e.message }); }
});


router.get('/meta-templates', async (req, res) => {
  try {
    const MetaWA = require('../services/meta-whatsapp.service');
    const templates = await MetaWA.listarTemplates();
    res.json({ ok: true, total: templates.length, templates });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/pontos-referencia/:id', authMiddleware, async (req, res) => {
    try {
        await PontoReferencia.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, { ativo: false });
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});
