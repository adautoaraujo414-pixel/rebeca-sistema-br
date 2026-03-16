const express = require('express');
const router = express.Router();
const { Corrida, Motorista, Cliente } = require('../models');

const getAdminId = (req) => req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || null;

// Listar reclamacoes (cancelamentos com motivo + avaliacoes ruins <= 3)
router.get('/', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatorio' });
        const mongoose = require('mongoose');
        const aid = new mongoose.Types.ObjectId(adminId);

        const canceladas = await Corrida.find({
            adminId: aid,
            motivoCancelamento: { $exists: true, $ne: null }
        }).sort({ createdAt: -1 }).limit(50);

        const avaliadas = await Corrida.find({
            adminId: aid,
            avaliacaoCliente: { $exists: true, $lte: 3 }
        }).sort({ createdAt: -1 }).limit(50);

        const todas = [...canceladas, ...avaliadas];
        const unicas = todas.filter((v, i, a) => a.findIndex(x => x._id.toString() === v._id.toString()) === i);
        unicas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const resultado = unicas.map(x => ({
            _id: x._id,
            data: x.createdAt,
            clienteNome: x.clienteNome || x.cliente || '-',
            motoristaNome: x.motoristaNome || '-',
            tipo: x.avaliacaoCliente && x.avaliacaoCliente <= 3 ? 'avaliacao_ruim' : 'cancelamento',
            motivo: x.motivoCancelamento || ('Avaliacao: ' + (x.avaliacaoCliente || '-') + ' estrelas'),
            avaliacao: x.avaliacaoCliente || null,
            status: x.reclamacaoResolvida ? 'resolvida' : 'pendente',
            resolucao: x.resolucao || null
        }));

        res.json(resultado);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Estatisticas
router.get('/estatisticas', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatorio' });
        const mongoose = require('mongoose');
        const aid = new mongoose.Types.ObjectId(adminId);
        const hoje = new Date(); hoje.setHours(0,0,0,0);

        const [totalCanc, hojeCanc, totalAval, hojeAval, resolvidas] = await Promise.all([
            Corrida.countDocuments({ adminId: aid, motivoCancelamento: { $exists: true, $ne: null } }),
            Corrida.countDocuments({ adminId: aid, motivoCancelamento: { $exists: true, $ne: null }, createdAt: { $gte: hoje } }),
            Corrida.countDocuments({ adminId: aid, avaliacaoCliente: { $exists: true, $lte: 3 } }),
            Corrida.countDocuments({ adminId: aid, avaliacaoCliente: { $lte: 3 }, createdAt: { $gte: hoje } }),
            Corrida.countDocuments({ adminId: aid, reclamacaoResolvida: true })
        ]);

        res.json({
            total: totalCanc + totalAval,
            hoje: hojeCanc + hojeAval,
            pendentes: (totalCanc + totalAval) - resolvidas,
            resolvidas,
            cancelamentos: totalCanc,
            avaliacoesRuins: totalAval
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Resolver reclamacao
router.put('/:id/resolver', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatorio' });
        const mongoose = require('mongoose');
        const aid = new mongoose.Types.ObjectId(adminId);
        await Corrida.updateOne(
            { _id: req.params.id, adminId: aid },
            { $set: { reclamacaoResolvida: true, resolucao: req.body.resolucao || 'Resolvida pelo admin' } }
        );
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const adminId = getAdminId(req);
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatorio' });
        const mongoose = require('mongoose');
        const aid = new mongoose.Types.ObjectId(adminId);
        const corrida = await Corrida.findOne({ _id: req.params.id, adminId: aid });
        if (!corrida) return res.status(404).json({ error: 'Nao encontrada' });
        res.json(corrida);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
