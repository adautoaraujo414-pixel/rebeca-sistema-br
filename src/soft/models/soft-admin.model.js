/**
 * soft-admin.model.js
 * Dono/admin do negócio no módulo Rebeca Soft.
 * ISOLADO — não importa nenhum model de outro módulo.
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const RefreshTokenSchema = new mongoose.Schema({
  tokenHash:  { type: String, required: true },
  criadoEm:   { type: Date,   default: Date.now },
  expiresAt:  { type: Date,   required: true },
  ip:         { type: String },
}, { _id: false });

const SoftAdminSchema = new mongoose.Schema({
  nome:           { type: String,  required: true, trim: true },
  email:          { type: String,  required: true, trim: true, lowercase: true },
  senhaHash:      { type: String,  required: true },
  slug:           { type: String,  required: true, trim: true, lowercase: true },
  nomeLoja:       { type: String,  required: true, trim: true },
  telefone:       { type: String,  default: '' },
  logo:           { type: String,  default: '' },
  corPrimaria:    { type: String,  default: '#6366f1' },
  plano:          { type: String,  enum: ['starter','pro','premium'], default: 'starter' },
  ativo:          { type: Boolean, default: true },
  refreshTokens:  { type: [RefreshTokenSchema], default: [] },
  tentativasLogin:{ type: Number,  default: 0 },
  bloqueadoAte:   { type: Date,    default: null },
  ultimoLogin:    { type: Date,    default: null },
}, { timestamps: true });

// Índices
SoftAdminSchema.index({ email: 1 },  { unique: true });
SoftAdminSchema.index({ slug: 1 },   { unique: true });
SoftAdminSchema.index({ ativo: 1 });

// Limitar array de refreshTokens a 5 entradas
SoftAdminSchema.pre('save', function(next) {
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }
  next();
});

// Método de verificação de senha
SoftAdminSchema.methods.verificarSenha = async function(senhaPlana) {
  return bcrypt.compare(senhaPlana, this.senhaHash);
};

module.exports = mongoose.model('SoftAdmin', SoftAdminSchema);
