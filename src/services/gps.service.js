const { v4: uuidv4 } = require('uuid');

const localizacoes = new Map();

const gpsService = {
    atualizarLocalizacao: (motoristaId, dados) => {
        const lat = parseFloat(dados.latitude);
        const lon = parseFloat(dados.longitude);
        const precisao = dados.precisao ? parseFloat(dados.precisao) : null;

        // Validar coordenadas — rejeitar posições inválidas ou fora do Brasil
        if (isNaN(lat) || isNaN(lon)) {
            console.log('[GPS] Coordenadas inválidas para motorista', motoristaId);
            return localizacoes.get(motoristaId) || null;
        }
        if (lat < -34 || lat > 5 || lon < -74 || lon > -28) {
            console.log('[GPS] Coordenadas fora do Brasil rejeitadas:', lat, lon);
            return localizacoes.get(motoristaId) || null;
        }
        // Rejeitar precisão muito ruim (>150m) — mantém última posição válida
        if (precisao !== null && precisao > 150) {
            console.log('[GPS] Precisão ruim (' + precisao + 'm) rejeitada para motorista', motoristaId);
            return localizacoes.get(motoristaId) || null;
        }

        const localizacao = {
            id: uuidv4(),
            motoristaId,
            latitude: lat,
            longitude: lon,
            precisao,
            velocidade: dados.velocidade || null,
            timestamp: new Date().toISOString()
        };
        localizacoes.set(motoristaId, localizacao);
        return localizacao;
    },

    obterLocalizacao: (motoristaId) => {
        return localizacoes.get(motoristaId) || null;
    },

    listarLocalizacoes: () => {
        return Array.from(localizacoes.values());
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

    buscarProximos: (latitude, longitude, raioKm = 10) => {
        const proximos = [];
        localizacoes.forEach((loc, motoristaId) => {
            const distancia = gpsService.calcularDistancia(latitude, longitude, loc.latitude, loc.longitude);
            if (distancia <= raioKm) {
                proximos.push({ ...loc, distancia });
            }
        });
        proximos.sort((a, b) => a.distancia - b.distancia);
        return proximos;
    },

    removerLocalizacao: (motoristaId) => {
        return localizacoes.delete(motoristaId);
    }
};

module.exports = gpsService;
