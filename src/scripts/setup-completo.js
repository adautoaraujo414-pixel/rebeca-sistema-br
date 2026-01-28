const mongoose = require('mongoose');
require('../config/database');

const { AdminMaster, Admin, PlanoAdmin, ConfigMaster, Motorista, Cliente, Corrida, LogSistema } = require('../models');

async function setupCompleto() {
    console.log('🚀 INICIANDO SETUP COMPLETO DO SISTEMA...\n');
    
    // Aguardar conexão
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ========== 1. VERIFICAR CONEXÃO MONGODB ==========
    console.log('1️⃣ Verificando conexão MongoDB...');
    try {
        const estado = mongoose.connection.readyState;
        if (estado === 1) {
            console.log('   ✅ MongoDB CONECTADO!\n');
        } else {
            console.log('   ❌ MongoDB DESCONECTADO! Estado:', estado);
            process.exit(1);
        }
    } catch (e) {
        console.log('   ❌ Erro:', e.message);
        process.exit(1);
    }

    // ========== 2. LIMPAR DADOS DEMO ==========
    console.log('2️⃣ Limpando dados demo antigos...');
    try {
        await AdminMaster.deleteMany({ email: 'master@ubmax.com' });
        await AdminMaster.deleteMany({ email: 'admin@demo.com' });
        console.log('   ✅ Dados demo removidos!\n');
    } catch (e) {
        console.log('   ⚠️ Aviso:', e.message, '\n');
    }

    // ========== 3. CRIAR SEU LOGIN MASTER ==========
    console.log('3️⃣ Criando seu login master...');
    try {
        let master = await AdminMaster.findOne({ email: 'adautoaraujo414@gmail.com' });
        if (master) {
            master.senha = 'Ci851213@';
            master.nome = 'Adauto Araujo';
            master.ativo = true;
            await master.save();
            console.log('   ✅ Login atualizado!');
        } else {
            master = await AdminMaster.create({
                nome: 'Adauto Araujo',
                email: 'adautoaraujo414@gmail.com',
                senha: 'Ci851213@',
                telefone: '11999999999',
                ativo: true,
                permissoes: {
                    gerenciarAdmins: true,
                    gerenciarEmpresas: true,
                    verLogs: true,
                    suporte: true,
                    configuracoes: true
                }
            });
            console.log('   ✅ Login criado!');
        }
        console.log('   📧 Email: adautoaraujo414@gmail.com');
        console.log('   🔑 Senha: Ci851213@\n');
    } catch (e) {
        console.log('   ❌ Erro:', e.message, '\n');
    }

    // ========== 4. CRIAR PLANOS PADRÃO ==========
    console.log('4️⃣ Verificando planos...');
    try {
        const planosExistem = await PlanoAdmin.countDocuments();
        if (planosExistem === 0) {
            await PlanoAdmin.create([
                { nome: 'Starter', descricao: 'Ideal para começar', preco: 99.90, limiteMotoristas: 5, limiteCorridas: 500, recursos: ['Painel básico', 'Suporte email'] },
                { nome: 'Profissional', descricao: 'Para frotas médias', preco: 199.90, limiteMotoristas: 20, limiteCorridas: 2000, recursos: ['Painel completo', 'Relatórios', 'Suporte prioritário'] },
                { nome: 'Enterprise', descricao: 'Para grandes operações', preco: 399.90, limiteMotoristas: 100, limiteCorridas: 10000, recursos: ['Tudo ilimitado', 'API acesso', 'Suporte 24h', 'Customização'] }
            ]);
            console.log('   ✅ Planos criados!\n');
        } else {
            console.log('   ✅ Planos já existem:', planosExistem, '\n');
        }
    } catch (e) {
        console.log('   ⚠️ Aviso:', e.message, '\n');
    }

    // ========== 5. CRIAR CONFIG MASTER ==========
    console.log('5️⃣ Verificando configurações...');
    try {
        let config = await ConfigMaster.findOne();
        if (!config) {
            config = await ConfigMaster.create({
                comissaoPlataforma: 10,
                diasTolerancia: 5,
                mensagemBoasVindas: 'Bem-vindo ao Rebeca Sistemas!'
            });
            console.log('   ✅ Configurações criadas!\n');
        } else {
            console.log('   ✅ Configurações já existem!\n');
        }
    } catch (e) {
        console.log('   ⚠️ Aviso:', e.message, '\n');
    }

    // ========== 6. ESTATÍSTICAS DO BANCO ==========
    console.log('6️⃣ Estatísticas do banco de dados:');
    try {
        const stats = {
            adminsMaster: await AdminMaster.countDocuments(),
            admins: await Admin.countDocuments(),
            motoristas: await Motorista.countDocuments(),
            clientes: await Cliente.countDocuments(),
            corridas: await Corrida.countDocuments(),
            planos: await PlanoAdmin.countDocuments(),
            logs: await LogSistema.countDocuments()
        };
        console.log('   📊 Admins Master:', stats.adminsMaster);
        console.log('   📊 Admins:', stats.admins);
        console.log('   📊 Motoristas:', stats.motoristas);
        console.log('   📊 Clientes:', stats.clientes);
        console.log('   📊 Corridas:', stats.corridas);
        console.log('   📊 Planos:', stats.planos);
        console.log('   📊 Logs:', stats.logs);
    } catch (e) {
        console.log('   ⚠️ Erro ao buscar stats:', e.message);
    }

    // ========== 7. REGISTRAR LOG ==========
    console.log('\n7️⃣ Registrando log de setup...');
    try {
        await LogSistema.create({
            tipo: 'acao',
            usuario: 'Sistema',
            tipoUsuario: 'master',
            acao: 'Setup completo executado',
            detalhes: { data: new Date() }
        });
        console.log('   ✅ Log registrado!\n');
    } catch (e) {
        console.log('   ⚠️ Aviso:', e.message, '\n');
    }

    console.log('═══════════════════════════════════════════════');
    console.log('✅ SETUP COMPLETO FINALIZADO!');
    console.log('═══════════════════════════════════════════════');
    console.log('\n🔐 SUAS CREDENCIAIS:');
    console.log('   Email: adautoaraujo414@gmail.com');
    console.log('   Senha: Ci851213@');
    console.log('\n🌐 ACESSE:');
    console.log('   https://rebeca-sistema-br.onrender.com/admin-master');
    console.log('═══════════════════════════════════════════════\n');

    process.exit(0);
}

setupCompleto().catch(e => {
    console.error('❌ ERRO FATAL:', e);
    process.exit(1);
});
