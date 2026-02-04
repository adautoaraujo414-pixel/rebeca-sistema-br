
const mongoose = require('mongoose');
require('./config/database');
setTimeout(async () => {
    const { Corrida } = require('./models');
    const limite = new Date(Date.now() - 15 * 60 * 1000);
    const result = await Corrida.updateMany(
        { status: { $in: ['pendente', 'aceita'] }, createdAt: { $lt: limite } },
        { $set: { status: 'cancelada', motivoCancelamento: 'Expirada automaticamente' } }
    );
    console.log('Corridas limpas:', result.modifiedCount);
    process.exit(0);
}, 3000);
