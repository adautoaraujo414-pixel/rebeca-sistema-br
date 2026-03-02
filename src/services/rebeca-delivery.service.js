// ========== REBECA DELIVERY - IA ISOLADA ==========
// Usa mesma inteligência da Rebeca Corridas, mas como secretária de restaurante
// NÃO interfere em nada do sistema de corridas

const { CategoriaCardapio, ItemCardapio, PedidoDelivery, ConfigDelivery } = require('../models/delivery.models');
const AprendizadoService = require('./rebeca-aprendizado.service');
const OpenAIService = require('./openai-rebeca.service');

class RebecaDeliveryService {
    constructor() {
        this.conversas = {}; // {telefone: {etapa, dados, adminId, ...}}
    }

    obterConversa(telefone, adminId) {
        const chave = adminId + ':' + telefone;
        if (!this.conversas[chave]) {
            this.conversas[chave] = {
                telefone,
                adminId,
                etapa: 'inicio',
                dados: {},
                carrinho: [],
                ultimaMensagem: Date.now()
            };
        }
        this.conversas[chave].ultimaMensagem = Date.now();
        return this.conversas[chave];
    }

    async processarMensagem(telefone, mensagem, nome, contexto = {}) {
        const adminId = contexto.adminId;
        const instanciaId = contexto.instanciaId;
        if (!adminId) return 'Erro interno - admin não identificado';

        const conversa = this.obterConversa(telefone, adminId);
        conversa.clienteNome = nome || conversa.clienteNome || 'Cliente';
        if (instanciaId) conversa.instanciaId = instanciaId;

        const msgLower = mensagem.toLowerCase().trim();
        const sentimento = AprendizadoService.detectarSentimento(mensagem);

        // Registrar interação
        try {
            await AprendizadoService.registrar({
                adminId, telefone, mensagem, intencao: conversa.etapa,
                sentimento, canal: 'delivery'
            });
        } catch(e) {}

        // Carregar config do restaurante
        const config = await ConfigDelivery.findOne({ adminId }).lean();
        const nomeRestaurante = config?.nomeRestaurante || 'nosso delivery';

        // Verificar se restaurante está aberto
        if (!config?.aberto && conversa.etapa === 'inicio') {
            return `😔 Desculpe, o *${nomeRestaurante}* está fechado no momento.\n\nHorário de funcionamento: ${config?.horarioFuncionamento || 'consulte nosso WhatsApp'}\n\nVolte mais tarde! 😊`;
        }

        // ========== COMANDOS ESPECIAIS ==========
        if (['cancelar', 'voltar', 'recomeçar', 'recomecar', 'inicio'].includes(msgLower)) {
            conversa.etapa = 'inicio';
            conversa.carrinho = [];
            conversa.dados = {};
            return `Sem problemas! 😊 Quando quiser pedir, é só me chamar.\n\nSou a *Rebeca Delivery*, secretária do *${nomeRestaurante}*! 🍔`;
        }

        if (['cardapio', 'cardápio', 'menu', 'o que tem', 'oque tem', 'ver menu'].includes(msgLower)) {
            return await this._montarCardapio(adminId, nomeRestaurante);
        }

        if (msgLower === 'meu nome' || msgLower === 'qual seu nome' || msgLower === 'quem é você' || msgLower === 'quem e voce') {
            return `Sou a *Rebeca Delivery* 🍔, secretária virtual do *${nomeRestaurante}*! Estou aqui pra anotar seu pedido e cuidar de tudo pra você. 😊\n\nQuer ver nosso cardápio?`;
        }

        // ========== FLUXO POR ETAPA ==========
        if (conversa.etapa === 'inicio') {
            return await this._etapaInicio(conversa, msgLower, mensagem, adminId, nomeRestaurante, config);
        }

        if (conversa.etapa === 'montando_pedido') {
            return await this._etapaMontandoPedido(conversa, msgLower, mensagem, adminId, nomeRestaurante, config);
        }

        if (conversa.etapa === 'confirmar_pedido') {
            return await this._etapaConfirmarPedido(conversa, msgLower, mensagem, adminId, nomeRestaurante, config);
        }

        if (conversa.etapa === 'pedir_endereco') {
            return await this._etapaPedirEndereco(conversa, msgLower, mensagem, adminId, config);
        }

        if (conversa.etapa === 'pedir_pagamento') {
            return await this._etapaPedirPagamento(conversa, msgLower, mensagem, adminId, config);
        }

        if (conversa.etapa === 'pedir_troco') {
            return await this._etapaPedirTroco(conversa, msgLower, mensagem, adminId, config);
        }

        if (conversa.etapa === 'avaliar') {
            return await this._etapaAvaliar(conversa, msgLower, mensagem, adminId);
        }

        // Fallback: usar IA pra entender
        return await this._usarIA(conversa, mensagem, adminId, nomeRestaurante, config);
    }

    // ========== ETAPAS ==========

    async _etapaInicio(conversa, msgLower, msgOriginal, adminId, nomeRestaurante, config) {
        // Usar IA pra entender a intenção
        const categorias = await CategoriaCardapio.find({ adminId, ativo: true }).lean();
        const itens = await ItemCardapio.find({ adminId, ativo: true, disponivel: true }).lean();

        // Verificar se já é um pedido direto
        const itemEncontrado = await this._encontrarItemNoCardapio(msgOriginal, itens);

        if (itemEncontrado) {
            conversa.carrinho = [{ itemId: itemEncontrado._id, nome: itemEncontrado.nome, quantidade: 1, precoUnitario: itemEncontrado.preco, opcionais: [], subtotal: itemEncontrado.preco }];
            conversa.etapa = 'montando_pedido';

            // Sugerir bebida se pediu só comida
            const catBebidas = categorias.find(c => /bebida|refrigerante|suco|drink/i.test(c.nome));
            let sugestao = '';
            if (catBebidas) {
                const bebidas = itens.filter(i => i.categoriaId?.toString() === catBebidas._id.toString()).slice(0, 4);
                if (bebidas.length > 0) {
                    sugestao = '\n\n🥤 *Vai querer uma bebida?*\n' + bebidas.map(b => `• ${b.nome} — R$ ${b.preco.toFixed(2)}`).join('\n');
                }
            }

            return `✅ Anotado! *${itemEncontrado.nome}* — R$ ${itemEncontrado.preco.toFixed(2)}\n${sugestao}\n\n📝 Quer *adicionar mais alguma coisa* ou posso *finalizar* o pedido?`;
        }

        // Saudação
        const boasVindas = config?.mensagemBoasVindas || `Olá! Bem-vindo ao *${nomeRestaurante}*! 🍔`;
        const cardapio = await this._montarCardapioResumido(categorias, itens);
        conversa.etapa = 'montando_pedido';

        return `${boasVindas}\n\nSou a *Rebeca Delivery*, sua atendente virtual! 😊\n\n${cardapio}\n\n💬 Me diz o que você quer pedir!`;
    }

    async _etapaMontandoPedido(conversa, msgLower, msgOriginal, adminId, nomeRestaurante, config) {
        const itens = await ItemCardapio.find({ adminId, ativo: true, disponivel: true }).lean();

        if (['finalizar', 'fechar', 'é isso', 'e isso', 'só isso', 'so isso', 'confirmar', 'pronto', 'fechar pedido'].includes(msgLower)) {
            if (conversa.carrinho.length === 0) return 'Seu carrinho está vazio! Me diz o que quer pedir 😊';
            conversa.etapa = 'confirmar_pedido';
            return this._montarResumo(conversa, config);
        }

        // Tentar encontrar item
        const itemEncontrado = await this._encontrarItemNoCardapio(msgOriginal, itens);

        if (itemEncontrado) {
            // Detectar quantidade
            let qtd = 1;
            const matchQtd = msgOriginal.match(/(\d+)\s*x?\s/i);
            if (matchQtd) qtd = parseInt(matchQtd[1]) || 1;

            conversa.carrinho.push({ itemId: itemEncontrado._id, nome: itemEncontrado.nome, quantidade: qtd, precoUnitario: itemEncontrado.preco, opcionais: [], subtotal: itemEncontrado.preco * qtd });

            const total = conversa.carrinho.reduce((s, i) => s + i.subtotal, 0);

            // Sugerir complemento se não tem bebida
            const temBebida = conversa.carrinho.some(i => /coca|pepsi|guaraná|suco|refri|cerveja|água|fanta|sprite/i.test(i.nome));
            let sugestao = '';
            if (!temBebida && conversa.carrinho.length >= 1) {
                const categorias = await CategoriaCardapio.find({ adminId, ativo: true }).lean();
                const catBebidas = categorias.find(c => /bebida|refrigerante|suco|drink/i.test(c.nome));
                if (catBebidas) {
                    const bebidas = itens.filter(i => i.categoriaId?.toString() === catBebidas._id.toString()).slice(0, 3);
                    if (bebidas.length > 0) sugestao = '\n\n🥤 *Não quer uma bebida pra acompanhar?*\n' + bebidas.map(b => `• ${b.nome} — R$ ${b.preco.toFixed(2)}`).join('\n');
                }
            }

            return `✅ +${qtd}x *${itemEncontrado.nome}* — R$ ${(itemEncontrado.preco * qtd).toFixed(2)}\n\n🛒 *Carrinho:* ${conversa.carrinho.map(i => i.quantidade + 'x ' + i.nome).join(', ')}\n💰 *Subtotal:* R$ ${total.toFixed(2)}${sugestao}\n\n📝 *Mais alguma coisa?* Ou digite *finalizar* pra fechar o pedido.`;
        }

        // Não encontrou — tentar sugerir similar
        const similar = this._encontrarSimilar(msgOriginal, itens);
        if (similar) {
            return `🤔 Não encontrei exatamente isso no cardápio, mas temos algo parecido:\n\n⭐ *${similar.nome}* — R$ ${similar.preco.toFixed(2)}\n${similar.descricao || ''}\n\nQuer adicionar? 😊`;
        }

        // Usar IA como fallback
        return await this._usarIA(conversa, msgOriginal, adminId, nomeRestaurante, config);
    }

    async _etapaConfirmarPedido(conversa, msgLower, msgOriginal, adminId, nomeRestaurante, config) {
        if (['sim', 'confirmar', 'isso', 'ok', 'tá certo', 'ta certo', 'pode ser', 'confirma', 's'].includes(msgLower)) {
            // Verificar tipo de entrega
            conversa.etapa = 'pedir_endereco';
            return '📍 *Qual o endereço de entrega?*\n\nPode mandar o endereço escrito ou sua localização pelo WhatsApp.\n\nOu digite *retirada* se vai buscar no local.';
        }

        if (['não', 'nao', 'n', 'mudar', 'alterar'].includes(msgLower)) {
            conversa.etapa = 'montando_pedido';
            return '📝 Sem problemas! O que quer mudar?\n\n🛒 *Carrinho atual:*\n' + conversa.carrinho.map((i, idx) => `${idx + 1}. ${i.quantidade}x ${i.nome} — R$ ${i.subtotal.toFixed(2)}`).join('\n') + '\n\nPode *adicionar* mais itens ou dizer *remover [item]*.';
        }

        return this._montarResumo(conversa, config) + '\n\n*Confirma o pedido?* (sim/não)';
    }

    async _etapaPedirEndereco(conversa, msgLower, msgOriginal, adminId, config) {
        if (msgLower === 'retirada' || msgLower === 'retirar' || msgLower === 'buscar') {
            conversa.dados.tipoEntrega = 'retirada';
            conversa.dados.taxaEntrega = 0;
            conversa.etapa = 'pedir_pagamento';
            return this._montarOpcoesPagamento(config);
        }

        // Endereço para delivery
        conversa.dados.tipoEntrega = 'delivery';
        conversa.dados.enderecoEntrega = msgOriginal;
        conversa.dados.taxaEntrega = config?.taxaEntregaFixa || 5;
        conversa.etapa = 'pedir_pagamento';

        return `📍 Endereço: *${msgOriginal}*\n🏍️ Taxa de entrega: *R$ ${conversa.dados.taxaEntrega.toFixed(2)}*\n\n${this._montarOpcoesPagamento(config)}`;
    }

    async _etapaPedirPagamento(conversa, msgLower, msgOriginal, adminId, config) {
        let forma = null;
        if (/pix/i.test(msgLower)) forma = 'pix';
        else if (/dinheiro|din|cash/i.test(msgLower)) forma = 'dinheiro';
        else if (/cart[aã]o|cartao|credito|debito/i.test(msgLower)) forma = 'cartao';
        else if (/1/.test(msgLower)) forma = 'pix';
        else if (/2/.test(msgLower)) forma = 'dinheiro';
        else if (/3/.test(msgLower)) forma = 'cartao';

        if (!forma) return this._montarOpcoesPagamento(config);

        conversa.dados.formaPagamento = forma;

        if (forma === 'dinheiro') {
            conversa.etapa = 'pedir_troco';
            return '💵 Vai precisar de troco? Se sim, troco pra quanto?\n\nEx: "50" ou "sem troco"';
        }

        return await this._finalizarPedido(conversa, adminId, config);
    }

    async _etapaPedirTroco(conversa, msgLower, msgOriginal, adminId, config) {
        if (msgLower === 'sem troco' || msgLower === 'não' || msgLower === 'nao' || msgLower === 'n') {
            conversa.dados.trocoPara = null;
        } else {
            conversa.dados.trocoPara = parseFloat(msgOriginal.replace(/[^\d,.]/g, '').replace(',', '.')) || null;
        }
        return await this._finalizarPedido(conversa, adminId, config);
    }

    async _etapaAvaliar(conversa, msgLower, msgOriginal, adminId) {
        const nota = parseInt(msgOriginal);
        if (nota >= 1 && nota <= 5) {
            if (conversa.dados.pedidoId) {
                await PedidoDelivery.findByIdAndUpdate(conversa.dados.pedidoId, { avaliacao: nota, avaliacaoComentario: '' });
                try { await AprendizadoService.aprenderComAvaliacao(conversa.dados.pedidoId, nota, adminId); } catch(e) {}
            }
            conversa.etapa = 'inicio';
            conversa.carrinho = [];
            conversa.dados = {};
            const emojis = ['😞', '😐', '🙂', '😊', '🤩'];
            return `${emojis[nota - 1]} Obrigada pela avaliação *${nota}/5*! ${nota >= 4 ? 'Ficamos felizes que gostou!' : 'Vamos melhorar!'}\n\nQuando quiser pedir de novo, é só chamar! 🍔`;
        }
        return 'Por favor, avalie de *1 a 5* ⭐\n\n1 ⭐ Péssimo\n2 ⭐ Ruim\n3 ⭐ Ok\n4 ⭐ Bom\n5 ⭐ Excelente';
    }

    // ========== HELPERS ==========

    async _finalizarPedido(conversa, adminId, config) {
        const subtotal = conversa.carrinho.reduce((s, i) => s + i.subtotal, 0);
        const taxa = conversa.dados.taxaEntrega || 0;
        const total = subtotal + taxa;
        const tempoEstimado = config?.tempoMedioEntrega || 40;

        const pedido = await PedidoDelivery.create({
            adminId,
            clienteNome: conversa.clienteNome,
            clienteTelefone: conversa.telefone,
            instanciaId: conversa.instanciaId,
            itens: conversa.carrinho,
            tipoEntrega: conversa.dados.tipoEntrega || 'delivery',
            enderecoEntrega: conversa.dados.enderecoEntrega,
            taxaEntrega: taxa,
            formaPagamento: conversa.dados.formaPagamento,
            trocoPara: conversa.dados.trocoPara,
            subtotal,
            total,
            status: 'novo'
        });

        conversa.dados.pedidoId = pedido._id;
        conversa.etapa = 'inicio';
        conversa.carrinho = [];

        try { await AprendizadoService.aprenderEnderecoPopular(conversa.dados.enderecoEntrega, adminId); } catch(e) {}

        return `🎉 *PEDIDO #${pedido.numero} CONFIRMADO!*\n\n🛒 ${pedido.itens.map(i => i.quantidade + 'x ' + i.nome).join(', ')}\n💰 *Total: R$ ${total.toFixed(2)}*\n💳 Pagamento: ${conversa.dados.formaPagamento}\n${conversa.dados.tipoEntrega === 'retirada' ? '🏪 Retirada no local' : '📍 ' + conversa.dados.enderecoEntrega}\n⏱️ *Tempo estimado: ~${tempoEstimado} minutos*\n\n${config?.mensagemPedidoConfirmado || 'Estamos preparando com carinho! 🍳'}\n\nVocê receberá atualizações aqui mesmo! 😊`;
    }

    async _encontrarItemNoCardapio(mensagem, itens) {
        const msgLower = mensagem.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (const item of itens) {
            const nomeLower = item.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (msgLower.includes(nomeLower) || nomeLower.includes(msgLower)) return item;
            // Partial match (pelo menos 70% das palavras)
            const palavrasItem = nomeLower.split(/\s+/);
            const palavrasMsg = msgLower.split(/\s+/);
            const match = palavrasItem.filter(p => palavrasMsg.some(m => m.includes(p) || p.includes(m))).length;
            if (match >= palavrasItem.length * 0.7 && match > 0) return item;
        }
        return null;
    }

    _encontrarSimilar(mensagem, itens) {
        const msgLower = mensagem.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const palavras = msgLower.split(/\s+/);
        let melhor = null, melhorScore = 0;
        for (const item of itens) {
            const nomeLower = item.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const descLower = (item.descricao || '').toLowerCase();
            let score = 0;
            for (const p of palavras) {
                if (nomeLower.includes(p)) score += 2;
                if (descLower.includes(p)) score += 1;
            }
            if (score > melhorScore) { melhorScore = score; melhor = item; }
        }
        return melhorScore >= 1 ? melhor : null;
    }

    async _montarCardapio(adminId, nomeRestaurante) {
        const categorias = await CategoriaCardapio.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean();
        const itens = await ItemCardapio.find({ adminId, ativo: true, disponivel: true }).sort({ ordem: 1 }).lean();
        let txt = `📋 *Cardápio — ${nomeRestaurante}*\n`;
        for (const cat of categorias) {
            const itensCat = itens.filter(i => i.categoriaId?.toString() === cat._id.toString());
            if (itensCat.length === 0) continue;
            txt += `\n${cat.emoji || '📁'} *${cat.nome}*\n`;
            for (const i of itensCat) {
                txt += `  • ${i.destaque ? '⭐ ' : ''}${i.nome} — *R$ ${i.preco.toFixed(2)}*\n`;
                if (i.descricao) txt += `    _${i.descricao}_\n`;
            }
        }
        txt += '\n💬 *O que você quer pedir?* 😊';
        return txt;
    }

    async _montarCardapioResumido(categorias, itens) {
        let txt = '📋 *CARDÁPIO*\n';
        for (const cat of categorias.slice(0, 6)) {
            const itensCat = itens.filter(i => i.categoriaId?.toString() === cat._id.toString()).slice(0, 5);
            if (itensCat.length === 0) continue;
            txt += `\n${cat.emoji || '📁'} *${cat.nome}*\n`;
            for (const i of itensCat) {
                txt += `  • ${i.destaque ? '⭐ ' : ''}${i.nome} — *R$ ${i.preco.toFixed(2)}*\n`;
            }
        }
        return txt;
    }

    _montarResumo(conversa, config) {
        const subtotal = conversa.carrinho.reduce((s, i) => s + i.subtotal, 0);
        return `📋 *RESUMO DO PEDIDO*\n\n${conversa.carrinho.map((i, idx) => `${idx + 1}. ${i.quantidade}x ${i.nome} — R$ ${i.subtotal.toFixed(2)}`).join('\n')}\n\n💰 *Subtotal: R$ ${subtotal.toFixed(2)}*\n\n✅ Alguma alteração? Ou *confirma* o pedido?`;
    }

    _montarOpcoesPagamento(config) {
        let txt = '💳 *Forma de pagamento:*\n\n';
        if (config?.aceitaPix) txt += '1️⃣ PIX\n';
        if (config?.aceitaDinheiro) txt += '2️⃣ Dinheiro\n';
        if (config?.aceitaCartao) txt += '3️⃣ Cartão\n';
        return txt;
    }

    async _usarIA(conversa, mensagem, adminId, nomeRestaurante, config) {
        try {
            const itens = await ItemCardapio.find({ adminId, ativo: true, disponivel: true }).lean();
            const cardapio = itens.map(i => `${i.nome} (R$ ${i.preco.toFixed(2)})`).join(', ');
            const carrinhoAtual = conversa.carrinho.map(i => i.quantidade + 'x ' + i.nome).join(', ') || 'vazio';

            const prompt = `Você é a Rebeca Delivery, secretária virtual do restaurante "${nomeRestaurante}".
REGRAS ABSOLUTAS:
- Você é atendente de DELIVERY/RESTAURANTE, NÃO de corridas ou transporte
- Nunca invente itens que não estão no cardápio
- Se o cliente pedir algo que não tem, sugira o mais parecido do cardápio
- Se pediu comida e não pediu bebida, sugira uma
- Confirme o pedido item por item antes de finalizar
- Seja simpática, use emojis com moderação
- Nunca dê desconto ou promoção que não existe

CARDÁPIO DISPONÍVEL: ${cardapio}
CARRINHO ATUAL: ${carrinhoAtual}
ETAPA: ${conversa.etapa}
CLIENTE: ${conversa.clienteNome}
MENSAGEM: ${mensagem}

Responda de forma natural e ajude o cliente.`;

            const resposta = await OpenAIService.gerarResposta(mensagem, {
                systemPrompt: prompt,
                contextoExtra: `Delivery: ${nomeRestaurante}. Cardápio: ${cardapio}`
            });
            return resposta;
        } catch(e) {
            return `Desculpe, não entendi. 😅 Quer ver nosso *cardápio*? Ou me diz o que quer pedir! 🍔`;
        }
    }

    // Pedir avaliação após entrega
    async pedirAvaliacao(telefone, adminId, instanciaId) {
        const conversa = this.obterConversa(telefone, adminId);
        conversa.etapa = 'avaliar';
        return '⭐ *Como foi seu pedido?*\n\nAvalie de 1 a 5:\n1 ⭐ Péssimo\n2 ⭐ Ruim\n3 ⭐ Ok\n4 ⭐ Bom\n5 ⭐ Excelente';
    }
}

module.exports = new RebecaDeliveryService();
