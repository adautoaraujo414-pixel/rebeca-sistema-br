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
                const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminId, status: { $in: ['conectado','open','connected'] } });
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


// ========== RASTREIO PÚBLICO (sem auth) ==========
router.get('/pedidos/rastrear/:codigo', async (req, res) => {
    try {
        const codigo = req.params.codigo;
        const recentes = await PedidoDelivery.find({}).sort({ createdAt: -1 }).limit(200).lean();
        const pedido = recentes.find(p => p._id.toString().endsWith(codigo));
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
        res.json(pedido);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});



// ========== COZINHA: ACEITAR PEDIDO (novo -> preparando) ==========
router.put('/cozinha/:id/aceitar', authDelivery, async (req, res) => {
    try {
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId, status: 'novo' },
            { status: 'preparando', tempoEstimadoPreparo: req.body.tempoEstimado || 20, dataPreparando: new Date() },
            { new: true }
        );
        // Notificar cliente via WhatsApp
        try {
            const RebecaDeliveryService = require('../services/rebeca-delivery.service');
            await RebecaDeliveryService.notificarClientePreparo(pedido._id);
        } catch(e) { console.log('[COZINHA] Erro notificar:', e.message); }
        console.log('[COZINHA] Pedido #' + pedido.numero + ' aceito - preparando');
        res.json(pedido);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== COZINHA: MARCAR PRONTO ==========
router.put('/cozinha/:id/pronto', authDelivery, async (req, res) => {
    try {
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId, status: 'preparando' },
            { status: 'pronto', dataPronto: new Date() },
            { new: true }
        );
        try {
            const RebecaDeliveryService = require('../services/rebeca-delivery.service');
            await RebecaDeliveryService.notificarClientePronto(pedido._id);
        } catch(e) { console.log('[COZINHA] Erro notificar pronto:', e.message); }
        console.log('[COZINHA] Pedido #' + pedido.numero + ' PRONTO');
        res.json(pedido);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== COZINHA: REJEITAR PEDIDO ==========
router.put('/cozinha/:id/rejeitar', authDelivery, async (req, res) => {
    try {
        const motivo = req.body.motivo || 'Rejeitado pela cozinha';
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId, status: 'novo' },
            { status: 'cancelado', dataCancelado: new Date(), motivoCancelamento: motivo },
            { new: true }
        );
        try {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminId, status: { $in: ['conectado','open','connected'] } });
            if (inst) await EvolutionMultiService.enviarMensagem(inst._id, pedido.clienteTelefone, 'Pedido #' + pedido.numero + ' cancelado. ' + motivo + '. Desculpe pelo transtorno!');
        } catch(e) {}
        res.json(pedido);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== COZINHA: LISTAR PEDIDOS POR STATUS ==========
router.get('/cozinha/pedidos', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            status: { $in: ['novo', 'preparando', 'pronto'] }
        }).sort({ createdAt: 1 });
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ========== CRUD ENTREGADORES ==========
router.get('/entregadores', authDelivery, async (req, res) => {
    try {
        const entregadores = await Motorista.find({ adminId: req.adminId, tipo: 'entregador' }).sort({ nome: 1 });
        res.json({ entregadores });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/entregadores', authDelivery, async (req, res) => {
    try {
        const { nome, telefone, veiculo } = req.body;
        const entregador = await Motorista.create({
            nome, telefone, veiculo, adminId: req.adminId,
            tipo: 'entregador', ativo: true
        });
        res.json({ entregador });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/entregadores/:id', authDelivery, async (req, res) => {
    try {
        const { nome, telefone, veiculo } = req.body;
        const entregador = await Motorista.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { nome, telefone, veiculo },
            { new: true }
        );
        res.json({ entregador });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/entregadores/:id/toggle', authDelivery, async (req, res) => {
    try {
        const entregador = await Motorista.findOne({ _id: req.params.id, adminId: req.adminId });
        await entregador.save();
        res.json({ entregador });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADOR: LISTAR PEDIDOS PRONTOS ==========
router.get('/entregador/pedidos', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            status: { $in: ['pronto', 'saiu_entrega'] }
        }).sort({ dataPronto: 1 });
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADOR: PEGAR PEDIDO (pronto -> saiu_entrega) ==========
router.put('/entregador/:id/pegar', authDelivery, async (req, res) => {
    try {
        const { entregadorNome, entregadorId } = req.body;
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId, status: 'pronto' },
            { 
                status: 'saiu_entrega', dataSaiuEntrega: new Date(),
                entregadorNome: entregadorNome || 'Entregador',
                entregadorId: entregadorId || null
            },
            { new: true }
        );
        try {
            const RebecaDeliveryService = require('../services/rebeca-delivery.service');
            await RebecaDeliveryService.notificarClienteSaiuEntrega(pedido._id, entregadorNome);
        } catch(e) { console.log('[ENTREGADOR] Erro notificar:', e.message); }
        console.log('[ENTREGADOR] Pedido #' + pedido.numero + ' saiu entrega com', entregadorNome);
        res.json(pedido);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADOR: MARCAR ENTREGUE ==========
router.put('/entregador/:id/entregue', authDelivery, async (req, res) => {
    try {
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId, status: 'saiu_entrega' },
            { status: 'entregue', dataEntregue: new Date() },
            { new: true }
        );
        try {
            const RebecaDeliveryService = require('../services/rebeca-delivery.service');
            await RebecaDeliveryService.notificarClienteEntregue(pedido._id);
        } catch(e) { console.log('[ENTREGADOR] Erro notificar entregue:', e.message); }
        console.log('[ENTREGADOR] Pedido #' + pedido.numero + ' ENTREGUE');
        res.json(pedido);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADOR: ATUALIZAR GPS ==========
router.post('/entregador/:id/gps', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const pedido = await PedidoDelivery.findById(req.params.id);
        // Salvar GPS no pedido (para rastreamento)
        pedido.entregadorLatitude = latitude;
        pedido.entregadorLongitude = longitude;
        pedido.entregadorGpsAtualizado = new Date();
        await pedido.save();
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== RASTREIO COM GPS DO ENTREGADOR ==========
router.get('/rastrear-gps/:codigo', async (req, res) => {
    try {
        const codigo = req.params.codigo;
        const recentes = await PedidoDelivery.find({ status: { $in: ['preparando', 'pronto', 'saiu_entrega'] } }).sort({ createdAt: -1 }).limit(200).lean();
        const pedido = recentes.find(function(p) { return p._id.toString().endsWith(codigo); });
        res.json({
            numero: pedido.numero,
            status: pedido.status,
            itens: pedido.itens,
            enderecoEntrega: pedido.enderecoEntrega,
            entregadorNome: pedido.entregadorNome,
            entregadorLatitude: pedido.entregadorLatitude,
            entregadorLongitude: pedido.entregadorLongitude,
            gpsAtualizado: pedido.entregadorGpsAtualizado,
            dataPronto: pedido.dataPronto,
            dataSaiuEntrega: pedido.dataSaiuEntrega
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});



// ========== UPLOAD FOTO CARDAPIO (IA TRANSCREVE) ==========
router.post('/cardapio/upload-foto', authDelivery, async (req, res) => {
    try {
        const { imagemBase64 } = req.body;
        if (!imagemBase64) return res.status(400).json({ erro: 'Envie imagemBase64' });
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ erro: 'OPENAI_API_KEY nao configurada' });
        const axios = require('axios');
        let mediaType = 'image/jpeg';
        let base64Data = imagemBase64;
        if (imagemBase64.startsWith('data:')) {
            const match = imagemBase64.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) { mediaType = match[1]; base64Data = match[2]; }
        }
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o',
            messages: [{ role: 'user', content: [
                { type: 'text', text: 'Analise esta foto de cardapio/menu de restaurante e extraia TODOS os itens. Retorne APENAS um JSON valido (sem markdown, sem backticks) neste formato exato: { "categorias": [ { "nome": "Nome da Categoria", "emoji": "emoji adequado", "itens": [ { "nome": "Nome do Item", "descricao": "ingredientes ou descricao se visivel", "preco": 25.90 } ] } ] }. Regras: Se nao conseguir ler o preco coloque 0. Agrupe itens em categorias logicas. Use emojis adequados. Mantenha os nomes EXATAMENTE como estao no cardapio. Se a foto estiver ilegivel retorne {"erro": "Nao consegui ler o cardapio. Tente uma foto mais nitida."}' },
                { type: 'image_url', image_url: { url: 'data:' + mediaType + ';base64,' + base64Data, detail: 'high' } }
            ]}],
            max_tokens: 4000, temperature: 0.2
        }, { headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, timeout: 60000 });
        const texto = response.data.choices[0].message.content.trim();
        console.log('[CARDAPIO-IA] Resposta recebida');
        const jsonLimpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const resultado = JSON.parse(jsonLimpo);
        if (resultado.erro) return res.status(400).json({ erro: resultado.erro });
        let totalItens = 0;
        resultado.categorias.forEach(function(c) { totalItens += c.itens.length; });
        console.log('[CARDAPIO-IA] ' + resultado.categorias.length + ' categorias, ' + totalItens + ' itens');
        res.json(resultado);
    } catch(e) { console.error('[CARDAPIO-IA] Erro:', e.message); res.status(500).json({ erro: 'Erro ao processar imagem: ' + e.message }); }
});

router.post('/cardapio/confirmar-transcricao', authDelivery, async (req, res) => {
    try {
        const { categorias, limparExistente } = req.body;
        if (!categorias || !categorias.length) return res.status(400).json({ erro: 'Nenhuma categoria' });
        if (limparExistente) {
            await ItemCardapio.updateMany({ adminId: req.adminId }, { ativo: false });
            await CategoriaCardapio.updateMany({ adminId: req.adminId }, { ativo: false });
        }
        let totalCats = 0, totalItens = 0;
        for (let i = 0; i < categorias.length; i++) {
            const catData = categorias[i];
            const cat = await CategoriaCardapio.create({ adminId: req.adminId, nome: catData.nome, emoji: catData.emoji || '', ordem: i, ativo: true });
            totalCats++;
            for (let j = 0; j < catData.itens.length; j++) {
                const it = catData.itens[j];
                await ItemCardapio.create({ adminId: req.adminId, categoriaId: cat._id, nome: it.nome, descricao: it.descricao || '', preco: parseFloat(it.preco) || 0, ordem: j, ativo: true, disponivel: true });
                totalItens++;
            }
        }
        console.log('[CARDAPIO-IA] Salvo: ' + totalCats + ' cats, ' + totalItens + ' itens');
        res.json({ sucesso: true, categorias: totalCats, itens: totalItens });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;

// ========== LOGIN DELIVERY ==========
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const admin = await Admin.findOne({ email, senha, tipoAdmin: { $in: ['delivery', 'multi'] } });
        if (!admin) return res.status(401).json({ erro: 'Email ou senha incorretos' });
        if (!admin.ativo) return res.status(401).json({ erro: 'Conta inativa' });
        res.json({ sucesso: true, admin: { id: admin._id, nome: admin.nome, email: admin.email, token: admin.token } });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== CONTATO ENTREGADOR -> CLIENTE VIA REBECA =====
router.post('/pedido/:id/contato-cliente', async (req, res) => {
    try {
        const { Pedido, InstanciaWhatsapp } = require('../models');
        const pedido = await Pedido.findById(req.params.id);
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
        const instancia = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
        if (!instancia) return res.status(400).json({ erro: 'WhatsApp não conectado' });
        const { EvolutionMultiService } = require('../services/evolution-multi.service');
        const entregadorNome = req.body.entregadorNome || 'Entregador';
        const msg = `🛵 *Mensagem do Entregador*\n\nOlá! Sou o entregador do seu pedido #${pedido.numeroPedido || pedido._id.toString().slice(-4)}.\nEstou a caminho! Caso precise falar comigo, responda esta mensagem e a Rebeca vai me repassar.`;
        await EvolutionMultiService.enviarMensagem(instancia.nomeInstancia, pedido.telefoneCliente, msg);
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});
