'use strict';
const mongoose = require('mongoose');

// Clientes cadastrados para receber pedidos na cozinha
const clienteCozinhaSchema = new mongoose.Schema({
  telefone:    { type: String, required: true },
  nome:        { type: String, default: 'Cliente' },
  mesa:        { type: String, default: '' },
  adminId:     { type: String, required: true }, // dono do restaurante
  ativo:       { type: Boolean, default: true },
  criadoEm:   { type: Date, default: Date.now }
});

// Config da impressora por admin
const impressoraCozinhaSchema = new mongoose.Schema({
  adminId:          { type: String, required: true, unique: true },
  // Endereço de entrada (servidor local PC da cozinha ou IP direto da impressora)
  ip:               { type: String, required: true }, // IP do PC local (porta 3333) ou IP da impressora
  porta:            { type: Number, default: 9100 },  // 3333 = servidor local, 9100 = direto
  // Se for modo servidor local, IP real da impressora fica aqui
  ipImpressora:     { type: String, default: '' },
  portaImpressora:  { type: Number, default: 9100 },
  nomeImpressora:   { type: String, default: '' },
  modoLocal:        { type: Boolean, default: false }, // true = usa servidor local
  nome:             { type: String, default: 'Cozinha' },
  ativo:            { type: Boolean, default: true },
  criadoEm:        { type: Date, default: Date.now }
});



// ── CONTADOR GLOBAL DE PEDIDOS ────────────────────────────────────
const contadorPedidoSchema = new mongoose.Schema({
  adminId:  { type: String, required: true },
  data:     { type: String, required: true },
  numero:   { type: Number, default: 0 }
});
contadorPedidoSchema.index({ adminId: 1, data: 1 }, { unique: true });
const ContadorPedido = mongoose.models.ContadorPedido || mongoose.model('ContadorPedido', contadorPedidoSchema);

// ── ADMIN COZINHA (independente do AdminAgenda) ──────────────────
const adminCozinhaSchema = new mongoose.Schema({
  nomeNegocio: { type: String, required: true },
  usuario:     { type: String, required: true, unique: true },
  senha:       { type: String, required: true },
  ativo:       { type: Boolean, default: true },
  criadoEm:   { type: Date, default: Date.now }
});
const AdminCozinha = mongoose.models.AdminCozinha || mongoose.model('AdminCozinha', adminCozinhaSchema);

const JobImpressaoSchema = new mongoose.Schema({
  adminId:   { type: String, required: true }, // String para compatibilidade com polling
  texto:     { type: String, required: true },
  mesa:      { type: String, default: '' },
  telefone:  { type: String, default: '' },
  status:    { type: String, default: 'pendente' }, // pendente | impresso | erro
  instancia: { type: String, default: 'cozinha' }, // cozinha | caixa — separa filas por PC
  criadoEm:  { type: Date, default: Date.now },
  impresso_em: { type: Date }
});
JobImpressaoSchema.index({ adminId: 1, status: 1, criadoEm: 1 });
const JobImpressao = mongoose.model('JobImpressao', JobImpressaoSchema);

module.exports = {
  AdminCozinha,
  ContadorPedido,
  JobImpressao,
  ClienteCozinha:    mongoose.model('ClienteCozinha', clienteCozinhaSchema),
  ImpressoraCozinha: mongoose.model('ImpressoraCozinha', impressoraCozinhaSchema)
};
