const MapsService = {
    apiKey: process.env.GOOGLE_MAPS_API_KEY || '',

    // ==================== CONFIGURAÇÃO ====================
    setApiKey: (key) => {
        MapsService.apiKey = key;
        return { sucesso: true };
    },

    getApiKey: () => MapsService.apiKey,

    // ==================== GEOCODING ====================
    async geocodificar(endereco) {
        if (!MapsService.apiKey) {
            return MapsService.geocodificarOffline(endereco);
        }
        
        try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(endereco)}&key=${MapsService.apiKey}&language=pt-BR&region=br`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'OK' && data.results[0]) {
                const result = data.results[0];
                return {
                    sucesso: true,
                    endereco: result.formatted_address,
                    latitude: result.geometry.location.lat,
                    longitude: result.geometry.location.lng,
                    componentes: MapsService.extrairComponentes(result.address_components)
                };
            }
            
            return { sucesso: false, error: 'Endereço não encontrado' };
        } catch (error) {
            console.error('Erro geocoding:', error);
            return MapsService.geocodificarOffline(endereco);
        }
    },

    geocodificarOffline(endereco) {
        // Coordenadas aproximadas para Osasco e região
        const locais = {
            'osasco': { lat: -23.5327, lng: -46.7917 },
            'centro': { lat: -23.5324, lng: -46.7916 },
            'presidente altino': { lat: -23.5256, lng: -46.7678 },
            'bela vista': { lat: -23.5412, lng: -46.7823 },
            'pestana': { lat: -23.5189, lng: -46.7912 },
            'km 18': { lat: -23.5456, lng: -46.8123 },
            'jaguaribe': { lat: -23.5098, lng: -46.7789 },
            'carapicuiba': { lat: -23.5225, lng: -46.8408 },
            'barueri': { lat: -23.5114, lng: -46.8761 },
            'alphaville': { lat: -23.4967, lng: -46.8500 },
            'sao paulo': { lat: -23.5505, lng: -46.6333 },
            'pinheiros': { lat: -23.5672, lng: -46.6914 },
            'lapa': { lat: -23.5203, lng: -46.7017 }
        };

        const enderecoLower = endereco.toLowerCase();
        let coordenadas = { lat: -23.5327, lng: -46.7917 }; // Default Osasco

        for (const [local, coords] of Object.entries(locais)) {
            if (enderecoLower.includes(local)) {
                coordenadas = coords;
                break;
            }
        }

        // Adicionar pequena variação para não sobrepor
        coordenadas.lat += (Math.random() - 0.5) * 0.01;
        coordenadas.lng += (Math.random() - 0.5) * 0.01;

        return {
            sucesso: true,
            endereco: endereco,
            latitude: coordenadas.lat,
            longitude: coordenadas.lng,
            componentes: { cidade: 'Osasco', estado: 'SP', pais: 'Brasil' },
            offline: true
        };
    },

    async geocodificarReverso(latitude, longitude) {
        if (!MapsService.apiKey) {
            return { sucesso: true, endereco: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, offline: true };
        }

        try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${MapsService.apiKey}&language=pt-BR`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK' && data.results[0]) {
                return {
                    sucesso: true,
                    endereco: data.results[0].formatted_address,
                    componentes: MapsService.extrairComponentes(data.results[0].address_components)
                };
            }

            return { sucesso: false, error: 'Localização não encontrada' };
        } catch (error) {
            return { sucesso: true, endereco: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, offline: true };
        }
    },

    // ==================== ROTAS E DISTÂNCIA ====================
    async calcularRota(origem, destino) {
        const origemGeo = typeof origem === 'string' ? await MapsService.geocodificar(origem) : origem;
        const destinoGeo = typeof destino === 'string' ? await MapsService.geocodificar(destino) : destino;

        if (!origemGeo.sucesso || !destinoGeo.sucesso) {
            return { sucesso: false, error: 'Não foi possível geocodificar os endereços' };
        }

        if (!MapsService.apiKey) {
            return MapsService.calcularRotaOffline(origemGeo, destinoGeo);
        }

        try {
            const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origemGeo.latitude},${origemGeo.longitude}&destination=${destinoGeo.latitude},${destinoGeo.longitude}&key=${MapsService.apiKey}&language=pt-BR&mode=driving`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK' && data.routes[0]) {
                const route = data.routes[0];
                const leg = route.legs[0];

                return {
                    sucesso: true,
                    origem: {
                        endereco: leg.start_address,
                        latitude: origemGeo.latitude,
                        longitude: origemGeo.longitude
                    },
                    destino: {
                        endereco: leg.end_address,
                        latitude: destinoGeo.latitude,
                        longitude: destinoGeo.longitude
                    },
                    distancia: {
                        texto: leg.distance.text,
                        metros: leg.distance.value,
                        km: leg.distance.value / 1000
                    },
                    duracao: {
                        texto: leg.duration.text,
                        segundos: leg.duration.value,
                        minutos: Math.round(leg.duration.value / 60)
                    },
                    polyline: route.overview_polyline.points,
                    passos: leg.steps.map(s => ({
                        instrucao: s.html_instructions.replace(/<[^>]*>/g, ''),
                        distancia: s.distance.text,
                        duracao: s.duration.text
                    }))
                };
            }

            return MapsService.calcularRotaOffline(origemGeo, destinoGeo);
        } catch (error) {
            console.error('Erro directions:', error);
            return MapsService.calcularRotaOffline(origemGeo, destinoGeo);
        }
    },

    calcularRotaOffline(origem, destino) {
        const distanciaKm = MapsService.calcularDistancia(
            origem.latitude, origem.longitude,
            destino.latitude, destino.longitude
        );

        // Estimar tempo: média 30km/h em área urbana
        const duracaoMinutos = Math.round((distanciaKm / 30) * 60);

        return {
            sucesso: true,
            origem: {
                endereco: origem.endereco,
                latitude: origem.latitude,
                longitude: origem.longitude
            },
            destino: {
                endereco: destino.endereco,
                latitude: destino.latitude,
                longitude: destino.longitude
            },
            distancia: {
                texto: distanciaKm.toFixed(1) + ' km',
                metros: Math.round(distanciaKm * 1000),
                km: distanciaKm
            },
            duracao: {
                texto: duracaoMinutos + ' min',
                segundos: duracaoMinutos * 60,
                minutos: duracaoMinutos
            },
            polyline: null,
            passos: [],
            offline: true
        };
    },

    // ==================== MATRIZ DE DISTÂNCIA ====================
    async matrizDistancia(origens, destinos) {
        if (!MapsService.apiKey) {
            return MapsService.matrizDistanciaOffline(origens, destinos);
        }

        try {
            const origensStr = origens.map(o => `${o.latitude},${o.longitude}`).join('|');
            const destinosStr = destinos.map(d => `${d.latitude},${d.longitude}`).join('|');
            
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origensStr}&destinations=${destinosStr}&key=${MapsService.apiKey}&language=pt-BR&mode=driving`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK') {
                return {
                    sucesso: true,
                    resultados: data.rows.map((row, i) => ({
                        origem: origens[i],
                        destinos: row.elements.map((elem, j) => ({
                            destino: destinos[j],
                            distancia: elem.distance ? { texto: elem.distance.text, metros: elem.distance.value } : null,
                            duracao: elem.duration ? { texto: elem.duration.text, segundos: elem.duration.value } : null,
                            status: elem.status
                        }))
                    }))
                };
            }

            return MapsService.matrizDistanciaOffline(origens, destinos);
        } catch (error) {
            return MapsService.matrizDistanciaOffline(origens, destinos);
        }
    },

    matrizDistanciaOffline(origens, destinos) {
        return {
            sucesso: true,
            resultados: origens.map(origem => ({
                origem,
                destinos: destinos.map(destino => {
                    const distanciaKm = MapsService.calcularDistancia(
                        origem.latitude, origem.longitude,
                        destino.latitude, destino.longitude
                    );
                    return {
                        destino,
                        distancia: { texto: distanciaKm.toFixed(1) + ' km', metros: Math.round(distanciaKm * 1000) },
                        duracao: { texto: Math.round((distanciaKm / 30) * 60) + ' min', segundos: Math.round((distanciaKm / 30) * 3600) },
                        status: 'OK'
                    };
                })
            })),
            offline: true
        };
    },

    // ==================== ENCONTRAR MOTORISTA MAIS PRÓXIMO ====================
    async encontrarMotoristaProximo(clienteLatLng, motoristas) {
        if (!motoristas || motoristas.length === 0) {
            return { sucesso: false, error: 'Nenhum motorista disponível' };
        }

        const motoristasComDistancia = motoristas
            .filter(m => m.latitude && m.longitude && m.status === 'disponivel')
            .map(m => ({
                ...m,
                distanciaKm: MapsService.calcularDistancia(
                    clienteLatLng.latitude, clienteLatLng.longitude,
                    m.latitude, m.longitude
                )
            }))
            .sort((a, b) => a.distanciaKm - b.distanciaKm);

        if (motoristasComDistancia.length === 0) {
            return { sucesso: false, error: 'Nenhum motorista disponível na região' };
        }

        const maisProximo = motoristasComDistancia[0];
        const tempoEstimado = Math.round((maisProximo.distanciaKm / 30) * 60); // 30km/h média

        return {
            sucesso: true,
            motorista: maisProximo,
            distanciaKm: maisProximo.distanciaKm,
            tempoEstimadoMinutos: tempoEstimado,
            alternativas: motoristasComDistancia.slice(1, 4) // Próximos 3
        };
    },

    // ==================== AUTOCOMPLETAR ====================
    async autocompletar(texto) {
        if (!MapsService.apiKey || texto.length < 3) {
            return { sucesso: true, sugestoes: [], offline: true };
        }

        try {
            const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(texto)}&key=${MapsService.apiKey}&language=pt-BR&components=country:br&types=address`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === 'OK') {
                return {
                    sucesso: true,
                    sugestoes: data.predictions.map(p => ({
                        descricao: p.description,
                        placeId: p.place_id,
                        principal: p.structured_formatting?.main_text,
                        secundario: p.structured_formatting?.secondary_text
                    }))
                };
            }

            return { sucesso: true, sugestoes: [] };
        } catch (error) {
            return { sucesso: true, sugestoes: [], offline: true };
        }
    },

    // ==================== HELPERS ====================
    calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raio da Terra em km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    extrairComponentes(components) {
        const result = {};
        components.forEach(c => {
            if (c.types.includes('street_number')) result.numero = c.long_name;
            if (c.types.includes('route')) result.rua = c.long_name;
            if (c.types.includes('sublocality') || c.types.includes('sublocality_level_1')) result.bairro = c.long_name;
            if (c.types.includes('administrative_area_level_2')) result.cidade = c.long_name;
            if (c.types.includes('administrative_area_level_1')) result.estado = c.short_name;
            if (c.types.includes('country')) result.pais = c.long_name;
            if (c.types.includes('postal_code')) result.cep = c.long_name;
        });
        return result;
    },

    // Decodificar polyline do Google
    decodificarPolyline(encoded) {
        const points = [];
        let index = 0, lat = 0, lng = 0;

        while (index < encoded.length) {
            let b, shift = 0, result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);

            shift = 0;
            result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            lng += (result & 1) ? ~(result >> 1) : (result >> 1);

            points.push({ lat: lat / 1e5, lng: lng / 1e5 });
        }

        return points;
    }
};

module.exports = MapsService;
