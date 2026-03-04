const { Corrida } = require('../models');
const MotoristaService = require('./motorista.service');

const CorridaService = {
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

    buscarCorridaAtivaMotorista(motoristaId) {
        const limiteRecente = new Date(Date.now() - 120 * 60 * 1000); // 2 horas
        return Corrida.findOne({ 
            motoristaId, 
            status: { $in: ['aceita', 'a_caminho', 'motorista_a_caminho', 'aguardando_cliente', 'em_andamento'] },
            createdAt: { $gte: limiteRecente }
        });
    },

    listarPorCliente(clienteId) {
        return Corrida.find({ clienteId }).sort({ createdAt: -1 }).limit(10);
    },

    listarPorMotorista(motoristaId) {
        return Corrida.find({ motoristaId }).sort({ createdAt: -1 }).limit(10);
    },

    async finalizarCorrida(corridaId, precoFinal = null) {
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };
        
        corrida.status = 'finalizada';
        corrida.finalizadaEm = new Date();
        
        // Liberar motorista para disponivel
        if (corrida.motoristaId) {
            try {
                const MotoristaService = require('./motorista.service');
                await MotoristaService.atualizarStatus(corrida.motoristaId, 'disponivel');
            } catch(e) { console.log('[CORRIDA] Erro liberar motorista:', e.message); }
        }

        // Reentrar na fila da central automaticamente após concluir
        if (corrida.motoristaId) {
            try {
                const DespachoService = require('./despacho.service');
                setTimeout(async () => {
                    await DespachoService.reentrarNaFilaAposCorrida(
                        corrida.motoristaId.toString(),
                        corrida.adminId?.toString()
                    );
                }, 2000); // 2s de delay para status disponivel já estar salvo
            } catch(e) { console.log('[CENTRAL] Erro reentrar fila após finalizar:', e.message); }
        }

        // Notificar próximo da fila de espera
        try {
            const RebecaService = require('./rebeca.service');
            setTimeout(async () => {
                await RebecaService.notificarFilaQuandoDisponivel(corrida.adminId, null);
            }, 3000); // Aguarda 3 segundos para motorista ficar disponível
        } catch(e) { console.log('[CORRIDA] Erro notificar fila:', e.message); }
        if (precoFinal) corrida.precoFinal = precoFinal;
        await corrida.save();

        console.log('[CORRIDA] Motorista liberado - Status: disponivel');
        return { sucesso: true, corrida };
    },

    async cancelarCorrida(corridaId, motivo = null) {
        if (!corridaId || corridaId === 'undefined') {
            throw new Error('ID da corrida nao fornecido');
        }
        const corrida = await Corrida.findById(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };
        
        corrida.status = 'cancelada';
        corrida.canceladaEm = new Date();
        corrida.motivoCancelamento = motivo;
        await corrida.save();

        if (corrida.motoristaId) {
            await MotoristaService.atualizarStatus(corrida.motoristaId, 'disponivel');
            // Reentrar na fila se o cancelamento não foi culpa do motorista
            const motivoMotorista = ['motorista_cancelou', 'motorista_nao_compareceu'];
            if (!motivoMotorista.includes(motivo)) {
                try {
                    const DespachoService = require('./despacho.service');
                    setTimeout(async () => {
                        await DespachoService.reentrarNaFilaAposCorrida(
                            corrida.motoristaId.toString(),
                            corrida.adminId?.toString()
                        );
                    }, 2000);
                } catch(e) { console.log('[CENTRAL] Erro reentrar fila após cancelar:', e.message); }
            }
        }

        return { sucesso: true, corrida };
    },

    async iniciarCorrida(corridaId) {
        return await Corrida.findByIdAndUpdate(corridaId, {
            status: 'em_andamento',
            iniciadaEm: new Date()
        }, { new: true });
    },

    async estatisticas(adminId) {
        const query = adminId ? { adminId } : {};
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        
        const total = await Corrida.countDocuments(query);
        const hoje_count = await Corrida.countDocuments({ ...query, createdAt: { $gte: hoje } });
        const pendentes = await Corrida.countDocuments({ ...query, status: 'pendente' });
        const emAndamento = await Corrida.countDocuments({ ...query, status: { $in: ['aceita', 'aguardando_cliente', 'em_andamento'] } });
        const finalizadas = await Corrida.countDocuments({ ...query, status: 'finalizada' });
        const canceladas = await Corrida.countDocuments({ ...query, status: 'cancelada' });
        
        const corridasHoje = await Corrida.find({ ...query, status: 'finalizada', createdAt: { $gte: hoje } });
        const faturamentoHoje = corridasHoje.reduce((s, c) => s + (c.precoFinal || c.precoEstimado || 0), 0);
        
        return { total, hoje: hoje_count, pendentes, emAndamento, finalizadas, canceladas, faturamentoHoje };
    },
    
    async listarPendentes(adminId = null) {
        const limiteRecente = new Date(Date.now() - 15 * 60 * 1000);
        const filtro = { status: 'pendente', createdAt: { $gte: limiteRecente } };
        if (adminId) filtro.adminId = adminId;
        return await Corrida.find(filtro).sort({ createdAt: -1 }).limit(50);
    },
    
    async listarAtivas(adminId = null) {
        const filtro = { status: { $in: ['pendente', 'aceita', 'aguardando_cliente', 'em_andamento', 'motorista_a_caminho'] } };
        if (adminId) filtro.adminId = adminId;
        return await Corrida.find(filtro).sort({ createdAt: -1 }).limit(50);
    },

    // Aliases para compatibilidade com rotas
    iniciar(corridaId) { return this.iniciarCorrida(corridaId); },
    finalizar(corridaId, precoFinal) { return this.finalizarCorrida(corridaId, precoFinal); },
    cancelar(corridaId, motivo) { return this.cancelarCorrida(corridaId, motivo); },
    listarTodas(filtros) { return this.listar(null, filtros); },
    obterEstatisticas(adminId) { return this.estatisticas(adminId); },
    corridaAtivaMotorista(motoristaId) { return this.buscarCorridaAtivaMotorista(motoristaId); },
};

module.exports = CorridaService;