const mongoose = require('mongoose');

const agendamentoSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    telefone: { type: String, required: true },
    nomeCliente: { type: String },
    origem: { type: String, required: true },
    destino: { type: String },
    dataHora: { type: Date, required: true },
    status: { type: String, enum: ['pendente', 'lembrete_enviado', 'despachado', 'cancelado'], default: 'pendente' },
    instanciaId: { type: mongoose.Schema.Types.ObjectId },
    corridaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Corrida' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Agendamento', agendamentoSchema);
