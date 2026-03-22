const { Corrida, Motorista, Cliente } = require('../models');

const EstatisticasService = {
    // Corridas por dia
    async corridasPorDia(dias = 7, adminId = null) {
        const mongoose = require('mongoose');
        if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) return [];

        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - (dias - 1));
        dataInicio.setHours(0, 0, 0, 0);

        const aid = new mongoose.Types.ObjectId(adminId);

        // UMA aggregate no lugar de 7 queries separadas
        const agg = await Corrida.aggregate([
            { $match: { adminId: aid, createdAt: { $gte: dataInicio } } },
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'America/Sao_Paulo' } },
                total: { $sum: 1 },
                finalizadas: { $sum: { $cond: [{ $eq: ['$status', 'finalizada'] }, 1, 0] } },
                canceladas:  { $sum: { $cond: [{ $eq: ['$status', 'cancelada']  }, 1, 0] } },
                faturamento: { $sum: { $cond: [{ $eq: ['$status', 'finalizada'] }, { $ifNull: ['$precoFinal', 0] }, 0] } }
            }},
            { $sort: { _id: 1 } }
        ]);

        // Montar array com todos os dias (incluindo dias sem corridas)
        const dias_nomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        const mapa = {};
        agg.forEach(r => { mapa[r._id] = r; });

        const resultado = [];
        for (let i = dias - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const dataStr = d.toISOString().split('T')[0];
            const r = mapa[dataStr] || {};
            resultado.push({
                data: dataStr,
                diaSemana: dias_nomes[d.getDay()],
                total:       r.total       || 0,
                finalizadas: r.finalizadas || 0,
                canceladas:  r.canceladas  || 0,
                faturamento: r.faturamento || 0
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
        const agg = await Corrida.aggregate([
            { $match: { status: 'finalizada', adminId: aid } },
            { $group: {
                _id: { $hour: { date: '$createdAt', timezone: 'America/Sao_Paulo' } },
                corridas: { $sum: 1 }
            }}
        ]);

        if (!agg.length) return [];
        const max = Math.max(...agg.map(r => r.corridas), 1);
        return agg.map(r => {
            const h = r._id;
            const pct = r.corridas / max;
            return {
                hora: h,
                corridas: r.corridas,
                horaFormatada: h.toString().padStart(2,'0') + ':00',
                nivel: pct > 0.75 ? 'alto' : pct > 0.4 ? 'medio' : 'baixo'
            };
        }).sort((a, b) => b.corridas - a.corridas);
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
            resumoHoje,
            resumoTotal,
            motoristas,
            clientes
        ] = await Promise.all([
            Corrida.aggregate([
                { $match: { adminId: aid, createdAt: { $gte: hoje } } },
                { $group: {
                    _id: null,
                    total: { $sum: 1 },
                    finalizadas: { $sum: { $cond: [{ $eq: ['$status','finalizada'] }, 1, 0] } },
                    faturamento: { $sum: { $cond: [{ $eq: ['$status','finalizada'] }, { $ifNull: ['$precoFinal',0] }, 0] } }
                }}
            ]),
            Corrida.aggregate([
                { $match: { adminId: aid } },
                { $group: {
                    _id: null,
                    total: { $sum: 1 },
                    faturamento: { $sum: { $cond: [{ $eq: ['$status','finalizada'] }, { $ifNull: ['$precoFinal',0] }, 0] } }
                }}
            ]),
            Motorista.find({ adminId: aid }).select('status').lean(),
            Cliente.countDocuments({ adminId: aid })
        ]);

        const h = resumoHoje[0] || { total: 0, finalizadas: 0, faturamento: 0 };
        const t = resumoTotal[0] || { total: 0, faturamento: 0 };

        return {
            corridasHoje: h.total,
            corridasFinalizadasHoje: h.finalizadas,
            faturamentoHoje: h.faturamento,
            motoristasTotal: motoristas.length,
            motoristasOnline: motoristas.filter(m => m.status === 'disponivel').length,
            motoristasEmCorrida: motoristas.filter(m => m.status === 'em_corrida').length,
            clientesTotal: clientes,
            corridasTotal: t.total,
            faturamentoTotal: t.faturamento
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


