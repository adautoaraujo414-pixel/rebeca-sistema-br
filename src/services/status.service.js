const STATUS_VALIDOS = ['offline', 'disponivel', 'a_caminho', 'em_corrida', 'pausa'];

const statusMotoristas = new Map();

const statusService = {
    definirStatus: (motoristaId, novoStatus, dados = {}) => {
        if (!STATUS_VALIDOS.includes(novoStatus)) {
            throw new Error('Status inválido: ' + novoStatus);
        }
        const statusAnterior = statusMotoristas.get(motoristaId);
        const status = {
            motoristaId,
            status: novoStatus,
            statusAnterior: statusAnterior?.status || null,
            corridaAtual: dados.corridaId || null,
            motivoPausa: novoStatus === 'pausa' ? (dados.motivo || 'Não informado') : null,
            inicioStatus: new Date().toISOString()
        };
        statusMotoristas.set(motoristaId, status);
        return status;
    },

    obterStatus: (motoristaId) => {
        return statusMotoristas.get(motoristaId) || {
            motoristaId,
            status: 'offline',
            statusAnterior: null,
            corridaAtual: null,
            motivoPausa: null,
            inicioStatus: null
        };
    },

    listarTodos: () => {
        return Array.from(statusMotoristas.values());
    },

    listarPorStatus: (status) => {
        if (!STATUS_VALIDOS.includes(status)) return [];
        return Array.from(statusMotoristas.values()).filter(s => s.status === status);
    },

    obterEstatisticas: () => {
        const stats = { total: statusMotoristas.size, offline: 0, disponivel: 0, a_caminho: 0, em_corrida: 0, pausa: 0 };
        statusMotoristas.forEach(s => {
            if (stats.hasOwnProperty(s.status)) stats[s.status]++;
        });
        return stats;
    },

    estaDisponivel: (motoristaId) => {
        const status = statusMotoristas.get(motoristaId);
        return status?.status === 'disponivel';
    },

    listarDisponiveis: () => {
        return statusService.listarPorStatus('disponivel');
    },

    getStatusValidos: () => STATUS_VALIDOS
};

module.exports = statusService;
