/**
 * soft-fornecedor.model.js
 */
const mongoose = require('mongoose');

const SoftFornecedorSchema = new mongoose.Schema({
  adminId:  { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  nome:     { type: String, required: true, trim: true },
  telefone: { type: String, default: '' },
  email:    { type: String, default: '' },
  cnpj:     { type: String, default: '' },
  ativo:    { type: Boolean, default: true },
}, { timestamps: true });

SoftFornecedorSchema.index({ adminId: 1, ativo: 1 });

module.exports = mongoose.model('SoftFornecedor', SoftFornecedorSchema);
