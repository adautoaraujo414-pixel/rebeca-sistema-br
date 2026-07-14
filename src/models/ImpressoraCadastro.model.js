// ===================================================================
// Cadastro isolado: telefone (WhatsApp) -> adminId -> impressora
// Nao depende de nenhum outro model/modulo do sistema.
// Serve pra qualquer cliente, nao so pra um caso especifico.
// ===================================================================

const mongoose = require('mongoose');

const ImpressoraCadastroSchema = new mongoose.Schema({
  telefone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  adminId: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  nomeCliente: {
    type: String,
    trim: true,
    default: '',
  },
  ativo: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  collection: 'impressoras_cadastro', // collection isolada, nome proprio
});

module.exports = mongoose.model('ImpressoraCadastro', ImpressoraCadastroSchema);
