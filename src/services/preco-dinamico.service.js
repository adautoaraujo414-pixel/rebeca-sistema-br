const { v4: uuidv4 } = require('uuid');

const CONFIG_PRECO = {
    taxaBase: 5.00,
    precoKm: 2.50,
    taxaMinima: 15.00
};

const regrasDinamicas = new Map();

const regrasExemplo = [
    { id: 'regra_001', nome: 'Taxa Madrugada', horaInicio: '00:00', horaFim: '06:00', diasSemana: ['dom','seg','ter','qua','qui','sex','sab'], multiplicador: 1.3, ativo: true },
    { id: 'regra_002', nome: 'Taxa Noturna', horaInicio: '18:00', horaFim: '23:59', diasSemana: ['dom','seg','ter','qua','qui','sex','sab'], multiplicador: 1.2, ativo: true },
    { id: 'regra_003', nome: 'Final de Semana', horaInicio: '00:00', horaFim: '23:59', diasSemana: ['sab','dom'], multiplicador: 1.15, ativo: true }
];

regrasExemplo.forEach(r => regrasDinamicas.set(r.id, r));

const precoDinamicoService = {
    listarRegras: (apenasAtivas = false) => {
        let lista = Array.from(regrasDinamicas.values());
        if (apenasAtivas) lista = lista.filter(r => r.ativo);
        return lista;
    },

    obterRegra: (id) => regrasDinamicas.get(id) || null,

    criarRegra: (dados) => {
        const id = 'regra_' + uuidv4().slice(0, 8);
        const nova = {
            id, nome: dados.nome, horaInicio: dados.horaInicio || '00:00', horaFim: dados.horaFim || '23:59',
            diasSemana: dados.diasSemana || ['dom','seg','ter','qua','qui','sex','sab'],
            multiplicador: dados.multiplicador || 1.0, ativo: true
        };
        regrasDinamicas.set(id, nova);
        return nova;
    },

    atualizarRegra: (id, dados) => {
        const regra = regrasDinamicas.get(id);
        if (!regra) return null;
        const atualizada = { ...regra, ...dados, id };
        regrasDinamicas.set(id, atualizada);
        return atualizada;
    },

    excluirRegra: (id) => regrasDinamicas.delete(id),

    calcularPreco: (distanciaKm, localidadeId = null, dataHora = null) => {
        const agora = dataHora ? new Date(dataHora) : new Date();
        const hora = agora.getHours();
        const minutos = agora.getMinutes();
        const horaAtual = hora.toString().padStart(2, '0') + ':' + minutos.toString().padStart(2, '0');
        const diasSemana = ['dom','seg','ter','qua','qui','sex','sab'];
        const diaAtual = diasSemana[agora.getDay()];

        let multiplicadorFinal = 1.0;
        const regrasAplicadas = [];

        regrasDinamicas.forEach(regra => {
            if (!regra.ativo) return;
            if (!regra.diasSemana.includes(diaAtual)) return;
            if (!precoDinamicoService.horarioNoIntervalo(horaAtual, regra.horaInicio, regra.horaFim)) return;
            multiplicadorFinal *= regra.multiplicador;
            regrasAplicadas.push({ id: regra.id, nome: regra.nome, multiplicador: regra.multiplicador });
        });

        const precoBase = CONFIG_PRECO.taxaBase + (distanciaKm * CONFIG_PRECO.precoKm);
        let precoFinal = precoBase * multiplicadorFinal;
        if (precoFinal < CONFIG_PRECO.taxaMinima) precoFinal = CONFIG_PRECO.taxaMinima;

        return {
            precoBase: Math.round(precoBase * 100) / 100,
            precoFinal: Math.round(precoFinal * 100) / 100,
            multiplicadorTotal: Math.round(multiplicadorFinal * 100) / 100,
            regrasAplicadas, distanciaKm
        };
    },

    horarioNoIntervalo: (horaAtual, horaInicio, horaFim) => {
        const atual = precoDinamicoService.horaParaMinutos(horaAtual);
        const inicio = precoDinamicoService.horaParaMinutos(horaInicio);
        const fim = precoDinamicoService.horaParaMinutos(horaFim);
        if (inicio <= fim) return atual >= inicio && atual <= fim;
        return atual >= inicio || atual <= fim;
    },

    horaParaMinutos: (hora) => {
        const [h, m] = hora.split(':').map(Number);
        return h * 60 + m;
    },

    getConfigBase: () => ({ ...CONFIG_PRECO }),

    setConfigBase: (novaConfig) => {
        if (novaConfig.taxaBase !== undefined) CONFIG_PRECO.taxaBase = novaConfig.taxaBase;
        if (novaConfig.precoKm !== undefined) CONFIG_PRECO.precoKm = novaConfig.precoKm;
        if (novaConfig.taxaMinima !== undefined) CONFIG_PRECO.taxaMinima = novaConfig.taxaMinima;
        return { ...CONFIG_PRECO };
    }
};

module.exports = precoDinamicoService;
