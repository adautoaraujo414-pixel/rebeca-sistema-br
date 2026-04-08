// ==================== REBECA DELIVERY SERVICE v6.5 ====================
// 100% ISOLADO - Cada admin delivery tem sua propria Rebeca
// Roteamento: webhook pega adminId da instancia -> tipoAdmin='delivery' -> cai aqui
// NUNCA interfere no Rebeca Corridas

const { CategoriaCardapio, ItemCardapio, PedidoDelivery, ConfigDelivery } = require('../models/delivery.models');
const CardapioDiaService = require('./cardapio-dia.service');
const IAService = require('./ia.service');
const EvolutionMultiService = require('./evolution-multi.service');
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

    async processarMensagem(telefone, conteudo, nome, contexto) {
        const { adminId, instanciaId } = contexto;

        // ===== ANTI-REPETIÇÃO =====
        if (!global._respostasDelivery) global._respostasDelivery = new Map();
        const _agora = Date.now();
        for (const [k, v] of global._respostasDelivery) { if (_agora - v > 120000) global._respostasDelivery.delete(k); }
        const conversa = this.obterConversa(telefone, adminId);
        conversa.clienteNome = nome;

        try {
            const msgTexto = typeof conteudo === 'string' ? conteudo : (conteudo?.text || conteudo?.caption || '');
            const msgLower = msgTexto.toLowerCase().trim();
            
            if (msgLower === 'cancelar') {
                conversa.etapa = 'inicio';
                conversa.carrinho = [];
                conversa.dados = {};
                return '❌ Pedido cancelado. Quando quiser eh so chamar! 😊';
            }

            // ===== REATIVAÇÃO: processar resposta antes do fluxo normal =====
            const _reativResp = await RebecaDeliveryReativacao.processarResposta(telefone, adminId, instanciaId, msgTexto);
            if (_reativResp === '__REATIVACAO__') return null; // Rebeca já respondeu diretamente

            // ===== INTERCEPTAR RESPOSTA DO CARDÁPIO DO DIA =====
            if (CardapioDiaService.isRespostaCardapio(adminId)) {
                await CardapioDiaService.salvarEEnviarCardapio(adminId, msgTexto, instanciaId);
                return null; // Rebeca já respondeu no serviço
            }
            const config = await ConfigDelivery.findOne({ adminId }).lean();
            const nomeRest = config?.nomeRestaurante || 'Nosso Restaurante';
            const cliente = await this.reconhecerCliente(telefone, nome, adminId);

            switch (conversa.etapa) {
                case 'inicio':
                    return await this._etapaInicio(conversa, msgLower, msgTexto, nome, cliente, config, nomeRest, adminId);
                case 'montando_pedido':
                    return await this._etapaMontandoPedido(conversa, msgLower, msgTexto, adminId, config);
                case 'confirmar_pedido':
                    return await this._etapaConfirmarPedido(conversa, msgLower, msgTexto, config, nomeRest, adminId);
                case 'pedir_endereco':
                    return await this._etapaPedirEndereco(conversa, msgTexto, config, nomeRest);
                case 'pedir_pagamento':
                    return await this._etapaPedirPagamento(conversa, msgLower, msgTexto, config);
                case 'finalizar':
                    return await this._etapaFinalizar(conversa, msgTexto, adminId, instanciaId);
                case 'avaliar':
                    return await this._etapaAvaliar(conversa, msgTexto, adminId);
                default:
                    conversa.etapa = 'inicio';
                    // Fallback IA para mensagens não reconhecidas
                    if (IAService.isAtivo()) {
                        const analise = await IAService.analisarMensagemDelivery(msgTexto, { adminId });
                        if (analise.usarIA && analise.respostaCurta) return analise.respostaCurta;
                    }
                    return 'Oi! 😊 Quer fazer um pedido? Me conta o que você precisa!';
            }
        } catch (error) {
            console.error('[REBECA-DELIVERY] Erro:', error);
            return 'Ops, deu um probleminha aqui. Tenta de novo! 😅';
        }
    }

    _antiRep(telefone, adminId, resposta) {
        if (!global._respostasDelivery) global._respostasDelivery = new Map();
        const chave = adminId + '_' + telefone + '_' + resposta.substring(0, 40);
        const ultima = global._respostasDelivery.get(chave);
        if (ultima && (Date.now() - ultima) < 30000) return true; // bloqueado
        global._respostasDelivery.set(chave, Date.now());
        return false;
    }

    async _etapaInicio(conversa, msgLower, msgTexto, nome, cliente, config, nomeRest, adminId) {
        // ========== IA: saudações e intenções humanizadas ==========
        if (IAService.isAtivo()) {
            const analise = await IAService.analisarMensagemDelivery(msgTexto, { adminId, nomeRest });
            if (analise.usarIA && analise.respostaCurta && analise.intencao !== 'pedir' && analise.intencao !== 'pergunta_horario') {
                return analise.respostaCurta;
            }
        }
        if (config && config.aberto === false) {
            return "😴 O *" + nomeRest + "* esta fechado no momento.\n🕐 Horario: " + (config.horarioFuncionamento || "") + "\nVolte mais tarde!";
        }
        const temPedido = this._detectarPedido(msgTexto);
        if (temPedido) {
            const itens = await this._parsearPedido(msgTexto, adminId);
            if (itens.length > 0) {
                conversa.carrinho = itens;
                const endereco = this._extrairEndereco(msgTexto);
                if (endereco) {
                    conversa.dados.endereco = endereco;
                    conversa.etapa = 'pedir_pagamento';
                    return this._montarResumoItens(conversa) + "\n📍 Entrega: *" + endereco + "*\n" + this._montarOpcoesPagamento(config);
                }
                conversa.etapa = 'confirmar_pedido';
                return this._montarResumoItens(conversa) + "\n✅ Ta certo isso? Responde *SIM* pra confirmar ou me diz o que quer mudar.";
            }
        }
        conversa.etapa = 'montando_pedido';
        if (cliente.recorrente) {
            let msg = 'Oi ' + nome + '! 😊 Bem-vindo de volta ao *' + nomeRest + '*!\n';
            if (cliente.ultimoPedido && cliente.ultimoPedido.itens) {
                msg += '\nQuer repetir o ultimo pedido? *' + cliente.ultimoPedido.itens.slice(0,2).map(i => i.nome).join(', ') + '...*\n\nOu me diz o que quer hoje! 🍔';
                conversa.dados.sugestaoRepetir = true;
                return msg;
            }
            return 'Nao encontrei pedido anterior. Me diz o que quer! 🍔';
        } else {
            let saudacao = '';
            const hora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
            if (hora < 12) saudacao = 'Bom dia';
            else if (hora < 18) saudacao = 'Boa tarde';
            else saudacao = 'Boa noite';
            
            return 'Oi! 😊 O que vai ser hoje?\n\nDigita o que quer ou manda *CARDAPIO* pra ver as opcoes! 🍔';
        }
    }

    async _etapaMontandoPedido(conversa, msgLower, msgTexto, adminId, config) {
        if (msgLower.includes('cardap') || msgLower.includes('menu')) {
            return await this._montarCardapioCompleto(adminId);
        }
        if (msgLower === 'sim' && conversa.dados.sugestaoRepetir) {
            const cliente = await this.reconhecerCliente(conversa.clienteTelefone, conversa.clienteNome, adminId);
            if (cliente.ultimoPedido && cliente.ultimoPedido.itens) {
                conversa.carrinho = cliente.ultimoPedido.itens;
                conversa.etapa = 'pedir_endereco';
                return '🔁 Perfeito! Repetindo o ultimo pedido:\n\n' + this._montarResumoItens(conversa) + '\n📍 Qual o *endereco de entrega*?\n\nOu manda *MESMO* se for o mesmo endereco de antes.';
            }
        }
        const resultadoBusca = await this._buscarNoCardapio(msgTexto, adminId);
        if (resultadoBusca.encontrou) {
            conversa.carrinho.push(...resultadoBusca.itens);
            let ultimo = resultadoBusca.itens[resultadoBusca.itens.length - 1];
            if (ultimo.opcionais && ultimo.opcionais.length > 0) {
                return '📝 Anotado: _' + msgTexto + '_ no ' + ultimo.nome + '\n\nQuer algum opcional? *' + ultimo.opcionais.join(', ') + '*\n\nOu me diz mais alguma coisa!';
            }
            return '📝 Anotado! Mais alguma coisa? 😊';
        } else {
            // IA tenta entender o que o cliente quis dizer
            if (IAService.isAtivo()) {
                const analise = await IAService.analisarMensagemDelivery(msgTexto, { adminId });
                if (analise.usarIA && analise.intencao === 'agradecimento' && analise.respostaCurta) return analise.respostaCurta;
                if (analise.usarIA && analise.intencao === 'outro' && analise.respostaCurta) {
                    return '🤔 Nao encontrei "' + msgTexto + '" no cardapio.\n\n' + analise.respostaCurta;
                }
            }
            return '🤔 Nao encontrei "' + msgTexto + '" no cardapio.\n\nManda *CARDAPIO* pra ver as opcoes ou me diz de outro jeito! 😊';
        }
    }

    async _etapaConfirmarPedido(conversa, msgLower, msgTexto, config, nomeRest, adminId) {
        if (msgLower === 'sim' || msgLower.includes('confirma') || msgLower.includes('certo')) {
            conversa.etapa = 'pedir_endereco';
            return '📍 Qual o *endereco de entrega*?\n\nRua, numero, bairro...';
        } else {
            return 'Nao entendi 😅 Responde *SIM* pra confirmar ou me diz o que quer mudar!';
        }
    }

    async _etapaPedirEndereco(conversa, msgTexto, config, nomeRest) {
        const msgL = msgTexto.toLowerCase().trim();
        // Aceitar SIM para endereço sugerido na reativação
        if ((msgL === 'sim' || msgL === 'mesmo') && conversa.dados.enderecoSugerido) {
            conversa.dados.endereco = conversa.dados.enderecoSugerido;
            delete conversa.dados.enderecoSugerido;
            conversa.etapa = 'pedir_pagamento';
            return '📍 *' + conversa.dados.endereco + '*\n\n' + this._montarOpcoesPagamento(config);
        }
        if (msgL === 'mesmo') {
            const cliente = await this.reconhecerCliente(conversa.clienteTelefone, conversa.clienteNome, conversa.adminId);
            if (cliente.enderecosUsados && cliente.enderecosUsados.length > 0) {
                conversa.dados.endereco = cliente.enderecosUsados[0];
                conversa.etapa = 'pedir_pagamento';
                return '📍 *' + conversa.dados.endereco + '*\n\n' + this._montarOpcoesPagamento(config);
            }
        }
        if (msgTexto.length < 10) {
            return '📍 Manda o endereco completo com rua e numero!';
        }
        conversa.dados.endereco = msgTexto;
        conversa.etapa = 'pedir_pagamento';
        return '📍 Entrega: *' + conversa.dados.endereco + '*\n\n' + this._montarOpcoesPagamento(config);
    }

    async _etapaPedirPagamento(conversa, msgLower, msgTexto, config) {
        if (msgLower.includes('dinheiro') || msgLower.includes('especie')) {
            conversa.dados.pagamento = 'dinheiro';
            conversa.etapa = 'finalizar';
            return '💵 Vai precisar de *troco*?\n\nResponde o valor da nota (ex: *50*) ou *NAO*.';
        } else if (msgLower.includes('cartao') || msgLower.includes('credito') || msgLower.includes('debito')) {
            conversa.dados.pagamento = 'cartao';
            conversa.etapa = 'finalizar';
            return '💳 Perfeito! Pagamento no *cartao*.\n\n' + this._montarResumoFinal(conversa) + '\n\n*Confirma o pedido?* (SIM/NAO)';
        } else if (msgLower.includes('pix')) {
            conversa.dados.pagamento = 'pix';
            conversa.etapa = 'finalizar';
            return '📱 Pagamento via *PIX*.\n\n' + this._montarResumoFinal(conversa) + '\n\n*Confirma o pedido?* (SIM/NAO)';
        } else if (conversa.dados.pagamento === 'dinheiro') {
            if (msgLower === 'nao' || msgLower.includes('sem troco')) {
                conversa.dados.troco = 'nao';
                return this._montarResumoFinal(conversa) + '\n\n*Confirma o pedido?* (SIM/NAO)';
            } else {
                const valor = msgTexto.match(/\d+/);
                if (valor) {
                    conversa.dados.troco = valor[0];
                    return this._montarResumoFinal(conversa) + '\n\n*Confirma o pedido?* (SIM/NAO)';
                }
                else { return '💵 Diz o valor da nota pra eu separar o troco (ex: *50*) ou responde *NAO*.'; }
            }
        } else {
            return '💵 Como vai ser o *pagamento*?\n\n• *DINHEIRO* 💵\n• *CARTAO* 💳\n• *PIX* 📱';
        }
    }

    async _etapaFinalizar(conversa, msgTexto, adminId, instanciaId) {
        const msgLower = msgTexto.toLowerCase();
        if (msgLower === 'sim' || msgLower.includes('confirma')) {
            try {
                const numeroPedido = Date.now().toString().slice(-6);
                const valorTotal = conversa.carrinho.reduce((total, item) => total + (item.preco * item.quantidade), 0);
                
                const pedido = await PedidoDelivery.create({
                    adminId, numero: numeroPedido,
                    clienteNome: conversa.clienteNome,
                    clienteTelefone: conversa.clienteTelefone,
                    itens: conversa.carrinho,
                    enderecoEntrega: conversa.dados.endereco,
                    formaPagamento: conversa.dados.pagamento,
                    valorTroco: conversa.dados.troco || null,
                    valorTotal, status: 'novo',
                    observacoes: conversa.dados.observacoes || ''
                });

                // ===== VERIFICAR FILA E TEMPO REAL =====
                const pedidosNaFila = await PedidoDelivery.countDocuments({
                    adminId, status: { $in: ['novo', 'aceito', 'em_preparo'] }
                });
                const tempoBase = 30;
                const tempoFila = pedidosNaFila > 2 ? tempoBase + (pedidosNaFila - 1) * 10 : tempoBase;
                const tempoMsg = tempoFila <= 30 ? '30-40 min' : tempoFila <= 45 ? '40-50 min' : '50-60 min';

                // ===== SALVAR ENDEREÇO NO HISTÓRICO DO CLIENTE =====
                const chaveCliente = adminId + '_' + conversa.clienteTelefone;
                const cachedCli = clientesCache.get(chaveCliente);
                if (cachedCli) {
                    if (!cachedCli.enderecosUsados) cachedCli.enderecosUsados = [];
                    if (!cachedCli.enderecosUsados.includes(conversa.dados.endereco)) {
                        cachedCli.enderecosUsados.unshift(conversa.dados.endereco);
                        if (cachedCli.enderecosUsados.length > 5) cachedCli.enderecosUsados.pop();
                    }
                    clientesCache.set(chaveCliente, cachedCli);
                }

                conversa.etapa = 'inicio';
                conversa.carrinho = [];
                conversa.dados = {};

                // Notificar admin sobre novo pedido
                try { this.notificarNovoPedido(pedido._id); } catch(e) {}

                const tratamento = conversa.clienteNome && conversa.clienteNome.length > 2
                    ? (conversa.clienteNome.split(' ')[0])
                    : 'você';

                return '✅ *Pedido #' + numeroPedido + ' confirmado!*\n\n⏰ Tempo estimado: *' + tempoMsg + '*\n📱 Vou te avisar quando sair pra entrega!\n\nObrigado pela preferência, ' + tratamento + '! 😊';
            } catch (error) {
                console.error('[DELIVERY] Erro ao criar pedido:', error);
                return '❌ Ops, tive um problema. Tenta de novo!';
            }
        } else {
            conversa.etapa = 'inicio';
            conversa.carrinho = [];
            conversa.dados = {};
            return '❌ Pedido cancelado. Quando quiser eh so chamar! 😊';
        }
    }

    async _etapaAvaliar(conversa, msgTexto, adminId) {
        const nota = msgTexto.match(/[1-5]/);
        if (nota) {
            try {
                await PedidoDelivery.findByIdAndUpdate(conversa.dados.pedidoId, { avaliacao: parseInt(nota[0]) });
                conversa.etapa = 'inicio';
                conversa.dados = {};
                return 'Obrigado pela avaliacao! 🌟\n\nSempre que quiser eh so chamar! 😊';
            } catch (e) {
                return 'Obrigado! 😊';
            }
        }
        return 'Avalie de *1* a *5*';
    }

    // Métodos auxiliares
    _detectarPedido(texto) {
        const palavrasChave = ['quero', 'pedir', 'pizza', 'lanche', 'hambur', 'refri', 'coca', 'guarana', 'agua'];
        return palavrasChave.some(p => texto.toLowerCase().includes(p));
    }

    _extrairEndereco(texto) {
        const patterns = [/rua\s+[\w\s,\d-]+\d/i, /av\w*\s+[\w\s,\d-]+\d/i, /[\w\s,]+ \d+/];
        for (let pattern of patterns) {
            const match = texto.match(pattern);
            if (match) return match[0];
        }
        return null;
    }

    async _parsearPedido(texto, adminId) {
        // Implementação simples - busca itens no cardápio
        return [];
    }

    async _buscarNoCardapio(texto, adminId) {
        try {
            const itens = await ItemCardapio.find({ adminId, ativo: true }).lean();
            const encontrados = itens.filter(item => 
                item.nome.toLowerCase().includes(texto.toLowerCase()) ||
                item.descricao?.toLowerCase().includes(texto.toLowerCase())
            );
            
            if (encontrados.length > 0) {
                return {
                    encontrou: true,
                    itens: encontrados.map(item => ({
                        _id: item._id,
                        nome: item.nome,
                        preco: item.preco,
                        quantidade: 1,
                        opcionais: item.opcionais || []
                    }))
                };
            }
            return { encontrou: false, itens: [] };
        } catch (error) {
            console.error('[DELIVERY] Erro busca cardápio:', error);
            return { encontrou: false, itens: [] };
        }
    }

    async _montarCardapioCompleto(adminId) {
        try {
            const categorias = await CategoriaCardapio.find({ adminId, ativo: true }).lean();
            let cardapio = '📋 *CARDAPIO*\n\n';
            
            for (let cat of categorias) {
                cardapio += `🔸 *${cat.nome}*\n`;
                const itens = await ItemCardapio.find({ adminId, categoria: cat._id, ativo: true }).lean();
                for (let item of itens) {
                    cardapio += `• ${item.nome} - R$ ${item.preco.toFixed(2)}\n`;
                    if (item.descricao) cardapio += `   _${item.descricao}_\n`;
                }
                cardapio += '\n';
            }
            return cardapio + 'Me diz o que quer! 😊';
        } catch (error) {
            return '📋 *CARDAPIO*\n\nOps, problema ao carregar. Me diz o que quer! 😊';
        }
    }

    _montarResumoItens(conversa) {
        let resumo = '🛒 *SEU PEDIDO:*\n\n';
        let total = 0;
        for (let item of conversa.carrinho) {
            const subtotal = item.preco * (item.quantidade || 1);
            resumo += `• ${item.nome} x${item.quantidade || 1} - R$ ${subtotal.toFixed(2)}\n`;
            total += subtotal;
        }
        resumo += `\n💰 *Total: R$ ${total.toFixed(2)}*`;
        return resumo;
    }

    _montarOpcoesPagamento(config) {
        return '💵 *Como vai ser o pagamento?*\n\n• *DINHEIRO* 💵\n• *CARTAO* 💳\n• *PIX* 📱';
    }

    _montarResumoFinal(conversa) {
        let resumo = this._montarResumoItens(conversa);
        resumo += `\n\n📍 *Entrega:* ${conversa.dados.endereco}`;
        resumo += `\n💳 *Pagamento:* ${conversa.dados.pagamento.toUpperCase()}`;
        if (conversa.dados.troco && conversa.dados.troco !== 'nao') {
            const total = conversa.carrinho.reduce((sum, item) => sum + (item.preco * (item.quantidade || 1)), 0);
            const troco = parseFloat(conversa.dados.troco) - total;
            resumo += `\n💵 *Troco para:* R$ ${conversa.dados.troco} (Troco: R$ ${troco.toFixed(2)})`;
        }
        return resumo;
    }

    // Notificações para outros painéis
    async notificarNovoPedido(pedidoId) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId).lean();
            if (!pedido) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            if (!inst) return;
            const Evo = require('./evolution-multi.service');
            const itensTexto = (pedido.itens || []).map(i => i.quantidade + 'x ' + i.nome).join(', ');
            const msg = '🔔 *NOVO PEDIDO #' + pedido.numero + '*\n'
                + '👤 Cliente: *' + (pedido.clienteNome || 'Cliente') + '*\n'
                + '📦 Itens: ' + itensTexto + '\n'
                + '📍 Entrega: ' + (pedido.enderecoEntrega || 'Retirada') + '\n'
                + '💰 Total: *R$ ' + (pedido.valorTotal || pedido.total || 0).toFixed(2) + '*\n'
                + (pedido.observacoes ? '📝 Obs: ' + pedido.observacoes + '\n' : '')
                + '\n👨‍🍳 Acesse o painel para aceitar!';
            const admin = await Admin.findById(pedido.adminId).lean();
            if (admin && admin.telefone) {
                await Evo.enviarMensagem(inst._id, admin.telefone, msg);
            }
            console.log('[DELIVERY-NOTIFY] Novo pedido notificado:', pedidoId);
        } catch(e) { console.log('[DELIVERY-NOTIFY] Erro novo pedido:', e.message); }
    }

    async notificarClientePreparo(pedidoId) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId).lean();
            if (!pedido || !pedido.clienteTelefone) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            if (!inst) return;
            const Evo = require('./evolution-multi.service');
            const msg = '👨‍🍳 *Pedido #' + pedido.numero + ' está sendo preparado!*\n\nEm breve fica pronto 🍽️';
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
        } catch(e) { console.log('[DELIVERY-NOTIFY] Erro notif preparo:', e.message); }
    }

    async notificarClientePronto(pedidoId) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId).lean();
            if (!pedido || !pedido.clienteTelefone) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            if (!inst) return;
            const Evo = require('./evolution-multi.service');
            const config = await ConfigDelivery.findOne({ adminId: pedido.adminId }).lean();
            const msg = config?.mensagemPedidoPronto
                || '✅ *Pedido #' + pedido.numero + ' está pronto!*\n\n🏍️ O entregador vai buscar agora. Em breve na sua porta!';
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
        } catch(e) { console.log('[DELIVERY-NOTIFY] Erro notif pronto:', e.message); }
    }

    async notificarPedidoPronto(pedidoId) {
        return this.notificarClientePronto(pedidoId);
    }

    async notificarSaiuEntrega(pedidoId, entregadorNome) {
        try {
            var pedido = await PedidoDelivery.findById(pedidoId);
            var inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            var Evo = require('./evolution-multi.service');
            const link = (process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com') + '/delivery-rastrear/' + pedido._id.toString().slice(-8);
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, '*Pedido #' + pedido.numero + ' saiu pra entrega!*\n\nEntregador: *' + (entregadorNome || 'A caminho') + '*\n\nAcompanhe em tempo real:\n' + link);
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro:', e.message); }
    }

    async notificarClienteEntregue(pedidoId) {
        try {
            var pedido = await PedidoDelivery.findById(pedidoId);
            var inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            var Evo = require('./evolution-multi.service');
            var nome = pedido.clienteNome ? pedido.clienteNome.split(' ')[0] : '';
            var saudacao = nome ? 'Oi ' + nome + '! ' : '';
            var msgs = [
                saudacao + 'Seu pedido #' + pedido.numero + ' foi entregue! 🎉\n\nBom apetite! 🍽️ Espero que goste muito! 😋\n\nQue nota você dá pra gente? De *1 a 5* ⭐',
                saudacao + 'Chegou fresquinho! 🔥 Pedido #' + pedido.numero + ' entregue com sucesso!\n\nBom apetite! 😊 Obrigado pela preferência! 💛\n\nDe *1 a 5*, qual nota você dá?',
                saudacao + 'Pedido #' + pedido.numero + ' entregue! ✅\n\nEspero que esteja tudo delicioso! Bom apetite! 🍽️💛\n\nNos conta: de *1 a 5*, como foi?'
            ];
            var msg = msgs[Math.floor(Math.random() * msgs.length)];
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
            var conv = this.obterConversa(pedido.clienteTelefone, pedido.adminId.toString());
            conv.etapa = 'avaliar';
            conv.dados = { pedidoId: pedido._id };
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro:', e.message); }
    }
}

module.exports = new RebecaDeliveryService();
