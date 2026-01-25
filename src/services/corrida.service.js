const { Corrida, Motorista, Cliente } = require('../models');

const CorridaService = {
    // Listar todas
    async listar(filtros = {}) {
        const query = {};
        if (filtros.status) query.status = filtros.status;
        if (filtros.motoristaId) query.motoristaId = filtros.motoristaId;
        if (filtros.clienteTelefone) query.clienteTelefone = filtros.clienteTelefone;
        return await Corrida.find(query).sort({ createdAt: -1 }).limit(100);
    },

    // Buscar por ID
    async buscarPorId(id) {
        return await Corrida.findById(id);
    },

    // Criar corrida
    async criar(dados) {
        const corrida = new Corrida({
            ...dados,
            status: 'pendente',
            dataSolicitacao: new Date()
        });
        return await corrida.save();
    },

    // Atualizar corrida
    async atualizar(id, dados) {
        return await Corrida.findByIdAndUpdate(id, dados, { new: true });
    },

    // Aceitar corrida
    async aceitar(corridaId, motoristaId) {
        const motorista = await Motorista.findById(motoristaId);
        if (!motorista) return { sucesso: false, erro: 'Motorista não encontrado' };

        const corrida = await Corrida.findByIdAndUpdate(corridaId, {
            motoristaId,
            motoristaNome: motorista.nomeCompleto,
            status: 'aceita',
            dataAceite: new Date()
        }, { new: true });

        await Motorista.findByIdAndUpdate(motoristaId, { status: 'em_corrida' });
        return { sucesso: true, corrida };
    },

    // Iniciar corrida
    async iniciar(corridaId) {
        return await Corrida.findByIdAndUpdate(corridaId, {
            status: 'em_andamento',
            dataInicio: new Date()
        }, { new: true });
    },

    // Finalizar corrida
    async finalizar(corridaId, precoFinal) {
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };

        const corridaAtualizada = await Corrida.findByIdAndUpdate(corridaId, {
            status: 'finalizada',
            precoFinal: precoFinal || corrida.precoEstimado,
            dataFinalizacao: new Date()
        }, { new: true });

        if (corrida.motoristaId) {
            await Motorista.findByIdAndUpdate(corrida.motoristaId, { 
                status: 'disponivel',
                $inc: { corridasRealizadas: 1 }
            });
        }

        return { sucesso: true, corrida: corridaAtualizada };
    },

    // Cancelar corrida
    async cancelar(corridaId, motivo) {
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };

        const corridaAtualizada = await Corrida.findByIdAndUpdate(corridaId, {
            status: 'cancelada',
            motivoCancelamento: motivo,
            dataFinalizacao: new Date()
        }, { new: true });

        if (corrida.motoristaId) {
            await Motorista.findByIdAndUpdate(corrida.motoristaId, { status: 'disponivel' });
        }

        return { sucesso: true, corrida: corridaAtualizada };
    },

    // Avaliar corrida
    async avaliar(corridaId, avaliacao) {
        return await Corrida.findByIdAndUpdate(corridaId, { avaliacao }, { new: true });
    },

    // Buscar pendentes
    async listarPendentes() {
        return await Corrida.find({ status: 'pendente' }).sort({ createdAt: 1 });
    },

    // Buscar por motorista
    async listarPorMotorista(motoristaId) {
        return await Corrida.find({ motoristaId }).sort({ createdAt: -1 }).limit(50);
    },

    // Buscar por cliente
    async listarPorCliente(telefone) {
        return await Corrida.find({ clienteTelefone: telefone }).sort({ createdAt: -1 }).limit(20);
    },

    // Corrida ativa do motorista
    async corridaAtivaMotorista(motoristaId) {
        return await Corrida.findOne({ 
            motoristaId, 
            status: { $in: ['aceita', 'em_andamento'] }
        });
    },

    // Estatísticas
    async estatisticas(periodo = 'hoje') {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const query = periodo === 'hoje' ? { createdAt: { $gte: hoje } } : {};
        
        const total = await Corrida.countDocuments(query);
        const finalizadas = await Corrida.countDocuments({ ...query, status: 'finalizada' });
        const canceladas = await Corrida.countDocuments({ ...query, status: 'cancelada' });
        const pendentes = await Corrida.countDocuments({ ...query, status: 'pendente' });
        
        const faturamento = await Corrida.aggregate([
            { $match: { ...query, status: 'finalizada' } },
            { $group: { _id: null, total: { $sum: '$precoFinal' } } }
        ]);

        return {
            total,
            finalizadas,
            canceladas,
            pendentes,
            faturamento: faturamento[0]?.total || 0
        };
    }
};

module.exports = CorridaService;
