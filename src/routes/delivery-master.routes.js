const express = require('express');
const router = express.Router();
const { AdminDelivery } = require('../models/delivery.models');
const { AdminMaster } = require('../models');

// Middleware — só AdminMaster acessa
const authMaster = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
        if (!token) return res.status(401).json({ erro: 'Token master obrigatório' });
        const master = await AdminMaster.findOne({ token });
        if (!master) return res.status(401).json({ erro: 'Token master inválido' });
        req.master = master;
        next();
    } catch(e) { res.status(500).json({ erro: e.message }); }
};

// GET /api/delivery-master/lista — lista todos os admins delivery
router.get('/lista', authMaster, async (req, res) => {
    try {
        const { status } = req.query;
        const filtro = status ? { status } : {};
        const lista = await AdminDelivery.find(filtro).select('-senha').sort({ createdAt: -1 });
        const resumo = {
            total: lista.length,
            trial: lista.filter(a => a.status === 'trial').length,
            ativo: lista.filter(a => a.status === 'ativo').length,
            bloqueado: lista.filter(a => a.status === 'bloqueado').length
        };
        res.json({ sucesso: true, resumo, lista });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// POST /api/delivery-master/liberar/:id — libera conta bloqueada / ativa plano
router.post('/liberar/:id', authMaster, async (req, res) => {
    try {
        const { plano, valorMensal, observacao } = req.body;
        const admin = await AdminDelivery.findByIdAndUpdate(req.params.id, {
            status: 'ativo',
            motivoBloqueio: null,
            liberadoPor: req.master.nome || 'Master',
            plano: plano || 'basico',
            valorMensal: valorMensal || 97,
            observacoesMaster: observacao || ''
        }, { new: true }).select('-senha');
        if (!admin) return res.status(404).json({ erro: 'Admin delivery não encontrado' });
        console.log('[DELIVERY MASTER] Liberado:', admin.nomeComercio, '| por:', req.master.nome);
        res.json({ sucesso: true, admin });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// POST /api/delivery-master/bloquear/:id
router.post('/bloquear/:id', authMaster, async (req, res) => {
    try {
        const { motivo } = req.body;
        const admin = await AdminDelivery.findByIdAndUpdate(req.params.id, {
            status: 'bloqueado',
            motivoBloqueio: motivo || 'Bloqueado pelo master'
        }, { new: true }).select('-senha');
        if (!admin) return res.status(404).json({ erro: 'Admin delivery não encontrado' });
        console.log('[DELIVERY MASTER] Bloqueado:', admin.nomeComercio);
        res.json({ sucesso: true, admin });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// POST /api/delivery-master/extender-trial/:id — extende trial
router.post('/extender-trial/:id', authMaster, async (req, res) => {
    try {
        const { dias } = req.body;
        const admin = await AdminDelivery.findById(req.params.id);
        if (!admin) return res.status(404).json({ erro: 'Não encontrado' });
        const base = admin.trialFim > new Date() ? admin.trialFim : new Date();
        const novoFim = new Date(base.getTime() + (dias || 7) * 24 * 60 * 60 * 1000);
        await AdminDelivery.findByIdAndUpdate(req.params.id, {
            trialFim: novoFim,
            status: 'trial',
            motivoBloqueio: null
        });
        res.json({ sucesso: true, novoTrialFim: novoFim });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
