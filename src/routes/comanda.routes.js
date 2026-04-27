const express        = require('express');
const router         = express.Router();
const ComandaService = require('../services/comanda.service');

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

router.get('/pedido/:id', auth, async (req, res) => {
    try {
        const PedidoDelivery = require('../models/pedidoDelivery.model');
        const pedido = await PedidoDelivery.findOne({ _id: req.params.id, adminId: req.admin._id }).lean();
        if (!pedido) return res.status(404).json({ erro: 'Pedido nao encontrado' });
        const vias   = parseInt(req.query.vias) || pedido.vias || 1;
        const config = { nomeEstab: req.admin.nomeEstabelecimento || req.admin.nome || 'Delivery', vias };
        if (req.query.formato === 'html') return res.send(ComandaService.gerarHTML(pedido, config));
        res.json({ ok: true, texto: ComandaService.gerarTexto(pedido, config), vias });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/impresso/:id', auth, async (req, res) => {
    try {
        const PedidoDelivery = require('../models/pedidoDelivery.model');
        await PedidoDelivery.updateOne({ _id: req.params.id, adminId: req.admin._id }, { impresso: true });
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/rastreamento/:id', auth, async (req, res) => {
    try {
        const { linkRastreamento } = req.body;
        if (!linkRastreamento) return res.status(400).json({ erro: 'linkRastreamento obrigatorio' });
        const ReciboService = require('../services/recibo-delivery.service');
        await ReciboService.enviarLinkRastreamento(req.admin._id, req.params.id, linkRastreamento);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
