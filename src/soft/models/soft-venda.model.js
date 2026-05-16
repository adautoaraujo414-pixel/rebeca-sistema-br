/**
 * soft-venda.model.js
 * Registro de venda — append-only, nunca deletar.
 * Campos desnormalizados para relatórios sem populate.
 */
const mongoose = require('mongoose');

const ItemVendaSchema = new mongoose.Schema({
  produtoId:   { type: mongoose.Schema.Types.ObjectId, ref: 'SoftProduto', required: true },
  produtoNome: { type: String, required: true },
  quantidade:  { type: Number, required: true, min: 1 },
  precoUnit:   { type: Number, required: true, min: 0 },
  subtotal:    { type: Number, required: true, min: 0 },
}, { _id: false });

const SoftVendaSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  caixaId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SoftCaixa', required: true },
  operadorNome: { type: String, required: true },
  clienteNome:  { type: String, default: 'Consumidor' },
  itens:        { type: [ItemVendaSchema], required: true },
  subtotal:     { type: Number, required: true, min: 0 },
  desconto:     { type: Number, default: 0,     min: 0 },
  total:        { type: Number, required: true, min: 0 },
  formaPagamento: { type: String, required: true,
                    enum: ['dinheiro','pix','cartao_debito','cartao_credito','fiado','outro'] },
  status:       { type: String, enum: ['concluida','cancelada'], default: 'concluida' },
  canceladaEm:  { type: Date,   default: null },
  motivoCancelamento: { type: String, default: '' },
}, { timestamps: true });

SoftVendaSchema.index({ adminId: 1, createdAt: -1 });
SoftVendaSchema.index({ adminId: 1, caixaId: 1 });
SoftVendaSchema.index({ adminId: 1, status: 1 });
SoftVendaSchema.index({ adminId: 1, formaPagamento: 1, createdAt: -1 });

module.exports = mongoose.model('SoftVenda', SoftVendaSchema);
