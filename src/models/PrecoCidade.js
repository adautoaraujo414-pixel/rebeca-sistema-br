const mongoose = require('mongoose');

const PrecoCidadeSchema = new mongoose.Schema({
    adminId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    cidadeOrigem:   { type: String, required: true },
    cidadeDestino:  { type: String, required: true },
    precoFixo:      { type: Number, required: true },
    nome:           { type: String },
    ativo:          { type: Boolean, default: true },
}, { timestamps: true });

PrecoCidadeSchema.index({ adminId: 1, cidadeOrigem: 1, cidadeDestino: 1 });

module.exports = mongoose.model('PrecoCidade', PrecoCidadeSchema);
