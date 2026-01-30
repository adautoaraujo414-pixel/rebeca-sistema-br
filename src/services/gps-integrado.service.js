const { Motorista } = require('../models');

const gpsIntegradoService = {
    listarTodos: async (adminId) => {
        const motoristas = await Motorista.find({ adminId }).lean();
        return motoristas.map(m => ({
            id: m._id.toString(),
            nome: m.nome,
            telefone: m.telefone || m.whatsapp,
            veiculo: m.veiculo ? m.veiculo.modelo + ' ' + m.veiculo.cor + ' - ' + m.veiculo.placa : '-',
            latitude: m.localizacao ? m.localizacao.latitude : null,
            longitude: m.localizacao ? m.localizacao.longitude : null,
            status: m.status || 'offline',
            ultimaAtualizacao: m.localizacao ? m.localizacao.atualizadoEm : m.updatedAt
        }));
    },
    listarPorStatus: async (adminId, statusFiltro) => {
        const todos = await gpsIntegradoService.listarTodos(adminId);
        return todos.filter(m => m.status === statusFiltro);
    },
    listarDisponiveis: async (adminId, latitude, longitude) => {
        let disponiveis = await gpsIntegradoService.listarPorStatus(adminId, 'disponivel');
        if (latitude && longitude) {
            disponiveis = disponiveis.map(m => {
                const dist = (m.latitude && m.longitude) ? calcularDistancia(latitude, longitude, m.latitude, m.longitude) : 999999;
                return Object.assign({}, m, { distancia: dist });
            });
            disponiveis.sort((a, b) => a.distancia - b.distancia);
        }
        return disponiveis;
    },
    buscarMaisProximo: async (adminId, latitude, longitude, raioKm) => {
        const disponiveis = await gpsIntegradoService.listarDisponiveis(adminId, latitude, longitude);
        if (disponiveis.length === 0) return null;
        const maisProximo = disponiveis[0];
        if (maisProximo.distancia > (raioKm || 10)) return null;
        return maisProximo;
    },
    atualizar: async (motoristaId, dados) => {
        const update = {};
        if (dados.latitude && dados.longitude) {
            update['localizacao.latitude'] = dados.latitude;
            update['localizacao.longitude'] = dados.longitude;
            update['localizacao.atualizadoEm'] = new Date();
        }
        if (dados.status) update.status = dados.status;
        const motorista = await Motorista.findByIdAndUpdate(motoristaId, update, { new: true });
        return { id: motorista._id.toString(), nome: motorista.nome, status: motorista.status };
    },
    obterMotorista: async (motoristaId) => {
        const m = await Motorista.findById(motoristaId).lean();
        return {
            id: m._id.toString(),
            nome: m.nome,
            telefone: m.telefone || m.whatsapp,
            veiculo: m.veiculo ? m.veiculo.modelo + ' ' + m.veiculo.cor + ' - ' + m.veiculo.placa : '-',
            latitude: m.localizacao ? m.localizacao.latitude : null,
            longitude: m.localizacao ? m.localizacao.longitude : null,
            status: m.status || 'offline'
        };
    },
    obterEstatisticas: async (adminId) => {
        const motoristas = await Motorista.find({ adminId }).lean();
        return {
            disponiveis: motoristas.filter(m => m.status === 'disponivel').length,
            emCorrida: motoristas.filter(m => m.status === 'em_corrida').length,
            totalMotoristas: motoristas.length
        };
    }
};

function calcularDistancia(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = gpsIntegradoService;