const { v4: uuidv4 } = require('uuid');
const MotoristaService = require('./motorista.service');
const PrecoAdminService = require('./preco-admin.service');
const MapsService = require('./maps.service');
const GPSIntegradoService = require('./gps-integrado.service');

const corridasPendentes = new Map(); // Corridas aguardando aceite
const notificacoesMotoristas = new Map(); // Notificações enviadas


// FALLBACK: Ao iniciar, recuperar corridas pendentes do MongoDB que ainda não estão na Map
async function recuperarCorridasPendentes() {
    try {
        const { Corrida } = require('../models');
        const limite = new Date(Date.now() - 15 * 60 * 1000); // 15 min
        const pendentes = await Corrida.find({ status: 'pendente', createdAt: { $gte: limite } });
        for (const c of pendentes) {
            const id = c._id.toString();
            if (!corridasPendentes.has(id)) {
                corridasPendentes.set(id, {
                    corridaId: id,
                    corrida: c,
                    adminId: c.adminId,
                    modo: 'broadcast',
                    motoristasNotificados: [],
                    enviadoEm: c.createdAt
                });
            }
        }
        if (pendentes.length > 0) console.log('[DESPACHO] Recuperadas', pendentes.length, 'corridas pendentes do MongoDB');
    } catch(e) { console.log('[DESPACHO] Erro ao recuperar pendentes:', e.message); }
}
setTimeout(recuperarCorridasPendentes, 3000); // Executar 3s após iniciar

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
    async despacharPorPonto(corrida, adminId) {
        // Verifica se há pontos ativos próximos à origem da corrida
        try {
            const { PontoEmbarque, FilaPonto } = require('../models');
            const agora = new Date();
            const diaSemana = agora.getDay();
            const hora = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
            const pontos = await PontoEmbarque.find({
                adminId, ativo: true,
                diasSemana: diaSemana,
                horarioAbertura: { $lte: hora },
                horarioFechamento: { $gte: hora }
            }).lean();

            if (!pontos.length) return false;

            // Encontrar ponto mais próximo da origem
            let pontoMaisProximo = null, menorDist = Infinity;
            const origemLat = corrida.origem?.lat || corrida.origemLat;
            const origemLng = corrida.origem?.lng || corrida.origemLng;

            if (origemLat && origemLng) {
                for (const p of pontos) {
                    if (!p.lat || !p.lng) continue;
                    const dist = Math.sqrt(Math.pow(p.lat - origemLat, 2) + Math.pow(p.lng - origemLng, 2));
                    if (dist < menorDist) { menorDist = dist; pontoMaisProximo = p; }
                }
            } else {
                pontoMaisProximo = pontos[0];
            }

            if (!pontoMaisProximo) return false;

            // Pegar fila do ponto (ordem de chegada)
            const filaAtual = await FilaPonto.find({
                pontoId: pontoMaisProximo._id, status: 'aguardando'
            }).sort({ ordemChegada: 1 }).lean();

            if (!filaAtual.length) return false;

            // Notificar motoristas do ponto (até maxCorridasPonto)
            const max = pontoMaisProximo.maxCorridasPonto || 5;
            const motoristasDoPonto = filaAtual.slice(0, max).map(f => ({ _id: f.motoristaId, nomeCompleto: f.motoristaNome }));

            console.log(`[PONTO] Despachando para ${motoristasDoPonto.length} motoristas do ponto ${pontoMaisProximo.nome}`);
            await this.despacharCorrida(corrida, motoristasDoPonto, adminId);

            // Após 1 minuto sem aceite, broadcast para todos
            setTimeout(async () => {
                try {
                    const { Corrida, Motorista } = require('../models');
                    const corridaAtual = await Corrida.findById(corrida._id).lean();
                    if (corridaAtual && corridaAtual.status === 'pendente') {
                        console.log('[PONTO] 1 min sem aceite — broadcast para todos');
                        const todos = await Motorista.find({ adminId, online: true }).lean();
                        await DespachoService.despacharCorrida(corridaAtual, todos, adminId);
                    }
                } catch(e) { console.log('[PONTO TIMEOUT]', e.message); }
            }, 60000);

            return true;
        } catch(e) {
            console.log('[PONTO] Erro:', e.message);
            return false;
        }
    },

    async despacharCorrida(corrida, motoristasDisponiveis, adminId = null) {
        // ===== SISTEMA DE PONTOS =====
        try {
            const { PontoEmbarque, FilaPonto } = require('../models');
            const adminIdStr = (adminId || corrida.adminId)?.toString();

            // Encontrar ponto mais próximo da origem da corrida
            const pontos = await PontoEmbarque.find({ adminId: adminIdStr, ativo: true });
            let pontoMaisProximo = null;
            let menorDistancia = Infinity;

            if (pontos.length > 0 && corrida.origem?.lat && corrida.origem?.lng) {
                for (const p of pontos) {
                    if (!p.lat || !p.lng) continue;
                    const dist = Math.sqrt(Math.pow(p.lat - corrida.origem.lat, 2) + Math.pow(p.lng - corrida.origem.lng, 2));
                    if (dist < menorDistancia) { menorDistancia = dist; pontoMaisProximo = p; }
                }
            }

            if (pontoMaisProximo && menorDistancia < 0.1) { // ~10km
                // Verificar fila do ponto
                const fila = await FilaPonto.find({ pontoId: pontoMaisProximo._id, status: 'aguardando' }).sort({ ordemChegada: 1 });
                
                if (fila.length > 0) {
                    console.log(`[PONTOS] Corrida vai para fila do ponto ${pontoMaisProximo.nome} — ${fila.length} motoristas`);
                    
                    // Notificar motoristas do ponto por ordem de chegada (até maxCorridasPonto)
                    const limite = pontoMaisProximo.maxCorridasPonto || 3;
                    const motoristasNoPonto = fila.slice(0, limite).map(f => f.motoristaId.toString());
                    
                    // Filtrar motoristasDisponiveis pelos que estão no ponto
                    const motoristasFilados = motoristasDisponiveis.filter(m => motoristasNoPonto.includes(m._id.toString()));
                    
                    if (motoristasFilados.length > 0) {
                        // Notificar só os do ponto por 1 minuto
                        console.log(`[PONTOS] Notificando ${motoristasFilados.length} motoristas do ponto por 60s`);
                        
                        // Despachar só para os do ponto
                        const corridaId = corrida._id.toString();
                        global._corridasPonto = global._corridasPonto || new Map();
                        global._corridasPonto.set(corridaId, { pontoId: pontoMaisProximo._id, adminId: adminIdStr });
                        
                        // Após 60s sem aceite, broadcast para todos
                        setTimeout(async () => {
                            try {
                                const { Corrida } = require('../models');
                                const corridaAtual = await Corrida.findById(corridaId);
                                if (corridaAtual && corridaAtual.status === 'pendente') {
                                    console.log('[PONTOS] Timeout 60s — broadcast para todos');
                                    global._corridasPonto.delete(corridaId);
                                    // Notificar todos os motoristas disponíveis
                                    for (const mot of motoristasDisponiveis) {
                                        try {
                                            if (mot.pushSubscription) {
                                                const GPSIntegradoService = require('./gps-integrado.service');
                                                await GPSIntegradoService.notificarMotorista(mot, corridaAtual);
                                            }
                                        } catch(e) {}
                                    }
                                }
                            } catch(e) { console.log('[PONTOS] Erro timeout:', e.message); }
                        }, 60000);
                        
                        // Substituir lista de motoristas pelos do ponto
                        motoristasDisponiveis = motoristasFilados;
                    }
                }
            }
        } catch(pontosErr) { console.log('[PONTOS] Erro sistema pontos:', pontosErr.message); }
        // ===== SISTEMA DE PONTOS =====
        try {
            const { PontoEmbarque, FilaPonto } = require('../models');
            const adminIdStr = (adminId || corrida.adminId)?.toString();

            // Encontrar ponto mais próximo da origem da corrida
            const pontos = await PontoEmbarque.find({ adminId: adminIdStr, ativo: true });
            let pontoMaisProximo = null;
            let menorDistancia = Infinity;

            if (pontos.length > 0 && corrida.origem?.lat && corrida.origem?.lng) {
                for (const p of pontos) {
                    if (!p.lat || !p.lng) continue;
                    const dist = Math.sqrt(Math.pow(p.lat - corrida.origem.lat, 2) + Math.pow(p.lng - corrida.origem.lng, 2));
                    if (dist < menorDistancia) { menorDistancia = dist; pontoMaisProximo = p; }
                }
            }

            if (pontoMaisProximo && menorDistancia < 0.1) { // ~10km
                // Verificar fila do ponto
                const fila = await FilaPonto.find({ pontoId: pontoMaisProximo._id, status: 'aguardando' }).sort({ ordemChegada: 1 });
                
                if (fila.length > 0) {
                    console.log(`[PONTOS] Corrida vai para fila do ponto ${pontoMaisProximo.nome} — ${fila.length} motoristas`);
                    
                    // Notificar motoristas do ponto por ordem de chegada (até maxCorridasPonto)
                    const limite = pontoMaisProximo.maxCorridasPonto || 3;
                    const motoristasNoPonto = fila.slice(0, limite).map(f => f.motoristaId.toString());
                    
                    // Filtrar motoristasDisponiveis pelos que estão no ponto
                    const motoristasFilados = motoristasDisponiveis.filter(m => motoristasNoPonto.includes(m._id.toString()));
                    
                    if (motoristasFilados.length > 0) {
                        // Notificar só os do ponto por 1 minuto
                        console.log(`[PONTOS] Notificando ${motoristasFilados.length} motoristas do ponto por 60s`);
                        
                        // Despachar só para os do ponto
                        const corridaId = corrida._id.toString();
                        global._corridasPonto = global._corridasPonto || new Map();
                        global._corridasPonto.set(corridaId, { pontoId: pontoMaisProximo._id, adminId: adminIdStr });
                        
                        // Após 60s sem aceite, broadcast para todos
                        setTimeout(async () => {
                            try {
                                const { Corrida } = require('../models');
                                const corridaAtual = await Corrida.findById(corridaId);
                                if (corridaAtual && corridaAtual.status === 'pendente') {
                                    console.log('[PONTOS] Timeout 60s — broadcast para todos');
                                    global._corridasPonto.delete(corridaId);
                                    // Notificar todos os motoristas disponíveis
                                    for (const mot of motoristasDisponiveis) {
                                        try {
                                            if (mot.pushSubscription) {
                                                const GPSIntegradoService = require('./gps-integrado.service');
                                                await GPSIntegradoService.notificarMotorista(mot, corridaAtual);
                                            }
                                        } catch(e) {}
                                    }
                                }
                            } catch(e) { console.log('[PONTOS] Erro timeout:', e.message); }
                        }, 60000);
                        
                        // Substituir lista de motoristas pelos do ponto
                        motoristasDisponiveis = motoristasFilados;
                    }
                }
            }
        } catch(pontosErr) { console.log('[PONTOS] Erro sistema pontos:', pontosErr.message); }
        // Buscar foto do cliente no WhatsApp e salvar endereço em texto
        try {
            const { InstanciaWhatsapp } = require('../models');
            const axios = require('axios');
            const inst = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId || adminId, status: 'conectado' });
            if (inst && corrida.clienteTelefone && !corrida.clienteFoto) {
                try {
                    const fotoResp = await axios.get(
                        `${process.env.EVOLUTION_API_URL}/chat/fetchProfile/${inst.nomeInstancia}`,
                        { params: { number: corrida.clienteTelefone + '@s.whatsapp.net' },
                          headers: { 'apikey': process.env.EVOLUTION_API_KEY }, timeout: 8000 }
                    );
                    const fotoUrl = fotoResp.data?.picture || fotoResp.data?.profilePictureUrl || null;
                    if (fotoUrl) {
                        corrida.clienteFoto = fotoUrl;
                        await corrida.save();
                        console.log('[FOTO] Foto do cliente salva:', fotoUrl.substring(0, 60));
                    }
                } catch(fotoErr) { console.log('[FOTO] Não obteve foto:', fotoErr.message); }
            }
            // Salvar endereço de origem em texto legível
            if (corrida.origem && !corrida.enderecoOrigemTexto) {
                const endTxt = corrida.origem?.endereco || corrida.origem?.enderecoFormatado || corrida.enderecoOrigem || '';
                if (endTxt) {
                    corrida.enderecoOrigemTexto = endTxt;
                    corrida.enderecoDestinoTexto = corrida.destino?.endereco || corrida.destino?.enderecoFormatado || corrida.enderecoDestino || '';
                    await corrida.save();
                }
            }
        } catch(e) { console.log('[DESPACHO] Erro ao buscar foto/endereço:', e.message); }
        // Buscar modo do admin (ou usar padrão)
        let modo = DespachoService.modoDespacho;
        if (adminId) {
            try {
                modo = await PrecoAdminService.getModoDespacho(adminId);
            } catch (e) {
                console.log('[DESPACHO] Usando modo padrão:', modo);
            }
        }
        
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

    // ==================== PRÓXIMA CORRIDA (motorista em corrida mas perto) ====================
    async verificarProximaCorrida(corrida, adminId) {
        try {
            // Buscar motoristas EM CORRIDA que estão próximos
            const { Motorista } = require('../models');
            const motoristasEmCorrida = await Motorista.find({ 
                adminId, 
                status: 'em_corrida',
                ativo: true,
                latitude: { $exists: true },
                longitude: { $exists: true }
            });
            
            if (!motoristasEmCorrida.length) return null;
            
            // Buscar coordenadas da origem da nova corrida
            let origemCoords = corrida.origem;
            if (typeof corrida.origem === 'string') {
                const geo = await MapsService.geocodificar(corrida.origem);
                if (geo.sucesso) origemCoords = { latitude: geo.latitude, longitude: geo.longitude };
            }
            if (!origemCoords?.latitude) return null;
            
            // Encontrar motorista em corrida mais próximo (< 2km)
            const proximoDisponivel = motoristasEmCorrida
                .map(m => ({
                    ...m.toObject(),
                    distanciaKm: MapsService.calcularDistancia(
                        origemCoords.latitude, origemCoords.longitude,
                        m.latitude, m.longitude
                    )
                }))
                .filter(m => m.distanciaKm < 2) // Máximo 2km
                .sort((a, b) => a.distanciaKm - b.distanciaKm)[0];
            
            if (proximoDisponivel) {
                console.log(`📍 Próxima corrida: ${proximoDisponivel.nomeCompleto || proximoDisponivel.nome} está a ${proximoDisponivel.distanciaKm.toFixed(1)}km`);
                return proximoDisponivel;
            }
            return null;
        } catch(e) {
            console.error('[DESPACHO] Erro verificarProximaCorrida:', e.message);
            return null;
        }
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
            const mId = m._id?.toString() || m.id?.toString() || m.id;
            if (!notificacoesMotoristas.has(mId)) {
                notificacoesMotoristas.set(mId, []);
            }
            notificacoesMotoristas.get(mId).push({
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

        // MUDAR STATUS DO MOTORISTA PARA EM_CORRIDA
        MotoristaService.atualizarStatus(motoristaId, 'em_corrida');
        console.log(`✅ Corrida ${corridaId} aceita por ${motoristaNome} - Status: em_corrida`);
        
        // Salvar ultimo motorista do cliente
        try {
            const RebecaService = require('./rebeca.service');
            const corrida = CorridaService.buscar(corridaId);
            if (corrida?.clienteTelefone) {
                RebecaService.salvarUltimoMotorista(corrida.clienteTelefone, motoristaId, corrida.adminId);
            }
        } catch(e) { console.log('[DESPACHO] Erro salvar ultimo motorista:', e.message); }

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
        console.log('[DESPACHO] Buscando corridas para motorista:', motoristaId);
        console.log('[DESPACHO] Notificações registradas:', Array.from(notificacoesMotoristas.keys()));
        
        // Tentar diferentes formatos de ID
        const ids = [motoristaId, motoristaId?.toString()];
        let notifs = [];
        
        for (const id of ids) {
            if (notificacoesMotoristas.has(id)) {
                notifs = notificacoesMotoristas.get(id) || [];
                break;
            }
        }
        
        const agora = new Date();
        const disponiveis = notifs.filter(n => new Date(n.expiraEm) > agora);
        console.log('[DESPACHO] Corridas encontradas:', disponiveis.length);
        
        return disponiveis;
    },

    limparExpiradas() {
        // Limpar notificacoes expiradas dos motoristas
        const agoraNotif = new Date();
        notificacoesMotoristas.forEach((notifs, motoristaId) => {
            const validas = notifs.filter(n => new Date(n.expiraEm) > agoraNotif);
            if (validas.length === 0) {
                notificacoesMotoristas.delete(motoristaId);
            } else {
                notificacoesMotoristas.set(motoristaId, validas);
            }
        });

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
