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
  modoLocal:        { type: Boolean, default: false }, // true = usa servidor local
  nome:             { type: String, default: 'Cozinha' },
  ativo:            { type: Boolean, default: true },
  criadoEm:        { type: Date, default: Date.now }
});

module.exports = {
  ClienteCozinha:    mongoose.model('ClienteCozinha', clienteCozinhaSchema),
  ImpressoraCozinha: mongoose.model('ImpressoraCozinha', impressoraCozinhaSchema)
};
