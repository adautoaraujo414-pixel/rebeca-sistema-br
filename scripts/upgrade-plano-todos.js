
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI não definido'); process.exit(1); }
mongoose.connect(uri).then(async () => {
  const { AdminAgenda } = require('./src/models/AgendaServico');
  const r = await AdminAgenda.updateMany(
    { plano: { $in: ['espaco_digital', null, undefined, ''] } },
    { $set: { plano: 'espaco_digital_ia' } }
  );
  console.log('✅ Admins atualizados:', r.modifiedCount);
  const todos = await AdminAgenda.find({}, 'nome email plano').lean();
  todos.forEach(a => console.log(' ', a.email, '—', a.plano));
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
