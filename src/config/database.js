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
  } catch (error) {
    console.error(`❌ Erro MongoDB: ${error.message}`);
    // Não usar process.exit — deixar servidor subir mesmo sem MongoDB
    // para o Render detectar a porta
  }
};
connectDB();
module.exports = connectDB;
