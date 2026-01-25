const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ubmax:Ubmax2024@cluster0.mppdbhc.mongodb.net/ubmax?retryWrites=true&w=majority';
let isConnected = false;
const conectarDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGODB_URI);
        isConnected = true;
        console.log('✅ MongoDB conectado!');
    } catch (error) {
        console.error('❌ Erro MongoDB:', error.message);
    }
};
conectarDB();
module.exports = { conectarDB, mongoose };
