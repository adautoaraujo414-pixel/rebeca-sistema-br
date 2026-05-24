// Rodar: node scripts/upgrade-plano-todos.js
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB conectado');

  const { AdminAgenda } = require(__dirname + '/../src/models/AgendaServico');
  
  // Atualizar todos que ainda estão no plano antigo
  const r = await AdminAgenda.updateMany(
    { plano: { $in: ['espaco_digital', null, undefined, ''] } },
    { $set: { plano: 'espaco_digital_ia' } }
  );
  console.log(`✅ ${r.modifiedCount} admin(s) atualizados para espaco_digital_ia`);
  
  // Listar todos para confirmar
  const todos = await AdminAgenda.find({}, 'nome email plano').lean();
  todos.forEach(a => console.log(`  ${a.email} — ${a.plano}`));
  
  await mongoose.disconnect();
  console.log('✅ Pronto!');
}

main().catch(console.error);
