

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { Entregador, MensalidadeClienteDelivery, CardapioDia, GarcomDelivery,
        AdminDelivery, PedidoDelivery, ItemCardapio, CategoriaCardapio, ConfigDelivery, CaixaDelivery, ComboDelivery } = require('../models/delivery.models');
const { EntregadorDelivery, ClienteDelivery, InstanciaWhatsapp, AvaliacaoDelivery,
        AssinanteDelivery } = require('../models');
const EvolutionMultiService = require('../services/evolution-multi.service');
const RebecaDeliveryService = require('../services/rebeca-delivery.service');

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
async function gerarImagemItem(nome, descricao, tamanho, fotoReferencia) {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;
        const axios = require('axios');

        // Detectar se é bebida e qual embalagem usar
        const nomeLower = (nome || '').toLowerCase();
        const descLower = (descricao || '').toLowerCase();
        const isBebida = nomeLower.match(/suco|refrigerante|bebida|cerveja|água|agua|drink|guaraná|guarana|coca|pepsi|fanta|sprite|limonada|vitamina|shake|caldo de cana|mate|chá|cha|energético|energetico|isotônico|isotonico|vinho|caipirinha|dose|whisky|vodka|rum|gin|cerveja|chopp|milk.?shake/) ||
                         descLower.match(/gelad|gelei|refrescant|ml|litro|garrafa|latinha|lata|caixinha/);

        let embalagемDesc = '';
        let promptFinal = '';

        if (isBebida && tamanho) {
            // Mapear tamanho para descrição visual real da embalagem
            const embalagemMap = {
                '200ml':  'small 200ml juice box carton (caixinha), with straw',
                '269ml':  'small 269ml slim aluminum can (latinha pequena)',
                '350ml':  'standard 350ml aluminum can (latinha)',
                '473ml':  'tall 473ml aluminum can (lata grande)',
                '500ml':  '500ml glass bottle (garrafa de vidro 500ml)',
                '600ml':  '600ml plastic or glass bottle (garrafa 600ml)',
                '1L':     '1 liter PET bottle (garrafa pet 1 litro)',
                '1.5L':   '1.5 liter PET bottle (garrafa pet 1,5 litro)',
                '2L':     '2 liter PET bottle (garrafa pet 2 litros)',
                '2.5L':   '2.5 liter PET bottle (garrafa pet 2,5 litros)'
            };
            embalagemDesc = embalagemMap[tamanho] || tamanho;

            promptFinal = `Ultra realistic product photo of "${nome}" beverage, ` +
                `served in a ${embalagemDesc}. ` +
                (descricao ? `Flavor/description: ${descricao}. ` : '') +
                `The container must look exactly like a real product — correct proportions, ` +
                `condensation droplets on the outside showing it is cold and refreshing, ` +
                `placed on a dark wet bar counter or wooden surface with ice cubes nearby, ` +
                `dramatic studio lighting with a soft glow, bokeh background, ` +
                `no text, no labels with brand names, no watermark, ` +
                `ultra realistic, 4K, commercial beverage photography style.`;
        } else {
            // Prompt padrão para comidas
            promptFinal = `Professional food photography of "${nome}"` +
                (descricao ? `, with ${descricao}` : '') +
                `. Place the food centered on a beautiful warm wooden rustic table surface, ` +
                `shot from slightly above (45 degree angle), soft natural lighting from the side, ` +
                `shallow depth of field, bokeh background, appetizing and vibrant colors, ` +
                `no text, no watermark, no distortion, ultra realistic, 4K quality, ` +
                `restaurant menu style photo, food styled beautifully.`;
        }

        // Se tiver foto de referência, usar GPT-4 Vision para enriquecer o prompt
        if (fotoReferencia && fotoReferencia.length > 100) {
            try {
                console.log('[IMG-ITEM] Analisando foto de referencia com GPT-4 Vision...');
                const base64Data = fotoReferencia.replace(/^data:image\/[a-z]+;base64,/, '');
                const mediaType = fotoReferencia.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                const visionResp = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-4o',
                    max_tokens: 300,
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analise esta foto de um prato/lanche chamado "' + nome + '". Descreva em inglês, de forma detalhada e técnica para um prompt de geração de imagem profissional: as cores, ingredientes visíveis, textura, apresentação, estilo do prato. Seja específico sobre aparência visual. Responda APENAS com a descrição técnica visual, sem frases introdutórias.'
                            },
                            {
                                type: 'image_url',
                                image_url: { url: 'data:' + mediaType + ';base64,' + base64Data }
                            }
                        ]
                    }]
                }, {
                    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
                    timeout: 30000
                });
                const descricaoVisual = visionResp.data.choices[0]?.message?.content || '';
                if (descricaoVisual) {
                    promptFinal = 'Ultra-realistic professional food photography of "' + nome + '". ' +
                        'Visual reference analysis: ' + descricaoVisual + '. ' +
                        'Transform into a stunning commercial menu photo: perfect studio lighting, ' +
                        'beautiful modern background with warm bokeh, food styled elegantly on premium surface, ' +
                        'shot from 45-degree angle, vibrant appetizing colors, sharp focus on the food, ' +
                        'no text, no watermarks, no logos, 4K ultra quality, magazine-worthy presentation.';
                    console.log('[IMG-ITEM] Prompt enriquecido com Vision OK');
                }
            } catch(vErr) {
                console.log('[IMG-ITEM] Vision falhou, usando prompt padrao:', vErr.message);
            }
        }

        const prompt = promptFinal;

        console.log('[IMG-ITEM] Gerando imagem para:', nome);

        const resp = await axios.post('https://api.openai.com/v1/images/generations', {
            model: 'dall-e-3',
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
            style: 'natural',
            response_format: 'b64_json'
        }, {
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            timeout: 60000
        });

        const b64 = resp.data.data[0]?.b64_json;
        if (!b64) return null;
        const dataUrl = 'data:image/png;base64,' + b64;
        console.log('[IMG-ITEM] Imagem salva em base64 permanente: OK');
        return dataUrl;
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
            const urlImagem = await gerarImagemItem(dados.nome || '', dados.descricao || '', dados.tamanho || dados.volume || '');
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
            const urlImagem = await gerarImagemItem(nomeFinal, descFinal, dados.tamanho || dados.volume || itemAtual?.tamanho || itemAtual?.volume || '', dados.fotoReferencia || null);
            if (urlImagem) dados.imagem = urlImagem;
        }
        delete dados.regenerarImagem;
        delete dados.fotoReferencia; // nao salvar no banco

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
        const data = req.query.data;
        if (data) {
            const inicio = new Date(data + 'T00:00:00.000Z');
            const fim    = new Date(data + 'T23:59:59.999Z');
            filtro.createdAt = { $gte: inicio, $lte: fim };
        }
        const limit = parseInt(req.query.limit) || 50;
        const pedidos = await PedidoDelivery.find(filtro).sort({ createdAt: -1 }).limit(Math.min(limit, 500));
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
        if (status === 'cancelado') { update.dataCancelado = agora; update.motivoCancelamento = req.body.motivo; update.canceladoPor = req.body.canceladoPor || null; }
        
        const pedido = await PedidoDelivery.findOneAndUpdate({ _id: req.params.id, adminId: req.adminId }, update, { new: true });
        
        // Notificar cliente via WhatsApp
        if (pedido && pedido.clienteTelefone) {
            try {
                const EvolutionMultiService = require('../services/evolution-multi.service');
                const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminId, status: { $in: ['conectado','open','connected'] } });
                if (inst) {
                    const config = await ConfigDelivery.findOne({ adminId: req.adminId });
                    let msg = '';
                    if (status === 'confirmado') msg = config?.mensagemPedidoConfirmado || '✅ Pedido #' + pedido.numero + ' confirmado! Estamos preparando.';
                    if (status === 'preparando') msg = '👨‍🍳 Pedido #' + pedido.numero + ' está sendo preparado!';
                    if (status === 'pronto') msg = config?.mensagemPedidoPronto || '✅ Pedido #' + pedido.numero + ' está pronto!';
                    if (status === 'saiu_entrega') {
                        try {
                            const AdminDelivery = require('../models/delivery.models').AdminDelivery;
                            const adm2 = await AdminDelivery.findById(req.adminId).lean();
                            const isPlus2 = adm2 && ['plus','premium'].includes(adm2.plano) && adm2.planoStatus === 'ativo';
                            if (isPlus2) {
                                const linkRastreio = (process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com') + '/delivery-rastrear/' + pedido._id.toString().slice(-8);
                                msg = '\uD83C\uDFCD\uFE0F Pedido #' + pedido.numero + ' saiu para entrega!\n\n\uD83D\uDCCD Acompanhe: ' + linkRastreio;
                                try { const RDS = require('../services/recibo-delivery.service'); await RDS.enviarLinkRastreamento(req.adminId, pedido._id, linkRastreio); } catch(_) {}
                            } else {
                                msg = 'Eba! Seu pedido #' + pedido.numero + ' saiu para entrega! Logo logo esta ai \uD83D\uDE0A';
                            }
                        } catch(_) { msg = 'Pedido #' + pedido.numero + ' saiu para entrega!'; }
                    }
                    if (status === 'entregue') msg = '✅ Pedido #' + pedido.numero + ' entregue! Obrigado pela preferência! 😊\n\nAvalie de 1 a 5 ⭐';
                    if (status === 'cancelado') {
                        const quemCancelou = { caixa: 'pelo Caixa', garcom: 'pelo Garçom', cozinha: 'pela Cozinha', admin: 'pelo Administrador', cliente: 'a pedido do Cliente', sistema: 'pelo Sistema' };
                        const quem = quemCancelou[req.body.canceladoPor] || '';
                        const motivo = req.body.motivo ? ' Motivo: ' + req.body.motivo : '';
                        msg = '❌ Pedido #' + pedido.numero + ' foi cancelado' + (quem ? ' ' + quem : '') + '.' + motivo;
                    }
                    
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
        // Não criar automaticamente — só retornar o que existe
        res.json(config || {});
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/config', authDelivery, async (req, res) => {
    try {
        const config = await ConfigDelivery.findOneAndUpdate(
            { adminId: req.adminId },
            { $set: { ...req.body, adminId: req.adminId } },
            { new: true, upsert: true }
        );
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

// ========== ITENS (autenticado — para combos) ==========
router.get('/itens', authDelivery, async (req, res) => {
    try {
        const itens = await ItemCardapio.find({ adminId: req.adminId }).lean();
        res.json(itens);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== CARDÁPIO PÚBLICO (sem auth - para clientes verem) ==========
router.get('/cardapio-publico/:adminId', async (req, res) => {
    try {
        const adminId = req.params.adminId;
        const [config, admin, categorias, itens] = await Promise.all([
            ConfigDelivery.findOne({ adminId }).lean(),
            AdminDelivery.findById(adminId).lean(),
            CategoriaCardapio.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean(),
            ItemCardapio.find({ adminId, ativo: true, disponivel: { $ne: false } }).sort({ ordem: 1 }).lean()
        ]);

        // Nome: config > nomeComercio do admin > fallback
        const nomeRestaurante = config?.nomeRestaurante || admin?.nomeComercio || 'Delivery';

        // Formas de pagamento aceitas
        const formasPgto = [];
        if (config?.aceitaDinheiro !== false) formasPgto.push('dinheiro');
        if (config?.aceitaCartao) formasPgto.push('cartao');
        if (config?.aceitaPix !== false) formasPgto.push('pix');

        // Normalizar categoriaId dos itens para string (evitar falha de comparação no frontend)
        const itensNorm = itens.map(it => ({
            ...it,
            categoriaId: it.categoriaId ? it.categoriaId.toString() : null
        }));

        // Normalizar _id das categorias para string
        const categoriasNorm = categorias.map(c => ({
            ...c,
            _id: c._id.toString()
        }));

        // Só enviar campos que o admin configurou explicitamente (não defaults automáticos)
        const DEFAULTS = {
            horarioFuncionamento: '18:00 - 23:00',
            tempoMedioEntrega: 40,
            taxaEntregaFixa: 5.00,
            pedidoMinimo: 15.00
        };
        const configExiste = !!config;
        res.json({
            restaurante: nomeRestaurante,
            aberto: config?.aberto !== false,
            // Horário: só mostrar se existir e for diferente do padrão
            horario: (configExiste && config.horarioFuncionamento && config.horarioFuncionamento !== DEFAULTS.horarioFuncionamento) ? config.horarioFuncionamento : null,
            // Endereço: só se preenchido
            endereco: config?.endereco || null,
            // Telefone: só se o admin cadastrou telefone de exibição separado (não o de login)
            telefone: config?.telefoneExibicao || null,
            logo: admin?.logo || config?.logo || null,
            // Numéricos: só mostrar se admin alterou do padrão
            pedidoMinimo: (configExiste && config.pedidoMinimo !== DEFAULTS.pedidoMinimo) ? config.pedidoMinimo : null,
            taxaEntrega: (configExiste && config.taxaEntregaFixa !== DEFAULTS.taxaEntregaFixa) ? config.taxaEntregaFixa : null,
            tempoEntrega: (configExiste && config.tempoMedioEntrega !== DEFAULTS.tempoMedioEntrega) ? config.tempoMedioEntrega : null,
            chavePix: config?.aceitaPix ? config?.chavePix || null : null,
            formasPagamento: formasPgto,
            categorias: categoriasNorm,
            itens: itensNorm
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
        try {
            const _Sse = require('../services/sse.service');
            // Notificar admin
            _Sse.emitir(pedido.adminId?.toString(), 'pedido_pronto', { pedidoId: pedido._id, numero: pedido.numero, origem: pedido.origemPedido || 'cozinha' });
            // Notificar todos entregadores ativos deste admin via SSE
            const _entsAtivos = await Entregador.find({ adminId: pedido.adminId, ativo: true }).lean();
            const _tokens = _entsAtivos.map(e => e.token).filter(Boolean);
            if (_tokens.length > 0) {
                _Sse.emitirParaEntregadores(_tokens, 'novo_pedido_disponivel', {
                    pedidoId: pedido._id.toString(),
                    numero: pedido.numero,
                    endereco: pedido.enderecoEntrega || 'Retirada',
                    total: pedido.total || pedido.valorTotal || 0,
                    itens: (pedido.itens || []).map(i => i.quantidade + 'x ' + i.nome).join(', ')
                });
                // Timer: avisar admin se ninguém aceitar em 3 minutos
                _Sse.iniciarTimerAlerta(pedido._id.toString(), pedido.adminId.toString(), 180);
            }
        } catch(_) { console.log('[SSE-ENTREGADOR] Erro:', _.message); }
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
            { status: 'cancelado', dataCancelado: new Date(), motivoCancelamento: motivo, canceladoPor: req.body.canceladoPor || 'cozinha' },
            { new: true }
        );
        try {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminId, status: { $in: ['conectado','open','connected'] } });
            const quemCancelou = { caixa: 'pelo Caixa', garcom: 'pelo Garçom', cozinha: 'pela Cozinha', admin: 'pelo Administrador', cliente: 'a pedido do Cliente', sistema: 'pelo Sistema' };
            const quem = quemCancelou[req.body.canceladoPor || 'cozinha'] || 'pela Cozinha';
            const msgCancel = '❌ Pedido #' + pedido.numero + ' foi cancelado ' + quem + '. Motivo: ' + motivo + '. Desculpe pelo transtorno!';
            if (inst && pedido && pedido.clienteTelefone) await EvolutionMultiService.enviarMensagem(inst._id, pedido.clienteTelefone, msgCancel);
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
        const token = crypto.randomBytes(32).toString('hex');
        const entregador = await Entregador.create({
            nome, telefone, veiculo, adminId: req.adminId,
            tipo: 'entregador', ativo: true, token
        });
        const BASE = process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com';
        const linkApp = BASE + '/delivery-entregador?token=' + token;
        res.json({ entregador, linkApp });
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
        entregador.ativo = !entregador.ativo;
        await entregador.save();
        res.json({ entregador });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADOR: LISTAR PEDIDOS PRONTOS ==========

router.delete('/entregadores/:id', authDelivery, async (req, res) => {
    try {
        await Entregador.deleteOne({ _id: req.params.id, adminId: req.adminId });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

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


router.post('/pedido-cardapio-digital', async (req, res) => {
    try {
        const { adminId, telefoneCliente, nomeCliente, itens, total, taxaEntrega, enderecoEntrega, formaPagamento, troco, observacaoGeral } = req.body;
        if (!adminId || !itens || itens.length === 0) {
            return res.status(400).json({ erro: 'Dados inválidos' });
        }

        // Salvar pedido no banco
        const numeroPedido = Date.now().toString().slice(-6);
        // Buscar config para taxas e plano do admin
        const cfgTaxa = await ConfigDelivery.findOne({ adminId }).lean();
        const adminDoc = await AdminDelivery.findById(adminId).lean();
        const isPlanoPlus = adminDoc && ['plus','premium'].includes(adminDoc.plano) && adminDoc.planoStatus === 'ativo';
        const subtotalItens = itens.reduce((s,i) => s + (Number(i.preco||0)*Number(i.quantidade||1)), 0);
        const taxaGarcomPerc = cfgTaxa?.cobrarTaxaGarcom ? (cfgTaxa.taxaGarcomPerc || 10) : 0;
        const taxaGarcom = taxaGarcomPerc > 0 ? Math.round(subtotalItens * taxaGarcomPerc / 100 * 100) / 100 : 0;
        const taxaBanda = cfgTaxa?.cobrarBanda ? (cfgTaxa.taxaBandaValor || 0) : 0;
        const SseService = require('../services/sse.service');
        const pedidoSalvo = await PedidoDelivery.create({
            adminId,
            numero: numeroPedido,
            clienteNome: nomeCliente || 'Cliente Digital',
            clienteTelefone: telefoneCliente || '',
            enderecoEntrega: enderecoEntrega || '',
            formaPagamento: formaPagamento || 'dinheiro',
            troco: troco || null,
            observacao: observacaoGeral || '',
            itens: itens.map(i => ({
                itemId: i.itemId,
                nome: i.nome,
                preco: i.preco,
                quantidade: i.quantidade,
                observacao: i.obs || ''
            })),
            subtotal: itens.reduce((s,i) => s + (i.preco * i.quantidade), 0),
            taxaEntrega: taxaEntrega || 0,
            total: Number(total),
            status: 'novo',
            origemPedido: 'cardapio_digital',
            taxaGarcomPerc, taxaGarcom, taxaBanda,
            planoPlus: isPlanoPlus,
            vias: cfgTaxa?.viasImpressao || 1,
        });

        console.log('[CARDAPIO-DIGITAL] Pedido #' + numeroPedido + ' salvo de', telefoneCliente || 'sem telefone');
        // Disparar SSE para impressão automática no admin
        try { SseService.emitir(adminId?.toString(), 'novo_pedido', { pedidoId: pedidoSalvo._id, origem: 'cardapio_digital' }); } catch(_) {}

        // Enviar recibo oficial via ReciboDeliveryService (salva reciboEnviado no banco)
        try {
            const ReciboDeliveryService = require('../services/recibo-delivery.service');
            await ReciboDeliveryService.enviarRecibo(adminId, pedidoSalvo._id);
        } catch(re) { console.log('[RECIBO] Erro service:', re.message); }
        // Impressao automatica da comanda — TODOS os planos (confort, plus, premium)
        try {
            const ComandaService = require('../services/comanda.service');
            const ImpressoraService = require('../services/impressora.service');
            const nomeEstab = (cfgTaxa && cfgTaxa.nomeRestaurante) || 'Delivery';
            const vias = (cfgTaxa && cfgTaxa.viasImpressao) || 1;
            const { InstanciaWhatsapp } = require('../models');
            const Evo = require('../services/evolution-multi.service');
            const instCoz = await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).lean();

            // Montar comanda completa com endereço, pagamento, troco, complemento
            const pedidoParaComanda = {
                ...pedidoSalvo.toObject ? pedidoSalvo.toObject() : pedidoSalvo,
                nomeCliente: pedidoSalvo.clienteNome || pedidoSalvo.nomeCliente || '',
                telefoneCliente: pedidoSalvo.telefoneCliente || '',
                endereco: pedidoSalvo.enderecoEntrega || '',
                observacoes: pedidoSalvo.observacaoGeral || pedidoSalvo.observacao || '',
                formaPagamento: pedidoSalvo.formaPagamento || '',
                troco: pedidoSalvo.troco || 0,
                valorPago: pedidoSalvo.valorPago || 0,
            };

            if (instCoz && adminDoc && adminDoc.telefone) {
                // Enviar texto da comanda via WhatsApp (para o admin ver/imprimir)
                const texto = ComandaService.gerarTexto(pedidoParaComanda, { nomeEstab, vias });
                await Evo.enviarMensagem(instCoz._id, adminDoc.telefone, texto);
            }

            // Plus/Premium: marcar como confirmado automaticamente
            if (isPlanoPlus) {
                const PedidoMdl = require('../models/pedidoDelivery.model');
                await PedidoMdl.updateOne({ _id: pedidoSalvo._id }, { status: 'confirmado', dataConfirmacao: new Date() });
            }

            console.log('[COMANDA-AUTO] Enviada — plano:', adminDoc?.plano, '— vias:', vias);
        } catch(cp) { console.log('[COMANDA-AUTO] Erro:', cp.message); }
        // Notificar cliente pelo WhatsApp se tiver telefone
        if (telefoneCliente) {
            try {
                const EvolutionMultiService = require('../services/evolution-multi.service');
                const inst = await InstanciaWhatsapp.findOne({ 
                    adminId, status: { $in: ['conectado','open','connected'] } 
                });
                if (inst) {
                    const resumo = itens.map(i => 
                        '• ' + i.quantidade + 'x *' + i.nome + '* — R$ ' + (i.preco * i.quantidade).toFixed(2)
                    ).join('\n');
                    const pgtoLabel = { dinheiro: '💵 Dinheiro', pix: '📱 Pix', cartao: '💳 Cartão na entrega' }[formaPagamento] || formaPagamento;
                    let msg = '✅ *Pedido #' + numeroPedido + ' confirmado!*\n\n'
                        + resumo
                        + (taxaEntrega ? '\n🛵 Taxa: R$ ' + Number(taxaEntrega).toFixed(2) : '')
                        + '\n\n💰 *Total: R$ ' + Number(total).toFixed(2) + '*'
                        + '\n📍 *Entrega:* ' + (enderecoEntrega || 'A confirmar')
                        + (req.body.complementoEntrega ? '\n🏠 *Complemento:* ' + req.body.complementoEntrega : '')
                        + '\n💳 *Pagamento:* ' + pgtoLabel
                        + (troco ? '\n💵 *Troco para:* R$ ' + Number(troco).toFixed(2) : '')
                        + (observacaoGeral ? '\n📝 *Obs:* ' + observacaoGeral : '')
                        + '\n\n⏳ Estamos preparando seu pedido! Em breve avisamos. 😊';
                    await EvolutionMultiService.enviarMensagem(inst._id, telefoneCliente, msg);
                }
            } catch(e) {
                console.log('[CARDAPIO-DIGITAL] Erro notificar cliente:', e.message);
            }
        }

        res.json({ sucesso: true, pedidoId: pedidoSalvo._id, numero: numeroPedido });
    } catch(e) {
        console.error('[CARDAPIO-DIGITAL] Erro:', e.message);
        res.status(500).json({ erro: e.message });
    }
});



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
        const pedido = await Pedido.findById(req.params.id);
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
        const instancia = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
        if (!instancia) return res.status(400).json({ erro: 'WhatsApp não conectado' });

        const entregadorNome = req.body.entregadorNome || 'Entregador';
        const msg = `🛵 *Mensagem do Entregador*\n\nOlá! Sou o entregador do seu pedido #${pedido.numeroPedido || pedido._id.toString().slice(-4)}.\nEstou a caminho! Caso precise falar comigo, responda esta mensagem e a Rebeca vai me repassar.`;
        await EvolutionMultiService.enviarMensagem(instancia.nomeInstancia, pedido.telefoneCliente, msg);
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ===== CARDÁPIO DO DIA — TOGGLE E CONFIGURAÇÃO =====
// ===== CARDÁPIO SEMANAL MARMITARIA =====
const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

router.get('/cardapio-semanal', authDelivery, async (req, res) => {
    try {
        const { CardapioSemanal } = require('../models/delivery.models');
        const cardapios = await CardapioSemanal.find({ adminId: req.adminId }).sort({ diaSemana: 1 }).lean();
        res.json({ cardapios });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/cardapio-semanal/hoje', async (req, res) => {
    try {
        const { CardapioSemanal, AdminDelivery } = require('../models/delivery.models');
        const { adminId } = req.query;
        if (!adminId) return res.status(400).json({ erro: 'adminId obrigatorio' });
        const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay();
        const cardapio = await CardapioSemanal.findOne({ adminId, diaSemana: hoje, ativo: true }).lean();
        res.json({ cardapio, diaSemana: hoje, nomeDia: DIAS[hoje] });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/cardapio-semanal', authDelivery, async (req, res) => {
    try {
        const { CardapioSemanal } = require('../models/delivery.models');
        const { diaSemana, nomePrato, ingredientes, adicionais, tamanhos, ativo } = req.body;
        const cardapio = await CardapioSemanal.findOneAndUpdate(
            { adminId: req.adminId, diaSemana },
            { adminId: req.adminId, diaSemana, nomePrato, ingredientes, adicionais, tamanhos, ativo: ativo !== false },
            { upsert: true, new: true }
        );
        res.json({ sucesso: true, cardapio });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/cardapio-semanal/:diaSemana', authDelivery, async (req, res) => {
    try {
        const { CardapioSemanal } = require('../models/delivery.models');
        await CardapioSemanal.findOneAndDelete({ adminId: req.adminId, diaSemana: req.params.diaSemana });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/cardapio-dia/config', authDelivery, async (req, res) => {
    try {
        const admin = await AdminDelivery.findById(req.adminId).lean();
        res.json({ 
            cardapioAtivoAssinantes: admin?.cardapioAtivoAssinantes || false,
            telefoneDono: admin?.telefoneDono || admin?.telefone || ''
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/cardapio-dia/toggle', authDelivery, async (req, res) => {
    try {
        const { ativo, telefoneDono } = req.body;
        const update = { cardapioAtivoAssinantes: !!ativo };
        if (telefoneDono !== undefined) update.telefoneDono = telefoneDono;
        await AdminDelivery.findByIdAndUpdate(req.adminId, update);
        res.json({ sucesso: true, cardapioAtivoAssinantes: !!ativo });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/cardapio-dia/enviar-agora', authDelivery, async (req, res) => {
    try {
        const CardapioDiaService = require('../services/cardapio-dia.service');
        await CardapioDiaService.perguntarCardapioAdmin(req.adminId.toString());
        res.json({ sucesso: true, msg: 'Pergunta enviada para seu WhatsApp!' });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// [rotas assinantes e cardapio-hoje movidas para delivery-assinantes.routes.js]

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
        // Garantia: se por qualquer motivo o token não foi salvo, gera agora
        if (!entregador.token) {
            entregador.token = crypto.randomBytes(32).toString('hex');
            await entregador.save();
        }
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
        // token NÃO muda ao trocar senha — só muda se admin revogar acesso
        if (!entregador.token) entregador.token = crypto.randomBytes(32).toString('hex');
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

// ===== SSE — eventos em tempo real (admin) =====
router.get('/eventos', authDelivery, (req, res) => {
    const SseService = require('../services/sse.service');
    SseService.registrar(req.adminId.toString(), res);
});

// ===== SSE — eventos para entregador (por token) =====
router.get('/entregador/eventos', async (req, res) => {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ','');
    if (!token) return res.status(401).end();
    const entregador = await Entregador.findOne({ token }).lean();
    if (!entregador || !entregador.ativo) return res.status(401).end();
    const SseService = require('../services/sse.service');
    SseService.registrarEntregador(token, res);
});

// ===== ACEITAR PEDIDO (primeiro entregador que aceitar trava) =====
router.put('/entregador/:id/aceitar', async (req, res) => {
    try {
        const token = req.query.token || req.headers.authorization?.replace('Bearer ','');
        if (!token) return res.status(401).json({ erro: 'Token obrigatório' });
        const entregador = await Entregador.findOne({ token });
        if (!entregador || !entregador.ativo) return res.status(401).json({ erro: 'Entregador inválido' });

        // Trava atômica: só aceita se ainda estiver 'pronto' e sem entregador
        const pedido = await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: entregador.adminId, status: 'pronto', entregadorId: { $in: [null, undefined] } },
            {
                status: 'saiu_entrega',
                dataSaiuEntrega: new Date(),
                entregadorNome: entregador.nome,
                entregadorId: entregador._id
            },
            { new: true }
        );

        if (!pedido) {
            return res.status(409).json({ erro: 'Pedido já foi aceito por outro entregador ou não está disponível.' });
        }

        // Cancelar timer de alerta pois alguém aceitou
        const SseService = require('../services/sse.service');
        SseService.cancelarTimerAlerta(req.params.id);

        // Notificar admin que entregador aceitou
        SseService.emitir(entregador.adminId.toString(), 'pedido_aceito_entregador', {
            pedidoId: pedido._id,
            numero: pedido.numero,
            entregadorNome: entregador.nome
        });

        // Notificar cliente
        try {
            const RebecaDeliveryService = require('../services/rebeca-delivery.service');
            await RebecaDeliveryService.notificarSaiuEntrega(pedido._id, entregador.nome);
        } catch(e) { console.log('[ACEITAR] Erro notificar cliente:', e.message); }

        console.log('[ACEITAR] Pedido #' + pedido.numero + ' aceito por ' + entregador.nome);
        res.json({ sucesso: true, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== IMPRESSORA — gerar cupom 3 vias =====
router.get('/caixa/pedido/:id/imprimir', authDelivery, async (req, res) => {
    try {
        const pedido = await PedidoDelivery.findOne({ _id: req.params.id, adminId: req.adminId }).lean();
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
        const config = await ConfigDelivery.findOne({ adminId: req.adminId }).lean();
        const ImpressoraService = require('../services/impressora.service');
        const html = ImpressoraService.gerarTresVias(pedido, config || {});
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/caixa/pedido/:id/imprimir', authDelivery, async (req, res) => {
    try {
        const pedido = await PedidoDelivery.findOne({ _id: req.params.id, adminId: req.adminId }).lean();
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
        const config = await ConfigDelivery.findOne({ adminId: req.adminId }).lean();
        const ImpressoraService = require('../services/impressora.service');
        const html = ImpressoraService.gerarTresVias(pedido, config || {});
        res.json({ sucesso: true, html });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar pedido manual pelo caixa
router.post('/caixa/pedido', authDelivery, async (req, res) => {
    const SseService = require('../services/sse.service');
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
            status: 'novo',
            tipoEntrega: tipoLocal === 'delivery' ? 'delivery' : 'retirada'
        });
        
        await pedido.save();
        try { SseService.emitir(adminId?.toString(), 'novo_pedido', { pedidoId: pedido._id, origem: 'digital' }); } catch(_) {}
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

// ========== ESTOQUE ==========

// Buscar item por código de barras
router.get('/estoque/barcode/:codigo', authDelivery, async (req, res) => {
    try {
        const item = await ItemCardapio.findOne({ adminId: req.adminId, codigoBarra: req.params.codigo, ativo: true }).lean();
        if (!item) return res.status(404).json({ erro: 'Item nao encontrado para este codigo' });
        res.json(item);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/estoque', authDelivery, async (req, res) => {
    try {
        const itens = await ItemCardapio.find({ adminId: req.adminId, ativo: true })
            .populate('categoriaId', 'nome emoji').sort({ nome: 1 }).lean();
        res.json(itens);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/estoque/:id', authDelivery, async (req, res) => {
    try {
        const { estoqueAtivo, estoqueAtual, estoqueMinimo, unidadePorPedido } = req.body;
        const item = await ItemCardapio.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { estoqueAtivo, estoqueAtual, estoqueMinimo, unidadePorPedido },
            { new: true }
        );
        if (item && item.estoqueAtivo && item.estoqueAtual <= 0) {
            await ItemCardapio.findByIdAndUpdate(item._id, { disponivel: false });
        }
        res.json({ sucesso: true, item });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/estoque/:id/repor', authDelivery, async (req, res) => {
    try {
        const { quantidade } = req.body;
        const item = await ItemCardapio.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { $inc: { estoqueAtual: parseInt(quantidade) || 0 }, disponivel: true },
            { new: true }
        );
        res.json({ sucesso: true, item });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/lista-compras', authDelivery, async (req, res) => {
    try {
        const itens = await ItemCardapio.find({ adminId: req.adminId, ativo: true, estoqueAtivo: true }).lean();
        const seteDias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            status: { $in: ['entregue', 'preparando', 'pronto'] },
            createdAt: { $gte: seteDias }
        }).lean();
        const consumo = {};
        for (const p of pedidos) {
            for (const it of (p.itens || [])) {
                if (it.itemId) {
                    const id = it.itemId.toString();
                    consumo[id] = (consumo[id] || 0) + (it.quantidade || 1);
                }
            }
        }
        const lista = itens.map(item => {
            const id = item._id.toString();
            const vendidoSemana = consumo[id] || 0;
            const mediaDiaria = Math.ceil(vendidoSemana / 7);
            const diasRestantes = item.estoqueAtual > 0 && mediaDiaria > 0
                ? Math.floor(item.estoqueAtual / mediaDiaria)
                : item.estoqueAtual > 0 ? 99 : 0;
            const precisaComprar = item.estoqueAtual <= item.estoqueMinimo;
            const sugestaoCompra = mediaDiaria > 0
                ? Math.max(mediaDiaria * 7 - item.estoqueAtual, 0)
                : item.estoqueMinimo * 3;
            return {
                _id: item._id,
                nome: item.nome,
                estoqueAtual: item.estoqueAtual,
                estoqueMinimo: item.estoqueMinimo,
                vendidoSemana,
                mediaDiaria,
                diasRestantes,
                precisaComprar,
                sugestaoCompra: Math.ceil(sugestaoCompra),
                urgente: item.estoqueAtual === 0
            };
        }).sort((a, b) => a.diasRestantes - b.diasRestantes);
        res.json({ lista, totalItens: lista.length, precisamCompra: lista.filter(i => i.precisaComprar).length });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== PREVIEW IMAGEM AO DIGITAR NOME =====
router.post('/cardapio/gerar-imagem-preview', authDelivery, async (req, res) => {
    try {
        const { nome, descricao } = req.body;
        if (!nome) return res.json({ imagem: null });
        const url = await gerarImagemItem(nome, descricao || '', req.body.tamanho || '');
        res.json({ imagem: url });
    } catch(e) { res.json({ imagem: null }); }
});

// ===== GARCONS CRUD =====
router.get('/garcons', authDelivery, async (req, res) => {
    try {
        const garcons = await GarcomDelivery.find({ adminId: req.adminId }).sort({ nome: 1 });
        res.json({ sucesso: true, garcons });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/garcons', authDelivery, async (req, res) => {
    try {
        const { nome, telefone, senha, mesas } = req.body;
        if (!nome || !senha) return res.status(400).json({ erro: 'Nome e senha obrigatorios' });
        const token = 'GRC-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const garcom = await GarcomDelivery.create({ adminId: req.adminId, nome, telefone, senha, mesas: mesas || '', token, ativo: true });
        res.json({ sucesso: true, garcom });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/garcons/login', async (req, res) => {
    try {
        const { token, senha } = req.body;
        // Aceitar garçons sem senha ou com senha vazia
        const query = { token, ativo: true };
        if (senha && senha.trim()) query.senha = senha;
        const g = await GarcomDelivery.findOne(query);
        if (!g) return res.status(401).json({ erro: 'Token ou senha inválidos' });
        const adminG = await AdminDelivery.findById(g.adminId).select('nomeComercio');
        res.json({ sucesso: true, garcom: { nome: g.nome, token: g.token, mesas: g.mesas, adminId: g.adminId }, nomeComercio: adminG?.nomeComercio || '' });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/garcons/cardapio', async (req, res) => {
    try {
        const garcomToken = req.query.garcomToken;
        if (!garcomToken) return res.status(400).json({ erro: 'Token nao informado' });
        const g = await GarcomDelivery.findOne({ token: garcomToken, ativo: true });
        if (!g) return res.status(401).json({ erro: 'Token invalido ou garcom inativo' });
        const itens = await ItemCardapio.find({ adminId: g.adminId, ativo: true })
            .sort({ ordem: 1 })
            .populate('categoriaId', 'nome emoji');
        const admin = await AdminDelivery.findById(g.adminId).select('nomeEstabelecimento');
        const cats = [...new Set(itens.map(i => i.categoriaId?.nome).filter(Boolean))];
        res.json({
            sucesso: true,
            itens,
            nomeEstabelecimento: admin ? admin.nomeEstabelecimento : 'Restaurante',
            garcom: { nome: g.nome, mesas: g.mesas, adminId: g.adminId }
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== SSE para garçom (por token) =====
router.get('/garcons/eventos', async (req, res) => {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ','');
    if (!token) return res.status(401).end();
    const g = await GarcomDelivery.findOne({ token, ativo: true });
    if (!g) return res.status(401).end();
    const SseService = require('../services/sse.service');
    // Reutilizar canal do admin para garçom (mesmo adminId)
    SseService.registrar('garcom_' + g._id.toString(), res);
});

// ===== PEDIR CONTA (cliente solicita pelo mesa.html) =====
router.post('/garcons/pedir-conta', async (req, res) => {
    try {
        const { adminId, mesa, nomeCliente } = req.body;
        if (!adminId || !mesa) return res.status(400).json({ erro: 'adminId e mesa obrigatorios' });
        const SseService = require('../services/sse.service');
        // Notificar admin
        SseService.emitir(adminId.toString(), 'pedido_conta', { mesa, nomeCliente: nomeCliente || 'Cliente' });
        // Notificar todos garçons do admin via SSE
        const garcons = await GarcomDelivery.find({ adminId, ativo: true });
        garcons.forEach(g => {
            SseService.emitir('garcom_' + g._id.toString(), 'pedido_conta', { mesa, nomeCliente: nomeCliente || 'Cliente' });
        });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/garcons/pedido', async (req, res) => {
    try {
        const { garcomToken, mesa, itens, observacao } = req.body;
        if (!garcomToken) return res.status(400).json({ erro: 'Token nao informado' });
        const g = await GarcomDelivery.findOne({ token: garcomToken, ativo: true });
        if (!g) return res.status(401).json({ erro: 'Token invalido' });
        const total = itens.reduce((s, i) => s + (i.preco * (i.qtd || i.quantidade || 1)), 0);
        const { nomeCliente } = req.body;
        const itensMapeados = itens.map(i => ({
            itemId: i.itemId || i._id,
            nome: i.nome,
            quantidade: i.qtd || i.quantidade || 1,
            precoUnitario: i.preco || i.precoUnitario || 0,
            subtotal: (i.preco || i.precoUnitario || 0) * (i.qtd || i.quantidade || 1)
        }));
        const pedido = await PedidoDelivery.create({
            adminId: g.adminId,
            tipo: 'mesa',
            mesa: mesa || 'S/N',
            numeroMesa: mesa || 'S/N',
            tipoLocal: 'mesa',
            garcom: g.nome,
            garcomToken: g.token,
            clienteNome: nomeCliente || g.nome,
            clienteTelefone: '00000000000',
            itens: itensMapeados,
            total,
            observacao: observacao || '',
            status: 'novo',
            tipoEntrega: 'retirada',
            tipoLocal: 'mesa',
            origemPedido: 'garcom',
            formaPagamento: 'na_entrega'
        });
        try {
            const _Sse = require('../services/sse.service');
            // Notificar admin
            _Sse.emitir(g.adminId?.toString(), 'novo_pedido', { pedidoId: pedido._id, origem: 'mesa', mesa: mesa || 'S/N' });
            // Notificar todos garçons ativos do admin
            const _garcons = await GarcomDelivery.find({ adminId: g.adminId, ativo: true });
            _garcons.forEach(gc => {
                _Sse.emitir('garcom_' + gc._id.toString(), 'novo_pedido_mesa', {
                    pedidoId: pedido._id,
                    mesa: mesa || 'S/N',
                    total: total,
                    nomeCliente: nomeCliente || 'Cliente'
                });
            });
        } catch(_) { console.log('[SSE-GARCOM]', _.message); }
        res.json({ sucesso: true, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


router.get('/garcons/mesas-ativas', async (req, res) => {
    try {
        const garcomToken = req.headers.authorization?.replace('Bearer ','') || req.query.garcomToken;
        const g = await GarcomDelivery.findOne({ token: garcomToken, ativo: true });
        if (!g) return res.status(401).json({ erro: 'Token invalido' });
        const pedidos = await PedidoDelivery.find({
            adminId: g.adminId,
            tipoLocal: 'mesa',
            status: { $nin: ['entregue','cancelado'] },
            pago: { $ne: true }
        }).sort({ createdAt: -1 });
        res.json({ sucesso: true, pedidos });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/garcons/:id/toggle', authDelivery, async (req, res) => {
    try {
        const g = await GarcomDelivery.findOne({ _id: req.params.id, adminId: req.adminId });
        if (!g) return res.status(404).json({ erro: 'Nao encontrado' });
        g.ativo = !g.ativo;
        await g.save();
        res.json({ sucesso: true, ativo: g.ativo });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/garcons/:id', authDelivery, async (req, res) => {
    try {
        await GarcomDelivery.deleteOne({ _id: req.params.id, adminId: req.adminId });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Login do garcom pelo app

router.put('/garcons/:id', authDelivery, async (req, res) => {
    try {
        const garcom = await GarcomDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { $set: req.body },
            { new: true }
        );
        res.json({ sucesso: true, garcom });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/garcons/:id/toggle', authDelivery, async (req, res) => {
    try {
        const g = await GarcomDelivery.findOne({ _id: req.params.id, adminId: req.adminId });
        g.ativo = !g.ativo;
        await g.save();
        res.json({ sucesso: true, ativo: g.ativo });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/garcons/:id/novo-token', authDelivery, async (req, res) => {
    try {
        const token = 'GRC-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const g = await GarcomDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { $set: { token } }, { new: true }
        );
        res.json({ sucesso: true, token: g.token });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/garcons/:id/historico', authDelivery, async (req, res) => {
    try {
        const garcom = await GarcomDelivery.findOne({ _id: req.params.id, adminId: req.adminId });
        if (!garcom) return res.status(404).json({ erro: 'Garçom não encontrado' });

        const { dias = 30 } = req.query;
        const desde = new Date();
        desde.setDate(desde.getDate() - parseInt(dias));

        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            garcom: garcom.nome,
            createdAt: { $gte: desde }
        }).sort({ createdAt: -1 });

        // Agrupar por dia
        const porDia = {};
        pedidos.forEach(p => {
            const dia = p.createdAt.toISOString().split('T')[0];
            if (!porDia[dia]) porDia[dia] = { dia, pedidos: 0, mesas: new Set(), total: 0 };
            porDia[dia].pedidos++;
            if (p.mesa) porDia[dia].mesas.add(p.mesa);
            porDia[dia].total += p.total || 0;
        });
        const historicoDias = Object.values(porDia).map(d => ({
            ...d, mesas: d.mesas.size
        })).sort((a,b) => b.dia.localeCompare(a.dia));

        const totalMesas = new Set(pedidos.filter(p=>p.mesa).map(p=>p.mesa)).size;
        const totalVendido = pedidos.reduce((s,p) => s+( p.total||0), 0);

        res.json({
            sucesso: true,
            garcom,
            resumo: { totalPedidos: pedidos.length, totalMesas, totalVendido },
            historicoDias,
            ultimosPedidos: pedidos.slice(0, 20)
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Autenticação pelo token do garçom (para tela delivery-garcom)
router.get('/salon/garcom-info', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
        if (!token) return res.status(401).json({ erro: 'Token obrigatório' });
        const garcom = await GarcomDelivery.findOne({ token, ativo: true });
        if (!garcom) {
            // fallback: token do admin
            const admin = await AdminDelivery.findOne({ token });
            if (admin) return res.json({ sucesso: true, tipo: 'admin', nome: 'Admin', adminId: admin._id });
            return res.status(401).json({ erro: 'Token inválido' });
        }
        const admin = await AdminDelivery.findById(garcom.adminId);
        res.json({ sucesso: true, tipo: 'garcom', garcom, nomeComercio: admin?.nomeComercio, adminToken: admin?.token });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ENTREGADORES: histórico por entregador ==========
router.get('/entregadores/:id/historico', authDelivery, async (req, res) => {
    try {
        const entregador = await Entregador.findOne({ _id: req.params.id, adminId: req.adminId });
        if (!entregador) return res.status(404).json({ erro: 'Entregador não encontrado' });

        const { dias = 30 } = req.query;
        const desde = new Date();
        desde.setDate(desde.getDate() - parseInt(dias));

        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            'entregador.nome': entregador.nome,
            createdAt: { $gte: desde }
        }).sort({ createdAt: -1 });

        const porDia = {};
        pedidos.forEach(p => {
            const dia = p.createdAt.toISOString().split('T')[0];
            if (!porDia[dia]) porDia[dia] = { dia, entregas: 0, total: 0 };
            porDia[dia].entregas++;
            porDia[dia].total += p.total || 0;
        });

        const totalVendido = pedidos.reduce((s,p) => s+(p.total||0), 0);
        res.json({
            sucesso: true, entregador,
            resumo: { totalEntregas: pedidos.length, totalVendido },
            historicoDias: Object.values(porDia).sort((a,b) => b.dia.localeCompare(a.dia)),
            ultimosPedidos: pedidos.slice(0, 20)
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== SALON / GARCOM PEDIDOS =====
router.get('/salon/mesas', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            tipoLocal: 'mesa',
            status: { $nin: ['entregue','cancelado'] }
        }).sort({ createdAt: -1 });
        const mesas = {};
        pedidos.forEach(p => {
            const m = p.numeroMesa || 'S/N';
            if (!mesas[m]) mesas[m] = { mesa: m, pedidos: [], total: 0 };
            mesas[m].pedidos.push(p);
            mesas[m].total += p.total || 0;
        });
        res.json(Object.values(mesas));
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/salon/pedido', authDelivery, async (req, res) => {
    try {
        const { clienteNome, itens, numeroMesa, nomeComanda, observacao, formaPagamento, subtotal, total, garcomId, garcomNome } = req.body;
        if (!itens || !itens.length) return res.status(400).json({ erro: 'Itens obrigatorios' });
        const pedido = new PedidoDelivery({
            adminId: req.adminId,
            clienteNome: clienteNome || 'Mesa ' + (numeroMesa||''),
            clienteTelefone: '0000000000',
            itens,
            tipoLocal: 'mesa',
            numeroMesa,
            nomeComanda,
            observacao,
            origemPedido: 'garcom',
            garcomId,
            garcomNome: garcomNome||"",
            formaPagamento: formaPagamento || 'na_entrega',
            subtotal: subtotal || 0,
            total: total || 0,
            taxaEntrega: 0,
            status: 'pendente',
            tipoEntrega: 'retirada'
        });
        await pedido.save();
        res.json({ sucesso: true, pedido });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/salon/cardapio', authDelivery, async (req, res) => {
    try {
        const categorias = await CategoriaDelivery.find({ adminId: req.adminId, ativa: true }).sort({ ordem: 1 });
        const itens = await ItemCardapioDelivery.find({ adminId: req.adminId, disponivel: true }).sort({ ordem: 1 });
        res.json({ categorias, itens });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/salon/mesa/:mesa/fechar', authDelivery, async (req, res) => {
    try {
        const { formaPagamento } = req.body;
        await PedidoDelivery.updateMany(
            { adminId: req.adminId, numeroMesa: req.params.mesa, status: { $nin: ['entregue','cancelado'] } },
            { status: 'entregue', pago: true, formaPagamento: formaPagamento || 'dinheiro', dataPagamento: new Date() }
        );
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/salon/pedidos-mesa/:mesa', authDelivery, async (req, res) => {
    try {
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            numeroMesa: req.params.mesa,
            status: { $nin: ['entregue','cancelado'] }
        }).sort({ createdAt: -1 });
        res.json(pedidos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});
// GET /salon/stats - estatísticas do dia por garçom
router.get('/salon/stats', authDelivery, async (req, res) => {
    try {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const pedidos = await PedidoDelivery.find({ adminId: req.adminId, createdAt: { $gte: hoje } });
        const statsMap = {};
        let totalDia = 0, comandasFechadas = 0;
        pedidos.forEach(p => {
            const gId = String(p.garcomId || p.origemPedido || 'sistema');
            const gNome = p.garcomNome || (p.origemPedido==='garcom'?'Garçom':(p.origemPedido==='caixa'?'Caixa':'Sistema'));
            if (!statsMap[gId]) statsMap[gId] = { id:gId, nome:gNome, pedidos:0, comandas:0, total:0 };
            statsMap[gId].pedidos++;
            if (p.status==='entregue' && p.pago) {
                statsMap[gId].total += (p.total||0);
                totalDia += (p.total||0);
                if (p.origemPedido==='garcom') { statsMap[gId].comandas++; comandasFechadas++; }
            }
        });
        const mesasAtivas = await PedidoDelivery.distinct('numeroMesa', {
            adminId: req.adminId, tipoLocal:'mesa', status:{ $nin:['entregue','cancelado'] }
        });
        res.json({ totalDia, comandasFechadas, mesasAtivas:(mesasAtivas||[]).filter(Boolean).length, porGarcom:Object.values(statsMap) });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// GET /salon/pix-key - retorna chave pix configurada
router.get('/salon/pix-key', authDelivery, async (req, res) => {
    try {
        const admin = await AdminDelivery.findById(req.adminId).select('pixKey chavePix nomeEstabelecimento nomeComercio').lean();
        const chave = (admin && (admin.pixKey || admin.chavePix)) || '';
        const nome = (admin && (admin.nomeEstabelecimento || admin.nomeComercio)) || 'Restaurante';
        res.json({ pixKey: chave, nome });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});



// Cardapio para o garcom (autenticado pelo token pessoal GRC-xxx)

// Pedido do garcom (autenticado pelo token pessoal GRC-xxx)


// Cardápio público por slug (usado pelo mesa.html)
router.get('/mesa/cardapio', async (req, res) => {
    try {
        const slug = req.query.r;
        if (!slug) return res.status(400).json({ erro: 'Slug obrigatorio' });
        const admin = await AdminDelivery.findOne({ slug });
        if (!admin) return res.status(404).json({ sucesso: false, erro: 'Restaurante não encontrado' });
        const itens = await ItemCardapio.find({ adminId: admin._id, ativo: true })
            .sort({ ordem: 1 })
            .populate('categoriaId', 'nome emoji');
        res.json({
            sucesso: true,
            adminId: admin._id.toString(),
            nomeEstabelecimento: admin.nomeEstabelecimento || admin.nomeComercio || 'Restaurante',
            itens
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// QR Code do restaurante - gerar slug se não tiver
router.get('/mesa/qr', authDelivery, async (req, res) => {
    try {
        let admin = await AdminDelivery.findById(req.adminId);
        if (!admin) return res.status(404).json({ erro: 'Admin nao encontrado' });
        if (!admin.slug) {
            const base = (admin.nomeComercio || admin.nomeEstabelecimento || 'rest')
                .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
            admin.slug = base + '-' + Math.random().toString(36).slice(2, 8);
            await admin.save();
        }
        const url = req.protocol + '://' + req.get('host') + '/mesa?r=' + admin.slug;
        res.json({ sucesso: true, slug: admin.slug, url });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// Pedidos novos de mesa para o garçom
router.get('/mesa/pedidos-novos', async (req, res) => {
    try {
        const garcomToken = req.headers.authorization?.replace('Bearer ','') || req.query.garcomToken;
        const g = await GarcomDelivery.findOne({ token: garcomToken, ativo: true });
        if (!g) return res.status(401).json({ erro: 'Token invalido' });
        const pedidos = await PedidoDelivery.find({
            adminId: g.adminId,
            tipo: 'mesa',
            origem: 'qrcode',
            status: 'novo',
            createdAt: { $gte: new Date(Date.now() - 4*60*60*1000) }
        }).sort({ createdAt: -1 }).limit(10);
        res.json({ sucesso: true, pedidos });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Confirmar pedido de mesa (garçom)
router.post('/mesa/confirmar/:id', async (req, res) => {
    try {
        const garcomToken = req.headers.authorization?.replace('Bearer ','') || req.query.garcomToken;
        const g = await GarcomDelivery.findOne({ token: garcomToken, ativo: true });
        if (!g) return res.status(401).json({ erro: 'Token invalido' });
        await PedidoDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: g.adminId },
            { status: 'preparo' }
        );
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ===== ABERTURA / FECHAMENTO DE CAIXA =====

// Ver status atual do caixa
router.get('/caixa/status', authDelivery, async (req, res) => {
    try {
        const caixa = await CaixaDelivery.findOne({ adminId: req.adminId, status: 'aberto' }).sort({ dataAbertura: -1 });
        res.json({ caixa: caixa || null, aberto: !!caixa });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Abrir caixa
router.post('/caixa/abrir', authDelivery, async (req, res) => {
    try {
        const jaAberto = await CaixaDelivery.findOne({ adminId: req.adminId, status: 'aberto' });
        if (jaAberto) return res.json({ sucesso: true, caixa: jaAberto, msg: 'Caixa já estava aberto' });
        const caixa = await CaixaDelivery.create({
            adminId: req.adminId,
            status: 'aberto',
            abertoPor: req.body.operador || 'admin',
            dataAbertura: new Date()
        });
        res.json({ sucesso: true, caixa });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Fechar caixa - gera relatório e zera pedidos do dia
router.post('/caixa/fechar', authDelivery, async (req, res) => {
    try {
        const caixa = await CaixaDelivery.findOne({ adminId: req.adminId, status: 'aberto' });
        if (!caixa) return res.status(400).json({ erro: 'Nenhum caixa aberto' });

        // Buscar todos pedidos desde abertura do caixa
        const pedidos = await PedidoDelivery.find({
            adminId: req.adminId,
            criadoEm: { $gte: caixa.dataAbertura }
        });

        // Calcular totais
        const entregues = pedidos.filter(p => p.status === 'entregue');
        const cancelados = pedidos.filter(p => p.status === 'cancelado');
        const totalFaturamento = entregues.reduce((s, p) => s + (p.total || 0), 0);

        // Produtos mais vendidos
        const contagem = {};
        pedidos.forEach(p => {
            (p.itens || []).forEach(it => {
                const nome = it.nome || 'Item';
                if (!contagem[nome]) contagem[nome] = { nome, quantidade: 0, total: 0 };
                contagem[nome].quantidade += it.quantidade || 1;
                contagem[nome].total += (it.preco || 0) * (it.quantidade || 1);
            });
        });
        const produtosMaisVendidos = Object.values(contagem)
            .sort((a, b) => b.quantidade - a.quantidade)
            .slice(0, 10);

        // Fechar o caixa com relatório
        caixa.status = 'fechado';
        caixa.fechadoPor = req.body.operador || 'admin';
        caixa.dataFechamento = new Date();
        caixa.totalPedidos = pedidos.length;
        caixa.totalFaturamento = totalFaturamento;
        caixa.totalEntregues = entregues.length;
        caixa.totalCancelados = cancelados.length;
        caixa.produtosMaisVendidos = produtosMaisVendidos;
        caixa.pedidosIds = pedidos.map(p => p._id);
        caixa.observacoes = req.body.observacoes || '';
        await caixa.save();

        res.json({ sucesso: true, caixa, relatorio: {
            totalPedidos: pedidos.length,
            totalFaturamento,
            totalEntregues: entregues.length,
            totalCancelados: cancelados.length,
            produtosMaisVendidos
        }});
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Histórico de caixas fechados (relatórios)
router.get('/caixa/historico', authDelivery, async (req, res) => {
    try {
        const limite = parseInt(req.query.limite) || 30;
        const caixas = await CaixaDelivery.find({ adminId: req.adminId, status: 'fechado' })
            .sort({ dataFechamento: -1 })
            .limit(limite)
            .select('-pedidosIds');
        res.json({ caixas });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});



// ===== MIGRAR IMAGENS ANTIGAS PARA BASE64 =====
router.post('/cardapio/migrar-imagens', authDelivery, async (req, res) => {
    try {
        const axios = require('axios');
        const itens = await ItemCardapio.find({ adminId: req.adminId, ativo: true });
        let migrados = 0, erros = 0, jaBase64 = 0;

        for (const item of itens) {
            if (!item.imagem) continue;
            // Já é base64 - pular
            if (item.imagem.startsWith('data:')) { jaBase64++; continue; }
            // É URL externa - baixar e converter
            try {
                const resp = await axios.get(item.imagem, { 
                    responseType: 'arraybuffer', 
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const base64 = Buffer.from(resp.data).toString('base64');
                const mime = resp.headers['content-type'] || 'image/png';
                item.imagem = `data:${mime};base64,${base64}`;
                await item.save();
                migrados++;
                console.log(`[IMG-MIGRAR] OK: ${item.nome}`);
            } catch(e) {
                // URL expirou ou erro - gerar emoji placeholder
                item.imagem = null;
                await item.save();
                erros++;
                console.log(`[IMG-MIGRAR] Erro ${item.nome}: ${e.message}`);
            }
        }
        res.json({ sucesso: true, migrados, erros, jaBase64, total: itens.length });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ===== CONFIRMAR TRANSCRIÇÃO DO CARDÁPIO IA =====
router.post('/cardapio/confirmar-transcricao', authDelivery, async (req, res) => {
    try {
        const { categorias, limparExistente } = req.body;
        if (!categorias || !categorias.length) return res.status(400).json({ erro: 'Nenhuma categoria recebida' });

        // Desativar itens antigos se solicitado
        if (limparExistente) {
            await ItemCardapio.updateMany({ adminId: req.adminId }, { ativo: false });
            await CategoriaCardapio.updateMany({ adminId: req.adminId }, { ativo: false });
        }

        let totalCats = 0, totalItens = 0;

        for (const cat of categorias) {
            if (!cat.nome || !cat.itens?.length) continue;

            // Criar ou reusar categoria
            let categoriaDoc = await CategoriaCardapio.findOne({ 
                adminId: req.adminId, 
                nome: { $regex: new RegExp(cat.nome.trim(), 'i') }
            });
            if (!categoriaDoc) {
                categoriaDoc = await CategoriaCardapio.create({
                    adminId: req.adminId,
                    nome: cat.nome.trim(),
                    emoji: cat.emoji || '🍽️',
                    ativo: true,
                    ordem: totalCats
                });
            } else {
                categoriaDoc.ativo = true;
                await categoriaDoc.save();
            }
            totalCats++;

            // Criar itens da categoria
            for (const item of cat.itens) {
                if (!item.nome?.trim()) continue;
                
                // Verificar se já existe item com mesmo nome
                let itemDoc = await ItemCardapio.findOne({
                    adminId: req.adminId,
                    nome: { $regex: new RegExp(item.nome.trim(), 'i') }
                });

                if (itemDoc) {
                    // Atualizar item existente
                    itemDoc.preco = item.preco || itemDoc.preco;
                    itemDoc.descricao = item.descricao || itemDoc.descricao;
                    itemDoc.ativo = true;
                    itemDoc.categoriaId = categoriaDoc._id;
                    await itemDoc.save();
                } else {
                    // Criar novo item
                    itemDoc = await ItemCardapio.create({
                        adminId: req.adminId,
                        categoriaId: categoriaDoc._id,
                        nome: item.nome.trim(),
                        descricao: item.descricao || '',
                        preco: item.preco || 0,
                        ativo: true,
                        ordem: totalItens,
                        imagem: null
                    });
                }

                // Gerar imagem em background (não bloqueia a resposta)
                if (!itemDoc.imagem) {
                    gerarImagemItem(item.nome, item.descricao).then(async (img) => {
                        if (img) {
                            itemDoc.imagem = img;
                            await itemDoc.save();
                        }
                    }).catch(() => {});
                }
                totalItens++;
            }
        }

        res.json({ sucesso: true, categorias: totalCats, itens: totalItens });
    } catch(e) { 
        console.error('[TRANSCRICAO]', e);
        res.status(500).json({ erro: e.message }); 
    }
});


// ===== ROTAS DE PLANO =====
// Atualizar plano (admin master)
router.put('/admin/:id/plano', async (req, res) => {
    try {
        // Apenas admin master pode alterar plano
        const masterToken = req.headers['x-master-token'] || req.headers['authorization']?.replace('Bearer ','');
        const MASTER = process.env.ADMIN_MASTER_TOKEN || 'rebeca-master-2024';
        if (masterToken !== MASTER) return res.status(403).json({ erro: 'Acesso negado. Token master necessario.' });
        const { plano, planoStatus, planoDataVencimento } = req.body;
        const valores = { confort: 197.90, plus: 298.90, premium: 459 };
        const update = {};
        if (plano) { update.plano = plano; update.planoValor = valores[plano] || 179; }
        if (planoStatus) update.planoStatus = planoStatus;
        if (planoDataVencimento) update.planoDataVencimento = new Date(planoDataVencimento);
        const admin = await AdminDelivery.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado' });
        res.json({ sucesso: true, admin: { plano: admin.plano, planoStatus: admin.planoStatus, planoDataVencimento: admin.planoDataVencimento, planoValor: admin.planoValor } });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Ver plano do admin logado
router.get('/meu-plano', authDelivery, async (req, res) => {
    try {
        const admin = await AdminDelivery.findById(req.adminId).select('plano planoStatus planoDataVencimento planoValor nomeComercio');
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado' });
        const hoje = new Date();
        const venc = new Date(admin.planoDataVencimento);
        const diasRestantes = Math.ceil((venc - hoje) / (1000*60*60*24));
        res.json({ sucesso: true, plano: admin.plano, status: admin.planoStatus, vencimento: admin.planoDataVencimento, diasRestantes, valor: admin.planoValor });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ===== SOLICITAR UPGRADE DE PLANO (cliente solicita, ativa imediatamente) =====
router.post('/solicitar-upgrade', authDelivery, async (req, res) => {
    try {
        const { planoSolicitado } = req.body;
        const planosValidos = ['plus', 'premium'];
        const valores = { confort: 179, plus: 298.90, premium: 459 };

        if (!planosValidos.includes(planoSolicitado)) {
            return res.status(400).json({ erro: 'Plano inválido' });
        }

        const admin = await AdminDelivery.findById(req.adminId);
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado' });

        // Verificar se é realmente um upgrade (não downgrade)
        const ordemPlanos = ['confort', 'plus', 'premium'];
        const idxAtual = ordemPlanos.indexOf(admin.plano || 'confort');
        const idxNovo = ordemPlanos.indexOf(planoSolicitado);
        if (idxNovo <= idxAtual) {
            return res.status(400).json({ erro: 'Só é permitido upgrade para plano superior' });
        }

        // Calcular próximo vencimento (30 dias a partir de hoje)
        const novoVencimento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Ativar o novo plano imediatamente
        await AdminDelivery.findByIdAndUpdate(req.adminId, {
            $set: {
                plano: planoSolicitado,
                planoStatus: 'ativo',
                planoValor: valores[planoSolicitado],
                planoDataVencimento: novoVencimento,
                planoUpgradeSolicitadoEm: new Date(),
                planoAnterior: admin.plano
            }
        });

        // Log do upgrade para o admin master acompanhar
        console.log(`[UPGRADE] Admin ${admin.nomeComercio} (${admin._id}): ${admin.plano} → ${planoSolicitado} | Valor: R$ ${valores[planoSolicitado]} | Venc: ${novoVencimento.toLocaleDateString('pt-BR')}`);

        res.json({
            sucesso: true,
            plano: planoSolicitado,
            valor: valores[planoSolicitado],
            vencimento: novoVencimento,
            mensagem: `Plano ${planoSolicitado} ativado com sucesso! Próxima cobrança: R$ ${valores[planoSolicitado]}`
        });

    } catch(e) {
        console.error('Erro upgrade:', e);
        res.status(500).json({ erro: e.message });
    }
});


// ═══════════════════════════════════════
// ROTAS DE COMBOS
// ═══════════════════════════════════════

// Listar combos
router.get('/combos', authDelivery, async (req, res) => {
    try {
        const combos = await ComboDelivery.find({ adminId: req.adminId, ativo: true }).sort({ createdAt: -1 });
        res.json(combos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar combo
router.post('/combos', authDelivery, async (req, res) => {
    try {
        const { nome, descricao, preco, itens, imagem, destaque } = req.body;
        if (!nome || !preco) return res.status(400).json({ erro: 'Nome e preço obrigatórios' });
        const precoOriginal = (itens||[]).reduce((s,i) => s + (Number(i.preco||0)*Number(i.quantidade||1)), 0);
        const descontoPct = precoOriginal > 0 ? Math.round((1 - Number(preco)/precoOriginal)*100) : 0;
        const combo = await ComboDelivery.create({
            adminId: req.adminId, nome, descricao: descricao||'',
            preco: Number(preco), precoOriginal, descontoPct,
            itens: itens||[], imagem: imagem||'', destaque: destaque||false
        });
        res.json(combo);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Editar combo
router.put('/combos/:id', authDelivery, async (req, res) => {
    try {
        const { nome, descricao, preco, itens, imagem } = req.body;
        const combo = await ComboDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { nome, descricao, preco: Number(preco), itens: itens||[], imagem: imagem||'' },
            { new: true }
        );
        if (!combo) return res.status(404).json({ erro: 'Combo não encontrado' });
        res.json(combo);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Excluir combo (soft delete)
router.delete('/combos/:id', authDelivery, async (req, res) => {
    try {
        await ComboDelivery.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            { ativo: false }
        );
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Combos públicos (para o cardápio digital)
router.get('/combos-publicos/:adminId', async (req, res) => {
    try {
        const admin = await AdminDelivery.findById(req.params.adminId);
        if (!admin) return res.status(404).json({ erro: 'Restaurante não encontrado' });
        const combos = await ComboDelivery.find({ adminId: admin._id, ativo: true }).sort({ createdAt: -1 });
        res.json(combos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// Config pública (pagamentos para o cardápio digital)
router.get('/config-publica/:adminId', async (req, res) => {
    try {
        const admin = await AdminDelivery.findById(req.params.adminId);
        if (!admin) return res.status(404).json({ erro: 'Não encontrado' });
        const config = await ConfigDelivery.findOne({ adminId: admin._id });
        if (!config) return res.json({ pagamentos: {} });
        res.json({
            pagamentos: {
                pix: config.aceitaPix,
                cartao: config.aceitaCartao,
                dinheiro: config.aceitaDinheiro,
                pixChave: config.chavePix || '',
                pixNome: config.nomePix || '',
                pixTipo: 'telefone'
            },
            tempoEntrega: config.tempoMedioEntrega,
            taxaEntrega: config.taxaEntregaFixa,
            pedidoMinimo: config.pedidoMinimo,
            logo: config.logo || null,
            nomeRestaurante: config.nomeRestaurante || '',
            horario: config.horarioFuncionamento || '',
            aberto: config.aberto !== false,
            cobrarTaxaGarcom: config.cobrarTaxaGarcom || false,
            taxaGarcomPerc: config.taxaGarcomPerc || 0,
            cobrarBanda: config.cobrarBanda || false,
            taxaBandaValor: config.taxaBandaValor || 0
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;

// ========== ESTOQUE: LEITURA DE NOTA FISCAL POR FOTO (GPT-4o Vision) ==========
router.post('/estoque/nota-fiscal', authDelivery, async (req, res) => {
    try {
        // Apenas plus e premium
        const _adm = await require('./delivery.routes.js'.includes ? require('../models/delivery.models').AdminDelivery.findById(req.adminId).lean() : null);
        const AdminDelivery = require('../models/delivery.models').AdminDelivery;
        const _admDoc = await AdminDelivery.findById(req.adminId).lean();
        if (!_admDoc || !['plus','premium'].includes(_admDoc.plano) || _admDoc.planoStatus !== 'ativo') {
            return res.status(403).json({ erro: 'plano_insuficiente', msg: 'Estoque inteligente disponível apenas nos planos Plus e Premium.' });
        }
        const { imagemBase64, mimeType } = req.body;
        if (!imagemBase64) return res.status(400).json({ erro: 'Imagem obrigatoria' });
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ erro: 'OPENAI_API_KEY nao configurada' });
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o',
            max_tokens: 1500,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: 'data:' + (mimeType || 'image/jpeg') + ';base64,' + imagemBase64, detail: 'high' }
                    },
                    {
                        type: 'text',
                        text: 'Esta e uma nota fiscal ou cupom fiscal brasileiro. Extraia TODOS os itens/produtos com quantidade e valor unitario. Responda APENAS com JSON valido neste formato exato, sem markdown, sem explicacao:\n{"dataEmissao":"DD/MM/YYYY","fornecedor":"nome da empresa emitente","itens":[{"nome":"nome do produto","quantidade":1,"unidade":"un","valorUnitario":0.00,"valorTotal":0.00}],"valorTotalNota":0.00}\nSe nao conseguir ler algum campo deixe string vazia ou 0. Extraia todos os itens visiveis.'
                    }
                ]
            }]
        }, { headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, timeout: 30000 });

        const txt = response.data.choices?.[0]?.message?.content || '{}';
        let dados;
        try { dados = JSON.parse(txt.replace(/```json|```/g, '').trim()); }
        catch(pe) { return res.status(422).json({ erro: 'Nao foi possivel ler a nota. Tente uma foto mais nitida.', raw: txt }); }
        res.json({ sucesso: true, dados });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ========== ESTOQUE: ENTRADA EM LOTE (salvar itens da nota) ==========
router.post('/estoque/entrada-lote', authDelivery, async (req, res) => {
    try {
        const AdminDelivery2 = require('../models/delivery.models').AdminDelivery;
        const _admDoc2 = await AdminDelivery2.findById(req.adminId).lean();
        if (!_admDoc2 || !['plus','premium'].includes(_admDoc2.plano) || _admDoc2.planoStatus !== 'ativo') {
            return res.status(403).json({ erro: 'plano_insuficiente', msg: 'Estoque inteligente disponível apenas nos planos Plus e Premium.' });
        }
        const { itens, fornecedor, dataEntrada } = req.body;
        if (!itens || !itens.length) return res.status(400).json({ erro: 'Itens obrigatorios' });
        const resultados = [];
        for (const it of itens) {
            if (!it.itemId) { resultados.push({ nome: it.nome, status: 'sem_vinculo' }); continue; }
            const atualizado = await ItemCardapio.findOneAndUpdate(
                { _id: it.itemId, adminId: req.adminId },
                {
                    $inc: { estoqueAtual: parseInt(it.quantidade) || 0 },
                    $set: {
                        fornecedor: fornecedor || it.fornecedor || '',
                        disponivel: true,
                        ...(it.precoCompra ? { precoCompra: parseFloat(it.precoCompra) } : {})
                    }
                },
                { new: true }
            );
            resultados.push({ nome: it.nome, status: atualizado ? 'ok' : 'nao_encontrado', estoqueAtual: atualizado?.estoqueAtual });
        }
        res.json({ sucesso: true, resultados });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== PAINEL DE MESAS DO CAIXA =====
router.get('/caixa/mesas-painel', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ','') || '';
        const admin = await AdminDelivery.findOne({ token });
        if (!admin) return res.status(401).json({ erro: 'Token invalido' });
        const qtdMesas = admin.qtdMesas || 10;
        const pedidosAtivos = await PedidoDelivery.find({
            adminId: admin._id,
            tipoLocal: 'mesa',
            status: { $nin: ['cancelado', 'entregue'] }
        }).select('numeroMesa clienteNome status total createdAt').lean();
        const mesas = [];
        for (let i = 1; i <= qtdMesas; i++) {
            const pedidosMesa = pedidosAtivos.filter(p => String(p.numeroMesa) === String(i));
            mesas.push({
                numero: i,
                ocupada: pedidosMesa.length > 0,
                pedidos: pedidosMesa,
                total: pedidosMesa.reduce((s, p) => s + (p.total || 0), 0)
            });
        }
        res.json({ sucesso: true, mesas, qtdMesas });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== LIBERAR MESA (caixa) =====
router.post('/caixa/mesa/:numero/liberar', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ','') || '';
        const admin = await AdminDelivery.findOne({ token });
        if (!admin) return res.status(401).json({ erro: 'Token invalido' });
        await PedidoDelivery.updateMany(
            { adminId: admin._id, numeroMesa: req.params.numero, status: { $nin: ['cancelado', 'entregue'] } },
            { $set: { status: 'entregue' } }
        );
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Salvar qtdMesas do admin
router.post('/caixa/config/mesas', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ','') || '';
        const admin = await AdminDelivery.findOne({ token });
        if (!admin) return res.status(401).json({ erro: 'Token invalido' });
        const { qtdMesas } = req.body;
        await AdminDelivery.updateOne({ _id: admin._id }, { $set: { qtdMesas: Number(qtdMesas) || 10 } });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});
