const axios = require('axios');
const { InstanciaWhatsapp, Admin } = require('../models');

const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-19af.up.railway.app';
const EVOLUTION_GLOBAL_KEY = process.env.EVOLUTION_API_KEY || '31f8c35a2ed99385b1e2de3855ad43eba929292a8cb22bd42d2522f5567e7bae';


// ============================================================
// SISTEMA ANTI-BLOQUEIO WHATSAPP — proteção completa
// ============================================================
const _wppGuard = {
    // Rate limit: máx 6 msgs/minuto por instância
    _contadores: {},       // instanciaId -> { count, resetAt }
    // Cache anti-duplicata: não mandar 2x para o mesmo número em 45s
    _recentes: {},         // `instId:numero` -> timestamp
    // Delay progressivo: quanto mais msgs seguidas, maior o intervalo
    _sequencia: {},        // instanciaId -> { count, ultimaAt }

    // Verificar e registrar envio — retorna { ok, aguardar }
    checar(instanciaId, numero) {
        const agora = Date.now();
        const chaveInst = String(instanciaId);
        const chaveNum  = chaveInst + ':' + numero;

        // 1. Anti-duplicata — mesma instância + mesmo número em 45s
        if (this._recentes[chaveNum] && agora - this._recentes[chaveNum] < 45000) {
            const restam = Math.ceil((45000 - (agora - this._recentes[chaveNum])) / 1000);
            console.log('[GUARD] Duplicata bloqueada para', numero, '— aguardar', restam, 's');
            return { ok: false, motivo: 'duplicata', aguardar: restam * 1000 };
        }

        // 2. Rate limit — máx 6 msgs por minuto por instância
        if (!this._contadores[chaveInst] || agora > this._contadores[chaveInst].resetAt) {
            this._contadores[chaveInst] = { count: 0, resetAt: agora + 60000 };
        }
        if (this._contadores[chaveInst].count >= 6) {
            const aguardar = this._contadores[chaveInst].resetAt - agora;
            console.log('[GUARD] Rate limit atingido para instancia', chaveInst, '— aguardar', Math.ceil(aguardar/1000), 's');
            return { ok: false, motivo: 'rate_limit', aguardar };
        }

        // 3. Delay progressivo — sequência de msgs para instâncias diferentes
        if (!this._sequencia[chaveInst]) this._sequencia[chaveInst] = { count: 0, ultimaAt: 0 };
        const seq = this._sequencia[chaveInst];
        const deltaUltima = agora - seq.ultimaAt;
        // Se mandou há menos de 8s, incrementa sequência; senão reseta
        if (deltaUltima < 8000) { seq.count = Math.min(seq.count + 1, 10); }
        else { seq.count = 0; }

        return { ok: true, delayExtra: seq.count * 400 }; // até 4s extra por sequência
    },

    registrar(instanciaId, numero) {
        const agora = Date.now();
        const chaveInst = String(instanciaId);
        const chaveNum  = chaveInst + ':' + numero;
        this._recentes[chaveNum] = agora;
        this._contadores[chaveInst].count++;
        this._sequencia[chaveInst].ultimaAt = agora;
        // Limpar cache antigo a cada 200 registros
        if (Object.keys(this._recentes).length > 200) {
            const limite = agora - 120000;
            for (const k in this._recentes) { if (this._recentes[k] < limite) delete this._recentes[k]; }
        }
    },

    // Variação sutil no texto — evita mensagens idênticas para múltiplos números
    variarTexto(texto) {
        const sufixos = ['', ' ', '  ', '\u200b', '\u200c'];
        const s = sufixos[Math.floor(Math.random() * sufixos.length)];
        // Variação na saudação se existir
        const variacoes = [
            [/^Oi\b/, ['Oi', 'Olá', 'Oi']],
            [/^Olá\b/, ['Olá', 'Oi', 'Olá']],
            [/Obrigado/g, ['Obrigado', 'Obrigada', 'Obrigado']],
        ];
        let t = texto;
        for (const [re, opts] of variacoes) {
            if (re.test(t)) { t = t.replace(re, opts[Math.floor(Math.random() * opts.length)]); break; }
        }
        return t + s;
    },

    // Verificar horário comercial (6h-23h) — só avisa no log, não bloqueia
    verificarHorario() {
        const h = new Date().getHours();
        if (h < 6 || h >= 23) {
            console.log('[GUARD] ⚠️ Envio fora do horário comercial (' + h + 'h) — considere agendar');
        }
    }
};

const EvolutionMultiService = {
    criarInstancia: async (adminId, nomeEmpresa) => {
        try {
            // ✅ SEMPRE reaproveitar instância existente — nunca criar duplicata
            const { Types: { ObjectId: ObjId } } = require('mongoose');
            const adminIdStr = adminId.toString();
            const existente = await InstanciaWhatsapp.findOne({
                $or: [
                    { adminId: ObjId.isValid(adminId) ? new ObjId(adminId) : adminId },
                    { adminId: adminIdStr }
                ]
            }).sort({ createdAt: -1 }).lean();
            console.log('[EVO] Buscando instancia para adminId:', adminIdStr, '| encontrou:', existente ? existente.nomeInstancia : 'NENHUMA');
            if (existente) {
                console.log('[EVO] Instancia existente encontrada:', existente.nomeInstancia);
                return { sucesso: true, instancia: existente, existente: true };
            }
            // Buscar em Admin (corridas) ou AdminDelivery
            let admin = await Admin.findById(adminId);
            if (!admin) {
                const { AdminDelivery } = require('../models/delivery.models');
                admin = await AdminDelivery.findById(adminId);
            }
            if (!admin) throw new Error('Admin nao encontrado');
            const nomeInstancia = 'rebeca_' + nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
            let evolutionResponse = null;
            try {
                evolutionResponse = await axios.post(EVOLUTION_BASE_URL + '/instance/create', { instanceName: nomeInstancia, qrcode: true, integration: 'WHATSAPP-BAILEYS' }, { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
            } catch (e) { console.log('Evolution API nao disponivel'); }
            const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook/' + nomeInstancia;
            const instancia = await InstanciaWhatsapp.create({ adminId, nomeInstancia, apiUrl: EVOLUTION_BASE_URL, apiKey: evolutionResponse?.data?.hash || EVOLUTION_GLOBAL_KEY, status: 'desconectado', webhookUrl });
            
            // Configurar webhook na Evolution API (aguardar instancia estar pronta)
            await new Promise(r => setTimeout(r, 2000));
            try {
                await axios.post(EVOLUTION_BASE_URL + '/webhook/set/' + nomeInstancia, {
                    url: webhookUrl,
                    webhook_by_events: false,
                    enabled: true, webhook_base64: false,
                    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                }, { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
                console.log('[EVOLUTION] Webhook configurado:', webhookUrl);
            } catch (e) {
                console.log('[EVOLUTION] Tentando webhook PUT...');
                try {
                    await axios.put(EVOLUTION_BASE_URL + '/webhook/set/' + nomeInstancia, {
                        webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] }
                    }, { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
                    console.log('[EVOLUTION] Webhook configurado (PUT):', webhookUrl);
                } catch (e2) { console.log('[EVOLUTION] Erro webhook:', e2.response?.data || e2.message); }
            }
            
            return { sucesso: true, instancia };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    gerarQRCode: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            const gH = { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' };
            const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook/' + instancia.nomeInstancia;
            let qrData = null;

            // 1. Verificar status atual
            let conectada = false;
            try {
                const sr = await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers: gH });
                conectada = sr.data?.instance?.state === 'open';
                console.log('[EVO] Status:', sr.data?.instance?.state);
            } catch (e) { console.log('[EVO] Erro status:', e.message); }

            // 2. Se conectada, retornar
            if (conectada) {
                instancia.status = 'conectado';
                instancia.ultimaConexao = new Date();
                await instancia.save();
                return { sucesso: true, jaConectado: true, status: 'conectado' };
            }

            // 3. Verificar se instancia existe na Evolution API — se nao, recriar
            let instanciaExisteNaApi = false;
            try {
                await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers: gH, timeout: 5000 });
                instanciaExisteNaApi = true;
            } catch (e) {
                if (e.response?.status === 404) {
                    console.log('[EVO] Instancia nao existe na API, recriando...');
                    try {
                        await axios.post(instancia.apiUrl + '/instance/create', {
                            instanceName: instancia.nomeInstancia,
                            qrcode: true,
                            integration: 'WHATSAPP-BAILEYS'
                        }, { headers: gH, timeout: 10000 });
                        console.log('[EVO] Instancia recriada na Evolution API');
                        await new Promise(r => setTimeout(r, 2000));
                        instanciaExisteNaApi = true;
                    } catch (e2) { console.log('[EVO] Erro ao recriar instancia:', e2.message); }
                }
            }

            // 4. Chamar /connect para gerar QR
            try {
                const cn = await axios.get(instancia.apiUrl + '/instance/connect/' + instancia.nomeInstancia, { headers: gH, timeout: 10000 });
                console.log('[EVO] Connect OK:', JSON.stringify(cn.data).substring(0, 300));
                if (cn.data?.base64) qrData = cn.data.base64;
                else if (cn.data?.code) qrData = cn.data.code;
                else if (cn.data?.qrcode?.base64) qrData = cn.data.qrcode.base64;
            } catch (e) { console.log('[EVO] Connect falhou:', e.response?.status, e.message); }

            // 5. Configurar webhook
            try {
                const wr = await axios.post(instancia.apiUrl + '/webhook/set/' + instancia.nomeInstancia, {
                    webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'] }
                }, { headers: gH });
                console.log('[EVO] Webhook OK:', webhookUrl);
                console.log('[EVO] Webhook resp:', JSON.stringify(wr.data).substring(0, 200));
            } catch (e) { console.log('[EVO] Webhook FALHOU:', e.response?.status, JSON.stringify(e.response?.data || e.message)); }

            // 5. Salvar QR no banco
            instancia.qrCode = qrData;
            instancia.status = 'desconectado';
            await instancia.save();
            console.log('[EVO] QR salvo, tem base64:', !!(qrData && qrData.startsWith && qrData.startsWith('data:')));
            return { sucesso: true, qrCode: qrData, instancia };
        } catch (e) {
            console.log('[EVO] gerarQRCode erro:', e.message);
            return { sucesso: false, erro: e.message };
        }
    },
    verificarStatus: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            let statusApi = instancia.status;
            try {
                const response = await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY }, timeout: 6000 });
                statusApi = response.data?.instance?.state === 'open' ? 'conectado' : 'desconectado';
            } catch (e) {}
            instancia.status = statusApi;
            if (statusApi === 'conectado') instancia.ultimaConexao = new Date();
            await instancia.save();
            return { sucesso: true, status: statusApi, instancia };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    desconectar: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            try { await axios.delete(instancia.apiUrl + '/instance/logout/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }); } catch (e) {}
            instancia.status = 'desconectado';
            instancia.qrCode = null;
            await instancia.save();
            return { sucesso: true };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    enviarMensagem: async (instanciaId, telefone, mensagem, tentativa = 1) => {
        const MAX_TENTATIVAS = 3;
        try {
            let instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) {
                instancia = await InstanciaWhatsapp.findOne({ status: { $in: ['conectado','open','connected'] } });
                if (!instancia) throw new Error('Nenhuma instancia disponivel');
            }
            console.log('[EVO-DEBUG] instanciaId:', instanciaId, '| nome:', instancia.nomeInstancia, '| url:', instancia.apiUrl, '| status:', instancia.status, '| apiKey:', instancia.apiKey ? 'OK' : 'VAZIA');
            
            let numero = telefone.replace(/\D/g, '');
            if (numero.length <= 11) numero = '55' + numero;

            // ===== ANTI-BLOQUEIO =====
            _wppGuard.verificarHorario();
            const _guard = _wppGuard.checar(instanciaId, numero);
            if (!_guard.ok) {
                if (_guard.motivo === 'duplicata') {
                    console.log('[GUARD] Msg duplicada ignorada para', numero);
                    return { sucesso: true, ignorado: true, motivo: 'duplicata' };
                }
                // Rate limit: aguardar e tentar uma vez
                if (_guard.aguardar < 65000) {
                    console.log('[GUARD] Aguardando rate limit:', Math.ceil(_guard.aguardar/1000), 's');
                    await new Promise(r => setTimeout(r, _guard.aguardar));
                } else {
                    return { sucesso: false, erro: 'rate_limit' };
                }
            }
            // Aplicar variação sutil no texto
            mensagem = _wppGuard.variarTexto(mensagem);
            // Delay extra progressivo (sequência)
            if (_guard.ok && _guard.delayExtra > 0) {
                await new Promise(r => setTimeout(r, _guard.delayExtra));
            }

            // Mostrar "digitando..." antes de responder — efeito imersivo
            try {
                await axios.post(instancia.apiUrl + '/chat/presence/' + instancia.nomeInstancia,
                    { number: numero, presence: 'composing', delay: Math.min(800 + (mensagem.length * 25), 4000) },
                    { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' }, timeout: 5000 }
                );
            } catch(_) {} // silencioso se nao suportar

            // Delay humanizado: varia por tamanho + jitter aleatório para não parecer robô
            const delay = Math.min(1200 + (mensagem.length * 30), 5000) + Math.floor(Math.random() * 800);
            await new Promise(r => setTimeout(r, delay));

            // Modo web humanizado: quebrar mensagens longas em partes como humano faz
            const _enviarParte = async (texto) => {
                return axios.post(instancia.apiUrl + '/message/sendText/' + instancia.nomeInstancia,
                    { number: numero, text: texto },
                    { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }
                );
            };

            const _quebrarMensagem = (texto) => {
                // Se menor que 300 chars, manda inteiro
                if (texto.length < 300) return [texto];
                // Quebrar em parágrafos (linha dupla) ou pontos naturais
                const partes = texto.length < 300 ? [texto] : texto.split('\n\n').filter(function(p){ return p.trim(); });
                if (partes.length > 1) return partes.filter(p => p.trim());
                // Se não tem parágrafo, manda inteiro mesmo
                return [texto];
            };

            try {
                console.log('[EVO] Enviando msg para:', numero, '(tentativa', tentativa + ')');
                const partes = _quebrarMensagem(mensagem);
                let lastResponse;
                for (let pi = 0; pi < partes.length; pi++) {
                    if (pi > 0) {
                        // Presence + delay entre partes — parece digitando de verdade
                        try {
                            await axios.post(instancia.apiUrl + '/chat/presence/' + instancia.nomeInstancia,
                                { number: numero, presence: 'composing', delay: 600 + Math.floor(Math.random() * 600) },
                                { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' }, timeout: 4000 }
                            );
                        } catch(_) {}
                        await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 700)));
                    }
                    lastResponse = await _enviarParte(partes[pi]);
                }
                console.log('[EVO] Msg enviada OK (' + partes.length + ' parte(s))');
                _wppGuard.registrar(instanciaId, numero);
                return { sucesso: true, messageId: lastResponse?.data?.key?.id };
            } catch (e) { 
                const erroMsg = e.response?.data?.response?.message?.[0] || e.message;
                console.log('[EVO] ERRO ao enviar:', erroMsg);
                
                // Se Connection Closed, tentar reconectar e reenviar
                if (erroMsg?.includes?.('Connection Closed') || erroMsg?.includes?.('not connected')) {
                    console.log('[EVO] Conexao perdida! Tentando reconectar...');
                    
                    // Marcar como desconectado
                    await InstanciaWhatsapp.findByIdAndUpdate(instancia._id, { status: 'desconectado' });
                    
                    // Tentar reconectar via Evolution API
                    try {
                        await axios.get(instancia.apiUrl + '/instance/connect/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY }, timeout: 8000 });
                        await new Promise(r => setTimeout(r, 3000)); // Aguardar reconexão
                        
                        // Verificar status
                        const statusRes = await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY }, timeout: 6000 });
                        if (statusRes.data?.instance?.state === 'open') {
                            await InstanciaWhatsapp.findByIdAndUpdate(instancia._id, { status: 'open', ultimaConexao: new Date() });
                            console.log('[EVO] Reconectado com sucesso!');
                            
                            // Retry
                            if (tentativa < MAX_TENTATIVAS) {
                                return await EvolutionMultiService.enviarMensagem(instanciaId, telefone, mensagem, tentativa + 1);
                            }
                        }
                    } catch (reconErr) {
                        console.log('[EVO] Falha ao reconectar:', reconErr.message);
                    }
                }
                
                // Retry genérico
                if (tentativa < MAX_TENTATIVAS) {
                    console.log('[EVO] Tentando novamente em 2s...');
                    await new Promise(r => setTimeout(r, 2000));
                    return await EvolutionMultiService.enviarMensagem(instanciaId, telefone, mensagem, tentativa + 1);
                }
                
                return { sucesso: false, erro: erroMsg }; 
            }
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },

    enviarImagem: async (instanciaId, telefone, urlImagem, legenda = '') => {
        try {
            let instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) instancia = await InstanciaWhatsapp.findOne({ status: { $in: ['conectado','open','connected'] } });
            if (!instancia) throw new Error('Nenhuma instancia disponivel');

            let numero = telefone.replace(/\D/g, '');
            if (numero.length <= 11) numero = '55' + numero;

            await new Promise(r => setTimeout(r, 800));

            const response = await axios.post(
                instancia.apiUrl + '/message/sendMedia/' + instancia.nomeInstancia,
                {
                    number: numero,
                    mediatype: 'image',
                    media: urlImagem,
                    caption: legenda
                },
                { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
            );
            console.log('[EVO] Imagem enviada OK para:', numero);
            return { sucesso: true, messageId: response.data?.key?.id };
        } catch (e) {
            console.log('[EVO] Erro ao enviar imagem:', e.message);
            return { sucesso: false, erro: e.message };
        }
    },

    listarTodas: async () => {
        try {
            const instancias = await InstanciaWhatsapp.find().populate('adminId', 'nome email empresa').sort({ createdAt: -1 });
            return { sucesso: true, instancias };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    listarPorAdmin: async (adminId) => {
        try {
            const instancias = await InstanciaWhatsapp.find({ adminId });
            return { sucesso: true, instancias };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    deletarInstancia: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            try { await axios.delete(instancia.apiUrl + '/instance/delete/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }); } catch (e) {}
            await InstanciaWhatsapp.findByIdAndDelete(instanciaId);
            return { sucesso: true };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    }
};
module.exports = EvolutionMultiService;
// ========== LIMPEZA AUTOMATICA ==========
// Deletar instancias desconectadas ha mais de 1 hora
EvolutionMultiService.limparDesconectadas = async () => {
    try {
        const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
        const desconectadas = await InstanciaWhatsapp.find({ 
            status: 'desconectado', 
            updatedAt: { $lt: umaHoraAtras } 
        });
        for (const inst of desconectadas) {
            try {
                await axios.delete(EVOLUTION_BASE_URL + '/instance/delete/' + inst.nomeInstancia, 
                    { headers: { 'apikey': inst.apiKey || EVOLUTION_GLOBAL_KEY } });
            } catch (e) {}
            await InstanciaWhatsapp.findByIdAndDelete(inst._id);
            console.log('[LIMPEZA] Instancia removida:', inst.nomeInstancia);
        }
        if (desconectadas.length > 0) console.log('[LIMPEZA] ' + desconectadas.length + ' instancias removidas');
    } catch (e) { console.log('[LIMPEZA] Erro:', e.message); }
};

// Rodar a cada 30 minutos
setInterval(() => EvolutionMultiService.limparDesconectadas(), 30 * 60 * 1000);
// Rodar 1 min apos iniciar
setTimeout(() => EvolutionMultiService.limparDesconectadas(), 60 * 1000);
