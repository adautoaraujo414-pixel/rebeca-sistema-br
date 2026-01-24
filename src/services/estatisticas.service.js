const CorridaService = require('./corrida.service');
const MotoristaService = require('./motorista.service');
const ClienteService = require('./cliente.service');

const EstatisticasService = {
    // ========== CORRIDAS POR PERÍODO ==========
    corridasPorDia: (dias = 7) => {
        const corridas = CorridaService.listarTodas({});
        const resultado = [];
        
        for (let i = dias - 1; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            const dataStr = data.toISOString().split('T')[0];
            const diaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][data.getDay()];
            
            const corridasDia = corridas.filter(c => 
                c.dataSolicitacao?.startsWith(dataStr) || c.dataFinalizacao?.startsWith(dataStr)
            );
            
            resultado.push({
                data: dataStr,
                diaSemana,
                total: corridasDia.length,
                finalizadas: corridasDia.filter(c => c.status === 'finalizada').length,
                canceladas: corridasDia.filter(c => c.status === 'cancelada').length,
                faturamento: corridasDia.filter(c => c.status === 'finalizada').reduce((s, c) => s + (c.precoFinal || 0), 0)
            });
        }
        
        return resultado;
    },

    corridasPorSemana: (semanas = 4) => {
        const corridas = CorridaService.listarTodas({});
        const resultado = [];
        
        for (let i = semanas - 1; i >= 0; i--) {
            const inicioSemana = new Date();
            inicioSemana.setDate(inicioSemana.getDate() - (i * 7) - inicioSemana.getDay());
            const fimSemana = new Date(inicioSemana);
            fimSemana.setDate(fimSemana.getDate() + 6);
            
            const corridasSemana = corridas.filter(c => {
                const data = new Date(c.dataSolicitacao || c.dataFinalizacao);
                return data >= inicioSemana && data <= fimSemana;
            });
            
            resultado.push({
                semana: `${inicioSemana.getDate()}/${inicioSemana.getMonth() + 1} - ${fimSemana.getDate()}/${fimSemana.getMonth() + 1}`,
                total: corridasSemana.length,
                finalizadas: corridasSemana.filter(c => c.status === 'finalizada').length,
                faturamento: corridasSemana.filter(c => c.status === 'finalizada').reduce((s, c) => s + (c.precoFinal || 0), 0)
            });
        }
        
        return resultado;
    },

    // ========== HORÁRIOS DE PICO ==========
    horariosPico: () => {
        const corridas = CorridaService.listarTodas({});
        const porHora = {};
        
        for (let h = 0; h < 24; h++) {
            porHora[h] = { hora: h, corridas: 0, faturamento: 0 };
        }
        
        corridas.forEach(c => {
            if (c.dataSolicitacao) {
                const hora = new Date(c.dataSolicitacao).getHours();
                porHora[hora].corridas++;
                if (c.status === 'finalizada') {
                    porHora[hora].faturamento += c.precoFinal || 0;
                }
            }
        });
        
        const resultado = Object.values(porHora).map(h => ({
            ...h,
            horaFormatada: `${String(h.hora).padStart(2, '0')}:00`,
            nivel: h.corridas > 10 ? 'alto' : h.corridas > 5 ? 'medio' : 'baixo'
        }));
        
        return resultado;
    },

    // ========== RANKING MOTORISTAS ==========
    rankingMotoristas: (limite = 10, periodo = 'mes') => {
        const motoristas = MotoristaService.listarTodos({});
        const corridas = CorridaService.listarTodas({});
        
        let dataLimite = new Date();
        if (periodo === 'semana') dataLimite.setDate(dataLimite.getDate() - 7);
        else if (periodo === 'mes') dataLimite.setMonth(dataLimite.getMonth() - 1);
        else if (periodo === 'ano') dataLimite.setFullYear(dataLimite.getFullYear() - 1);
        
        const ranking = motoristas.map(m => {
            const corridasMotorista = corridas.filter(c => 
                c.motoristaId === m.id && 
                c.status === 'finalizada' &&
                new Date(c.dataFinalizacao) >= dataLimite
            );
            
            return {
                id: m.id,
                nome: m.nomeCompleto || m.nome,
                whatsapp: m.whatsapp,
                foto: m.foto,
                avaliacao: m.avaliacao || 5,
                corridasRealizadas: corridasMotorista.length,
                faturamento: corridasMotorista.reduce((s, c) => s + (c.precoFinal || 0), 0),
                kmRodados: corridasMotorista.reduce((s, c) => s + (c.distanciaKm || 0), 0)
            };
        });
        
        return ranking
            .sort((a, b) => b.faturamento - a.faturamento)
            .slice(0, limite)
            .map((m, i) => ({ ...m, posicao: i + 1 }));
    },

    // ========== FATURAMENTO ==========
    faturamentoPorDia: (dias = 30) => {
        const corridas = CorridaService.listarTodas({});
        const resultado = [];
        
        for (let i = dias - 1; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            const dataStr = data.toISOString().split('T')[0];
            
            const corridasDia = corridas.filter(c => 
                c.status === 'finalizada' && c.dataFinalizacao?.startsWith(dataStr)
            );
            
            const faturamento = corridasDia.reduce((s, c) => s + (c.precoFinal || 0), 0);
            const comissao = faturamento * 0.15; // 15% comissão
            
            resultado.push({
                data: dataStr,
                dataFormatada: `${data.getDate()}/${data.getMonth() + 1}`,
                corridas: corridasDia.length,
                faturamentoBruto: faturamento,
                comissaoEmpresa: comissao,
                repasseMotoristas: faturamento - comissao
            });
        }
        
        return resultado;
    },

    faturamentoResumo: () => {
        const corridas = CorridaService.listarTodas({});
        const finalizadas = corridas.filter(c => c.status === 'finalizada');
        
        const hoje = new Date().toISOString().split('T')[0];
        const corridasHoje = finalizadas.filter(c => c.dataFinalizacao?.startsWith(hoje));
        
        const inicioSemana = new Date();
        inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
        const corridasSemana = finalizadas.filter(c => new Date(c.dataFinalizacao) >= inicioSemana);
        
        const inicioMes = new Date();
        inicioMes.setDate(1);
        const corridasMes = finalizadas.filter(c => new Date(c.dataFinalizacao) >= inicioMes);
        
        const calcular = (lista) => {
            const bruto = lista.reduce((s, c) => s + (c.precoFinal || 0), 0);
            return {
                corridas: lista.length,
                bruto,
                comissao: bruto * 0.15,
                km: lista.reduce((s, c) => s + (c.distanciaKm || 0), 0)
            };
        };
        
        return {
            hoje: calcular(corridasHoje),
            semana: calcular(corridasSemana),
            mes: calcular(corridasMes),
            total: calcular(finalizadas)
        };
    },

    // ========== DASHBOARD COMPLETO ==========
    dashboardCompleto: () => {
        const motoristas = MotoristaService.listarTodos({});
        const corridas = CorridaService.listarTodas({});
        const hoje = new Date().toISOString().split('T')[0];
        
        return {
            motoristas: {
                total: motoristas.length,
                online: motoristas.filter(m => m.status === 'disponivel' || m.status === 'em_corrida').length,
                disponiveis: motoristas.filter(m => m.status === 'disponivel').length,
                emCorrida: motoristas.filter(m => m.status === 'em_corrida').length,
                offline: motoristas.filter(m => m.status === 'offline').length
            },
            corridas: {
                total: corridas.length,
                hoje: corridas.filter(c => c.dataSolicitacao?.startsWith(hoje)).length,
                pendentes: corridas.filter(c => c.status === 'pendente').length,
                emAndamento: corridas.filter(c => c.status === 'em_andamento' || c.status === 'aceita').length,
                finalizadas: corridas.filter(c => c.status === 'finalizada').length,
                canceladas: corridas.filter(c => c.status === 'cancelada').length
            },
            faturamento: EstatisticasService.faturamentoResumo(),
            horariosPico: EstatisticasService.horariosPico().filter(h => h.nivel === 'alto'),
            topMotoristas: EstatisticasService.rankingMotoristas(5, 'semana')
        };
    }
};

module.exports = EstatisticasService;
