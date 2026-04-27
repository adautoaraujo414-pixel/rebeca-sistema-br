const getCaixa  = () => require('../models/caixa.model');
const getPedido = () => { try { return require('../models/pedidoDelivery.model'); } catch(e){ return null; } };

const CaixaService = {

    async abrirCaixa(adminId, { operador, numeroCaixa = 1, valorAbertura = 0 }) {
        const Caixa = getCaixa();
        const num = Number(numeroCaixa);
        if (![1,2,3].includes(num)) throw new Error('Numero de caixa invalido. Use 1, 2 ou 3.');
        const existente = await Caixa.findOne({ adminId, numeroCaixa: num, status: 'aberto' });
        if (existente) throw new Error(`Caixa ${num} ja esta aberto (operador: ${existente.operador}).`);
        const caixa = await Caixa.create({
            adminId, numeroCaixa: num,
            operador: operador.trim(),
            valorAbertura: Number(valorAbertura) || 0,
            dataAbertura: new Date(), status: 'aberto',
        });
        console.log(`[CAIXA] Aberto — admin:${adminId} caixa:${num} operador:${operador}`);
        return caixa;
    },

    async fecharCaixa(adminId, caixaId, { valorFechamento, observacoes = '' }) {
        const Caixa  = getCaixa();
        const Pedido = getPedido();
        const caixa  = await Caixa.findOne({ _id: caixaId, adminId, status: 'aberto' });
        if (!caixa) throw new Error('Caixa nao encontrado ou ja fechado.');
        let totalVendas = 0, totalDinheiro = 0, totalCartao = 0, totalPix = 0;
        if (Pedido) {
            const pedidos = await Pedido.find({ adminId, caixaId, status: { $nin: ['cancelado'] } }).lean();
            for (const p of pedidos) {
                const v = (p.total||0) + (p.taxaGarcom||0) + (p.taxaBanda||0);
                totalVendas += v;
                if (p.formaPagamento === 'dinheiro') totalDinheiro += v;
                else if (p.formaPagamento === 'cartao') totalCartao += v;
                else if (p.formaPagamento === 'pix')    totalPix    += v;
            }
        }
        await Caixa.updateOne({ _id: caixaId }, {
            status: 'fechado', dataFechamento: new Date(),
            valorFechamento: Number(valorFechamento) || totalVendas,
            totalVendas, totalDinheiro, totalCartao, totalPix, observacoes,
        });
        const caixaFechado = await Caixa.findById(caixaId).lean();
        await this._enviarRelatorio(adminId, caixaFechado);
        console.log(`[CAIXA] Fechado — total:R$${totalVendas.toFixed(2)}`);
        return caixaFechado;
    },

    async caixasAbertos(adminId) {
        return getCaixa().find({ adminId, status: 'aberto' }).lean();
    },

    async listarCaixas(adminId, { status, limite = 20 } = {}) {
        const filtro = { adminId };
        if (status) filtro.status = status;
        return getCaixa().find(filtro).sort({ dataAbertura: -1 }).limit(limite).lean();
    },

    async gerarRelatorio(adminId, caixaId) {
        const caixa = await getCaixa().findOne({ _id: caixaId, adminId }).lean();
        if (!caixa) throw new Error('Caixa nao encontrado.');
        let pedidos = [];
        const Pedido = getPedido();
        if (Pedido) pedidos = await Pedido.find({ adminId, caixaId, status: { $nin: ['cancelado'] } }).lean();
        const durMin = Math.round((new Date() - new Date(caixa.dataAbertura)) / 60000);
        return { caixa, pedidos, duracao: durMin, resumo: this._fmt(caixa) };
    },

    async _enviarRelatorio(adminId, caixa) {
        try {
            const { Admin, InstanciaWhatsapp } = require('../models');
            const Evo = require('./evolution-multi.service');
            const admin = await Admin.findById(adminId).lean();
            if (!admin || !admin.telefone) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).lean();
            if (!inst) return;
            await Evo.enviarMensagem(inst._id, admin.telefone, this._fmt(caixa));
            await getCaixa().updateOne({ _id: caixa._id }, { relatorioEnviado: true });
            console.log('[CAIXA] Relatorio enviado ao admin');
        } catch(e) { console.log('[CAIXA] Erro relatorio:', e.message); }
    },

    _fmt(c) {
        const R = (n) => `R$ ${(n||0).toFixed(2).replace('.',',')}`;
        const dtA = new Date(c.dataAbertura).toLocaleString('pt-BR',{ timeZone:'America/Sao_Paulo' });
        const dtF = c.dataFechamento ? new Date(c.dataFechamento).toLocaleString('pt-BR',{ timeZone:'America/Sao_Paulo' }) : 'Em aberto';
        return [
            `📊 *RELATORIO CAIXA ${c.numeroCaixa}*`,
            `👤 Operador: ${c.operador}`,
            ``, `🕐 Abertura: ${dtA}`, `🕐 Fechamento: ${dtF}`, ``,
            `💰 *TOTAIS*`,
            `• Fundo inicial: ${R(c.valorAbertura)}`,
            `• Total vendas:  ${R(c.totalVendas)}`,
            `• Dinheiro:      ${R(c.totalDinheiro)}`,
            `• Cartao:        ${R(c.totalCartao)}`,
            `• Pix:           ${R(c.totalPix)}`,
            `• Ao fechar:     ${R(c.valorFechamento)}`,
            c.observacoes ? `\n📝 ${c.observacoes}` : '',
            ``, `_Rebeca Sistema_ 🤖`,
        ].filter(l => l !== '').join('\n');
    },
};

module.exports = CaixaService;
