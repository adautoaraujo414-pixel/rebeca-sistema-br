// ==================== REBECA DELIVERY SERVICE v7.0 ====================
// 100% ISOLADO - Apenas Rebeca Delivery. Zero interferência no Corridas.
// Personalidade: brasileira, calorosa, nunca repete, sugere alternativas

const { CategoriaCardapio, ItemCardapio, PedidoDelivery, ConfigDelivery } = require('../models/delivery.models');
const CardapioDiaService = require('./cardapio-dia.service');
const IAService = require('./ia.service');
const EvolutionMultiService = require('./evolution-multi.service');
const { Admin, InstanciaWhatsapp } = require('../models');

const conversasDelivery = new Map();
const clientesCache = new Map();

// ── Ganchos brasileiros por categoria ─────────────────────────────────────────
const GANCHOS = {
    anotei:    ['Anotei aqui! 📝', 'Beleza, já tô anotando! ✅', 'Perfeito, colocado no pedido! 🛒', 'Tá na lista! 😋', 'Show, anotei! 👍'],
    espera:    ['Já já tá na mão! 🔥', 'Vem vindo com tudo! 🏍️', 'Tá saindo do forno! 🍳', 'Rapidinho! ⚡'],
    saudacao:  ['Eita, que bom te ver! 😄', 'Oi oi! Chegou na hora certa! 😊', 'Salve! Tô aqui! 😎', 'Opa, e aí! 😁', 'Oii! Que saudade! 💛'],
    confirma:  ['Fechado! ✅', 'Maravilha! 🎉', 'Show de bola! 🌟', 'Perfeito demais! 😍', 'É isso aí! 🙌'],
    naotem:    ['Poxa, esse não temos hoje não 😅', 'Eita, esse saiu do cardápio por enquanto 😬', 'Esse aí não rola hoje não 😔'],
    sugestao:  ['Mas olha, tenho uma pedida boa aqui:', 'Mas tô com uma opção que você vai amar:', 'Que tal esse aqui?', 'Deixa eu te indicar algo parecido:'],
    pagamento: ['E aí, como vai ser o pagamento? 💳', 'Partiu pagar! Como vai preferir? 💰', 'Quase lá! Só falta o pagamento:', 'Forma de pagamento?'],
    endereco:  ['Me passa o endereço pra entrega! 📍', 'Cola o endereço aqui pra mim! 📍', 'Pra onde vai o pedido? Me manda o endereço! 🏠', 'Qual o endereço de entrega? 📍'],
};

function _g(categoria) {
    const lista = GANCHOS[categoria] || ['Ok!'];
    return lista[Math.floor(Math.random() * lista.length)];
}

class RebecaDeliveryService {

    obterConversa(telefone, adminId) {
        const chave = adminId + '_' + telefone;
        if (!conversasDelivery.has(chave)) {
            conversasDelivery.set(chave, {
                etapa: 'inicio', carrinho: [], dados: {},
                clienteNome: null, clienteTelefone: telefone,
                adminId, ultimaInteracao: Date.now(),
                _historico: [] // anti-repetição por conversa
            });
        }
        const conv = conversasDelivery.get(chave);
        if (Date.now() - conv.ultimaInteracao > 30 * 60 * 1000 && conv.etapa !== 'inicio') {
            conv.etapa = 'inicio'; conv.carrinho = []; conv.dados = {};
        }
        conv.ultimaInteracao = Date.now();
        return conv;
    }

    // Anti-repetição por conversa (não usa global — cada conversa tem seu histórico)
    _unico(conversa, opcoes) {
        if (!conversa._historico) conversa._historico = [];
        const disponiveis = opcoes.filter(op => {
            const h = op.substring(0, 60);
            return !conversa._historico.includes(h);
        });
        const pool = disponiveis.length > 0 ? disponiveis : opcoes;
        const escolha = pool[Math.floor(Math.random() * pool.length)];
        conversa._historico.push(escolha.substring(0, 60));
        if (conversa._historico.length > 15) conversa._historico.shift();
        return escolha;
    }

    // Mantém _escolher para compatibilidade com outros métodos
    _escolher(telefone, adminId, opcoes) {
        const chave = (adminId || 'x') + '_' + (telefone || 'x');
        if (!global._respostasDelivery) global._respostasDelivery = new Map();
        const historico = global._respostasDelivery.get(chave) || [];
        const disponiveis = opcoes.filter(op => !historico.includes(op.substring(0, 60)));
        const pool = disponiveis.length > 0 ? disponiveis : opcoes;
        const escolha = pool[Math.floor(Math.random() * pool.length)];
        historico.push(escolha.substring(0, 60));
        if (historico.length > 10) historico.shift();
        global._respostasDelivery.set(chave, historico);
        return escolha;
    }

    async reconhecerCliente(telefone, nome, adminId) {
        const chave = adminId + '_' + telefone;
        const cached = clientesCache.get(chave);
        if (cached && Date.now() - cached._ts < 600000) return cached;
        try {
            const pedidos = await PedidoDelivery.find({ adminId, clienteTelefone: telefone, status: 'entregue' })
                .sort({ createdAt: -1 }).limit(10).lean();
            let intervaloMedioMs = null;
            if (pedidos.length >= 2) {
                const ord = [...pedidos].reverse();
                let soma = 0;
                for (let i = 1; i < ord.length; i++) soma += new Date(ord[i].createdAt) - new Date(ord[i-1].createdAt);
                intervaloMedioMs = soma / (ord.length - 1);
            }
            const cl = {
                telefone, nome: pedidos[0]?.clienteNome || nome,
                totalPedidos: pedidos.length, ultimoPedido: pedidos[0] || null,
                enderecosUsados: [...new Set(pedidos.map(p => p.enderecoEntrega).filter(Boolean))],
                pagamentoPreferido: pedidos[0]?.formaPagamento || null,
                recorrente: pedidos.length >= 2,
                intervaloMedioMs,
                msSinceUltimo: pedidos[0] ? Date.now() - new Date(pedidos[0].createdAt).getTime() : null,
                _ts: Date.now()
            };
            clientesCache.set(chave, cl);
            return cl;
        } catch(e) {
            return { telefone, nome, totalPedidos: 0, recorrente: false, enderecosUsados: [], _ts: Date.now() };
        }
    }

    async processarMensagem(telefone, conteudo, nome, contexto) {
        const { adminId, instanciaId } = contexto;
        const conversa = this.obterConversa(telefone, adminId);
        conversa.clienteNome = nome;

        try {
            // Suporte a áudio: Evolution manda texto transcrito em conteudo.text ou conteudo
            const msgTexto = typeof conteudo === 'string'
                ? conteudo
                : (conteudo?.text || conteudo?.caption || conteudo?.transcription || '');
            const msgLower = msgTexto.toLowerCase().trim();

            if (!msgTexto) return null; // áudio sem transcrição, ignora

            if (msgLower === 'cancelar') {
                conversa.etapa = 'inicio'; conversa.carrinho = []; conversa.dados = {};
                return this._unico(conversa, [
                    'Tudo bem! Cancelei tudo por aqui 😊 Quando quiser é só chamar!',
                    'Ok, cancelado! Qualquer coisa tô aqui 😄',
                    'Beleza! Zerado por aqui. Se quiser pedir depois é só falar! 💛'
                ]);
            }

            if (CardapioDiaService.isRespostaCardapio(adminId)) {
                await CardapioDiaService.salvarEEnviarCardapio(adminId, msgTexto, instanciaId);
                return null;
            }

            const config = await ConfigDelivery.findOne({ adminId }).lean();
            const nomeRest = config?.nomeRestaurante || 'nosso restaurante';
            const cliente = await this.reconhecerCliente(telefone, nome, adminId);

            switch (conversa.etapa) {
                case 'inicio':          return await this._etapaInicio(conversa, msgLower, msgTexto, nome, cliente, config, nomeRest, adminId);
                case 'montando_pedido': return await this._etapaMontandoPedido(conversa, msgLower, msgTexto, adminId, config, nomeRest);
                case 'confirmar_pedido':return await this._etapaConfirmarPedido(conversa, msgLower, msgTexto, config, nomeRest, adminId);
                case 'pedir_endereco':  return await this._etapaPedirEndereco(conversa, msgTexto, config);
                case 'pedir_pagamento': return await this._etapaPedirPagamento(conversa, msgLower, msgTexto, config);
                case 'finalizar':       return await this._etapaFinalizar(conversa, msgLower, msgTexto, adminId, instanciaId);
                case 'avaliar':         return await this._etapaAvaliar(conversa, msgTexto, adminId);
                default:
                    conversa.etapa = 'inicio';
                    return 'Oi! 😊 Quer fazer um pedido? Me conta o que tá afim!';
            }
        } catch (error) {
            console.error('[REBECA-DELIVERY] Erro:', error);
            return 'Eita, deu um probleminha aqui 😅 Tenta de novo!';
        }
    }

    // ─── ETAPA INÍCIO ─────────────────────────────────────────────────────────
    async _etapaInicio(conversa, msgLower, msgTexto, nome, cliente, config, nomeRest, adminId) {
        if (config?.aberto === false) {
            return `😴 O *${nomeRest}* tá fechado agora.\n🕐 Horário: ${config.horarioFuncionamento || '—'}\n\nVolta mais tarde que a gente tá aqui! 😊`;
        }

        // Detecção rápida de pedido na primeira mensagem
        const temPedido = this._detectarPedido(msgTexto);
        if (temPedido) {
            const itens = await this._parsearPedido(msgTexto, adminId);
            if (itens.length > 0) {
                conversa.carrinho = itens;
                const endereco = this._extrairEndereco(msgTexto);
                if (endereco) {
                    conversa.dados.endereco = endereco;
                    conversa.etapa = 'pedir_pagamento';
                    return this._montarResumoItens(conversa) + `\n\n📍 Entrega em: *${endereco}*\n\n` + this._montarOpcoesPagamento(config, conversa);
                }
                conversa.etapa = 'confirmar_pedido';
                return this._montarResumoItens(conversa) + '\n\n✅ Tá certinho isso? Responde *SIM* pra confirmar ou me fala o que quer mudar!';
            }
        }

        conversa.etapa = 'montando_pedido';
        const primeiroNome = nome ? nome.split(' ')[0] : '';

        // Cliente recorrente
        if (cliente.recorrente && cliente.ultimoPedido?.itens?.length) {
            const itensNomes = cliente.ultimoPedido.itens.slice(0, 2).map(i => i.nome).join(' e ');
            const diasAtras = cliente.msSinceUltimo ? Math.round(cliente.msSinceUltimo / 86400000) : null;
            const quando = diasAtras === 0 ? 'hoje cedo' : diasAtras === 1 ? 'ontem' : diasAtras ? `há ${diasAtras} dias` : 'da última vez';
            conversa.dados.sugestaoRepetir = true;
            conversa.dados.enderecoAnterior = cliente.enderecosUsados[0] || null;
            return this._unico(conversa, [
                `${_g('saudacao')} ${primeiroNome ? primeiroNome + '!' : ''} 😍\n\n${quando} você pediu *${itensNomes}*... quer repetir ou vai querer outra coisa hoje? 🍔`,
                `Ei ${primeiroNome || ''}! Que bom que voltou! 🎉\n\nLembro que ${quando} você pediu *${itensNomes}*...\n\nRepete o mesmo ou bora experimentar outra coisa? 😋`,
                `Oii ${primeiroNome || ''}! 💛 Saudade!\n\n${quando} o pedido foi *${itensNomes}*... quer de novo ou vai querer algo diferente hoje?`,
            ]);
        }

        // Cliente novo
        const hora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
        const sd = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
        return this._unico(conversa, [
            `${sd}! 😊 Bem-vindo ao *${nomeRest}*!\n\nO que vai ser hoje? Me fala o que tá afim ou manda *CARDAPIO* pra ver as opções! 🍔`,
            `Oi${primeiroNome ? ' ' + primeiroNome : ''}! 😄 Chegou na hora certa no *${nomeRest}*!\n\nQuer ver o cardápio? Manda *CARDAPIO* ou me diz logo o que quer! 🔥`,
            `Salve${primeiroNome ? ' ' + primeiroNome : ''}! 😎 Seja bem-vindo ao *${nomeRest}*!\n\nO que vai querer hoje? Manda *CARDAPIO* ou me diz direto! 🍽️`,
            `${sd}! 🌟 Tô aqui pra te atender no *${nomeRest}*!\n\nMe fala o que tá com vontade ou manda *CARDAPIO*! 😋`,
        ]);
    }

    // ─── ETAPA MONTANDO PEDIDO ────────────────────────────────────────────────
    async _etapaMontandoPedido(conversa, msgLower, msgTexto, adminId, config, nomeRest) {
        if (msgLower.includes('cardap') || msgLower.includes('menu') || msgLower === 'c') {
            return await this._montarCardapioCompleto(adminId, conversa.clienteTelefone);
        }

        // Cliente quer repetir pedido anterior
        if (conversa.dados.sugestaoRepetir) {
            const querRepetir = ['sim','quero','pode','repete','mesmo','igual','isso','bora','manda'].some(p => msgLower.includes(p));
            if (querRepetir) {
                const cliente = await this.reconhecerCliente(conversa.clienteTelefone, conversa.clienteNome, adminId);
                if (cliente.ultimoPedido?.itens?.length) {
                    conversa.carrinho = cliente.ultimoPedido.itens.map(i => ({
                        _id: i.itemId || null, nome: i.nome,
                        preco: i.precoUnitario || 0, quantidade: i.quantidade || 1, opcionais: i.opcionais || []
                    }));
                    const resumo = this._montarResumoItens(conversa);
                    const endAnterior = cliente.enderecosUsados[0];
                    if (endAnterior) {
                        conversa.dados.enderecoSugerido = endAnterior;
                        conversa.etapa = 'pedir_endereco';
                        return `${_g('confirma')}\n\n🔁 *Repetindo seu último pedido:*\n\n${resumo}\n\n📍 Entrego em *${endAnterior}* de novo?\n\nResponde *SIM* pra confirmar ou me manda o novo endereço! 😊`;
                    }
                    conversa.etapa = 'pedir_endereco';
                    return `${_g('confirma')}\n\n🔁 *Repetindo:*\n\n${resumo}\n\n📍 ${_g('endereco')}`;
                }
            }
            delete conversa.dados.sugestaoRepetir;
        }

        // Finalizar pedido (cliente disse que é só isso)
        const quer_fechar = ['é isso','so isso','só isso','pode fechar','fecha','quero fechar','só','so','confirmar','pronto','finalizar'].some(p => msgLower.includes(p));
        if (quer_fechar && conversa.carrinho.length > 0) {
            conversa.etapa = 'pedir_endereco';
            return `${_g('confirma')} Carrinho:\n\n${this._montarResumoItens(conversa)}\n\n📍 ${_g('endereco')}`;
        }

        // Busca no cardápio
        const resultado = await this._buscarNoCardapio(msgTexto, adminId);
        if (resultado.encontrou) {
            conversa.carrinho.push(...resultado.itens);
            const ultimo = resultado.itens[resultado.itens.length - 1];
            const gancho = _g('anotei');
            if (conversa.carrinho.length >= 1) {
                return this._unico(conversa, [
                    `${gancho} Vai mais alguma coisa? 😊`,
                    `${gancho} Quer acrescentar mais algum item?`,
                    `${gancho} Mais alguma coisa ou pode fechar o pedido?`,
                    `${gancho} Tem mais alguma coisa ou tá bom assim?`,
                    `${gancho} Posso colocar mais alguma coisa? 🛒`,
                ]);
            }
            return `${gancho} Mais alguma coisa? 😊`;
        }

        // Não encontrou — busca o mais próximo e sugere
        const sugestao = await this._buscarMaisProximo(msgTexto, adminId);
        if (sugestao) {
            return this._unico(conversa, [
                `${_g('naotem')} 😅\n\n${_g('sugestao')}\n\n🍽️ *${sugestao.nome}* — R$ ${sugestao.preco.toFixed(2)}\n${sugestao.descricao ? '_' + sugestao.descricao + '_' : ''}\n\nQuer esse? 😋`,
                `Poxa, *${msgTexto}* não temos agora não 😬\n\nMas tô com um item parecido que pode te agradar:\n\n🔥 *${sugestao.nome}* — R$ ${sugestao.preco.toFixed(2)}\n\nQuer experimentar? 😍`,
                `Esse aí saiu do cardápio por enquanto 😔\n\nMas olha que opção boa que temos:\n\n✨ *${sugestao.nome}* — R$ ${sugestao.preco.toFixed(2)}\n\nQuer? Ou prefere ver o *CARDAPIO* completo?`,
            ]);
        }

        // Nada encontrado
        return this._unico(conversa, [
            `Hmm, não encontrei *"${msgTexto}"* no cardápio 🤔\n\nManda *CARDAPIO* pra ver tudo que temos ou me diz de outro jeito! 😊`,
            `Eita, esse item não tô achando aqui não 😅\n\nQuer ver o *CARDAPIO* completo? Ou me fala diferente que te ajudo! 🙏`,
            `Não localizei esse item por aqui 😬\n\nManda *CARDAPIO* ou me descreve diferente que eu acho! 😄`,
        ]);
    }

    // ─── ETAPA CONFIRMAR PEDIDO ───────────────────────────────────────────────
    async _etapaConfirmarPedido(conversa, msgLower, msgTexto, config, nomeRest, adminId) {
        const confirmou = ['sim','s','ok','pode','certo','isso','confirma','bora','tá','ta','yes'].some(p => msgLower === p || msgLower.includes(p));
        if (confirmou) {
            conversa.etapa = 'pedir_endereco';
            return `${_g('confirma')}\n\n📍 ${_g('endereco')}`;
        }
        return this._unico(conversa, [
            'Responde *SIM* pra confirmar ou me fala o que quer mudar! 😊',
            'É só mandar *SIM* que eu já anoto! Ou me diz o que tá errado 😄',
            '*SIM* confirma o pedido ou me fala o que ajustar! 🛒',
        ]);
    }

    // ─── ETAPA PEDIR ENDEREÇO ─────────────────────────────────────────────────
    async _etapaPedirEndereco(conversa, msgTexto, config) {
        const msgL = msgTexto.toLowerCase().trim();

        if ((msgL === 'sim' || msgL === 'mesmo' || msgL === 's') && conversa.dados.enderecoSugerido) {
            conversa.dados.endereco = conversa.dados.enderecoSugerido;
            delete conversa.dados.enderecoSugerido;
            conversa.etapa = 'pedir_pagamento';
            return `📍 *${conversa.dados.endereco}*\n\n${_g('pagamento')}\n\n${this._montarOpcoesPagamento(config, conversa)}`;
        }
        if (msgL === 'mesmo') {
            const cliente = await this.reconhecerCliente(conversa.clienteTelefone, conversa.clienteNome, conversa.adminId);
            if (cliente.enderecosUsados?.length > 0) {
                conversa.dados.endereco = cliente.enderecosUsados[0];
                conversa.etapa = 'pedir_pagamento';
                return `📍 *${conversa.dados.endereco}*\n\n${_g('pagamento')}\n\n${this._montarOpcoesPagamento(config, conversa)}`;
            }
        }
        if (msgTexto.length < 8) {
            return this._unico(conversa, [
                'Preciso do endereço completo! Rua, número e bairro tá ótimo 😊',
                'Me manda o endereço direitinho: rua, número e bairro! 📍',
                'Cola o endereço completo aí: rua, número, bairro! 🏠',
            ]);
        }
        conversa.dados.endereco = msgTexto;
        conversa.etapa = 'pedir_pagamento';
        return `📍 *${conversa.dados.endereco}*\n\n${_g('pagamento')}\n\n${this._montarOpcoesPagamento(config, conversa)}`;
    }

    // ─── ETAPA PEDIR PAGAMENTO ────────────────────────────────────────────────
    async _etapaPedirPagamento(conversa, msgLower, msgTexto, config) {
        if (msgLower.includes('dinheiro') || msgLower.includes('especie') || msgLower.includes('espécie') || msgLower === 'd') {
            conversa.dados.pagamento = 'dinheiro';
            conversa.etapa = 'finalizar';
            return this._unico(conversa, [
                '💵 Vai precisar de troco?\n\nMe fala o valor da nota (ex: *50*) ou manda *NAO* se não precisar!',
                '💵 Precisa de troco? Me diz o valor da nota ou manda *NAO*! 😊',
            ]);
        }
        if (msgLower.includes('cartao') || msgLower.includes('cartão') || msgLower.includes('credito') || msgLower.includes('debito') || msgLower === 'c') {
            conversa.dados.pagamento = 'cartao';
            conversa.etapa = 'finalizar';
            return `💳 Cartão combinado!\n\n${this._montarResumoFinal(conversa)}\n\n*Confirma o pedido?* (SIM/NAO)`;
        }
        if (msgLower.includes('pix') || msgLower === 'p') {
            conversa.dados.pagamento = 'pix';
            conversa.etapa = 'finalizar';
            const chavePix = config?.chavePix ? `\n\n🔑 *Chave PIX:* ${config.chavePix}` : '';
            return `📱 PIX combinado!${chavePix}\n\n${this._montarResumoFinal(conversa)}\n\n*Confirma o pedido?* (SIM/NAO)`;
        }
        if (conversa.dados.pagamento === 'dinheiro') {
            if (msgLower === 'nao' || msgLower === 'não' || msgLower.includes('sem troco') || msgLower === 'n') {
                conversa.dados.troco = 'nao';
                return `${this._montarResumoFinal(conversa)}\n\n*Confirma o pedido?* (SIM/NAO)`;
            }
            const valor = msgTexto.match(/\d+/);
            if (valor) {
                conversa.dados.troco = valor[0];
                return `${this._montarResumoFinal(conversa)}\n\n*Confirma o pedido?* (SIM/NAO)`;
            }
            return '💵 Me fala o valor da nota pra calcular o troco (ex: *50*) ou manda *NAO* se não precisar 😊';
        }
        return this._montarOpcoesPagamento(config, conversa);
    }

    // ─── ETAPA FINALIZAR ──────────────────────────────────────────────────────
    async _etapaFinalizar(conversa, msgLower, msgTexto, adminId, instanciaId) {
        const confirmou = ['sim','s','ok','pode','confirma','bora','yes','isso'].some(p => msgLower === p || msgLower.startsWith(p));
        if (confirmou) {
            try {
                const valorTotal = conversa.carrinho.reduce((t, i) => t + (i.preco * (i.quantidade || 1)), 0);
                const itensSalvar = conversa.carrinho.map(item => ({
                    itemId: item._id || null, nome: item.nome,
                    quantidade: item.quantidade || 1, precoUnitario: item.preco || 0,
                    subtotal: (item.preco || 0) * (item.quantidade || 1),
                    observacao: item.observacao || '', opcionais: item.opcionais || []
                }));

                // ── Criar pedido com status 'preparando' → já vai direto pra cozinha ──
                const pedido = await PedidoDelivery.create({
                    adminId,
                    clienteNome: conversa.clienteNome,
                    clienteTelefone: conversa.clienteTelefone,
                    itens: itensSalvar,
                    enderecoEntrega: conversa.dados.endereco,
                    formaPagamento: conversa.dados.pagamento || 'na_entrega',
                    trocoPara: conversa.dados.troco && conversa.dados.troco !== 'nao' ? parseFloat(conversa.dados.troco) : null,
                    subtotal: valorTotal, total: valorTotal, taxaEntrega: 0,
                    status: 'preparando', // ← direto pra cozinha
                    dataConfirmado: new Date(),
                    dataPreparando: new Date(),
                    origemPedido: 'whatsapp',
                    observacao: conversa.dados.observacoes || ''
                });

                // Calcular tempo estimado pela fila
                const naFila = await PedidoDelivery.countDocuments({ adminId, status: { $in: ['preparando','pronto'] } });
                const tempoMsg = naFila <= 1 ? '25-35 min' : naFila <= 3 ? '35-45 min' : '45-60 min';

                // Salvar endereço no cache do cliente
                const chaveCliente = adminId + '_' + conversa.clienteTelefone;
                const cachedCli = clientesCache.get(chaveCliente);
                if (cachedCli && conversa.dados.endereco) {
                    if (!cachedCli.enderecosUsados) cachedCli.enderecosUsados = [];
                    if (!cachedCli.enderecosUsados.includes(conversa.dados.endereco)) {
                        cachedCli.enderecosUsados.unshift(conversa.dados.endereco);
                        if (cachedCli.enderecosUsados.length > 5) cachedCli.enderecosUsados.pop();
                    }
                    clientesCache.set(chaveCliente, cachedCli);
                }

                conversa.etapa = 'inicio'; conversa.carrinho = []; conversa.dados = {};

                // Notificar admin/cozinha
                try { this.notificarNovoPedido(pedido._id); } catch(e) {}

                const primeiroNome = conversa.clienteNome?.split(' ')[0] || 'você';
                return this._unico(conversa, [
                    `✅ *Pedido #${pedido.numero} confirmado e já foi pra cozinha!* 🍳\n\n⏰ Tempo estimado: *${tempoMsg}*\n📱 Te aviso quando sair pra entrega!\n\n${_g('espera')} Obrigado, ${primeiroNome}! 💛`,
                    `🎉 *Pedido #${pedido.numero} recebido!* Já tá na cozinha preparando!\n\n⏰ Previsão: *${tempoMsg}*\n🏍️ Te mando mensagem quando o entregador sair!\n\nObrigado pela preferência, ${primeiroNome}! 😍`,
                    `✅ *#${pedido.numero} confirmado!* Mandei pra cozinha já! 🔥\n\n⏰ *${tempoMsg}* e tá na sua porta!\n📲 Avisarei quando o entregador pegar!\n\nValeu demais, ${primeiroNome}! 🙌`,
                ]);
            } catch (err) {
                console.error('[DELIVERY] Erro criar pedido:', err);
                return 'Quase lá! 😊 Me repete o pedido que eu anoto certinho agora!';
            }
        } else {
            conversa.etapa = 'inicio'; conversa.carrinho = []; conversa.dados = {};
            return this._unico(conversa, [
                'Tudo bem! Cancelei o pedido 😊 Qualquer coisa é só chamar!',
                'Ok, cancelado! Quando quiser pedir de novo é só falar 💛',
                'Beleza, zerado! Se mudar de ideia tô aqui 😄',
            ]);
        }
    }

    // ─── ETAPA AVALIAR ────────────────────────────────────────────────────────
    async _etapaAvaliar(conversa, msgTexto, adminId) {
        const nota = msgTexto.match(/[1-5]/);
        if (nota) {
            try {
                await PedidoDelivery.findByIdAndUpdate(conversa.dados.pedidoId, { avaliacao: parseInt(nota[0]) });
                conversa.etapa = 'inicio'; conversa.dados = {};
                const n = parseInt(nota[0]);
                if (n >= 4) return this._unico(conversa, ['Uhul! 🎉 Que alegria receber essa nota! Obrigado 💛', 'Arrasou! Nota ' + n + ' pra gente! 🌟 Valeu demais!', 'Que nota incrível! Obrigado por confiar na gente! 😍']);
                if (n === 3) return 'Obrigado pela avaliação! 😊 Vamos melhorar sempre pra você!';
                return 'Obrigado pelo feedback! 🙏 Sentimos muito e vamos melhorar!';
            } catch(e) { return 'Obrigado! 😊'; }
        }
        return 'Avalia de *1 a 5* pra gente! ⭐';
    }

    // ─── MÉTODOS AUXILIARES ───────────────────────────────────────────────────
    _detectarPedido(texto) {
        const t = texto.toLowerCase();
        const intencao = ['quero','pedir','me manda','me traz','queria','pode me mandar','vou querer',
            'tô com fome','to com fome','com fome','pedido','fazer pedido','me manda','quero pedir'];
        const alimentos = ['pizza','lanche','hambur','burger','refri','coca','guarana','agua','suco',
            'frango','carne','batata','porcao','porcão','combo','marmita','prato','sanduiche',
            'sanduíche','acai','açaí','sorvete','pastel','esfiha','tapioca','crepe','wrap',
            'salada','macarrao','macarrão','x-','xis','file','filé'];
        return intencao.some(p => t.includes(p)) || alimentos.some(p => t.includes(p));
    }

    _extrairEndereco(texto) {
        const patterns = [/rua\s+[\w\s,\d-]+\d/i, /av\w*\s+[\w\s,\d-]+\d/i];
        for (const p of patterns) { const m = texto.match(p); if (m) return m[0]; }
        return null;
    }

    async _parsearPedido(texto, adminId) {
        try {
            const itens = await ItemCardapio.find({ adminId, ativo: true }).lean();
            const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
            const textoNorm = norm(texto);
            const encontrados = [];
            const numeros = {'uma':1,'um':1,'dois':2,'duas':2,'tres':3,'três':3,'quatro':4,'cinco':5};
            for (const item of itens) {
                const nomeNorm = norm(item.nome);
                if (textoNorm.includes(nomeNorm) || nomeNorm.split(' ').every(p => p.length > 2 && textoNorm.includes(p))) {
                    let qtd = 1;
                    const matchNum = textoNorm.match(new RegExp('(\\d+)\\s*' + nomeNorm.split(' ')[0]));
                    if (matchNum) qtd = parseInt(matchNum[1]);
                    else for (const [pal, num] of Object.entries(numeros)) {
                        if (textoNorm.includes(pal + ' ' + nomeNorm.split(' ')[0])) { qtd = num; break; }
                    }
                    encontrados.push({ _id: item._id, nome: item.nome, preco: item.preco, quantidade: qtd, opcionais: item.opcoes || [] });
                }
            }
            return encontrados;
        } catch(e) { return []; }
    }

    async _buscarNoCardapio(texto, adminId) {
        try {
            const itens = await ItemCardapio.find({ adminId, ativo: true }).lean();
            const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
            const textoNorm = norm(texto);
            const palavras = textoNorm.split(/\s+/).filter(p => p.length > 2);
            const encontrados = itens.filter(item => {
                const nomeNorm = norm(item.nome);
                const descNorm = norm(item.descricao || '');
                if (textoNorm.includes(nomeNorm)) return true;
                const palavrasNome = nomeNorm.split(/\s+/).filter(p => p.length > 2);
                if (palavrasNome.length > 0 && palavrasNome.every(p => textoNorm.includes(p))) return true;
                if (descNorm && palavras.some(p => descNorm.includes(p))) return true;
                return false;
            });
            const matchQtd = textoNorm.match(/(\d+)\s/);
            const qtd = matchQtd ? parseInt(matchQtd[1]) : 1;
            if (encontrados.length > 0) {
                return { encontrou: true, itens: encontrados.map(i => ({ _id: i._id, nome: i.nome, preco: i.preco, quantidade: qtd, opcionais: i.opcoes || [] })) };
            }
            return { encontrou: false, itens: [] };
        } catch(e) { return { encontrou: false, itens: [] }; }
    }

    // Busca o item mais próximo por similaridade de palavras
    async _buscarMaisProximo(texto, adminId) {
        try {
            const itens = await ItemCardapio.find({ adminId, ativo: true, disponivel: true }).lean();
            if (!itens.length) return null;
            const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
            const textoNorm = norm(texto);
            const palavras = textoNorm.split(/\s+/).filter(p => p.length > 2);
            let melhor = null, maxScore = 0;
            for (const item of itens) {
                const nomeNorm = norm(item.nome);
                const descNorm = norm(item.descricao || '');
                let score = 0;
                for (const p of palavras) {
                    if (nomeNorm.includes(p)) score += 3;
                    if (descNorm.includes(p)) score += 1;
                }
                // Similaridade por categoria (bebida → bebida, lanche → lanche)
                const categBebidas = ['refri','suco','agua','bebida','coca','guarana','cerveja','caldo'];
                const categLanches = ['lanche','hambur','burger','sanduiche','x-','xis'];
                for (const c of categBebidas) if (textoNorm.includes(c) && (nomeNorm.includes('refri') || nomeNorm.includes('suco') || nomeNorm.includes('bebida'))) score += 2;
                for (const c of categLanches) if (textoNorm.includes(c) && (nomeNorm.includes('hambur') || nomeNorm.includes('lanche') || nomeNorm.includes('burger'))) score += 2;
                if (score > maxScore) { maxScore = score; melhor = item; }
            }
            // Retorna qualquer item popular se não houver match
            return melhor || itens[0];
        } catch(e) { return null; }
    }

    async _montarCardapioCompleto(adminId, telefone) {
        try {
            const [categorias, config] = await Promise.all([
                CategoriaCardapio.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean(),
                ConfigDelivery.findOne({ adminId }).lean()
            ]);
            const nomeRest = config?.nomeRestaurante || 'Cardápio';
            const BASE_URL = process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com';
            const linkCardapio = `${BASE_URL}/delivery-cardapio/${adminId}${telefone ? '?tel=' + telefone : ''}`;
            let cardapio = `📋 *${nomeRest.toUpperCase()}*\n\n`;
            for (const cat of categorias) {
                const itens = await ItemCardapio.find({ adminId, categoriaId: cat._id, ativo: true, disponivel: true }).lean();
                if (!itens.length) continue;
                cardapio += `${cat.emoji || '🔸'} *${cat.nome}*\n`;
                for (const item of itens) cardapio += `• ${item.nome} — R$ ${Number(item.preco).toFixed(2)}\n`;
                cardapio += '\n';
            }
            if (config?.taxaEntregaFixa) cardapio += `🛵 *Taxa:* R$ ${Number(config.taxaEntregaFixa).toFixed(2)}\n`;
            if (config?.pedidoMinimo)    cardapio += `🛒 *Mínimo:* R$ ${Number(config.pedidoMinimo).toFixed(2)}\n`;
            if (config?.horarioFuncionamento) cardapio += `🕐 *Horário:* ${config.horarioFuncionamento}\n`;
            cardapio += `\n🔗 *Cardápio com fotos:*\n${linkCardapio}\n\n👆 Acesse, escolha e confirme pelo link! 😊`;
            return cardapio;
        } catch(e) {
            return '📋 Problema ao carregar o cardápio 😅 Me diz o que quer direto!';
        }
    }

    _montarResumoItens(conversa) {
        let resumo = '🛒 *SEU PEDIDO:*\n\n';
        let total = 0;
        for (const item of conversa.carrinho) {
            const sub = item.preco * (item.quantidade || 1);
            resumo += `• ${item.nome} x${item.quantidade || 1} — R$ ${sub.toFixed(2)}\n`;
            total += sub;
        }
        resumo += `\n💰 *Total: R$ ${total.toFixed(2)}*`;
        return resumo;
    }

    _montarOpcoesPagamento(config, conversa) {
        const formas = [];
        if (config?.aceitaDinheiro !== false) formas.push('💵 *DINHEIRO*');
        if (config?.aceitaCartao)             formas.push('💳 *CARTÃO*');
        if (config?.aceitaPix !== false)      formas.push('📱 *PIX*');
        if (!formas.length) formas.push('💵 *DINHEIRO*', '📱 *PIX*');
        return formas.map(f => '• ' + f).join('\n');
    }

    _montarResumoFinal(conversa) {
        let resumo = this._montarResumoItens(conversa);
        resumo += `\n\n📍 *Entrega:* ${conversa.dados.endereco || '—'}`;
        resumo += `\n💳 *Pagamento:* ${(conversa.dados.pagamento || 'na entrega').toUpperCase()}`;
        if (conversa.dados.troco && conversa.dados.troco !== 'nao') {
            const total = conversa.carrinho.reduce((s, i) => s + (i.preco * (i.quantidade || 1)), 0);
            const troco = parseFloat(conversa.dados.troco) - total;
            resumo += `\n💵 *Troco para:* R$ ${conversa.dados.troco} (troco: R$ ${troco.toFixed(2)})`;
        }
        return resumo;
    }

    // ─── NOTIFICAÇÕES ─────────────────────────────────────────────────────────
    async notificarNovoPedido(pedidoId) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId).lean();
            if (!pedido) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            if (!inst) return;
            const Evo = require('./evolution-multi.service');
            const itensTexto = (pedido.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(', ');
            const msg = `🔔 *NOVO PEDIDO #${pedido.numero}*\n`
                + `👤 *${pedido.clienteNome || 'Cliente'}*\n`
                + `📦 ${itensTexto}\n`
                + `📍 ${pedido.enderecoEntrega || 'Retirada'}\n`
                + `💰 *R$ ${(pedido.total || 0).toFixed(2)}*\n`
                + `💳 ${pedido.formaPagamento?.toUpperCase() || '—'}\n`
                + `\n👨‍🍳 Pedido já na fila da cozinha!`;
            const { AdminDelivery } = require('../models/delivery.models');
            let adminDoc = await AdminDelivery.findById(pedido.adminId).lean();
            if (!adminDoc) adminDoc = await Admin.findById(pedido.adminId).lean();
            if (adminDoc?.telefone) await Evo.enviarMensagem(inst._id, adminDoc.telefone, msg);
        } catch(e) { console.log('[DELIVERY-NOTIFY] Erro:', e.message); }
    }

    async notificarClientePreparo(pedidoId) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId).lean();
            if (!pedido?.clienteTelefone) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            if (!inst) return;
            const msg = `👨‍🍳 *Pedido #${pedido.numero} tá na cozinha!*\n\nJá tô preparando com carinho 🍽️ Em breve fica pronto!`;
            await EvolutionMultiService.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
        } catch(e) { console.log('[DELIVERY-NOTIFY] Erro preparo:', e.message); }
    }

    async notificarClientePronto(pedidoId) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId).lean();
            if (!pedido?.clienteTelefone) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            if (!inst) return;
            const config = await ConfigDelivery.findOne({ adminId: pedido.adminId }).lean();
            const msg = config?.mensagemPedidoPronto || `✅ *Pedido #${pedido.numero} ficou pronto!*\n\n🏍️ O entregador vai buscar agora. Em breve na sua porta!`;
            await EvolutionMultiService.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
        } catch(e) { console.log('[DELIVERY-NOTIFY] Erro pronto:', e.message); }
    }

    async notificarPedidoPronto(pedidoId) { return this.notificarClientePronto(pedidoId); }

    async notificarSaiuEntrega(pedidoId, entregadorNome) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId);
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            const link = `${process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com'}/delivery-rastrear/${pedido._id.toString().slice(-8)}`;
            const msgs = [
                `🏍️ *Pedido #${pedido.numero} saiu pra entrega!*\n\nEntregador: *${entregadorNome || 'A caminho'}*\n\nAcompanhe em tempo real:\n${link}`,
                `🚀 *Saiu!* Pedido #${pedido.numero} tá a caminho!\n\nEntregador: *${entregadorNome || 'A caminho'}* 🏍️\n\n📍 Rastreie aqui:\n${link}`,
            ];
            const msg = msgs[Math.floor(Math.random() * msgs.length)];
            await EvolutionMultiService.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro saiu:', e.message); }
    }

    async notificarClienteEntregue(pedidoId) {
        try {
            const pedido = await PedidoDelivery.findById(pedidoId);
            const inst = await InstanciaWhatsapp.findOne({ adminId: pedido.adminId, status: { $in: ['conectado','open','connected'] } });
            const nome = pedido.clienteNome?.split(' ')[0] || '';
            const sd = nome ? `Oi ${nome}! ` : '';
            const msgs = [
                `${sd}Chegou! 🎉 Pedido #${pedido.numero} entregue!\n\nBom apetite! 🍽️😋\n\nQue nota você dá pra gente? De *1 a 5* ⭐`,
                `${sd}Fresquinho e na mão! 🔥 Pedido #${pedido.numero} entregue!\n\nEspero que goste muito! 😍\n\nDe *1 a 5*, qual nota a gente merece?`,
                `${sd}Entregou! ✅ Pedido #${pedido.numero} chegou!\n\nBom apetite! 💛\n\nNos conta: de *1 a 5*, como foi?`,
            ];
            const msg = msgs[Math.floor(Math.random() * msgs.length)];
            await EvolutionMultiService.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
            const conv = this.obterConversa(pedido.clienteTelefone, pedido.adminId.toString());
            conv.etapa = 'avaliar';
            conv.dados = { pedidoId: pedido._id };
        } catch(e) { console.log('[DELIVERY-NOTIF] Erro entregue:', e.message); }
    }
}

module.exports = new RebecaDeliveryService();
