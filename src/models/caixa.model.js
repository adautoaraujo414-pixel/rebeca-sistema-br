const mongoose = require('mongoose');

const CaixaSchema = new mongoose.Schema({
    adminId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    numeroCaixa:     { type: Number, default: 1, min: 1, max: 3 },
    operador:        { type: String, required: true, trim: true },
    dataAbertura:    { type: Date, default: Date.now },
    valorAbertura:   { type: Number, default: 0 },
    dataFechamento:  { type: Date, default: null },
    valorFechamento: { type: Number, default: null },
    status:          { type: String, enum: ['aberto','fechado'], default: 'aberto' },
    totalVendas:     { type: Number, default: 0 },
    totalDinheiro:   { type: Number, default: 0 },
    totalCartao:     { type: Number, default: 0 },
    totalPix:        { type: Number, default: 0 },
    observacoes:     { type: String, default: '' },
    relatorioEnviado:{ type: Boolean, default: false },
}, { timestamps: true });

CaixaSchema.index({ adminId: 1, status: 1 });
CaixaSchema.index({ adminId: 1, numeroCaixa: 1, status: 1 });

module.exports = mongoose.model('Caixa', CaixaSchema);
