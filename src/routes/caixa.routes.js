const express      = require('express');
const router       = express.Router();
const CaixaService = require('../services/caixa.service');

const auth = async (req, res, next) => {
    try {
        const token = (req.headers.authorization||'').replace('Bearer ','') || req.query.token;
        if (!token) return res.status(401).json({ erro: 'Token ausente' });
        const jwt = require('jsonwebtoken');
        const { Admin } = require('../models');
        const dec = jwt.verify(token, process.env.JWT_SECRET || 'rebeca_secret');
        const admin = await Admin.findById(dec.id || dec._id).lean();
        if (!admin) return res.status(401).json({ erro: 'Admin nao encontrado' });
        req.admin = admin;
        next();
    } catch(e) { return res.status(401).json({ erro: 'Token invalido' }); }
};

router.post('/abrir', auth, async (req, res) => {
    try {
        const { operador, numeroCaixa, valorAbertura } = req.body;
        if (!operador) return res.status(400).json({ erro: 'Nome do operador obrigatorio' });
        const caixa = await CaixaService.abrirCaixa(req.admin._id, { operador, numeroCaixa, valorAbertura });
        res.json({ ok: true, caixa });
    } catch(e) { res.status(400).json({ erro: e.message }); }
});

router.post('/fechar/:id', auth, async (req, res) => {
    try {
        const caixa = await CaixaService.fecharCaixa(req.admin._id, req.params.id, req.body);
        res.json({ ok: true, caixa });
    } catch(e) { res.status(400).json({ erro: e.message }); }
});

router.get('/abertos', auth, async (req, res) => {
    try {
        const caixas = await CaixaService.caixasAbertos(req.admin._id);
        res.json({ ok: true, caixas });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/listar', auth, async (req, res) => {
    try {
        const caixas = await CaixaService.listarCaixas(req.admin._id, { status: req.query.status });
        res.json({ ok: true, caixas });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/relatorio/:id', auth, async (req, res) => {
    try {
        const rel = await CaixaService.gerarRelatorio(req.admin._id, req.params.id);
        res.json({ ok: true, ...rel });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
