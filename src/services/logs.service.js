const { v4: uuidv4 } = require('uuid');

const logs = [];

const LogsService = {
    registrar: (dados) => {
        const log = {
            id: 'log_' + uuidv4().slice(0, 8),
            tipo: dados.tipo || 'info',
            acao: dados.acao,
            usuarioId: dados.usuarioId || null,
            usuarioNome: dados.usuarioNome || 'Sistema',
            usuarioTipo: dados.usuarioTipo || 'sistema',
            detalhes: dados.detalhes || {},
            ip: dados.ip || null,
            dataHora: new Date().toISOString()
        };
        logs.unshift(log);
        if (logs.length > 1000) logs.pop();
        return log;
    },

    listar: (filtros = {}) => {
        let resultado = [...logs];
        if (filtros.tipo) resultado = resultado.filter(l => l.tipo === filtros.tipo);
        if (filtros.usuarioId) resultado = resultado.filter(l => l.usuarioId === filtros.usuarioId);
        if (filtros.usuarioTipo) resultado = resultado.filter(l => l.usuarioTipo === filtros.usuarioTipo);
        if (filtros.dataInicio) resultado = resultado.filter(l => l.dataHora >= filtros.dataInicio);
        if (filtros.dataFim) resultado = resultado.filter(l => l.dataHora <= filtros.dataFim);
        if (filtros.limite) resultado = resultado.slice(0, parseInt(filtros.limite));
        return resultado;
    },

    buscarPorId: (id) => logs.find(l => l.id === id),

    obterEstatisticas: () => {
        const hoje = new Date().toISOString().split('T')[0];
        const logsHoje = logs.filter(l => l.dataHora.startsWith(hoje));
        return {
            total: logs.length,
            hoje: logsHoje.length,
            porTipo: {
                login: logs.filter(l => l.acao?.includes('login')).length,
                corrida: logs.filter(l => l.acao?.includes('corrida')).length,
                cadastro: logs.filter(l => l.acao?.includes('cadastr')).length,
                erro: logs.filter(l => l.tipo === 'erro').length
            }
        };
    }
};

// Logs de exemplo
LogsService.registrar({ tipo: 'info', acao: 'Sistema iniciado', usuarioNome: 'Sistema' });
LogsService.registrar({ tipo: 'login', acao: 'Login admin', usuarioNome: 'Administrador', usuarioTipo: 'admin' });

module.exports = LogsService;
