/**
 * soft-movimentacao.model.js
 * Ledger financeiro — append-only, imutável após criação.
 * Todo evento que muda saldo gera um registro aqui.
 */
const mongoose = require('mongoose');

const SoftMovimentacaoSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  caixaId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SoftCaixa', default: null },
  tipo:         { type: String, required: true,
                  enum: ['venda','estorno','suprimento','sangria','despesa','receita'] },
  valor:        { type: Number, required: true },
  formaPagamento:{ type: String, default: '' },
  descricao:    { type: String, required: true },
  operadorNome: { type: String, required: true },
  vendaId:      { type: mongoose.Schema.Types.ObjectId, default: null },
  ip:           { type: String, default: '' },
}, { timestamps: true });

SoftMovimentacaoSchema.index({ adminId: 1, createdAt: -1 });
SoftMovimentacaoSchema.index({ adminId: 1, caixaId: 1 });
SoftMovimentacaoSchema.index({ adminId: 1, tipo: 1, createdAt: -1 });

module.exports = mongoose.model('SoftMovimentacao', SoftMovimentacaoSchema);
