node -e "
const fs = require('fs');
const path = '/workspaces/rebeca-sistema-br/src/services/agenda-modo-dono.service.js';
let c = fs.readFileSync(path, 'utf8');

// Remover a linha redundante dentro da funcao
const old = \"    const InstanciaWhatsapp  = require('../models').InstanciaWhatsapp;\n\";
if (c.includes(old)) {
  c = c.replace(old, '');
  fs.writeFileSync(path, c, 'utf8');
  console.log('✅ Linha redundante removida');
} else {
  console.log('Linha atual:', JSON.stringify(c.split('\n')[1497]));
}
"

node --check /workspaces/rebeca-sistema-br/src/services/agenda-modo-dono.service.js && echo "✅ OK"

git -C /workspaces/rebeca-sistema-br add -A
git -C /workspaces/rebeca-sistema-br commit -m "fix: remove require InstanciaWhatsapp redundante dentro de rodarLembretesClientes"
git -C /workspaces/rebeca-sistema-br push origin main
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
