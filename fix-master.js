const mongoose = require('/workspaces/rebeca-sistema-br/node_modules/mongoose');
require('dotenv').config({ path: '/workspaces/rebeca-sistema-br/.env' });

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const db = mongoose.connection.db;
    const existing = await db.collection('adminmasters').findOne({ email: 'master@rebeca.com' });
    console.log('Master existente:', JSON.stringify(existing));
    
    await db.collection('adminmasters').updateOne(
        { email: 'master@rebeca.com' },
        { $set: { email: 'master@rebeca.com', senha: 'master123', nome: 'Master', ativo: true } },
        { upsert: true }
    );
    console.log('AdminMaster criado/atualizado com sucesso!');
    mongoose.disconnect();
}).catch(e => { console.error('Erro:', e.message); process.exit(1); });
