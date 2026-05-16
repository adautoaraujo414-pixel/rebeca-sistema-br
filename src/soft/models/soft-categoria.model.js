/**
 * soft-categoria.model.js
 * Categorias de produtos do Rebeca Soft (por admin/tenant).
 */
const mongoose = require('mongoose');

const SoftCategoriaSchema = new mongoose.Schema({
  adminId:  { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  nome:     { type: String, required: true, trim: true },
  ordem:    { type: Number, default: 0 },
  ativa:    { type: Boolean, default: true },
}, { timestamps: true });

SoftCategoriaSchema.index({ adminId: 1, ativa: 1 });
SoftCategoriaSchema.index({ adminId: 1, nome: 1 }, { unique: true });

module.exports = mongoose.model('SoftCategoria', SoftCategoriaSchema);
