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
  adminId:     { type: String, required: true, unique: true },
  ip:          { type: String, required: true }, // ex: 192.168.1.100
  porta:       { type: Number, default: 9100 },  // porta padrão térmica
  nome:        { type: String, default: 'Cozinha' },
  ativo:       { type: Boolean, default: true },
  criadoEm:   { type: Date, default: Date.now }
});

module.exports = {
  ClienteCozinha:    mongoose.model('ClienteCozinha', clienteCozinhaSchema),
  ImpressoraCozinha: mongoose.model('ImpressoraCozinha', impressoraCozinhaSchema)
};
