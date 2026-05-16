/**
 * soft-despesa.model.js
 * Despesas e receitas avulsas (fora de venda).
 * v2: + idempotencyKey + canceladaEm + motivoCancelamento
 */
const mongoose = require('mongoose');

const SoftDespesaSchema = new mongoose.Schema({
  adminId:             { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  tipo:                { type: String, enum: ['despesa','receita'], required: true },
  descricao:           { type: String, required: true, trim: true },
  valor:               { type: Number, required: true, min: 0 },
  categoria:           { type: String, default: 'outros' },
  data:                { type: Date,   default: Date.now },
  operadorNome:        { type: String, required: true },
  comprovante:         { type: String, default: '' },
  idempotencyKey:      { type: String, default: null },
  canceladaEm:         { type: Date,   default: null },
  motivoCancelamento:  { type: String, default: '' },
}, { timestamps: true });

SoftDespesaSchema.index({ adminId: 1, data: -1 });
SoftDespesaSchema.index({ adminId: 1, tipo: 1, data: -1 });
SoftDespesaSchema.index({ adminId: 1, canceladaEm: 1 });
SoftDespesaSchema.index(
  { adminId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true, partialFilterExpression: { idempotencyKey: { $ne: null } } }
);

module.exports = mongoose.model('SoftDespesa', SoftDespesaSchema);
