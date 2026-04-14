const express = require('express');
const router = express.Router();
const { CategoriaCardapio, ItemCardapio, PedidoDelivery, ConfigDelivery, AdminDelivery, Entregador, MensalidadeClienteDelivery, CardapioDia } = require('../models/delivery.models');

// ========== AUTENTICAÇÃO DELIVERY ==========
const authDelivery = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
        if (!token) return res.status(401).json({ erro: 'Token obrigatório' });
        const admin = await AdminDelivery.findOne({ token });
        if (!admin) return res.status(401).json({ erro: 'Token inválido' });
        if (admin.status === 'bloqueado') return res.status(403).json({ erro: 'Conta bloqueada. Entre em contato: (34) 98403-9955', bloqueado: true });
        if (admin.status === 'trial' && new Date() > admin.trialFim) {
            await AdminDelivery.findByIdAndUpdate(admin._id, { status: 'bloqueado', motivoBloqueio: 'Trial expirado' });
            return res.status(403).json({ erro: 'Período de teste encerrado.', trialExpirado: true });
        }
        req.adminId = admin._id;
        req.admin = admin;
        next();
    } catch(e) { res.status(500).json({ erro: e.message }); }
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

// ========== GERAR IMAGEM DO ITEM VIA DALL-E (1x por item) ==========
async function gerarImagemItem(nome, descricao) {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;
        const axios = require('axios');

        // Prompt profissional: fundo amadeirado, item centralizado, sem distorção
        const prompt = `Professional food photography of "${nome}"` +
            (descricao ? `, with ${descricao}` : '') +
            `. Place the food centered on a beautiful warm wooden rustic table surface, ` +
            `shot from slightly above (45 degree angle), soft natural lighting from the side, ` +
            `shallow depth of field, bokeh background, appetizing and vibrant colors, ` +
            `no text, no watermark, no distortion, ultra realistic, 4K quality, ` +
            `restaurant menu style photo, food styled beautifully.`;

        console.log('[IMG-ITEM] Gerando imagem para:', nome);

        const resp = await axios.post('https://api.openai.com/v1/images/generations', {
            model: 'dall-e-3',
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
            style: 'natural'
        }, {
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            timeout: 60000
        });

        const url = resp.data.data[0]?.url;
        console.log('[IMG-ITEM] Imagem gerada:', url ? 'OK' : 'FALHOU');
        return url || null;
    } catch(e) {
        console.log('[IMG-ITEM] Erro ao gerar imagem:', e.message);
        return null;
    }
}

router.get('/cardapio', authDelivery, async (req, res) => {
    try {
        const itens = await ItemCardapio.find({ adminId: req.adminId, ativo: true }).sort({ ordem: 1 }).populate('categoriaId', 'nome emoji');
        res.json(itens);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/cardapio', authDelivery, async (req, res) => {
    try {
        const dados = { ...req.body, adminId: req.adminId };
        // Gerar imagem automaticamente se não foi enviada
        if (!dados.imagem && (dados.nome || dados.descricao)) {
            const urlImagem = await gerarImagemItem(dados.nome || '', dados.descricao || '');
            if (urlImagem) dados.imagem = urlImagem;
        }
        const item = await ItemCardapio.create(dados);
        res.json(item);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/cardapio/:id', authDelivery, async (req, res) => {
    try {
        const dados = { ...req.body };
        // Regerar imagem se nome ou descrição foi alterado (ou se pediu explicitamente)
        const itemAtual = await ItemCardapio.findOne({ _id: req.params.id, adminId: req.adminId }).lean();
        const nomeChanged = dados.nome && itemAtual && dados.nome !== itemAtual.nome;
        const descChanged = dados.descricao && itemAtual && dados.descricao !== itemAtual.descricao;
        const semImagem = !itemAtual?.imagem && (dados.nome || dados.descricao);
        const regerarExplicito = dados.regenerarImagem === true;

        if (regerarExplicito || nomeChanged || descChanged || semImagem) {
            const nomeFinal = dados.nome || itemAtual?.nome || '';
            const descFinal = dados.descricao || itemAtual?.descricao || '';
            console.log('[IMG-ITEM] Regenerando imagem por mudança em:', nomeFinal);
            const urlImagem = await gerarImagemItem(nomeFinal, descFinal);
            if (urlImagem) dados.imagem = urlImagem;
        }
        delete dados.regenerarImagem;

        const item = await ItemCardapio.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            dados,
            { new: true }
        );
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
        const mongoose = require('mongoose');
        const adminObjId = new mongoose.Types.ObjectId(req.adminId);
        const [pedidosHoje, pedidosAtivos, totalSemana] = await Promise.all([
            PedidoDelivery.countDocuments({ adminId: adminObjId, createdAt: { $gte: hoje } }),
            PedidoDelivery.countDocuments({ adminId: adminObjId, status: { $in: ['novo', 'confirmado', 'preparando', 'pronto', 'saiu_entrega'] } }),
            PedidoDelivery.aggregate([
                { $match: { adminId: adminObjId, createdAt: { $gte: new Date(Date.now() - 7*86400000) }, status: 'entregue' } },
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
        
        // Formas de pagamento aceitas
        const formasPgto = [];
        if (config?.aceitaDinheiro !== false) formasPgto.push('dinheiro');
        if (config?.aceitaCartao) formasPgto.push('cartao');
        if (config?.aceitaPix !== false) formasPgto.push('pix');

        res.json({
            restaurante: config?.nomeRestaurante || 'Delivery',
            aberto: config?.aberto !== false,
            horario: config?.horarioFuncionamento || '',
            pedidoMinimo: config?.pedidoMinimo || 0,
            taxaEntrega: config?.taxaEntregaFixa || 0,
            tempoEntrega: config?.tempoMedioEntrega || 40,
            chavePix: config?.aceitaPix ? config?.chavePix || '' : null,
            formasPagamento: formasPgto,
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
            await RebecaDeliveryService.notificarPedidoPronto(pedido._id);
        } catch(e) { console.log('[COZINHA] Erro notificar pronto:', e.message); }
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
            status: { $in: ['novo', 'confirmado', 'preparando', 'pronto'] }
        }).sort({ createdAt: 1 });
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ========== CRUD ENTREGADORES ==========
router.get('/entregadores', authDelivery, async (req, res) => {
    try {
        const entregadores = await Entregador.find({ adminId: req.adminId, tipo: 'entregador' }).sort({ nome: 1 });
        res.json({ entregadores });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Enviar credenciais do entregador por WhatsApp
router.post('/entregadores/enviar-credenciais', authDelivery, async (req, res) => {
    try {
        const { telefone, nome, senha, linkApp } = req.body;
        if (!telefone) return res.json({ sucesso: false, erro: 'Telefone obrigatório' });

        const { InstanciaWhatsapp } = require('../models');
        const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminId, status: { $in: ['conectado','open','connected'] } });
        if (!inst) return res.json({ sucesso: false, erro: 'WhatsApp não conectado' });

        const tel = telefone.replace(/[^0-9]/g, '');
        const telWpp = tel.startsWith('55') ? tel : '55' + tel;
        const linkEnt = linkApp || (process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com') + '/delivery-entregador';
        const msg = '🏍️ *Olá, ' + nome + '!*\n\nVocê foi cadastrado como entregador.\n\n*Seus dados de acesso:*\n📱 Telefone: ' + telefone + '\n🔑 Senha: ' + senha + '\n\n*Acesse o app:*\n👉 ' + linkEnt + '\n\n_Guarde em local seguro!_';

        await EvolutionMultiService.enviarMensagem(inst._id, telWpp, msg);

        res.json({ sucesso: true });
    } catch(e) {
        console.error('[ENTREGADOR WPP]', e.message);
        res.json({ sucesso: false, erro: e.message });
    }
});

router.post('/entregadores', authDelivery, async (req, res) => {
    try {
        const { nome, telefone, veiculo } = req.body;
        const entregador = await Entregador.create({
            nome, telefone, veiculo, adminId: req.adminId,
            tipo: 'entregador', ativo: true
        });
        res.json({ entregador });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/entregadores/:id', authDelivery, async (req, res) => {
    try {
        const { nome, telefone, veiculo } = req.body;
        const entregador = await Entregador.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { nome, telefone, veiculo },
            { new: true }
        );
        res.json({ entregador });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/entregadores/:id/toggle', authDelivery, async (req, res) => {
    try {
        const entregador = await Entregador.findOne({ _id: req.params.id, adminId: req.adminId });
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
            await RebecaDeliveryService.notificarSaiuEntrega(pedido._id, entregadorNome);
        } catch(e) { console.log('[ENTREGADOR] Erro notificar saiu:', e.message); }
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
        // Buscar em todos os status recentes
        const recentes = await PedidoDelivery.find({
            status: { $in: ['confirmado', 'preparando', 'pronto', 'saiu_entrega', 'entregue'] }
        }).sort({ createdAt: -1 }).limit(500).lean();
        const pedido = recentes.find(function(p) { return p._id.toString().slice(-8) === codigo || p._id.toString().endsWith(codigo); });
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
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




// ========== ENTREGADOR: DEFINIR ORDEM DA ROTA ==========
router.put('/entregador/:id/ordem', authDelivery, async (req, res) => {
    try {
        const { ordem } = req.body;
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { ordemEntrega: ordem },
            { new: true }
        );
        res.json({ sucesso: true, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADOR: INICIAR ENTREGA DE UM PEDIDO ESPECIFICO ==========
router.put('/entregador/:id/iniciar-entrega', authDelivery, async (req, res) => {
    try {
        const { entregadorNome, entregadorId } = req.body;
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId, status: 'pronto' },
            {
                status: 'saiu_entrega',
                dataSaiuEntrega: new Date(),
                rotaIniciada: new Date(),
                entregadorNome: entregadorNome || 'Entregador',
                entregadorId: entregadorId || null
            },
            { new: true }
        );
        if (!pedido) return res.status(404).json({ erro: 'Pedido nao encontrado ou nao esta pronto' });
        // Notificar cliente com link de rastreio
        try {
            const RebecaDeliveryService = require('../services/rebeca-delivery.service');
            await RebecaDeliveryService.notificarSaiuEntrega(pedido._id, entregadorNome);
        } catch(e) { console.log('[ENTREGADOR] Erro notificar saiu individual:', e.message); }
        console.log('[ENTREGADOR] Pedido #' + pedido.numero + ' saiu entrega individual');
        res.json({ sucesso: true, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADOR: BUSCAR PEDIDOS DA ROTA (pronto + saiu_entrega) ordenados ==========
router.get('/entregador/rota', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            status: { $in: ['pronto', 'saiu_entrega'] }
        }).sort({ ordemEntrega: 1, createdAt: 1 }).lean();
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ========== ENTREGADOR: PEDIDOS ENTREGUES DO DIA ==========
router.get('/entregador/entregues', authDelivery, async (req, res) => {
    try {
        const inicio = new Date();
        inicio.setHours(0,0,0,0);
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            status: 'entregue',
            dataEntregue: { $gte: inicio }
        }).sort({ dataEntregue: -1 }).lean();
        // Calcular tempos de cada etapa
        const resultado = pedidos.map(p => {
            const criado = p.createdAt ? new Date(p.createdAt) : null;
            const preparando = p.dataPreparando ? new Date(p.dataPreparando) : null;
            const pronto = p.dataPronto ? new Date(p.dataPronto) : null;
            const saiu = p.dataSaiuEntrega ? new Date(p.dataSaiuEntrega) : null;
            const entregue = p.dataEntregue ? new Date(p.dataEntregue) : null;
            const min = (a, b) => (a && b) ? Math.round((b-a)/60000) : null;
            return {
                ...p,
                tempos: {
                    coleta: min(criado, preparando),       // pedido -> cozinha aceitar
                    producao: min(preparando, pronto),     // cozinha aceitar -> pronto
                    entrega: min(saiu || pronto, entregue),// saiu -> entregue
                    total: min(criado, entregue)           // total pedido -> entregue
                }
            };
        });
        res.json(resultado);
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


// ========== PEDIDO VIA CARDÁPIO DIGITAL ==========
router.post('/pedido-cardapio-digital', async (req, res) => {
    try {
        const { adminId, telefoneCliente, nomeCliente, itens, total } = req.body;
        if (!adminId || !itens || itens.length === 0) {
            return res.status(400).json({ erro: 'Dados inválidos' });
        }

        // Montar texto do pedido
        const itensTexto = itens.map(i => 
            i.quantidade + 'x ' + i.nome + (i.obs ? ' (' + i.obs + ')' : '')
        ).join(', ');

        console.log('[CARDAPIO-DIGITAL] Pedido de', telefoneCliente, ':', itensTexto);

        // Se tem telefone do cliente, enviar para a Rebeca processar
        if (telefoneCliente) {
            try {
                const { InstanciaWhatsapp } = require('../models');
                const EvolutionMultiService = require('../services/evolution-multi.service');
                const RebecaDeliveryService = require('../services/rebeca-delivery.service');

                const inst = await InstanciaWhatsapp.findOne({ 
                    adminId, 
                    status: { $in: ['conectado','open','connected'] } 
                });

                if (inst) {
                    // Carregar conversa e preencher carrinho direto
                    const conversa = RebecaDeliveryService.obterConversa(telefoneCliente, adminId);
                    conversa.carrinho = itens.map(i => ({
                        _id: i.itemId,
                        nome: i.nome,
                        preco: i.preco,
                        quantidade: i.quantidade,
                        observacao: i.obs || ''
                    }));
                    conversa.clienteNome = nomeCliente || conversa.clienteNome || 'Cliente';
                    conversa.etapa = 'pedir_endereco';

                    // Montar resumo bonito
                    const resumo = itens.map(i => 
                        '• ' + i.quantidade + 'x *' + i.nome + '* — R$ ' + (i.preco * i.quantidade).toFixed(2)
                    ).join('\n');

                    const msg = '🛒 *Pedido recebido pelo cardápio digital!*\n\n' 
                        + resumo 
                        + '\n\n💰 *Total: R$ ' + Number(total).toFixed(2) + '*'
                        + '\n\n📍 Qual o *endereço de entrega*?\n\nManda a rua, número e bairro! 😊';

                    await EvolutionMultiService.enviarMensagem(inst._id, telefoneCliente, msg);
                    console.log('[CARDAPIO-DIGITAL] Mensagem enviada para', telefoneCliente);
                }
            } catch(e) {
                console.log('[CARDAPIO-DIGITAL] Erro notificar cliente:', e.message);
            }
        }

        res.json({ sucesso: true });
    } catch(e) {
        console.error('[CARDAPIO-DIGITAL] Erro:', e.message);
        res.status(500).json({ erro: e.message });
    }
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


// ========== ASSINANTES ==========
router.get('/assinantes', authDelivery, async (req, res) => {
    try {
        const assinantes = await MensalidadeClienteDelivery.find({ adminId: req.adminId }).sort({ nome: 1 });
        res.json({ assinantes });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/assinantes', authDelivery, async (req, res) => {
    try {
        const { nome, telefone, endereco, valor, diaVencimento, formaPagamento, horarioEntrega, restricoes, observacoes } = req.body;
        const assinante = await MensalidadeClienteDelivery.create({
            adminId: req.adminId, nome, telefone, endereco, valor, diaVencimento,
            formaPagamento, horarioEntrega, restricoes, observacoes, status: 'ativo'
        });
        res.json({ assinante });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/assinantes/:id', authDelivery, async (req, res) => {
    try {
        const assinante = await MensalidadeClienteDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            req.body,
            { new: true }
        );
        res.json({ assinante });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/assinantes/:id', authDelivery, async (req, res) => {
    try {
        await MensalidadeClienteDelivery.findOneAndDelete({ _id: req.params.id, adminId: req.adminId });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/assinantes/:id/pagar', authDelivery, async (req, res) => {
    try {
        const assinante = await MensalidadeClienteDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { ultimoPagamento: new Date(), status: 'ativo' },
            { new: true }
        );
        res.json({ assinante });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== CARDÁPIO DO DIA ==========
router.get('/cardapio-hoje', authDelivery, async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        let cardapio = await CardapioDia.findOne({ adminId: req.adminId, data: hoje });
        if (!cardapio) {
            cardapio = { data: hoje, descricao: '', enviado: false, totalEnviados: 0 };
        }
        const totalAssinantes = await MensalidadeClienteDelivery.countDocuments({ adminId: req.adminId, status: 'ativo' });
        res.json({ cardapio, totalAssinantes });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/cardapio-hoje/enviar', authDelivery, async (req, res) => {
    try {
        const { descricao } = req.body;
        const hoje = new Date().toISOString().split('T')[0];
        const cardapio = await CardapioDia.findOneAndUpdate(
            { adminId: req.adminId, data: hoje },
            { descricao, enviado: true, enviadoEm: new Date(), adminId: req.adminId, data: hoje },
            { upsert: true, new: true }
        );
        // Buscar assinantes ativos e enviar mensagem
        const assinantes = await MensalidadeClienteDelivery.find({ adminId: req.adminId, status: 'ativo' });
        let enviados = 0;
        try {
            const { InstanciaWhatsapp } = require('../models');
            const instancia = await InstanciaWhatsapp.findOne({ adminId: req.adminId, status: 'conectado' });
            if (instancia) {
                const EvolutionMultiService = require('../services/evolution-multi.service');
                for (const a of assinantes) {
                    try {
                        await EvolutionMultiService.enviarMensagem(instancia._id, a.telefone,
                            `🍽️ *Cardápio do Dia!*\n\n${descricao}\n\n_Para fazer seu pedido, responda esta mensagem!_`
                        );
                        enviados++;
                    } catch(_) {}
                }
            }
        } catch(_) {}
        await CardapioDia.findOneAndUpdate({ _id: cardapio._id }, { totalEnviados: enviados });
        res.json({ sucesso: true, enviados, totalAssinantes: assinantes.length });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ========== ENTREGADOR — AUTH ==========

// Login do entregador
router.post('/entregador/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        if (!telefone || !senha) return res.status(400).json({ erro: 'Telefone e senha obrigatórios' });
        const entregador = await Entregador.findOne({ telefone: telefone.replace(/\D/g,'') });
        if (!entregador) return res.status(401).json({ erro: 'Entregador não encontrado' });
        if (!entregador.ativo) return res.status(401).json({ erro: 'Conta desativada. Fale com o restaurante.' });
        if (entregador.senha !== senha) return res.status(401).json({ erro: 'Senha incorreta' });
        // Gerar token se não tiver
        if (!entregador.token) {
            entregador.token = crypto.randomBytes(32).toString('hex');
            await entregador.save();
        }
        res.json({ sucesso: true, token: entregador.token, entregador: {
            _id: entregador._id, nome: entregador.nome, telefone: entregador.telefone,
            veiculo: entregador.veiculo, placa: entregador.placa, foto: entregador.foto,
            valorPorEntrega: entregador.valorPorEntrega, adminId: entregador.adminId
        }});
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Cadastrar entregador (pelo admin)
router.post('/entregadores/cadastrar', authDelivery, async (req, res) => {
    try {
        const { nome, telefone, senha, veiculo, placa, valorPorEntrega, foto } = req.body;
        if (!nome || !telefone || !senha) return res.status(400).json({ erro: 'Nome, telefone e senha obrigatórios' });
        const telefoneLimpo = telefone.replace(/\D/g,'');
        const existe = await Entregador.findOne({ adminId: req.adminId, telefone: telefoneLimpo });
        if (existe) return res.status(400).json({ erro: 'Já existe entregador com esse telefone' });
        const token = crypto.randomBytes(32).toString('hex');
        const entregador = await Entregador.create({
            adminId: req.adminId, nome, telefone: telefoneLimpo, senha,
            veiculo: veiculo || '', placa: placa || '',
            valorPorEntrega: valorPorEntrega || 0, foto: foto || '',
            token, ativo: true, tipo: 'entregador'
        });
        const linkApp = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/delivery-entregador?token=' + token;
        res.json({ sucesso: true, entregador, linkApp });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Listar entregadores com detalhes (pelo admin)
router.get('/entregadores/detalhes', authDelivery, async (req, res) => {
    try {
        const entregadores = await Entregador.find({ adminId: req.adminId }).sort({ nome: 1 });
        const BASE = process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com';
        const lista = entregadores.map(e => ({
            ...e.toObject(),
            linkApp: BASE + '/delivery-entregador?token=' + (e.token || ''),
            senhaMascarada: e.senha ? '••••••' : 'Sem senha'
        }));
        res.json({ entregadores: lista });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar senha do entregador (pelo admin)
router.put('/entregadores/:id/senha', authDelivery, async (req, res) => {
    try {
        const { senha } = req.body;
        const entregador = await Entregador.findOne({ _id: req.params.id, adminId: req.adminId });
        if (!entregador) return res.status(404).json({ erro: 'Não encontrado' });
        entregador.senha = senha;
        entregador.token = crypto.randomBytes(32).toString('hex');
        await entregador.save();
        const linkApp = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/delivery-entregador?token=' + entregador.token;
        res.json({ sucesso: true, linkApp });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Entregador atualiza próprio status online/offline
router.put('/entregador/status', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ','') || req.query.token;
        const { online, latitude, longitude } = req.body;
        const entregador = await Entregador.findOne({ token });
        if (!entregador) return res.status(401).json({ erro: 'Token inválido' });
        entregador.online = online;
        if (latitude && longitude) {
            entregador.ultimaLocalizacao = { latitude, longitude, atualizadoEm: new Date() };
        }
        await entregador.save();
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== CAIXA ==========

// Criar pedido manual pelo caixa
router.post('/caixa/pedido', authDelivery, async (req, res) => {
    try {
        const { clienteNome, clienteTelefone, itens, tipoLocal, numeroMesa, 
                nomeComanda, observacao, formaPagamento, subtotal, total, taxaEntrega } = req.body;
        
        const pedido = new PedidoDelivery({
            adminId: req.adminId,
            clienteNome: clienteNome || 'Cliente Balcão',
            clienteTelefone: clienteTelefone || '0000000000',
            itens,
            tipoLocal: tipoLocal || 'balcao',
            numeroMesa,
            nomeComanda,
            observacao,
            origemPedido: 'caixa',
            formaPagamento: formaPagamento || 'na_entrega',
            subtotal: subtotal || 0,
            total: total || 0,
            taxaEntrega: taxaEntrega || 0,
            status: 'confirmado',
            tipoEntrega: tipoLocal === 'delivery' ? 'delivery' : 'retirada'
        });
        
        await pedido.save();
        res.json({ sucesso: true, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Buscar pedidos ativos do caixa (mesa + balcão + delivery pendente)
router.get('/caixa/pedidos', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            status: { $nin: ['entregue', 'cancelado'] },
            pago: { $ne: true }
        }).sort({ createdAt: -1 });
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Registrar pagamento (total ou parcial)
router.post('/caixa/pedido/:id/pagar', authDelivery, async (req, res) => {
    try {
        const { formas, total } = req.body; // formas: [{forma, valor}]
        const pedido = await PedidoDelivery.findOne({ _id: req.params.id, adminId: req.adminId });
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
        
        pedido.formasPagamento = formas;
        pedido.totalPago = formas.reduce((s, f) => s + f.valor, 0);
        pedido.troco = Math.max(0, pedido.totalPago - pedido.total);
        pedido.pago = true;
        pedido.dataPagamento = new Date();
        pedido.status = 'entregue';
        pedido.dataEntregue = new Date();
        
        await pedido.save();
        res.json({ sucesso: true, troco: pedido.troco, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Adicionar item a pedido existente (comanda aberta)
router.post('/caixa/pedido/:id/item', authDelivery, async (req, res) => {
    try {
        const { item } = req.body;
        const pedido = await PedidoDelivery.findOne({ _id: req.params.id, adminId: req.adminId });
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
        
        pedido.itens.push(item);
        pedido.subtotal = pedido.itens.reduce((s, i) => s + (i.subtotal || 0), 0);
        pedido.total = pedido.subtotal + (pedido.taxaEntrega || 0) - (pedido.desconto || 0);
        
        await pedido.save();
        res.json({ sucesso: true, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== CAIXA — ESTATÍSTICAS E PAINEL COMPLETO ==========

// Estatísticas do dia para o caixa
router.get('/caixa/stats', authDelivery, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        const [ativos, entregues, cancelados] = await Promise.all([
            PedidoDelivery.find({ adminId: req.adminId, status: { $nin: ['entregue','cancelado'] } }),
            PedidoDelivery.find({ adminId: req.adminId, status: 'entregue', dataEntregue: { $gte: hoje } }),
            PedidoDelivery.countDocuments({ adminId: req.adminId, status: 'cancelado', createdAt: { $gte: hoje } })
        ]);

        // Calcular previsão média de entrega
        const temposEntrega = entregues
            .filter(p => p.dataSaiuEntrega && p.dataEntregue)
            .map(p => Math.round((new Date(p.dataEntregue) - new Date(p.dataSaiuEntrega)) / 60000));
        const mediaEntrega = temposEntrega.length 
            ? Math.round(temposEntrega.reduce((a,b) => a+b, 0) / temposEntrega.length)
            : null;

        const totalDia = entregues.reduce((s, p) => s + (p.total || 0), 0);
        const ticketMedio = entregues.length ? totalDia / entregues.length : 0;

        // Pedidos por origem
        const doWhatsapp = [...ativos, ...entregues].filter(p => p.origemPedido === 'whatsapp' || !p.origemPedido).length;
        const doCaixa = [...ativos, ...entregues].filter(p => p.origemPedido === 'caixa').length;

        res.json({
            ativos: ativos.length,
            entreguesHoje: entregues.length,
            canceladosHoje: cancelados,
            totalDia,
            ticketMedio,
            mediaEntregaMin: mediaEntrega,
            doWhatsapp,
            doCaixa,
            emPreparacao: ativos.filter(p => p.status === 'preparando').length,
            prontos: ativos.filter(p => p.status === 'pronto').length,
            saindoEntrega: ativos.filter(p => p.status === 'saiu_entrega').length,
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Todos pedidos do dia (WhatsApp + Caixa) para o caixa
router.get('/caixa/todos', authDelivery, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            createdAt: { $gte: hoje }
        }).sort({ createdAt: -1 });
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== CAIXA — INFO ENTREGADORES ATIVOS ==========
router.get('/caixa/entregadores-ativos', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            status: 'saiu_entrega'
        }).select('numero clienteNome enderecoEntrega entregadorNome dataSaiuEntrega total');
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});
