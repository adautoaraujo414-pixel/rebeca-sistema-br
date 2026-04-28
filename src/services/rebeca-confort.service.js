/**
 * REBECA CONFORT — Modo econômico
 * Sem IA pesada. Respostas baseadas em regras + cardápio do banco.
 * Usa IA apenas quando necessário (pedidos complexos).
 */
const { ConfigDelivery, ItemCardapio, CategoriaCardapio } = require('../models/delivery.models');

class RebecaConfortService {
    constructor() {
        this._conversas = new Map(); // telefone+adminId -> estado
    }

    _key(tel, adminId) { return `${tel}_${adminId}`; }

    _conv(tel, adminId) {
        const k = this._key(tel, adminId);
        if (!this._conversas.has(k)) {
            this._conversas.set(k, { etapa: 'inicio', carrinho: [], dados: {}, nome: '' });
        }
        return this._conversas.get(k);
    }

    async processar(telefone, msgTexto, nome, adminId, instanciaId) {
        const conv = this._conv(telefone, adminId);
        conv.nome = nome || conv.nome;
        const msg = msgTexto.trim().toLowerCase();
        const config = await ConfigDelivery.findOne({ adminId }).lean();
        const nomeRest = config?.nomeRestaurante || 'Restaurante';
        const linkCardapio = config?.linkCardapio || config?.linkDigital || '';
        const primeiroNome = (nome || '').split(' ')[0];

        // Fechado
        if (config?.aberto === false) {
            return `😴 Olá! O *${nomeRest}* está fechado agora.\n🕐 ${config.horarioFuncionamento || ''}\n\nVolte mais tarde! 😊`;
        }

        // Saudações
        const saudacoes = ['oi','olá','ola','bom dia','boa tarde','boa noite','opa','eai','e ai','hey','hello'];
        if (saudacoes.some(s => msg === s || msg.startsWith(s + ' '))) {
            conv.etapa = 'montando';
            const hora = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
            const sd = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
            return `${sd}${primeiroNome ? ', ' + primeiroNome : ''}! 😊 Bem-vindo ao *${nomeRest}*!\n\nMe fala o que vai querer ou manda *CARDAPIO* para ver as opções! 🍽️`;
        }

        // Cardápio — manda link direto
        if (msg.includes('cardap') || msg.includes('menu') || msg === 'c' || msg.includes('foto') || msg.includes('imagem') || msg.includes('opcoes') || msg.includes('opções')) {
            if (linkCardapio) {
                return `Aqui está nosso cardápio digital! 🍽️\n\n👉 ${linkCardapio}\n\nDepois me diz o que vai querer! 😄`;
            }
            // Sem link — busca itens do banco
            const itens = await ItemCardapio.find({ adminId, ativo: true }).lean();
            if (!itens.length) return `No momento não temos o cardápio disponível. Liga pra gente! 📞 ${tel || ''}`;
            const porCat = {};
            itens.forEach(i => { 
                const c = i.categoria || 'Outros';
                if (!porCat[c]) porCat[c] = [];
                porCat[c].push(`• ${i.nome} — R$ ${(i.preco||0).toFixed(2).replace('.',',')}`);
            });
            let txt = `🍽️ *Cardápio ${nomeRest}*\n\n`;
            Object.entries(porCat).forEach(([cat, its]) => {
                txt += `*${cat}*\n${its.join('\n')}\n\n`;
            });
            txt += `Me fala o que vai querer! 😊`;
            return txt;
        }

        // Horário
        if (msg.includes('hora') || msg.includes('horario') || msg.includes('horário') || msg.includes('funciona')) {
            return `🕐 Nosso horário: *${config?.horarioFuncionamento || 'Consulte-nos'}*\n\nQualquer dúvida é só perguntar! 😊`;
        }

        // Endereço
        if (msg.includes('endere') || msg.includes('onde') || msg.includes('localiz') || msg.includes('fica')) {
            return `📍 *${nomeRest}*\n${config?.endereco || 'Endereço não configurado'}\n\nQuer fazer um pedido? 😊`;
        }

        // Confirmar pedido
        if (conv.etapa === 'confirmar' && (msg === 'sim' || msg === 's' || msg === 'isso' || msg === 'pode' || msg.includes('confirm'))) {
            conv.etapa = 'pagamento';
            return this._opcoesPagamento(config, conv);
        }

        // Pagamento
        if (conv.etapa === 'pagamento') {
            return this._processarPagamento(conv, msg, config, nomeRest, adminId, instanciaId);
        }

        // Endereço após pagamento
        if (conv.etapa === 'endereco') {
            conv.dados.endereco = msgTexto;
            conv.etapa = 'finalizar';
            return await this._finalizar(conv, adminId, instanciaId, nomeRest);
        }

        // Troco
        if (conv.etapa === 'troco') {
            const valor = parseFloat(msg.replace(/[^0-9,]/g, '').replace(',', '.'));
            conv.dados.troco = isNaN(valor) ? 0 : valor - (conv.dados.total || 0);
            conv.dados.valorPago = valor;
            if (conv.dados.tipoEntrega === 'entrega') {
                conv.etapa = 'endereco';
                return `📍 Qual o endereço de entrega?`;
            }
            conv.etapa = 'finalizar';
            return await this._finalizar(conv, adminId, instanciaId, nomeRest);
        }

        // Montando pedido — passa para IA só se necessário
        conv.etapa = 'montando';
        // Tentar identificar item no cardápio
        const itensDb = await ItemCardapio.find({ adminId, ativo: true }).lean();
        const encontrados = itensDb.filter(item => 
            msgTexto.toLowerCase().includes(item.nome.toLowerCase().split(' ')[0])
        );
        
        if (encontrados.length > 0) {
            encontrados.forEach(item => {
                const jaNoCarrinho = conv.carrinho.find(c => c.itemId === item._id.toString());
                if (jaNoCarrinho) jaNoCarrinho.qty++;
                else conv.carrinho.push({ itemId: item._id.toString(), nome: item.nome, preco: item.preco, qty: 1 });
            });
            const resumo = conv.carrinho.map(c => `${c.qty}x ${c.nome} — R$ ${(c.preco*c.qty).toFixed(2).replace('.',',')}`).join('\n');
            const total = conv.carrinho.reduce((a, c) => a + c.preco * c.qty, 0);
            conv.dados.total = total;
            conv.etapa = 'confirmar';
            return `Anotei! ✅\n\n${resumo}\n\n*Total: R$ ${total.toFixed(2).replace('.',',')}*\n\nConfirma? (sim/não)`;
        }

        // Sem match — resposta neutra
        return `Não encontrei esse item no cardápio. 😕\n\nManda *CARDAPIO* para ver as opções ou me diz o nome certinho! 😊`;
    }

    _opcoesPagamento(config, conv) {
        const formas = [];
        if (config?.aceitaDinheiro !== false) formas.push('💵 *Dinheiro*');
        if (config?.aceitaCartao !== false) formas.push('💳 *Cartão*');
        if (config?.aceitaPix !== false) formas.push('📱 *Pix*');
        return `Como vai pagar?\n\n${formas.join('\n')}\n\nÉ para entrega ou retirada?`;
    }

    async _processarPagamento(conv, msg, config, nomeRest, adminId, instanciaId) {
        if (msg.includes('dinheiro')) {
            conv.dados.formaPagamento = 'dinheiro';
            conv.etapa = 'troco';
            return `💵 Dinheiro! Vai pagar com quanto? (ex: 50,00)`;
        }
        if (msg.includes('cart')) {
            conv.dados.formaPagamento = 'cartao';
            conv.etapa = 'endereco';
            return `💳 Cartão, anotado!\n\n📍 Qual o endereço de entrega? (ou manda *retirada* para buscar no local)`;
        }
        if (msg.includes('pix')) {
            conv.dados.formaPagamento = 'pix';
            if (config?.chavePix) {
                return `📱 Pix!\n\nChave: *${config.chavePix}*\n\nApós confirmar o pagamento, me manda o endereço de entrega ou *retirada*!`;
            }
            conv.etapa = 'endereco';
            return `📱 Pix! Qual o endereço? (ou *retirada*)`;
        }
        if (msg.includes('retirada') || msg.includes('buscar') || msg.includes('pegar')) {
            conv.dados.tipoEntrega = 'retirada';
            conv.etapa = 'finalizar';
            return await this._finalizar(conv, adminId, instanciaId, nomeRest);
        }
        return `Me diz como vai pagar: *dinheiro*, *cartão* ou *pix*?`;
    }

    async _finalizar(conv, adminId, instanciaId, nomeRest) {
        try {
            const { PedidoDelivery } = require('../models/delivery.models');
            const pedido = await PedidoDelivery.create({
                adminId,
                instanciaId,
                itens: conv.carrinho,
                total: conv.dados.total || 0,
                formaPagamento: conv.dados.formaPagamento || 'dinheiro',
                troco: conv.dados.troco || 0,
                valorPago: conv.dados.valorPago || 0,
                endereco: conv.dados.endereco || 'Retirada no local',
                tipoEntrega: conv.dados.tipoEntrega || 'entrega',
                nomeCliente: conv.nome,
                status: 'novo',
                origemPedido: 'whatsapp',
            });
            // Limpar conversa
            conv.etapa = 'inicio'; conv.carrinho = []; conv.dados = {};
            return `✅ *Pedido confirmado!*\n\nPedido #${pedido._id.toString().slice(-6).toUpperCase()} registrado!\n\n🕐 Em breve seu pedido estará pronto!\n\nObrigado pelo pedido no *${nomeRest}*! 😊`;
        } catch(e) {
            console.error('[REBECA-CONFORT] Erro finalizar:', e.message);
            return `Pedido anotado! Em breve entraremos em contato. 😊`;
        }
    }
}

module.exports = new RebecaConfortService();
