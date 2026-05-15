// marcar-admin-oficial.js
// Marca o AdminAgenda como isRebecaOficial=true pelo email.
// Uso: node src/scripts/marcar-admin-oficial.js
// Não hardcoda senha. Não loga tokens. Roda uma vez e sai.

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { AdminAgenda } = require('../models/AgendaServico');

const EMAIL_OFICIAL = 'adautoaraujo410@gmail.com';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB conectado');

  // Desmarcar qualquer outro que esteja como oficial
  const desmarcados = await AdminAgenda.updateMany(
    { isRebecaOficial: true, email: { $ne: EMAIL_OFICIAL } },
    { $set: { isRebecaOficial: false } }
  );
  if (desmarcados.modifiedCount > 0) {
    console.log(`⚠️  ${desmarcados.modifiedCount} admin(s) desmarcado(s) como oficial`);
  }

  // Marcar o admin oficial
  const result = await AdminAgenda.findOneAndUpdate(
    { email: EMAIL_OFICIAL },
    { $set: { isRebecaOficial: true, ativo: true } },
    { new: true }
  ).select('_id nome email isRebecaOficial plano instanciaWhatsappId');

  if (!result) {
    console.error(`❌ Admin não encontrado com email: ${EMAIL_OFICIAL}`);
    console.log('Crie o admin pelo painel primeiro, depois rode este script.');
    process.exit(1);
  }

  console.log('✅ Admin oficial marcado:');
  console.log(`   ID:       ${result._id}`);
  console.log(`   Nome:     ${result.nome}`);
  console.log(`   Email:    ${result.email}`);
  console.log(`   Plano:    ${result.plano}`);
  console.log(`   Instância vinculada: ${result.instanciaWhatsappId || '(nenhuma ainda)'}`);
  console.log('');
  console.log('Próximo passo: conecte o WhatsApp pelo painel com este admin.');

  await mongoose.disconnect();
}

main().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
