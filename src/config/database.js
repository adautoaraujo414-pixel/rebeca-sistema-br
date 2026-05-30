const mongoose = require('mongoose');
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
    });
    console.log(`✅ MongoDB conectado! Host: ${conn.connection.host}`);
    // Migração: dropar índice antigo adminId_1 do ContadorPedido
    try {
      const col = conn.connection.db.collection('contadorpedidos');
      const idxs = await col.indexes();
      const old = idxs.find(i => i.name === 'adminId_1' && !i.key.data);
      if (old) { await col.dropIndex('adminId_1'); console.log('[DB] ContadorPedido: índice adminId_1 dropado ✅'); }
      else { console.log('[DB] ContadorPedido: índice OK, nada a dropar'); }
    } catch(_ed) { console.log('[DB] Drop índice skip:', _ed.message); }
  } catch (error) {
    console.error(`❌ Erro MongoDB: ${error.message}`);
    // Não usar process.exit — deixar servidor subir mesmo sem MongoDB
    // para o Render detectar a porta
  }
};
connectDB();
module.exports = connectDB;
