/**
 * soft-caixa.model.js
 * Sessão de caixa — abertura e fechamento.
 * Índice único parcial garante apenas 1 caixa aberto por admin.
 */
const mongoose = require('mongoose');

const SoftCaixaSchema = new mongoose.Schema({
  adminId:        { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  operadorNome:   { type: String, required: true },
  status:         { type: String, enum: ['aberto','fechado'], default: 'aberto' },
  saldoInicial:   { type: Number, required: true, min: 0 },
  saldoFinal:     { type: Number, default: null },
  saldoEsperado:  { type: Number, default: null },
  diferenca:      { type: Number, default: null },
  totalVendas:    { type: Number, default: 0 },
  qtdVendas:      { type: Number, default: 0 },
  observacao:     { type: String, default: '' },
  aberturaEm:     { type: Date,   default: Date.now },
  fechamentoEm:   { type: Date,   default: null },
}, { timestamps: true });

// CRÍTICO: garante apenas 1 caixa aberto por admin simultaneamente
SoftCaixaSchema.index(
  { adminId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'aberto' } }
);
SoftCaixaSchema.index({ adminId: 1, createdAt: -1 });

module.exports = mongoose.model('SoftCaixa', SoftCaixaSchema);
