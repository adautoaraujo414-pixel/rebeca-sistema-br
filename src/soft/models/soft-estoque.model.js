/**
 * soft-estoque.model.js
 * Movimentações de estoque — append-only, nunca deletar.
 * Auditoria completa de entradas, saídas e ajustes.
 */
const mongoose = require('mongoose');

const SoftEstoqueSchema = new mongoose.Schema({
  adminId:     { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin',    required: true },
  produtoId:   { type: mongoose.Schema.Types.ObjectId, ref: 'SoftProduto',  required: true },
  // Nomes desnormalizados para relatório sem populate
  produtoNome: { type: String, required: true },
  tipo:        { type: String, required: true,
                 enum: ['entrada','saida','ajuste','inventario','estorno'] },
  quantidade:  { type: Number, required: true },
  estoqueApos: { type: Number, required: true },
  motivo:      { type: String, default: '' },
  operadorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', default: null },
  vendaId:     { type: mongoose.Schema.Types.ObjectId, default: null }, // ref SoftVenda
  compraId:    { type: mongoose.Schema.Types.ObjectId, default: null }, // ref SoftCompra
}, { timestamps: true });

SoftEstoqueSchema.index({ adminId: 1, produtoId: 1, createdAt: -1 });
SoftEstoqueSchema.index({ adminId: 1, createdAt: -1 });
SoftEstoqueSchema.index({ vendaId: 1 }, { sparse: true });

module.exports = mongoose.model('SoftEstoque', SoftEstoqueSchema);
