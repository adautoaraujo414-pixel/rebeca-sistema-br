const mongoose = require('mongoose');

const LembreteSchema = new mongoose.Schema({
  adminId:      { type: String, required: true, index: true },
  texto:        { type: String, required: true },
  dataEvento:   { type: Date,   required: true },
  antecedencia: { type: Number, default: 30 }, // minutos antes
  enviado:      { type: Boolean, default: false },
  dataEnvio:    { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('LembreteAgenda', LembreteSchema);
