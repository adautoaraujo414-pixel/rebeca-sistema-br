const { v4: uuidv4 } = require('uuid');

// Map isolado por adminId: { adminId -> { motoristaId -> localizacao } }
const localizacoesPorAdmin = new Map();

function getMapAdmin(adminId) {
    if (!localizacoesPorAdmin.has(adminId)) {
        localizacoesPorAdmin.set(adminId, new Map());
    }
    return localizacoesPorAdmin.get(adminId);
}

const gpsService = {
    atualizarLocalizacao: (motoristaId, dados, adminId = 'global') => {
        const lat = parseFloat(dados.latitude);
        const lon = parseFloat(dados.longitude);
        const precisao = dados.precisao ? parseFloat(dados.precisao) : null;

        if (isNaN(lat) || isNaN(lon)) {
            console.log('[GPS] Coordenadas inválidas para motorista', motoristaId);
            return getMapAdmin(adminId).get(motoristaId) || null;
        }
        if (lat < -34 || lat > 5 || lon < -74 || lon > -28) {
            console.log('[GPS] Coordenadas fora do Brasil rejeitadas:', lat, lon);
            return getMapAdmin(adminId).get(motoristaId) || null;
        }
        if (precisao !== null && precisao > 150) {
            console.log('[GPS] Precisão ruim (' + precisao + 'm) rejeitada para motorista', motoristaId);
            return getMapAdmin(adminId).get(motoristaId) || null;
        }

        const localizacao = {
            id: uuidv4(),
            motoristaId,
            adminId,
            latitude: lat,
            longitude: lon,
            precisao,
            velocidade: dados.velocidade || null,
            timestamp: new Date().toISOString()
        };
        getMapAdmin(adminId).set(motoristaId, localizacao);
        return localizacao;
    },

    obterLocalizacao: (motoristaId, adminId = 'global') => {
        return getMapAdmin(adminId).get(motoristaId) || null;
    },

    listarLocalizacoes: (adminId = 'global') => {
        return Array.from(getMapAdmin(adminId).values());
    },

    calcularDistancia: (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return Math.round(R * c * 100) / 100;
    },

    buscarProximos: (latitude, longitude, raioKm = 10, adminId = 'global') => {
        const proximos = [];
        getMapAdmin(adminId).forEach((loc) => {
            const distancia = gpsService.calcularDistancia(latitude, longitude, loc.latitude, loc.longitude);
            if (distancia <= raioKm) {
                proximos.push({ ...loc, distancia });
            }
        });
        proximos.sort((a, b) => a.distancia - b.distancia);
        return proximos;
    },

    removerLocalizacao: (motoristaId, adminId = 'global') => {
        return getMapAdmin(adminId).delete(motoristaId);
    }
};

module.exports = gpsService;
