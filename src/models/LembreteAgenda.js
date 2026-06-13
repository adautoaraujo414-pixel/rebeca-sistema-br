const mongoose = require('mongoose');

const LembreteSchema = new mongoose.Schema({
  adminId:      { type: String, required: true, index: true },
  texto:        { type: String, required: true },
  dataEvento:   { type: Date,   required: false }, // null se recorrente sem próxima data calculada
  antecedencia: { type: Number, default: 30 }, // minutos antes
  enviado:      { type: Boolean, default: false },
  dataEnvio:    { type: Date },
  // Recorrência
  recorrente:   { type: Boolean, default: false },
  recorrencia:  {
    tipo:       { type: String, enum: ['diario','semanal','mensal'], default: null },
    diaSemana:  { type: String, default: null }, // segunda, terça, quarta, quinta, sexta, sábado, domingo
    diaMes:     { type: Number, default: null }, // 1-31
    hora:       { type: Number, default: null }, // hora do dia (0-23)
    minuto:     { type: Number, default: 0 }
  },
  origem:       { type: String, enum: ['painel','whatsapp'], default: 'painel' }
}, { timestamps: true });

module.exports = mongoose.model('LembreteAgenda', LembreteSchema);
