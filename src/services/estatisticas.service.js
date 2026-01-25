const { Corrida, Motorista, Cliente } = require('../models');

const EstatisticasService = {
    // Corridas por dia
    async corridasPorDia(dias = 7) {
        const resultado = [];
        
        for (let i = dias - 1; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            data.setHours(0, 0, 0, 0);
            
            const dataFim = new Date(data);
            dataFim.setHours(23, 59, 59, 999);
            
            const dataStr = data.toISOString().split('T')[0];
            const diaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][data.getDay()];
            
            const corridas = await Corrida.find({
                createdAt: { $gte: data, $lte: dataFim }
            });
            
            resultado.push({
                data: dataStr,
                diaSemana,
                total: corridas.length,
                finalizadas: corridas.filter(c => c.status === 'finalizada').length,
                canceladas: corridas.filter(c => c.status === 'cancelada').length,
                faturamento: corridas.filter(c => c.status === 'finalizada').reduce((s, c) => s + (c.precoFinal || 0), 0)
            });
        }
        
        return resultado;
    },

    // Faturamento por período
    async faturamentoPorPeriodo(periodo = 'hoje') {
        let dataInicio = new Date();
        dataInicio.setHours(0, 0, 0, 0);
        
        if (periodo === 'semana') {
            dataInicio.setDate(dataInicio.getDate() - 7);
        } else if (periodo === 'mes') {
            dataInicio.setMonth(dataInicio.getMonth() - 1);
        }
        
        const corridas = await Corrida.find({
            status: 'finalizada',
            createdAt: { $gte: dataInicio }
        });
        
        return {
            total: corridas.reduce((s, c) => s + (c.precoFinal || 0), 0),
            quantidade: corridas.length,
            media: corridas.length > 0 ? corridas.reduce((s, c) => s + (c.precoFinal || 0), 0) / corridas.length : 0
        };
    },

    // Ranking motoristas
    async rankingMotoristas(limite = 10) {
        const motoristas = await Motorista.find({ ativo: true })
            .sort({ corridasRealizadas: -1 })
            .limit(limite);
        
        return motoristas.map((m, i) => ({
            posicao: i + 1,
            nome: m.nomeCompleto,
            corridas: m.corridasRealizadas || 0,
            avaliacao: m.avaliacao || 5
        }));
    },

    // Horários de pico
    async horariosPico() {
        const corridas = await Corrida.find({ status: 'finalizada' });
        const horarios = {};
        
        corridas.forEach(c => {
            if (c.createdAt) {
                const hora = new Date(c.createdAt).getHours();
                horarios[hora] = (horarios[hora] || 0) + 1;
            }
        });
        
        return Object.entries(horarios)
            .map(([hora, total]) => ({ hora: parseInt(hora), total }))
            .sort((a, b) => b.total - a.total);
    },

    // Dashboard completo
    async dashboardCompleto() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const [
            corridasHoje,
            motoristas,
            clientes,
            todasCorridas
        ] = await Promise.all([
            Corrida.find({ createdAt: { $gte: hoje } }),
            Motorista.find({}),
            Cliente.countDocuments(),
            Corrida.find({ status: 'finalizada' })
        ]);
        
        const faturamentoHoje = corridasHoje
            .filter(c => c.status === 'finalizada')
            .reduce((s, c) => s + (c.precoFinal || 0), 0);
        
        return {
            corridasHoje: corridasHoje.length,
            corridasFinalizadasHoje: corridasHoje.filter(c => c.status === 'finalizada').length,
            faturamentoHoje,
            motoristasTotal: motoristas.length,
            motoristasOnline: motoristas.filter(m => m.status === 'disponivel').length,
            motoristasEmCorrida: motoristas.filter(m => m.status === 'em_corrida').length,
            clientesTotal: clientes,
            corridasTotal: todasCorridas.length,
            faturamentoTotal: todasCorridas.reduce((s, c) => s + (c.precoFinal || 0), 0)
        };
    },

    // Estatísticas de cancelamento
    async estatisticasCancelamento() {
        const corridas = await Corrida.find({});
        const canceladas = corridas.filter(c => c.status === 'cancelada');
        
        return {
            total: canceladas.length,
            taxa: corridas.length > 0 ? (canceladas.length / corridas.length * 100).toFixed(1) : 0,
            motivos: {}
        };
    }
};

module.exports = EstatisticasService;
