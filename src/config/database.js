const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 15000,    // query max 15s — nao pendurar
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    });
    console.log(`✅ MongoDB conectado! Host: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Erro MongoDB: ${error.message}`);
    process.exit(1);
  }
};

// Conectar imediatamente ao ser importado
connectDB();

module.exports = connectDB;
