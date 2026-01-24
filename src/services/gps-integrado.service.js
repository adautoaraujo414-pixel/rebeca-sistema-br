const gpsService = require('./gps.service');
const statusService = require('./status.service');

const motoristas = new Map();

const motoristasExemplo = [
    { id: 'mot_001', nome: 'Carlos Silva', telefone: '11999887766', veiculo: 'Fiat Uno Branco - ABC-1234', latitude: -23.5327, longitude: -46.7917 },
    { id: 'mot_002', nome: 'João Santos', telefone: '11988776655', veiculo: 'VW Gol Prata - DEF-5678', latitude: -23.5350, longitude: -46.7890 },
    { id: 'mot_003', nome: 'Maria Oliveira', telefone: '11977665544', veiculo: 'Chevrolet Onix Preto - GHI-9012', latitude: -23.5300, longitude: -46.7950 }
];

motoristasExemplo.forEach(m => {
    motoristas.set(m.id, m);
    gpsService.atualizarLocalizacao(m.id, { latitude: m.latitude, longitude: m.longitude });
    statusService.definirStatus(m.id, 'disponivel');
});

const gpsIntegradoService = {
    listarTodos: () => {
        const resultado = [];
        motoristas.forEach((motorista, id) => {
            const localizacao = gpsService.obterLocalizacao(id);
            const status = statusService.obterStatus(id);
            resultado.push({
                ...motorista,
                latitude: localizacao?.latitude || null,
                longitude: localizacao?.longitude || null,
                status: status?.status || 'offline',
                ultimaAtualizacao: localizacao?.timestamp || null
            });
        });
        return resultado;
    },

    listarPorStatus: (statusFiltro) => {
        return gpsIntegradoService.listarTodos().filter(m => m.status === statusFiltro);
    },

    listarDisponiveis: (latitude = null, longitude = null) => {
        let disponiveis = gpsIntegradoService.listarPorStatus('disponivel');
        if (latitude && longitude) {
            disponiveis = disponiveis.map(m => ({
                ...m,
                distancia: m.latitude && m.longitude 
                    ? gpsService.calcularDistancia(latitude, longitude, m.latitude, m.longitude)
                    : 999999
            }));
            disponiveis.sort((a, b) => a.distancia - b.distancia);
        }
        return disponiveis;
    },

    buscarMaisProximo: (latitude, longitude, raioKm = 10) => {
        const disponiveis = gpsIntegradoService.listarDisponiveis(latitude, longitude);
        if (disponiveis.length === 0) return null;
        const maisProximo = disponiveis[0];
        if (maisProximo.distancia > raioKm) return null;
        return maisProximo;
    },

    atualizar: (motoristaId, dados) => {
        const motorista = motoristas.get(motoristaId);
        if (!motorista) return null;

        if (dados.latitude && dados.longitude) {
            gpsService.atualizarLocalizacao(motoristaId, {
                latitude: dados.latitude,
                longitude: dados.longitude
            });
        }

        if (dados.status) {
            statusService.definirStatus(motoristaId, dados.status);
        }

        return gpsIntegradoService.obterMotorista(motoristaId);
    },

    obterMotorista: (motoristaId) => {
        const motorista = motoristas.get(motoristaId);
        if (!motorista) return null;
        const localizacao = gpsService.obterLocalizacao(motoristaId);
        const status = statusService.obterStatus(motoristaId);
        return {
            ...motorista,
            latitude: localizacao?.latitude || null,
            longitude: localizacao?.longitude || null,
            status: status?.status || 'offline',
            ultimaAtualizacao: localizacao?.timestamp || null
        };
    },

    obterEstatisticas: () => {
        return {
            ...statusService.obterEstatisticas(),
            totalMotoristas: motoristas.size
        };
    }
};

module.exports = gpsIntegradoService;
