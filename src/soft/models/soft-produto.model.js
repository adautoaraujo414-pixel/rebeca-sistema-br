/**
 * soft-produto.model.js
 * Produtos do catálogo — por tenant.
 * Estoque armazenado aqui como campo de consulta rápida.
 * Movimentações detalhadas ficam em SoftEstoque.
 */
const mongoose = require('mongoose');

const SoftProdutoSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin',    required: true },
  categoriaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'SoftCategoria', default: null },
  nome:         { type: String,  required: true, trim: true },
  descricao:    { type: String,  default: '' },
  codigoBarras: { type: String,  default: '' },
  preco:        { type: Number,  required: true, min: 0 },
  precoCusto:   { type: Number,  default: 0,     min: 0 },
  estoque:      { type: Number,  default: 0,     min: 0 },
  estoqueMin:   { type: Number,  default: 0,     min: 0 },
  unidade:      { type: String,  default: 'un',  enum: ['un','kg','g','l','ml','cx','pc','m'] },
  imagens:      { type: [String], default: [],   validate: v => v.length <= 10 },
  ativo:        { type: Boolean, default: true },
  vendaOnline:  { type: Boolean, default: true },
}, { timestamps: true });

SoftProdutoSchema.index({ adminId: 1, ativo: 1 });
SoftProdutoSchema.index({ adminId: 1, categoriaId: 1 });
SoftProdutoSchema.index({ adminId: 1, codigoBarras: 1 }, { sparse: true });
SoftProdutoSchema.index({ adminId: 1, nome: 'text' }); // busca por texto

module.exports = mongoose.model('SoftProduto', SoftProdutoSchema);
