// ==================== REBECA DELIVERY SERVICE v6.5 ====================
// 100% ISOLADO - Cada admin delivery tem sua propria Rebeca
// Roteamento: webhook pega adminId da instancia -> tipoAdmin='delivery' -> cai aqui
// NUNCA interfere no Rebeca Corridas

const { CategoriaCardapio, ItemCardapio, PedidoDelivery, ConfigDelivery } = require('../models/delivery.models');
const { Admin, InstanciaWhatsapp } = require('../models');

const conversasDelivery = new Map();
const clientesCache = new Map();

class RebecaDeliveryService {

    obterConversa(telefone, adminId) {
        const chave = adminId + '_' + telefone;
        if (!conversasDelivery.has(chave)) {
            conversasDelivery.set(chave, {
                etapa: 'inicio', carrinho: [], dados: {},
                clienteNome: null, clienteTelefone: telefone,
                adminId, ultimaInteracao: Date.now()
            });
        }
        const conv = conversasDelivery.get(chave);
        if (Date.now() - conv.ultimaInteracao > 30 * 60 * 1000 && conv.etapa !== 'inicio') {
            conv.etapa = 'inicio'; conv.carrinho = []; conv.dados = {};
        }
        conv.ultimaInteracao = Date.now();
        return conv;
    }

    async reconhecerCliente(telefone, nome, adminId) {
        const chave = adminId + '_' + telefone;
        const cached = clientesCache.get(chave);
        if (cached && Date.now() - cached._ts < 600000) return cached;
        try {
            const pedidos = await PedidoDelivery.find({ adminId, clienteTelefone: telefone, status: 'entregue' }).sort({ createdAt: -1 }).limit(5).lean();
            const cl = {
                telefone, nome: pedidos[0]?.clienteNome || nome,
                totalPedidos: pedidos.length, ultimoPedido: pedidos[0] || null,
                enderecosUsados: [...new Set(pedidos.map(p => p.enderecoEntrega).filter(Boolean))],
                pagamentoPreferido: pedidos[0]?.formaPagamento || null,
                recorrente: pedidos.length >= 2, _ts: Date.now()
            };
            clientesCache.set(chave, cl);
            return cl;
        } catch(e) {
            return { telefone, nome, totalPedidos: 0, recorrente: false, enderecosUsados: [], _ts: Date.now() };
        }
    }
    }
    }

    async processarMensagem(telefone, conteudo, nome, contexto) {
        const { adminId, instanciaId } = contexto;
        const conversa = this.obterConversa(telefone, adminId);
        conversa.clienteNome = nome;
        conversa.instanciaId = instanciaId;
        conversa.telefone = telefone;

        const config = await ConfigDelivery.findOne({ adminId }).lean();
        const nomeRest = config?.nomeRestaurante || 'nosso delivery';
        const cliente = await this.reconhecerCliente(telefone, nome, adminId);

        const msgTexto = typeof conteudo === 'string' ? conteudo.trim() : '';
        const msgLower = msgTexto.toLowerCase();

        if (msgLower === 'cancelar' || msgLower === '0') {
            conversa.etapa = 'inicio'; conversa.carrinho = []; conversa.dados = {};
            return '❌ Pedido cancelado. Quando quiser eh so chamar! 😊';
        }
        if (msgLower === 'cardapio' || msgLower === 'cardapio' || msgLower === 'menu') {
            conversa.etapa = 'montando_pedido';
            return await this._montarCardapio(adminId, nomeRest);
        }

        let resposta = null;
        switch (conversa.etapa) {
            case 'inicio':
                resposta = await this._etapaInicio(conversa, msgLower, msgTexto, nome, cliente, config, nomeRest, adminId);
                break;
            case 'montando_pedido':
                resposta = await this._etapaMontandoPedido(conversa, msgLower, msgTexto, config, adminId, nomeRest);
                break;
            case 'confirmar_pedido':
                resposta = await this._etapaConfirmarPedido(conversa, msgLower, msgTexto, config, adminId, cliente);
                break;
            case 'pedir_endereco':
                resposta = await this._etapaPedirEndereco(conversa, msgTexto, cliente);
                break;
            case 'pedir_pagamento':
                resposta = await this._etapaPedirPagamento(conversa, msgLower, config);
                break;
            case 'pedir_troco':
                resposta = await this._etapaPedirTroco(conversa, msgTexto);
                break;
            case 'finalizar_pedido':
                resposta = await this._etapaFinalizar(conversa, telefone, nome, config, adminId, instanciaId);
                break;
            case 'aguardando_preparo':
                resposta = '⏳ Seu pedido esta sendo preparado! Te aviso quando sair pra entrega 😊';
                break;
            case 'avaliar':
                resposta = await this._etapaAvaliar(conversa, msgTexto, adminId);
                break;
            default:
                conversa.etapa = 'inicio';
                resposta = await this._etapaInicio(conversa, msgLower, msgTexto, nome, cliente, config, nomeRest, adminId);
        }
        return resposta;
    }

    async _etapaInicio(conversa, msgLower, msgTexto, nome, cliente, config, nomeRest, adminId) {
        if (config && config.aberto === false) {
            return '😴 O *' + nomeRest + '* esta fechado no momento.

🕐 Horario: ' + (config.horarioFuncionamento || '') + '

Volte mais tarde!';
        }
        const temPedido = this._detectarPedido(msgTexto);
        if (temPedido) {
            const itens = await this._parsearPedido(msgTexto, adminId);
            if (itens.length > 0) {
                conversa.carrinho = itens;
                const endereco = this._extrairEndereco(msgTexto);
                if (endereco) {
                    conversa.dados.endereco = endereco;
                    const pgto = this._extrairPagamento(msgTexto);
                    if (pgto) {
                        conversa.dados.formaPagamento = pgto.forma;
                        if (pgto.troco) conversa.dados.trocoPara = pgto.troco;
                        conversa.etapa = 'confirmar_pedido';
                        return this._montarResumoCompleto(conversa, config);
                    }
                    conversa.etapa = 'pedir_pagamento';
                    return this._montarResumoItens(conversa) + '

📍 Entrega: *' + endereco + '*

' + this._montarOpcoesPagamento(config);
                }
                conversa.etapa = 'confirmar_pedido';
                return this._montarResumoItens(conversa) + '

✅ Ta certo isso? Responde *SIM* pra confirmar ou me diz o que quer mudar.';
            }
        }
        conversa.etapa = 'montando_pedido';
        if (cliente.recorrente) {
            let msg = 'Oi ' + nome + '! 😊 Bem-vindo de volta ao *' + nomeRest + '*!

';
            if (cliente.ultimoPedido && cliente.ultimoPedido.itens) {
                const itensUlt = cliente.ultimoPedido.itens.map(function(i){ return i.nome; }).join(', ');
                if (itensUlt) msg += '🔄 Ultimo pedido: _' + itensUlt + '_
Quer repetir? Responde *REPETIR*

';
            }
            msg += 'Ou me diz o que quer pedir! 🍔
Digite *CARDAPIO* pra ver as opcoes.';
            return msg;
        }
        return 'Oi ' + nome + '! 😊 Bem-vindo ao *' + nomeRest + '*!

🍔 Me diz o que voce quer pedir ou digite *CARDAPIO* pra ver as opcoes!';
    }

    async _etapaMontandoPedido(conversa, msgLower, msgTexto, config, adminId, nomeRest) {
        if (msgLower === 'repetir') {
            const chave = adminId + '_' + conversa.clienteTelefone;
            const cl = clientesCache.get(chave);
            if (cl && cl.ultimoPedido && cl.ultimoPedido.itens && cl.ultimoPedido.itens.length) {
                conversa.carrinho = cl.ultimoPedido.itens.map(function(i){ return { itemId: i.itemId, nome: i.nome, quantidade: i.quantidade, precoUnitario: i.precoUnitario, observacao: i.observacao || '', subtotal: i.subtotal }; });
                conversa.etapa = 'confirmar_pedido';
                return this._montarResumoItens(conversa) + '

✅ Repetir esse pedido? *SIM* ou manda o que quer mudar.';
            }
            return 'Nao encontrei pedido anterior. Me diz o que quer! 🍔';
        }
        const itens = await this._parsearPedido(msgTexto, adminId);
        if (itens.length > 0) {
            conversa.carrinho.push.apply(conversa.carrinho, itens);
            conversa.etapa = 'confirmar_pedido';
            return this._montarResumoItens(conversa) + '

➕ Quer *mais alguma coisa*?
Ou responde *SIM* pra confirmar!';
        }
        if (msgLower.match(/(oi|ola|bom dia|boa tarde|boa noite|eai|fala)/)) {
            return 'Oi! 😊 O que vai ser hoje?

Digite *CARDAPIO* pra ver as opcoes ou me diz direto o que quer! 🍔';
        }
        const sugestao = await this._buscarItemParecido(msgTexto, adminId);
        if (sugestao) {
            return '🤔 Nao encontrei "' + msgTexto + '" no cardapio.

Voce quis dizer *' + sugestao.nome + '* (R$ ' + sugestao.preco.toFixed(2) + ')?
Responde *SIM* ou digite *CARDAPIO*.';
        }
        return await this._montarCardapio(adminId, nomeRest);
    }

    async _etapaConfirmarPedido(conversa, msgLower, msgTexto, config, adminId, cliente) {
        if (msgLower !== 'sim' && msgLower !== 's' && msgLower !== 'confirma' && msgLower !== 'confirmar' && msgLower !== 'isso') {
            const novos = await this._parsearPedido(msgTexto, adminId);
            if (novos.length > 0) {
                conversa.carrinho.push.apply(conversa.carrinho, novos);
                return this._montarResumoItens(conversa) + '

➕ Mais alguma coisa? Ou *SIM* pra confirmar!';
            }
            if (msgTexto.length < 100 && conversa.carrinho.length > 0) {
                var ultimo = conversa.carrinho[conversa.carrinho.length - 1];
                ultimo.observacao = (ultimo.observacao ? ultimo.observacao + ', ' : '') + msgTexto;
                return '📝 Anotado: _' + msgTexto + '_ no ' + ultimo.nome + '

Mais alguma coisa? Ou *SIM* pra confirmar!';
            }
            return 'Nao entendi 😅 Responde *SIM* pra confirmar ou me diz o que quer mudar!';
        }
            if (cliente.enderecosUsados && cliente.enderecosUsados.length > 0) {
                conversa.etapa = 'pedir_endereco';
                var msg = '📍 *Endereco de entrega:*

';
                cliente.enderecosUsados.slice(0, 3).forEach(function(end, i){ msg += '*' + (i+1) + '* - ' + end + '
'; });
                msg += '
Escolha o numero ou manda o endereco novo!';
                return msg;
            }
            conversa.etapa = 'pedir_endereco';
            return '📍 Qual o *endereco de entrega*?

_Ex: Rua das Flores 123, Centro_';
        }
        conversa.etapa = 'pedir_pagamento';
        return this._montarOpcoesPagamento(config);
    }

    async _etapaPedirEndereco(conversa, msgTexto, cliente) {
        var num = parseInt(msgTexto);
        if (num >= 1 && num <= 3 && cliente.enderecosUsados && cliente.enderecosUsados[num - 1]) {
            conversa.dados.endereco = cliente.enderecosUsados[num - 1];
        } else if (msgTexto.length >= 5) {
            conversa.dados.endereco = msgTexto;
        } else {
            return '📍 Manda o endereco completo com rua e numero!

_Ex: Rua das Flores 123, Centro_';
        }
        conversa.etapa = 'pedir_pagamento';
        var config = await ConfigDelivery.findOne({ adminId: conversa.adminId }).lean();
        return '📍 Entrega: *' + conversa.dados.endereco + '*

' + this._montarOpcoesPagamento(config);
    }

    async _etapaPedirPagamento(conversa, msgLower, config) {
        var forma = null;
        if (msgLower.match(/(pix|1)/)) forma = 'pix';
        else if (msgLower.match(/(dinheiro|2|din)/)) forma = 'dinheiro';
        else if (msgLower.match(/(cart|3|maquininha|maquina|debito|credito)/)) forma = 'cartao';
        conversa.dados.formaPagamento = forma;
        if (forma === 'dinheiro') {
            conversa.etapa = 'pedir_troco';
            return '💵 Vai precisar de *troco*?

Me diz o valor da nota (ex: *50*) ou responde *NAO* se tiver trocado.';
        }
        conversa.etapa = 'finalizar_pedido';
        return await this._etapaFinalizar(conversa, conversa.telefone, conversa.clienteNome, config, conversa.adminId, conversa.instanciaId);
    }

    async _etapaPedirTroco(conversa, msgTexto) {
        var msgLower = msgTexto.toLowerCase();
        if (msgLower === 'nao' || msgLower === 'n' || msgLower === 'trocado') {
            conversa.dados.trocoPara = null;
        } else {
            var valor = parseFloat(msgTexto.replace(/[^d.,]/g, '').replace(',', '.'));
            if (valor && valor > 0) { conversa.dados.trocoPara = valor; }
            else { return '💵 Diz o valor da nota pra eu separar o troco (ex: *50*) ou responde *NAO*.'; }
        }
        conversa.etapa = 'finalizar_pedido';
        var config = await ConfigDelivery.findOne({ adminId: conversa.adminId }).lean();
        return await this._etapaFinalizar(conversa, conversa.telefone, conversa.clienteNome, config, conversa.adminId, conversa.instanciaId);
    }

    async _etapaFinalizar(conversa, telefone, nome, config, adminId, instanciaId) {
        try {
            var subtotal = conversa.carrinho.reduce(function(s, i){ return s + (i.subtotal || 0); }, 0);
            var taxa = config?.taxaEntregaFixa || 0;
            var total = subtotal + taxa;
            var pedido = await PedidoDelivery.create({
                adminId: adminId,
                clienteNome: nome,
                clienteTelefone: telefone,
                instanciaId: instanciaId,
                itens: conversa.carrinho,
                enderecoEntrega: conversa.dados.endereco || '',
                formaPagamento: conversa.dados.formaPagamento || 'na_entrega',
                trocoPara: conversa.dados.trocoPara || null,
                taxaEntrega: taxa, subtotal: subtotal, total: total,
                status: 'novo',
                observacao: conversa.dados.observacao || null
            });
            console.log('[DELIVERY] Pedido #' + pedido.numero + ' criado - Tel:', telefone, '- Total: R$', total.toFixed(2));
            var itensTexto = pedido.itens.map(function(i, idx){ var t = (idx+1) + '. ' + i.quantidade + 'x ' + i.nome + ' - R$ ' + i.subtotal.toFixed(2); if(i.observacao) t += ' (' + i.observacao + ')'; return t; }).join('
');
            var formaPgto = { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartao (maquininha)', na_entrega: 'Na entrega' };
            var msg = '✅ *PEDIDO #' + pedido.numero + ' CONFIRMADO!*

';
            msg += itensTexto + '

';
            msg += '📍 *Entrega:* ' + (pedido.enderecoEntrega || 'Retirada') + '
';
            msg += '💳 ' + (formaPgto[pedido.formaPagamento] || 'Na entrega');
            if (pedido.trocoPara) msg += ' (troco p/ R$ ' + pedido.trocoPara.toFixed(2) + ')';
            msg += '

💰 *Total: R$ ' + total.toFixed(2) + '*';
            if (taxa > 0) msg += ' _(taxa: R$ ' + taxa.toFixed(2) + ')_';
            msg += '

🍳 Enviando pra cozinha! Te aviso quando comecar a preparar!';
            conversa.etapa = 'aguardando_preparo';
            conversa.dados = { pedidoId: pedido._id };
            conversa.carrinho = [];
            return msg;
        } catch (e) {
            console.error('[DELIVERY] Erro finalizar:', e.message);
            conversa.etapa = 'inicio';
            return '❌ Ops, tive um problema. Tenta de novo!';
        }
    }

    async _etapaAvaliar(conversa, msgTexto, adminId) {
        var nota = parseInt(msgTexto);
        if (nota >= 1 && nota <= 5) {
            try { if (conversa.dados.pedidoId) await PedidoDelivery.findByIdAndUpdate(conversa.dados.pedidoId, { avaliacao: nota }); } catch(e){}
            conversa.etapa = 'inicio'; conversa.dados = {};
            var resps = { 5: 'Que demais! Obrigado pela nota maxima!', 4: 'Muito obrigado! Bom saber que gostou!', 3: 'Obrigado! Vamos melhorar sempre!', 2: 'Puxa, vamos melhorar! Obrigado.', 1: 'Sentimos muito! Vamos trabalhar pra melhorar.' };
            return resps[nota] + '

Quando quiser pedir de novo, eh so chamar! 🍔';
        }
        return 'Avalie de *1* a *5*';
    }

    async _parsearPedido(texto, adminId) {
        var itensEncontrados = [];
        try {
            var todosItens = await ItemCardapio.find({ adminId: adminId, ativo: true, disponivel: true }).lean();
            if (todosItens.length === 0) return [];
            var textoLower = texto.toLowerCase();
            for (var it = 0; it < todosItens.length; it++) {
                var item = todosItens[it];
                var nomeItem = item.nome.toLowerCase();
                var nomeNorm = nomeItem.replace(/[-s]/g, '');
                var textoNorm = textoLower.replace(/[-s]/g, '');
                var encontrou = false;
                if (textoLower.includes(nomeItem)) encontrou = true;
                    var palavras = nomeItem.split(/s+/);
                    var matches = palavras.filter(function(p){ return p.length > 2 && textoLower.includes(p); });
                    if (matches.length >= Math.ceil(palavras.length * 0.6) && matches.length > 0) encontrou = true;
                }
                if (encontrou) {
                    var qtd = 1;
                    var regQ = new RegExp('(\d+)\s*(?:x\s*)?' + nomeItem.split(/s+/)[0], 'i');
                    var mQ = texto.match(regQ);
                    if (mQ) qtd = parseInt(mQ[1]) || 1;
                    var numExt = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };
                    for (var ext in numExt) {
                        if (textoLower.includes(ext + ' ' + nomeItem.split(/s+/)[0])) qtd = numExt[ext];
                    }
                    var obs = '';
                    var regSem = /sems+(w+)/gi;
                    var mS;
                    while ((mS = regSem.exec(textoLower)) !== null) { obs += (obs ? ', ' : '') + 'sem ' + mS[1]; }
                    itensEncontrados.push({ itemId: item._id, nome: item.nome, quantidade: qtd, precoUnitario: item.preco, observacao: obs, subtotal: item.preco * qtd });
                }
            }
        } catch(e) { console.log('[DELIVERY] Erro parsear:', e.message); }
        return itensEncontrados;
    }

    _detectarPedido(texto) {
        return /(manda|quero|me ve|um |uma |dois |duas |faz |prepara|x-|xtudo|hambur|pizza|lanche|coca|refri|suco|guarana|batata|pastel|esfiha|coxinha|hot dog)/i.test(texto.toLowerCase());
    }

    _extrairEndereco(texto) {
        var m = texto.match(/(?:na |rua |av |avenida |travessa )([ws,.-]+(?:numero|nº|,)s*d+[ws,.-]*)/i);
        if (m) return m[1].trim();
        var m2 = texto.match(/(?:rua|av|avenida|travessa|alameda)s+[ws]+d{1,5}/i);
        if (m2) return m2[0].trim();
        return null;
    }

    _extrairPagamento(texto) {
        var l = texto.toLowerCase();
        if (l.includes('pix')) return { forma: 'pix' };
        if (l.match(/(cart|maquininha|maquina|debito|credito)/)) return { forma: 'cartao' };
        if (l.match(/(dinheiro|din|trocado)/)) {
            var mT = l.match(/trocos*(?:pra|para|de)?s*(d+)/);
            return { forma: 'dinheiro', troco: mT ? parseFloat(mT[1]) : null };
        }
        return null;
    }

    async _buscarItemParecido(texto, adminId) {
        try {
            var itens = await ItemCardapio.find({ adminId: adminId, ativo: true, disponivel: true }).lean();
            var melhor = null, melhorScore = 0;
            var tN = texto.toLowerCase().replace(/[-s]/g, '');
            for (var i = 0; i < itens.length; i++) {
                var nN = itens[i].nome.toLowerCase().replace(/[-s]/g, '');
                var score = 0, menor = tN.length < nN.length ? tN : nN, maior = tN.length < nN.length ? nN : tN;
                for (var j = 0; j < menor.length; j++) { if (maior.includes(menor[j])) score++; }
                score = score / maior.length;
                if (score > melhorScore) { melhorScore = score; melhor = itens[i]; }
            }
            return melhorScore >= 0.4 ? melhor : null;
        } catch(e) { return null; }
    }

    async _montarCardapio(adminId, nomeRest) {
        var categorias = await CategoriaCardapio.find({ adminId: adminId, ativo: true }).sort({ ordem: 1 }).lean();
        var itens = await ItemCardapio.find({ adminId: adminId, ativo: true, disponivel: true }).sort({ ordem: 1 }).lean();
        var txt = '📋 *Cardapio - ' + nomeRest + '*
';
        for (var c = 0; c < categorias.length; c++) {
            var cat = categorias[c];
            var itensCat = itens.filter(function(i){ return i.categoriaId && i.categoriaId.toString() === cat._id.toString(); });
            if (itensCat.length === 0) continue;
            txt += '
' + (cat.emoji || '') + ' *' + cat.nome + '*
';
            for (var ii = 0; ii < itensCat.length; ii++) {
                txt += '  . ' + (itensCat[ii].destaque ? '* ' : '') + itensCat[ii].nome + ' - *R$ ' + itensCat[ii].preco.toFixed(2) + '*
';
                if (itensCat[ii].descricao) txt += '    _' + itensCat[ii].descricao + '_
';
            }
        }
        txt += '
*O que voce quer pedir?*';
        return txt;
    }

    _montarResumoItens(conversa) {
        var subtotal = conversa.carrinho.reduce(function(s,i){ return s + i.subtotal; }, 0);
        var txt = '*SEU PEDIDO:*

';
        conversa.carrinho.forEach(function(i, idx) {
            txt += (idx+1) + '. ' + i.quantidade + 'x *' + i.nome + '* - R$ ' + i.subtotal.toFixed(2);
            if (i.observacao) txt += '
   _' + i.observacao + '_';
            txt += '
';
        });
        txt += '
*Subtotal: R$ ' + subtotal.toFixed(2) + '*';
        return txt;
    }

    _montarResumoCompleto(conversa, config) {
        var subtotal = conversa.carrinho.reduce(function(s,i){ return s + i.subtotal; }, 0);
        var taxa = config?.taxaEntregaFixa || 0;
        var txt = this._montarResumoItens(conversa);
        txt += '

Entrega: *' + conversa.dados.endereco + '*';
        var formas = { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartao' };
        txt += '
' + (formas[conversa.dados.formaPagamento] || 'Na entrega');
        if (conversa.dados.trocoPara) txt += ' (troco p/ R$ ' + conversa.dados.trocoPara + ')';
        if (taxa > 0) txt += '
Taxa entrega: R$ ' + taxa.toFixed(2);
        txt += '

*TOTAL: R$ ' + (subtotal + taxa).toFixed(2) + '*';
        txt += '

*CONFIRMA?* Responde *SIM*!';
        return txt;
    }

    _montarOpcoesPagamento(config) {
        var txt = '*Forma de pagamento:*

';
        if (config && config.aceitaCartao) txt += '3 Cartao (maquininha)
';
        return txt;
    }

    async notificarClientePreparo(pedidoId) {
        try {
            var pedido = await PedidoDelivery.findById(pedidoId);
            var inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: 'conectado' });
            var Evo = require('./evolution-multi.service');
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, '*Pedido #' + pedido.numero + ' em preparo!*

Nossa cozinha ja esta preparando seu pedido!');
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro:', e.message); }
    }

    async notificarClientePronto(pedidoId) {
        try {
            var pedido = await PedidoDelivery.findById(pedidoId);
            var inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: 'conectado' });
            var Evo = require('./evolution-multi.service');
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, '*Pedido #' + pedido.numero + ' pronto!*

Ja esta saindo pra entrega!');
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro:', e.message); }
    }

    async notificarClienteSaiuEntrega(pedidoId, entregadorNome) {
        try {
            var pedido = await PedidoDelivery.findById(pedidoId);
            var inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: 'conectado' });
            var link = (process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com') + '/delivery-rastrear/' + pedido._id.toString().slice(-8);
            var Evo = require('./evolution-multi.service');
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, '*Pedido #' + pedido.numero + ' saiu pra entrega!*

Entregador: *' + (entregadorNome || 'A caminho') + '*

Acompanhe em tempo real:
' + link);
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro:', e.message); }
    }

    async notificarClienteEntregue(pedidoId) {
        try {
            var pedido = await PedidoDelivery.findById(pedidoId);
            var inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: 'conectado' });
            var Evo = require('./evolution-multi.service');
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, '*Pedido #' + pedido.numero + ' entregue!*

Obrigado pela preferencia!

Avalie de 1 a 5!');
            var conv = this.obterConversa(pedido.clienteTelefone, pedido.adminId.toString());
            conv.etapa = 'avaliar';
            conv.dados = { pedidoId: pedido._id };
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro:', e.message); }
    }
}

module.exports = new RebecaDeliveryService();
