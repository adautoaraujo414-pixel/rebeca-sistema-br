const { Corrida } = require('../models');
const MotoristaService = require('./motorista.service');

const CorridaService = {
    // Listar (filtrado por admin)
    async listar(adminId, filtros = {}) {
        const query = adminId ? { adminId } : {};
        if (filtros.status) query.status = filtros.status;
        if (filtros.motoristaId) query.motoristaId = filtros.motoristaId;
        if (filtros.clienteId) query.clienteId = filtros.clienteId;
        return await Corrida.find(query).sort({ createdAt: -1 }).limit(100);
    },

    buscarPorId(id) {
        return Corrida.findById(id);
    },

    criar(dados) {
        const corrida = new Corrida(dados);
        return corrida.save();
    },

    atualizar(id, dados) {
        return Corrida.findByIdAndUpdate(id, dados, { new: true });
    },

    atualizarStatus(id, status) {
        return Corrida.findByIdAndUpdate(id, { status }, { new: true });
    },

    atribuirMotorista(corridaId, motoristaId, motoristaNome) {
        return Corrida.findByIdAndUpdate(corridaId, {
            motoristaId,
            motoristaNome,
            status: 'aceita'
        }, { new: true });
    },

    listarPorCliente(clienteId) {
        return Corrida.find({ clienteId }).sort({ createdAt: -1 }).limit(10);
    },

    buscarCorridaAtivaMotorista(motoristaId) {
        return Corrida.findOne({ 
            motoristaId, 
            status: { $in: ['aceita', 'em_andamento'] } 
        });
    },

    listarPorMotorista(motoristaId) {
        return Corrida.find({ motoristaId }).sort({ createdAt: -1 }).limit(10);
    },

    async estatisticas(adminId) {
        const query = adminId ? { adminId } : {};
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        
        const total = await Corrida.countDocuments(query);
        const hoje_count = await Corrida.countDocuments({ ...query, createdAt: { $gte: hoje } });
        const pendentes = await Corrida.countDocuments({ ...query, status: 'pendente' });
        const emAndamento = await Corrida.countDocuments({ ...query, status: { $in: ['aceita', 'em_andamento'] } });
        const finalizadas = await Corrida.countDocuments({ ...query, status: 'finalizada' });
        const canceladas = await Corrida.countDocuments({ ...query, status: 'cancelada' });
        
        // Faturamento
        const corridasHoje = await Corrida.find({ ...query, status: 'finalizada', createdAt: { $gte: hoje } });
        const faturamentoHoje = corridasHoje.reduce((s, c) => s + (c.precoFinal || c.precoEstimado || 0), 0);
        
        return { total, hoje: hoje_count, pendentes, emAndamento, finalizadas, canceladas, faturamentoHoje };
    }
};

    // Finalizar corrida e liberar motorista
    async finalizarCorrida(corridaId, precoFinal = null) {
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };
        
        // Atualizar corrida
        corrida.status = 'finalizada';
        corrida.finalizadaEm = new Date();
        if (precoFinal) corrida.precoFinal = precoFinal;
        await corrida.save();
        
        // LIBERAR MOTORISTA - volta para disponivel
        if (corrida.motoristaId) {
            await MotoristaService.atualizarStatus(corrida.motoristaId, 'disponivel');
            console.log('[CORRIDA] Motorista', corrida.motoristaId, 'liberado - Status: disponivel');
        }
        
        return { sucesso: true, corrida };
    },

    // Cancelar corrida e liberar motorista
    async cancelarCorrida(corridaId, motivo = null) {
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };
        
        corrida.status = 'cancelada';
        corrida.canceladaEm = new Date();
        corrida.motivoCancelamento = motivo;
        await corrida.save();
        
        // LIBERAR MOTORISTA se tinha um atribuido
        if (corrida.motoristaId) {
            await MotoristaService.atualizarStatus(corrida.motoristaId, 'disponivel');
            console.log('[CORRIDA] Motorista', corrida.motoristaId, 'liberado por cancelamento');
        }
        
        return { sucesso: true, corrida };
    },

    // Iniciar corrida (motorista chegou e começou)
    async iniciarCorrida(corridaId) {
        const corrida = await Corrida.findByIdAndUpdate(corridaId, {
            status: 'em_andamento',
            iniciadaEm: new Date()
        }, { new: true });
        return { sucesso: true, corrida };
    }
};

module.exports = CorridaService;