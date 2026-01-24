const { v4: uuidv4 } = require('uuid');

const corridas = new Map();

const STATUS = {
    PENDENTE: 'pendente',
    ACEITA: 'aceita',
    EM_ANDAMENTO: 'em_andamento',
    FINALIZADA: 'finalizada',
    CANCELADA: 'cancelada'
};

const corridasExemplo = [
    {
        id: 'cor_001', clienteId: 'cli_001', clienteNome: 'Fernando Souza', clienteTelefone: '11912345678',
        motoristaId: 'mot_001', motoristaNome: 'Carlos Silva',
        origem: { endereco: 'Av. dos Autonomistas, 1500 - Osasco', latitude: -23.5327, longitude: -46.7917 },
        destino: { endereco: 'Shopping União Osasco', latitude: -23.5323, longitude: -46.7755 },
        distanciaKm: 3.2, precoEstimado: 18.50, precoFinal: 18.50,
        status: STATUS.FINALIZADA, formaPagamento: 'dinheiro',
        dataSolicitacao: '2026-01-22T08:30:00Z', dataFinalizacao: '2026-01-22T08:55:00Z', avaliacao: 5
    },
    {
        id: 'cor_002', clienteId: 'cli_002', clienteNome: 'Mariana Lima', clienteTelefone: '11923456789',
        motoristaId: 'mot_002', motoristaNome: 'João Santos',
        origem: { endereco: 'Rua das Flores, 200 - Osasco', latitude: -23.5350, longitude: -46.7890 },
        destino: { endereco: 'Hospital Antonio Giglio', latitude: -23.5245, longitude: -46.7823 },
        distanciaKm: 2.8, precoEstimado: 16.00, precoFinal: null,
        status: STATUS.EM_ANDAMENTO, formaPagamento: 'pix',
        dataSolicitacao: '2026-01-22T10:15:00Z', dataFinalizacao: null, avaliacao: null
    },
    {
        id: 'cor_003', clienteId: 'cli_003', clienteNome: 'Roberto Costa', clienteTelefone: '11934567890',
        motoristaId: null, motoristaNome: null,
        origem: { endereco: 'Estação Osasco CPTM', latitude: -23.5328, longitude: -46.7921 },
        destino: { endereco: 'Shopping Tamboré', latitude: -23.4981, longitude: -46.8428 },
        distanciaKm: 8.5, precoEstimado: 32.00, precoFinal: null,
        status: STATUS.PENDENTE, formaPagamento: 'cartao',
        dataSolicitacao: new Date().toISOString(), dataFinalizacao: null, avaliacao: null
    }
];

corridasExemplo.forEach(c => corridas.set(c.id, c));

const CorridaService = {
    STATUS,

    listarTodas: (filtros = {}) => {
        let resultado = Array.from(corridas.values());
        if (filtros.status) resultado = resultado.filter(c => c.status === filtros.status);
        if (filtros.motoristaId) resultado = resultado.filter(c => c.motoristaId === filtros.motoristaId);
        if (filtros.clienteId) resultado = resultado.filter(c => c.clienteId === filtros.clienteId);
        resultado.sort((a, b) => new Date(b.dataSolicitacao) - new Date(a.dataSolicitacao));
        return resultado;
    },

    buscarPorId: (id) => corridas.get(id) || null,

    criar: (dados) => {
        const id = 'cor_' + uuidv4().slice(0, 8);
        const nova = {
            id, clienteId: dados.clienteId, clienteNome: dados.clienteNome, clienteTelefone: dados.clienteTelefone,
            motoristaId: null, motoristaNome: null,
            origem: dados.origem, destino: dados.destino,
            distanciaKm: dados.distanciaKm || 0, precoEstimado: dados.precoEstimado || 0, precoFinal: null,
            status: STATUS.PENDENTE, formaPagamento: dados.formaPagamento || 'dinheiro',
            dataSolicitacao: new Date().toISOString(), dataFinalizacao: null, avaliacao: null,
            observacoes: dados.observacoes || ''
        };
        corridas.set(id, nova);
        return nova;
    },

    atribuirMotorista: (corridaId, motoristaId, motoristaNome) => {
        const corrida = corridas.get(corridaId);
        if (!corrida) return null;
        corrida.motoristaId = motoristaId;
        corrida.motoristaNome = motoristaNome;
        corrida.status = STATUS.ACEITA;
        corridas.set(corridaId, corrida);
        return corrida;
    },

    iniciar: (corridaId) => {
        const corrida = corridas.get(corridaId);
        if (!corrida) return null;
        corrida.status = STATUS.EM_ANDAMENTO;
        corrida.dataInicio = new Date().toISOString();
        corridas.set(corridaId, corrida);
        return corrida;
    },

    finalizar: (corridaId, precoFinal) => {
        const corrida = corridas.get(corridaId);
        if (!corrida) return null;
        corrida.status = STATUS.FINALIZADA;
        corrida.precoFinal = precoFinal || corrida.precoEstimado;
        corrida.dataFinalizacao = new Date().toISOString();
        corridas.set(corridaId, corrida);
        return corrida;
    },

    cancelar: (corridaId, motivo) => {
        const corrida = corridas.get(corridaId);
        if (!corrida) return null;
        corrida.status = STATUS.CANCELADA;
        corrida.motivoCancelamento = motivo;
        corrida.dataFinalizacao = new Date().toISOString();
        corridas.set(corridaId, corrida);
        return corrida;
    },

    listarPendentes: () => {
        return Array.from(corridas.values()).filter(c => c.status === STATUS.PENDENTE);
    },

    listarAtivas: () => {
        return Array.from(corridas.values()).filter(c => 
            c.status === STATUS.ACEITA || c.status === STATUS.EM_ANDAMENTO
        );
    },

    obterEstatisticas: () => {
        const lista = Array.from(corridas.values());
        const finalizadas = lista.filter(c => c.status === STATUS.FINALIZADA);
        const faturamento = finalizadas.reduce((sum, c) => sum + (c.precoFinal || 0), 0);
        return {
            total: lista.length,
            pendentes: lista.filter(c => c.status === STATUS.PENDENTE).length,
            emAndamento: lista.filter(c => c.status === STATUS.EM_ANDAMENTO).length,
            finalizadas: finalizadas.length,
            canceladas: lista.filter(c => c.status === STATUS.CANCELADA).length,
            faturamento: Math.round(faturamento * 100) / 100
        };
    }
};

module.exports = CorridaService;
