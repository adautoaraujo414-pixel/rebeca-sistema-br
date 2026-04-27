const getPedido = () => require('../models/pedidoDelivery.model');

const ReciboDeliveryService = {

    async enviarRecibo(adminId, pedidoId) {
        try {
            const Pedido = getPedido();
            const { InstanciaWhatsapp } = require('../models');
            const Evo = require('./evolution-multi.service');
            const pedido = await Pedido.findOne({ _id: pedidoId, adminId }).lean();
            if (!pedido || !pedido.clienteTelefone || pedido.reciboEnviado) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId, tipo: 'delivery', status: { $in: ['conectado','open','connected'] } }).lean()
                      || await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).lean();
            if (!inst) return console.log('[RECIBO] Sem instancia conectada');
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, this._texto(pedido));
            await Pedido.updateOne({ _id: pedidoId }, { reciboEnviado: true });
            console.log('[RECIBO] Enviado para', pedido.clienteTelefone);
        } catch(e) { console.log('[RECIBO] Erro:', e.message); }
    },

    async enviarLinkRastreamento(adminId, pedidoId, linkRastreamento) {
        try {
            const Pedido = getPedido();
            const { InstanciaWhatsapp } = require('../models');
            const Evo = require('./evolution-multi.service');
            const pedido = await Pedido.findOne({ _id: pedidoId, adminId }).lean();
            if (!pedido || !pedido.clienteTelefone || pedido.linkEnviado) return;
            const inst = await InstanciaWhatsapp.findOne({ adminId, tipo: 'delivery', status: { $in: ['conectado','open','connected'] } }).lean()
                      || await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).lean();
            if (!inst) return;
            await Pedido.updateOne({ _id: pedidoId }, { linkRastreamento, status: 'saiu_entrega', linkEnviado: true });
            const msg = `🛵 *Seu pedido saiu para entrega!*\n\nAcompanhe em tempo real:\n📍 ${linkRastreamento}\n\nQualquer duvida e so chamar! 😊`;
            await Evo.enviarMensagem(inst._id, pedido.clienteTelefone, msg);
            console.log('[RASTREAMENTO] Link enviado para', pedido.clienteTelefone);
        } catch(e) { console.log('[RASTREAMENTO] Erro:', e.message); }
    },

    _texto(pedido) {
        const R = (n) => `R$ ${(n||0).toFixed(2).replace('.',',')}`;
        const itens = (pedido.itens||[]).map(i => `• ${i.quantidade}x ${i.nome}${i.personalizacao ? ' _('+i.personalizacao+')_' : ''} — ${R(i.preco*i.quantidade)}`);
        const extras = [];
        if (pedido.taxaGarcom > 0) extras.push(`• Taxa garcom (${pedido.taxaGarcomPerc||10}%): ${R(pedido.taxaGarcom)}`);
        if (pedido.taxaBanda  > 0) extras.push(`• Banda/Cover: ${R(pedido.taxaBanda)}`);
        const total = (pedido.total||0) + (pedido.taxaGarcom||0) + (pedido.taxaBanda||0);
        const pgto  = { dinheiro:'💵 Dinheiro', cartao:'💳 Cartao', pix:'🔑 Pix', pendente:'⏳ Pendente' };
        return [
            `✅ *Pedido confirmado! Obrigado pela preferencia* 🙏`, ``,
            `🧾 *RECIBO — Pedido #${pedido.numeroPedido||'---'}*`, ``,
            ...itens,
            extras.length ? '' : null, ...extras, ``,
            `💰 *Total: ${R(total)}*`,
            `💳 ${pgto[pedido.formaPagamento]||pedido.formaPagamento}`,
            pedido.enderecoEntrega ? `📍 ${pedido.enderecoEntrega}` : null,
            ``, `Se precisar e so chamar! 😊`, ``, `_Rebeca Delivery_ 🤖`,
        ].filter(l => l !== null).join('\n');
    },
};

module.exports = ReciboDeliveryService;
