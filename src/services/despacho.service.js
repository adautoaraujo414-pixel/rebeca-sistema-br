const { v4: uuidv4 } = require('uuid');
const MapsService = require('./maps.service');
const GPSIntegradoService = require('./gps-integrado.service');

const corridasPendentes = new Map(); // Corridas aguardando aceite
const notificacoesMotoristas = new Map(); // Notificações enviadas

const DespachoService = {
    modoDespacho: 'broadcast', // 'broadcast' ou 'proximo'
    tempoAceiteSegundos: 30,
    tentativasMaximas: 3,

    // ==================== CONFIGURAÇÃO ====================
    setModo: (modo) => {
        if (['broadcast', 'proximo'].includes(modo)) {
            DespachoService.modoDespacho = modo;
            return { sucesso: true, modo };
        }
        return { error: 'Modo inválido. Use: broadcast ou proximo' };
    },

    getModo: () => DespachoService.modoDespacho,

    setTempoAceite: (segundos) => {
        DespachoService.tempoAceiteSegundos = segundos;
        return { sucesso: true, tempoAceite: segundos };
    },

    // ==================== DESPACHO DE CORRIDA ====================
    async despacharCorrida(corrida, motoristasDisponiveis) {
        const modo = DespachoService.modoDespacho;
        
        console.log(`🚗 Despachando corrida ${corrida.id} - Modo: ${modo}`);

        if (modo === 'proximo') {
            return await DespachoService.despacharParaProximo(corrida, motoristasDisponiveis);
        } else {
            return await DespachoService.despacharBroadcast(corrida, motoristasDisponiveis);
        }
    },

    // ==================== MODO: MOTORISTA MAIS PRÓXIMO ====================
    async despacharParaProximo(corrida, motoristasDisponiveis) {
        if (!motoristasDisponiveis || motoristasDisponiveis.length === 0) {
            return { sucesso: false, error: 'Nenhum motorista disponível' };
        }

        // Buscar coordenadas da origem
        let origemCoords = corrida.origem;
        if (typeof corrida.origem === 'string') {
            const geo = await MapsService.geocodificar(corrida.origem);
            if (geo.sucesso) {
                origemCoords = { latitude: geo.latitude, longitude: geo.longitude };
            }
        }

        // Calcular distância de cada motorista
        const motoristasComDistancia = motoristasDisponiveis
            .filter(m => m.latitude && m.longitude && m.status === 'disponivel')
            .map(m => ({
                ...m,
                distanciaKm: MapsService.calcularDistancia(
                    origemCoords.latitude, origemCoords.longitude,
                    m.latitude, m.longitude
                )
            }))
            .sort((a, b) => a.distanciaKm - b.distanciaKm);

        if (motoristasComDistancia.length === 0) {
            return { sucesso: false, error: 'Nenhum motorista disponível na região' };
        }

        const motoristaMaisProximo = motoristasComDistancia[0];
        const tempoEstimado = Math.round((motoristaMaisProximo.distanciaKm / 30) * 60);

        // Registrar despacho
        const despacho = {
            id: 'desp_' + uuidv4().slice(0, 8),
            corridaId: corrida.id,
            modo: 'proximo',
            motoristaId: motoristaMaisProximo.id,
            motoristaNome: motoristaMaisProximo.nome || motoristaMaisProximo.nomeCompleto,
            distanciaKm: motoristaMaisProximo.distanciaKm,
            tempoEstimadoMinutos: tempoEstimado,
            status: 'enviado',
            enviadoEm: new Date().toISOString(),
            expiraEm: new Date(Date.now() + DespachoService.tempoAceiteSegundos * 1000).toISOString(),
            tentativa: 1,
            alternativas: motoristasComDistancia.slice(1, 4).map(m => ({
                id: m.id,
                nome: m.nome || m.nomeCompleto,
                distanciaKm: m.distanciaKm
            }))
        };

        corridasPendentes.set(corrida.id, despacho);

        // Registrar notificação para o motorista
        if (!notificacoesMotoristas.has(motoristaMaisProximo.id)) {
            notificacoesMotoristas.set(motoristaMaisProximo.id, []);
        }
        notificacoesMotoristas.get(motoristaMaisProximo.id).push({
            corridaId: corrida.id,
            tipo: 'nova_corrida',
            enviadoEm: new Date().toISOString(),
            expiraEm: despacho.expiraEm
        });

        console.log(`📍 Corrida ${corrida.id} enviada para ${motoristaMaisProximo.nome || motoristaMaisProximo.nomeCompleto} (${motoristaMaisProximo.distanciaKm.toFixed(1)}km)`);

        return {
            sucesso: true,
            modo: 'proximo',
            despacho,
            motorista: {
                id: motoristaMaisProximo.id,
                nome: motoristaMaisProximo.nome || motoristaMaisProximo.nomeCompleto,
                whatsapp: motoristaMaisProximo.whatsapp,
                distanciaKm: motoristaMaisProximo.distanciaKm,
                tempoEstimadoMinutos: tempoEstimado
            }
        };
    },

    // ==================== MODO: BROADCAST (TODOS) ====================
    async despacharBroadcast(corrida, motoristasDisponiveis) {
        if (!motoristasDisponiveis || motoristasDisponiveis.length === 0) {
            return { sucesso: false, error: 'Nenhum motorista disponível' };
        }

        const motoristasAtivos = motoristasDisponiveis.filter(m => m.status === 'disponivel');

        if (motoristasAtivos.length === 0) {
            return { sucesso: false, error: 'Nenhum motorista disponível' };
        }

        // Buscar coordenadas da origem para calcular distâncias
        let origemCoords = corrida.origem;
        if (typeof corrida.origem === 'string') {
            const geo = await MapsService.geocodificar(corrida.origem);
            if (geo.sucesso) {
                origemCoords = { latitude: geo.latitude, longitude: geo.longitude };
            }
        }

        // Calcular distância de cada motorista (para ordenar na tela deles)
        const motoristasComDistancia = motoristasAtivos
            .filter(m => m.latitude && m.longitude)
            .map(m => ({
                ...m,
                distanciaKm: origemCoords.latitude ? MapsService.calcularDistancia(
                    origemCoords.latitude, origemCoords.longitude,
                    m.latitude, m.longitude
                ) : 999
            }))
            .sort((a, b) => a.distanciaKm - b.distanciaKm);

        // Registrar despacho
        const despacho = {
            id: 'desp_' + uuidv4().slice(0, 8),
            corridaId: corrida.id,
            modo: 'broadcast',
            motoristasNotificados: motoristasComDistancia.map(m => ({
                id: m.id,
                nome: m.nome || m.nomeCompleto,
                distanciaKm: m.distanciaKm,
                notificadoEm: new Date().toISOString()
            })),
            totalNotificados: motoristasComDistancia.length,
            status: 'aguardando_aceite',
            enviadoEm: new Date().toISOString(),
            expiraEm: new Date(Date.now() + DespachoService.tempoAceiteSegundos * 1000).toISOString(),
            aceitoPor: null
        };

        corridasPendentes.set(corrida.id, despacho);

        // Registrar notificação para cada motorista
        motoristasComDistancia.forEach(m => {
            if (!notificacoesMotoristas.has(m.id)) {
                notificacoesMotoristas.set(m.id, []);
            }
            notificacoesMotoristas.get(m.id).push({
                corridaId: corrida.id,
                tipo: 'nova_corrida_broadcast',
                distanciaKm: m.distanciaKm,
                enviadoEm: new Date().toISOString(),
                expiraEm: despacho.expiraEm
            });
        });

        console.log(`📢 Corrida ${corrida.id} enviada para ${motoristasComDistancia.length} motoristas (broadcast)`);

        return {
            sucesso: true,
            modo: 'broadcast',
            despacho,
            motoristasNotificados: motoristasComDistancia.length
        };
    },

    // ==================== ACEITAR CORRIDA ====================
    aceitarCorrida(corridaId, motoristaId, motoristaNome) {
        const despacho = corridasPendentes.get(corridaId);
        
        if (!despacho) {
            return { sucesso: false, error: 'Corrida não encontrada ou já aceita' };
        }

        // Verificar se expirou
        if (new Date(despacho.expiraEm) < new Date()) {
            corridasPendentes.delete(corridaId);
            return { sucesso: false, error: 'Tempo de aceite expirado' };
        }

        // Modo próximo: verificar se é o motorista certo
        if (despacho.modo === 'proximo' && despacho.motoristaId !== motoristaId) {
            return { sucesso: false, error: 'Esta corrida foi enviada para outro motorista' };
        }

        // Registrar aceite
        despacho.status = 'aceita';
        despacho.aceitoPor = motoristaId;
        despacho.aceitoPorNome = motoristaNome;
        despacho.aceitoEm = new Date().toISOString();

        // Remover notificações de outros motoristas
        if (despacho.modo === 'broadcast') {
            despacho.motoristasNotificados.forEach(m => {
                if (m.id !== motoristaId) {
                    const notifs = notificacoesMotoristas.get(m.id);
                    if (notifs) {
                        const idx = notifs.findIndex(n => n.corridaId === corridaId);
                        if (idx > -1) notifs.splice(idx, 1);
                    }
                }
            });
        }

        console.log(`✅ Corrida ${corridaId} aceita por ${motoristaNome}`);

        return {
            sucesso: true,
            corridaId,
            motoristaId,
            motoristaNome,
            modo: despacho.modo,
            tempoResposta: Math.round((new Date() - new Date(despacho.enviadoEm)) / 1000) + 's'
        };
    },

    // ==================== RECUSAR/EXPIRAR CORRIDA ====================
    recusarCorrida(corridaId, motoristaId, motivo = 'Recusado') {
        const despacho = corridasPendentes.get(corridaId);
        
        if (!despacho) {
            return { sucesso: false, error: 'Corrida não encontrada' };
        }

        if (despacho.modo === 'proximo') {
            // Tentar próximo motorista da lista
            if (despacho.alternativas && despacho.alternativas.length > 0 && despacho.tentativa < DespachoService.tentativasMaximas) {
                const proximo = despacho.alternativas.shift();
                despacho.motoristaId = proximo.id;
                despacho.motoristaNome = proximo.nome;
                despacho.distanciaKm = proximo.distanciaKm;
                despacho.tentativa++;
                despacho.enviadoEm = new Date().toISOString();
                despacho.expiraEm = new Date(Date.now() + DespachoService.tempoAceiteSegundos * 1000).toISOString();

                console.log(`🔄 Corrida ${corridaId} redirecionada para ${proximo.nome} (tentativa ${despacho.tentativa})`);

                return {
                    sucesso: true,
                    redirecionado: true,
                    novoMotorista: proximo,
                    tentativa: despacho.tentativa
                };
            } else {
                // Sem mais alternativas
                corridasPendentes.delete(corridaId);
                return {
                    sucesso: false,
                    error: 'Nenhum motorista aceitou a corrida',
                    semMotoristas: true
                };
            }
        } else {
            // Broadcast: apenas remove da lista do motorista
            const notifs = notificacoesMotoristas.get(motoristaId);
            if (notifs) {
                const idx = notifs.findIndex(n => n.corridaId === corridaId);
                if (idx > -1) notifs.splice(idx, 1);
            }

            return { sucesso: true, removido: true };
        }
    },

    // ==================== CONSULTAS ====================
    getCorridaPendente(corridaId) {
        return corridasPendentes.get(corridaId);
    },

    getCorridasPendentesMotorista(motoristaId) {
        return notificacoesMotoristas.get(motoristaId) || [];
    },

    getCorridasDisponiveis(motoristaId) {
        const notifs = notificacoesMotoristas.get(motoristaId) || [];
        const agora = new Date();
        
        // Filtrar apenas não expiradas
        return notifs.filter(n => new Date(n.expiraEm) > agora);
    },

    limparExpiradas() {
        const agora = new Date();
        let limpas = 0;

        corridasPendentes.forEach((despacho, corridaId) => {
            if (new Date(despacho.expiraEm) < agora && despacho.status !== 'aceita') {
                corridasPendentes.delete(corridaId);
                limpas++;
            }
        });

        notificacoesMotoristas.forEach((notifs, motoristaId) => {
            const ativas = notifs.filter(n => new Date(n.expiraEm) > agora);
            notificacoesMotoristas.set(motoristaId, ativas);
        });

        if (limpas > 0) console.log(`🧹 ${limpas} corridas expiradas limpas`);
        return limpas;
    },

    // ==================== ESTATÍSTICAS ====================
    getEstatisticas() {
        const pendentes = Array.from(corridasPendentes.values());
        return {
            modo: DespachoService.modoDespacho,
            tempoAceiteSegundos: DespachoService.tempoAceiteSegundos,
            corridasPendentes: pendentes.length,
            aguardandoAceite: pendentes.filter(d => d.status === 'aguardando_aceite' || d.status === 'enviado').length,
            aceitas: pendentes.filter(d => d.status === 'aceita').length,
            motoristasComNotificacao: notificacoesMotoristas.size
        };
    }
};

// Limpar expiradas a cada 30 segundos
setInterval(() => DespachoService.limparExpiradas(), 30000);

module.exports = DespachoService;
