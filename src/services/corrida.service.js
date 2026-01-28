const { Corrida } = require('../models');

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

module.exports = CorridaService;