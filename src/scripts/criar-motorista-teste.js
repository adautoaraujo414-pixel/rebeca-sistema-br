const mongoose = require('mongoose');
require('../config/database');
const { Motorista } = require('../models');

async function criar() {
    await new Promise(r => setTimeout(r, 2000));
    
    const motorista = await Motorista.create({
        nomeCompleto: 'Carlos Motorista Teste',
        whatsapp: '11999999999',
        cpf: '123.456.789-00',
        veiculo: { modelo: 'Fiat Uno', cor: 'Branco', placa: 'ABC-1234', ano: 2020 },
        status: 'offline',
        ativo: true,
        senha: '123456',
        token: 'MOT_TESTE_' + Date.now()
    });
    
    console.log('✅ Motorista criado!');
    console.log('📱 WhatsApp:', motorista.whatsapp);
    console.log('🔐 Senha: 123456');
    process.exit(0);
}

criar().catch(e => { console.error(e); process.exit(1); });
