const mongoose = require('mongoose');

// Salva pares de erro→correção para alimentar o cérebro
const AprendizadoSchema = new mongoose.Schema({
  adminId:          { type: mongoose.Schema.Types.ObjectId, required: true },
  mensagem_original: { type: String, required: true },   // o que o dono disse
  intencao_errada:  { type: String },                    // o que Rebeca entendeu errado
  intencao_correta: { type: String, required: true },    // o que era certo
  descricao_erro:   { type: String },                    // ex: "confundiu conta a pagar com lembrete"
  confirmado:       { type: Boolean, default: false },   // dono confirmou que foi corrigido
  vezes_visto:      { type: Number, default: 1 },        // reforço — quanto mais visto, mais peso
  criadoEm:         { type: Date, default: Date.now },
  ultimoReforco:    { type: Date, default: Date.now },
});

AprendizadoSchema.index({ adminId: 1, intencao_correta: 1 });
AprendizadoSchema.index({ adminId: 1, criadoEm: -1 });

module.exports = mongoose.model('AprendizadoRebeca', AprendizadoSchema);
