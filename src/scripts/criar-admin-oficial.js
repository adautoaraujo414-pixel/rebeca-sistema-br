// criar-admin-oficial.js
// Cria o AdminAgenda oficial da Rebeca se não existir, ou atualiza se existir.
// Uso: node src/scripts/criar-admin-oficial.js

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const { AdminAgenda } = require('../models/AgendaServico');

const EMAIL_OFICIAL = 'adautoaraujo410@gmail.com';
const SENHA_ENV     = process.env.REBECA_ADMIN_SENHA || '';

async function main() {
  if (!SENHA_ENV) {
    console.error('❌ Defina REBECA_ADMIN_SENHA no .env antes de rodar este script');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB conectado');

  const hash = await bcrypt.hash(SENHA_ENV, 12);

  const result = await AdminAgenda.findOneAndUpdate(
    { email: EMAIL_OFICIAL },
    {
      $set: {
        nome           : 'Rebeca Oficial',
        email          : EMAIL_OFICIAL,
        senha          : hash,
        nomeNegocio    : 'Rebeca Agenda',
        plano          : 'espaco_digital_ia',
        ativo          : true,
        isRebecaOficial: true
      }
    },
    { upsert: true, new: true }
  ).select('_id nome email isRebecaOficial plano');

  console.log('✅ Admin oficial criado/atualizado:');
  console.log(`   ID:      ${result._id}`);
  console.log(`   Nome:    ${result.nome}`);
  console.log(`   Email:   ${result.email}`);
  console.log(`   Oficial: ${result.isRebecaOficial}`);
  console.log(`   Plano:   ${result.plano}`);

  await mongoose.disconnect();
}

main().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
