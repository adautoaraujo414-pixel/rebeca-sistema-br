/**
 * ROTAS — ASSINANTES / MENSALIDADES CLIENTE DELIVERY
 * 100% isolado do sistema de corridas
 */
const express = require('express');
const router = express.Router();
const CardapioDiaService = require('../services/cardapio-dia.service');

// Auth simples: x-admin-id no header
const auth = (req, res, next) => {
    const adminId = req.headers['x-admin-id'] || req.query.adminId;
    if (!adminId) return res.status(401).json({ erro: 'Sem adminId' });
    req.adminId = adminId;
    next();
};

// Listar assinantes
router.get('/assinantes', auth, async (req, res) => {
    try {
        const lista = await CardapioDiaService.listarAssinantes(req.adminId);
        res.json(lista);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar assinante
router.post('/assinantes', auth, async (req, res) => {
    try {
        const doc = await CardapioDiaService.criarAssinante(req.adminId, req.body);
        res.json(doc);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar assinante
router.put('/assinantes/:id', auth, async (req, res) => {
    try {
        const doc = await CardapioDiaService.atualizarAssinante(req.params.id, req.adminId, req.body);
        res.json(doc);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Excluir assinante
router.delete('/assinantes/:id', auth, async (req, res) => {
    try {
        await CardapioDiaService.excluirAssinante(req.params.id, req.adminId);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Confirmar pagamento
router.post('/assinantes/:id/pagar', auth, async (req, res) => {
    try {
        const doc = await CardapioDiaService.confirmarPagamentoAssinante(req.params.id, req.adminId);
        res.json(doc);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Cardápio de hoje
router.get('/cardapio-hoje', auth, async (req, res) => {
    try {
        const c = await CardapioDiaService.cardapioHoje(req.adminId);
        res.json(c || { descricao: '', enviado: false });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Enviar cardápio manualmente
router.post('/cardapio-hoje/enviar', auth, async (req, res) => {
    try {
        const { descricao } = req.body;
        if (!descricao) return res.status(400).json({ erro: 'Informe o cardápio' });
        await CardapioDiaService.salvarEEnviarCardapio(req.adminId, descricao, null);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
