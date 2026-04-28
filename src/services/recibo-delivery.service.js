const getPedido = () => require('../models/pedidoDelivery.model');

const ReciboDeliveryService = {

    _fone(tel) {
        if (!tel) return null;
        const n = tel.replace(/\D/g, '');
        if (n.length === 0) return null;
        if (n.startsWith('55') && n.length >= 12) return n;
        if (n.length === 11 || n.length === 10) return '55' + n;
        if (n.length === 13 && n.startsWith('55')) return n;
        return '55' + n;
    },

    async enviarRecibo(adminId, pedidoId) {
        try {
            const Pedido = getPedido();
            const { InstanciaWhatsapp } = require('../models');
            const Evo = require('./evolution-multi.service');
            const pedido = await Pedido.findOne({ _id: pedidoId, adminId }).lean();
            if (!pedido || !pedido.clienteTelefone || pedido.reciboEnviado) return;
            const fone = this._fone(pedido.clienteTelefone);
            if (!fone) return console.log('[RECIBO] Telefone invalido:', pedido.clienteTelefone);
            const inst = await InstanciaWhatsapp.findOne({ adminId, tipo: 'delivery', status: { $in: ['conectado','open','connected'] } }).lean()
                      || await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).lean();
            if (!inst) return console.log('[RECIBO] Sem instancia conectada');
            await Evo.enviarMensagem(inst._id, fone, this._texto(pedido));
            await Pedido.updateOne({ _id: pedidoId }, { reciboEnviado: true });
            console.log('[RECIBO] Enviado para', fone);
        } catch(e) { console.log('[RECIBO] Erro:', e.message); }
    },

    async enviarLinkRastreamento(adminId, pedidoId, linkRastreamento) {
        try {
            const Pedido = getPedido();
            const { InstanciaWhatsapp } = require('../models');
            const Evo = require('./evolution-multi.service');
            const pedido = await Pedido.findOne({ _id: pedidoId, adminId }).lean();
            if (!pedido || !pedido.clienteTelefone || pedido.linkEnviado) return;
            const fone = this._fone(pedido.clienteTelefone);
            if (!fone) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId, tipo: 'delivery', status: { $in: ['conectado','open','connected'] } }).lean()
                      || await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).lean();
            if (!inst) return;
            await Pedido.updateOne({ _id: pedidoId }, { linkRastreamento, status: 'saiu_entrega', linkEnviado: true });
            const msg = `🛵 *Seu pedido saiu para entrega!*\n\nAcompanhe em tempo real:\n📍 ${linkRastreamento}\n\nQualquer duvida e so chamar, estou aqui! 😊`;
            await Evo.enviarMensagem(inst._id, fone, msg);
            console.log('[RASTREAMENTO] Link enviado para', fone);
        } catch(e) { console.log('[RASTREAMENTO] Erro:', e.message); }
    },

    _texto(pedido) {
        const R = (n) => `R$ ${(n||0).toFixed(2).replace('.',',')}`;
        const itens = (pedido.itens||[]).map(i =>
            `• ${i.quantidade}x *${i.nome}*${i.personalizacao ? ' _('+i.personalizacao+')_' : ''} — ${R((i.preco||0)*(i.quantidade||1))}`
        );
        const extras = [];
        if (pedido.taxaGarcom > 0) extras.push(`• Taxa garcom (${pedido.taxaGarcomPerc||10}%): ${R(pedido.taxaGarcom)}`);
        if (pedido.taxaBanda  > 0) extras.push(`• Banda/Cover: ${R(pedido.taxaBanda)}`);
        const subtotal = (pedido.total||0);
        const total = subtotal + (pedido.taxaGarcom||0) + (pedido.taxaBanda||0);
        const pgto = { dinheiro:'💵 Dinheiro', cartao:'💳 Cartao', pix:'🔑 Pix', pendente:'⏳ Pendente' };
        const linhas = [
            `✅ *Pedido confirmado! Obrigado pela preferencia* 🙏`,
            ``,
            `🧾 *RECIBO — Pedido #${pedido.numeroPedido || pedido.numero || '---'}*`,
            ``,
            ...itens,
        ];
        if (extras.length) { linhas.push(''); linhas.push(...extras); }
        if (subtotal > 0 && extras.length > 0) linhas.push(`• Subtotal itens: ${R(subtotal)}`);
        linhas.push(``);
        linhas.push(`💰 *Total: ${R(total)}*`);
        linhas.push(`💳 ${pgto[pedido.formaPagamento] || pedido.formaPagamento || 'pendente'}`);
        if (pedido.troco) linhas.push(`💵 Troco para: ${R(pedido.troco)}`);
        if (pedido.enderecoEntrega) linhas.push(`📍 ${pedido.enderecoEntrega}`);
        linhas.push(``);
        linhas.push(`Se precisar de qualquer coisa estou aqui! Se quiser saber o andamento do pedido e so chamar 😊`);
        linhas.push(``);
        linhas.push(`_Rebeca Delivery_ 🤖`);
        return linhas.join('\n');
    },
};

module.exports = ReciboDeliveryService;
