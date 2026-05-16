/**
 * soft-cliente.model.js
 * Clientes cadastrados pelo admin — fiado, histórico, CRM básico.
 */
const mongoose = require('mongoose');

const SoftClienteSchema = new mongoose.Schema({
  adminId:   { type: mongoose.Schema.Types.ObjectId, ref: 'SoftAdmin', required: true },
  nome:      { type: String, required: true, trim: true },
  telefone:  { type: String, default: '' },
  email:     { type: String, default: '' },
  cpf:       { type: String, default: '' },
  endereco:  { type: String, default: '' },
  saldoFiado:{ type: Number, default: 0 },
  ativo:     { type: Boolean, default: true },
}, { timestamps: true });

SoftClienteSchema.index({ adminId: 1, ativo: 1 });
SoftClienteSchema.index({ adminId: 1, nome: 'text' });

module.exports = mongoose.model('SoftCliente', SoftClienteSchema);
