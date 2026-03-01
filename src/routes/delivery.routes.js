const express = require('express');
const router = express.Router();
const { CategoriaCardapio, ItemCardapio, PedidoDelivery, ConfigDelivery } = require('../models/delivery.models');
const { Admin } = require('../models');

// ========== AUTENTICAÇÃO DELIVERY ==========
const authDelivery = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!token) return res.status(401).json({ erro: 'Token obrigatório' });
    const admin = await Admin.findOne({ token, tipoAdmin: { $in: ['delivery', 'multi'] } });
    if (!admin) return res.status(401).json({ erro: 'Token inválido ou admin não é delivery' });
    if (admin.bloqueado) return res.status(403).json({ erro: 'Conta bloqueada' });
    req.adminId = admin._id;
    req.admin = admin;
    next();
};

// ========== CATEGORIAS ==========
router.get('/categorias', authDelivery, async (req, res) => {
    try {
        const cats = await CategoriaCardapio.find({ adminId: req.adminId, ativo: true }).sort({ ordem: 1 });
        res.json(cats);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/categorias', authDelivery, async (req, res) => {
    try {
        const cat = await CategoriaCardapio.create({ ...req.body, adminId: req.adminId });
        res.json(cat);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/categorias/:id', authDelivery, async (req, res) => {
    try {
        const cat = await CategoriaCardapio.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, req.body, { new: true });
        res.json(cat);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/categorias/:id', authDelivery, async (req, res) => {
    try {
        await CategoriaCardapio.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, { ativo: false });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ITENS DO CARDÁPIO ==========
router.get('/cardapio', authDelivery, async (req, res) => {
    try {
        const itens = await ItemCardapio.find({ adminId: req.adminId, ativo: true }).sort({ ordem: 1 }).populate('categoriaId', 'nome emoji');
        res.json(itens);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/cardapio', authDelivery, async (req, res) => {
    try {
        const item = await ItemCardapio.create({ ...req.body, adminId: req.adminId });
        res.json(item);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/cardapio/:id', authDelivery, async (req, res) => {
    try {
        const item = await ItemCardapio.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, req.body, { new: true });
        res.json(item);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/cardapio/:id', authDelivery, async (req, res) => {
    try {
        await ItemCardapio.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, { ativo: false });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== PEDIDOS ==========
router.get('/pedidos', authDelivery, async (req, res) => {
    try {
        const { status } = req.query;
        const filtro = { adminId: req.adminId };
        if (status) filtro.status = status;
        const pedidos = await PedidoDelivery.find(filtro).sort({ createdAt: -1 }).limit(50);
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/pedidos/ativos', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({ 
            adminId: req.adminId, 
            status: { $in: ['novo', 'confirmado', 'preparando', 'pronto', 'saiu_entrega'] }
        }).sort({ createdAt: -1 });
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/pedidos/:id/status', authDelivery, async (req, res) => {
    try {
        const { status } = req.body;
        const update = { status };
        const agora = new Date();
        
        if (status === 'confirmado') update.dataConfirmado = agora;
        if (status === 'preparando') update.dataPreparando = agora;
        if (status === 'pronto') update.dataPronto = agora;
        if (status === 'saiu_entrega') update.dataSaiuEntrega = agora;
        if (status === 'entregue') update.dataEntregue = agora;
        if (status === 'cancelado') { update.dataCancelado = agora; update.motivoCancelamento = req.body.motivo; }
        
        const pedido = await PedidoDelivery.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, update, { new: true });
        
        // Notificar cliente via WhatsApp
        if (pedido && pedido.clienteTelefone) {
            try {
                const EvolutionMultiService = require('../services/evolution-multi.service');
                const { InstanciaWhatsapp } = require('../models');
                const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminId, status: 'conectado' });
                if (inst) {
                    const config = await ConfigDelivery.findOne({ adminId: req.adminId });
                    let msg = '';
                    if (status === 'confirmado') msg = config?.mensagemPedidoConfirmado || '✅ Pedido #' + pedido.numero + ' confirmado! Estamos preparando.';
                    if (status === 'preparando') msg = '👨‍🍳 Pedido #' + pedido.numero + ' está sendo preparado!';
                    if (status === 'pronto') msg = config?.mensagemPedidoPronto || '✅ Pedido #' + pedido.numero + ' está pronto!';
                    if (status === 'saiu_entrega') {
                        const linkRastreio = (process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com') + '/delivery-rastrear/' + pedido._id.toString().slice(-8);
                        msg = '🏍️ Pedido #' + pedido.numero + ' saiu para entrega!\n\n📍 Acompanhe: ' + linkRastreio;
                    }
                    if (status === 'entregue') msg = '✅ Pedido #' + pedido.numero + ' entregue! Obrigado pela preferência! 😊\n\nAvalie de 1 a 5 ⭐';
                    if (status === 'cancelado') msg = '❌ Pedido #' + pedido.numero + ' cancelado. ' + (req.body.motivo || '');
                    
                    if (msg) await EvolutionMultiService.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
                }
            } catch(e) { console.log('[DELIVERY] Erro notificar:', e.message); }
        }
        
        res.json(pedido);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== CONFIG ==========
router.get('/config', authDelivery, async (req, res) => {
    try {
        let config = await ConfigDelivery.findOne({ adminId: req.adminId });
        if (!config) config = await ConfigDelivery.create({ adminId: req.adminId, nomeRestaurante: req.admin.empresa });
        res.json(config);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/config', authDelivery, async (req, res) => {
    try {
        const config = await ConfigDelivery.findOneAndUpdate({ adminId: req.adminId }, req.body, { new: true, upsert: true });
        res.json(config);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== DASHBOARD ==========
router.get('/dashboard', authDelivery, async (req, res) => {
    try {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const [pedidosHoje, pedidosAtivos, totalSemana] = await Promise.all([
            PedidoDelivery.countDocuments({ adminId: req.adminId, createdAt: { $gte: hoje } }),
            PedidoDelivery.countDocuments({ adminId: req.adminId, status: { $in: ['novo', 'confirmado', 'preparando', 'pronto', 'saiu_entrega'] } }),
            PedidoDelivery.aggregate([
                { $match: { adminId: req.adminId, createdAt: { $gte: new Date(Date.now() - 7*86400000) }, status: 'entregue' } },
                { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
            ])
        ]);
        res.json({
            pedidosHoje,
            pedidosAtivos,
            faturamentoSemana: totalSemana[0]?.total || 0,
            pedidosSemana: totalSemana[0]?.count || 0
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== CARDÁPIO PÚBLICO (sem auth - para clientes verem) ==========
router.get('/cardapio-publico/:adminId', async (req, res) => {
    try {
        const adminId = req.params.adminId;
        const config = await ConfigDelivery.findOne({ adminId }).lean();
        const categorias = await CategoriaCardapio.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean();
        const itens = await ItemCardapio.find({ adminId, ativo: true, disponivel: true }).sort({ ordem: 1 }).lean();
        
        res.json({
            restaurante: config?.nomeRestaurante || 'Delivery',
            aberto: config?.aberto || false,
            horario: config?.horarioFuncionamento || '',
            pedidoMinimo: config?.pedidoMinimo || 0,
            taxaEntrega: config?.taxaEntregaFixa || 0,
            categorias,
            itens
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
