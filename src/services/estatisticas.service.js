const { Corrida, Motorista, Cliente } = require('../models');

const EstatisticasService = {
    // Corridas por dia
    async corridasPorDia(dias = 7, adminId = null) {
        const mongoose = require('mongoose');
        if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) return [];
        const resultado = [];
        
        for (let i = dias - 1; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            data.setHours(0, 0, 0, 0);
            
            const dataFim = new Date(data);
            dataFim.setHours(23, 59, 59, 999);
            
            const dataStr = data.toISOString().split('T')[0];
            const diaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][data.getDay()];
            
            const aid2 = new mongoose.Types.ObjectId(adminId);
            const corridas = await Corrida.find({
                adminId: aid2, createdAt: { $gte: data, $lte: dataFim }
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
    async faturamentoPorPeriodo(periodo = 'hoje', adminId = null) {
        let dataInicio = new Date();
        dataInicio.setHours(0, 0, 0, 0);
        
        if (periodo === 'semana') {
            dataInicio.setDate(dataInicio.getDate() - 7);
        } else if (periodo === 'mes') {
            dataInicio.setMonth(dataInicio.getMonth() - 1);
        }
        
        const mongoose = require('mongoose');
        const aid = adminId && mongoose.Types.ObjectId.isValid(adminId) ? new mongoose.Types.ObjectId(adminId) : null;
        const queryFat = { status: 'finalizada', createdAt: { $gte: dataInicio } };
        if (aid) queryFat.adminId = aid;
        const corridas = await Corrida.find(queryFat);
        
        return {
            total: corridas.reduce((s, c) => s + (c.precoFinal || 0), 0),
            quantidade: corridas.length,
            media: corridas.length > 0 ? corridas.reduce((s, c) => s + (c.precoFinal || 0), 0) / corridas.length : 0
        };
    },

    // Ranking motoristas
    async rankingMotoristas(limite = 10, adminId = null, periodo = 'semana') {
        const mongoose = require('mongoose');
        const aid = adminId && mongoose.Types.ObjectId.isValid(adminId) ? new mongoose.Types.ObjectId(adminId) : null;
        const query = { ativo: true };
        if (aid) query.adminId = aid;
        const motoristas = await Motorista.find(query)
            .sort({ corridasRealizadas: -1 })
            .limit(limite);
        
        return motoristas.map((m, i) => ({
            posicao: i + 1,
            nome: m.nomeCompleto || m.nome || 'Sem nome',
            corridasRealizadas: m.corridasRealizadas || 0,
            faturamento: m.faturamentoTotal || 0,
            avaliacao: m.avaliacao || 5
        }));
    },

    // Horários de pico
    async horariosPico(adminId = null) {
        const mongoose = require('mongoose');
        if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) return [];
        const aid = new mongoose.Types.ObjectId(adminId);
        const corridas = await Corrida.find({ status: 'finalizada', adminId: aid });
        const horarios = {};
        
        corridas.forEach(c => {
            if (c.createdAt) {
                const hora = new Date(c.createdAt).getHours();
                horarios[hora] = (horarios[hora] || 0) + 1;
            }
        });

        const max = Math.max(...Object.values(horarios), 1);
        return Object.entries(horarios)
            .map(([hora, corridas]) => {
                const h = parseInt(hora);
                const pct = corridas / max;
                return {
                    hora: h,
                    corridas,
                    horaFormatada: h.toString().padStart(2,'0') + ':00',
                    nivel: pct > 0.75 ? 'alto' : pct > 0.4 ? 'medio' : 'baixo'
                };
            })
            .sort((a, b) => b.corridas - a.corridas);
    },

    // Dashboard completo
    async dashboardCompleto(adminId = null) {
        const mongoose = require('mongoose');
        if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
            return { corridasHoje: 0, corridasFinalizadasHoje: 0, faturamentoHoje: 0,
                     motoristasTotal: 0, motoristasOnline: 0, motoristasEmCorrida: 0,
                     clientesTotal: 0, corridasTotal: 0, faturamentoTotal: 0 };
        }
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const aid = new mongoose.Types.ObjectId(adminId);
        const [
            corridasHoje,
            motoristas,
            clientes,
            todasCorridas
        ] = await Promise.all([
            Corrida.find({ adminId: aid, createdAt: { $gte: hoje } }),
            Motorista.find({ adminId: aid }),
            Cliente.countDocuments({ adminId: aid }),
            Corrida.find({ adminId: aid })
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
    async estatisticasCancelamento(adminId = null) {
        const mongoose = require('mongoose');
        const aid = adminId && mongoose.Types.ObjectId.isValid(adminId) ? new mongoose.Types.ObjectId(adminId) : null;
        const q = aid ? { adminId: aid } : {};
        const corridas = await Corrida.find(q);
        const canceladas = corridas.filter(c => c.status === 'cancelada');
        
        return {
            total: canceladas.length,
            taxa: corridas.length > 0 ? (canceladas.length / corridas.length * 100).toFixed(1) : 0,
            motivos: {}
        };
    }
};

module.exports = EstatisticasService;


