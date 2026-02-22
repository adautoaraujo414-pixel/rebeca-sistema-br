const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
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
