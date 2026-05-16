/**
 * soft-catalogo-config.model.js
 * Configurações do catálogo público de cada admin.
 * 1 documento por admin (upsert).
 */
const mongoose = require('mongoose');

const SoftCatalogoConfigSchema = new mongoose.Schema({
  adminId:        { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  ativo:          { type: Boolean, default: true },
  aceitaPedido:   { type: Boolean, default: false },
  whatsappPedido: { type: String,  default: '' },
  banner:         { type: String,  default: '' },
  mensagemBoas:   { type: String,  default: 'Bem-vindo ao nosso catálogo!' },
  corFundo:       { type: String,  default: '#ffffff' },
  mostrarPreco:   { type: Boolean, default: true },
  mostrarEstoque: { type: Boolean, default: false },
}, { timestamps: true });

SoftCatalogoConfigSchema.index({ adminId: 1 }, { unique: true });

module.exports = mongoose.model('SoftCatalogoConfig', SoftCatalogoConfigSchema);
