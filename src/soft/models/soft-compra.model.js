/**
 * soft-compra.model.js
 * Registro de compra de mercadoria (entrada de estoque via fornecedor).
 */
const mongoose = require('mongoose');

const ItemCompraSchema = new mongoose.Schema({
  produtoId:   { type: mongoose.Schema.Types.ObjectId, ref: 'SoftProduto', required: true },
  produtoNome: { type: String, required: true },
  quantidade:  { type: Number, required: true, min: 1 },
  custoUnit:   { type: Number, required: true, min: 0 },
  subtotal:    { type: Number, required: true, min: 0 },
}, { _id: false });

const SoftCompraSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin',      required: true },
  fornecedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'SoftFornecedor', default: null },
  fornecedorNome:{ type: String, default: 'Sem fornecedor' },
  itens:        { type: [ItemCompraSchema], required: true },
  total:        { type: Number, required: true, min: 0 },
  notaFiscal:   { type: String, default: '' },
  observacao:   { type: String, default: '' },
  operadorNome: { type: String, required: true },
}, { timestamps: true });

SoftCompraSchema.index({ adminId: 1, createdAt: -1 });
SoftCompraSchema.index({ adminId: 1, fornecedorId: 1 });

module.exports = mongoose.model('SoftCompra', SoftCompraSchema);
