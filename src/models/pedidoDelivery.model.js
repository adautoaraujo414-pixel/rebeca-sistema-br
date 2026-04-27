const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    nome:          { type: String, required: true },
    quantidade:    { type: Number, default: 1 },
    preco:         { type: Number, default: 0 },
    personalizacao:{ type: String, default: '' },
    categoria:     { type: String, default: '' },
}, { _id: false });

const PedidoDeliverySchema = new mongoose.Schema({
    adminId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    caixaId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Caixa', default: null },
    numeroPedido:    { type: Number },
    clienteNome:     { type: String, default: '' },
    clienteTelefone: { type: String, default: '' },
    itens:           [ItemSchema],
    total:           { type: Number, default: 0 },
    taxaGarcom:      { type: Number, default: 0 },
    taxaGarcomPerc:  { type: Number, default: 0 },
    taxaBanda:       { type: Number, default: 0 },
    enderecoEntrega: { type: String, default: '' },
    tipoEntrega:     { type: String, enum: ['entrega','retirada','mesa'], default: 'entrega' },
    mesa:            { type: String, default: '' },
    formaPagamento:  { type: String, enum: ['dinheiro','cartao','pix','pendente'], default: 'pendente' },
    status:          { type: String, enum: ['aguardando','confirmado','preparando','pronto','saiu_entrega','entregue','cancelado'], default: 'aguardando' },
    linkRastreamento:{ type: String, default: '' },
    entregadorId:    { type: mongoose.Schema.Types.ObjectId, default: null },
    reciboEnviado:   { type: Boolean, default: false },
    linkEnviado:     { type: Boolean, default: false },
    vias:            { type: Number, default: 1 },
    impresso:        { type: Boolean, default: false },
    planoPlus:       { type: Boolean, default: false },
    observacoes:     { type: String, default: '' },
}, { timestamps: true });

PedidoDeliverySchema.index({ adminId: 1, status: 1 });
PedidoDeliverySchema.index({ adminId: 1, clienteTelefone: 1 });
PedidoDeliverySchema.index({ adminId: 1, caixaId: 1 });

module.exports = mongoose.model('PedidoDelivery', PedidoDeliverySchema);
