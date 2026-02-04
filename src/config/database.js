const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ubmax:Ubmax2024@cluster0.mppdbhc.mongodb.net/ubmax?retryWrites=true&w=majority';
let isConnected = false;
const conectarDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGODB_URI);
        isConnected = true;
        console.log('✅ MongoDB conectado!');
        // Dropar indexes unicos antigos (agora e compound com adminId)
        try { await mongoose.connection.collection('motoristas').dropIndex('whatsapp_1'); console.log('Index whatsapp_1 removido'); } catch(e) {}
        try { await mongoose.connection.collection('clientes').dropIndex('telefone_1'); console.log('Index telefone_1 removido'); } catch(e) {}
    } catch (error) {
        console.error('❌ Erro MongoDB:', error.message);
    }
};
conectarDB();
module.exports = { conectarDB, mongoose };
