
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const { AdminAgenda } = require('./src/models/AgendaServico');
  const admins = await AdminAgenda.find({}, 'nome email telefone whatsapp whatsappOficial').lean();
  admins.forEach(a => console.log(JSON.stringify({
    email: a.email,
    telefone: a.telefone,
    whatsapp: a.whatsapp,
    whatsappOficial: a.whatsappOficial
  })));
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
