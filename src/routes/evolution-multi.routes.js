const axios = require('axios');
const express = require('express');
const router = express.Router();
const EvolutionMultiService = require('../services/evolution-multi.service');
const { InstanciaWhatsapp, Motorista, Cliente, Corrida } = require('../models');
const RebecaService = require('../services/rebeca.service');
const OpenAIRebecaService = require('../services/openai-rebeca.service');

router.post('/instancia', async (req, res) => {
    try {
        const { adminId, nomeEmpresa } = req.body;
        if (!adminId || !nomeEmpresa) return res.status(400).json({ erro: 'adminId e nomeEmpresa obrigatorios' });
        const resultado = await EvolutionMultiService.criarInstancia(adminId, nomeEmpresa);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/instancia/:id/qrcode', async (req, res) => {
    try {
        const resultado = await EvolutionMultiService.gerarQRCode(req.params.id);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/instancia/:id/status', async (req, res) => {
    try {
        const resultado = await EvolutionMultiService.verificarStatus(req.params.id);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/instancia/:id/desconectar', async (req, res) => {
    try {
        const resultado = await EvolutionMultiService.desconectar(req.params.id);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/instancia/:id/enviar', async (req, res) => {
    try {
        const { telefone, mensagem } = req.body;
        if (!telefone || !mensagem) return res.status(400).json({ erro: 'telefone e mensagem obrigatorios' });
        const resultado = await EvolutionMultiService.enviarMensagem(req.params.id, telefone, mensagem);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/instancias', async (req, res) => {
    try {
        const resultado = await EvolutionMultiService.listarTodas();
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/instancias/admin/:adminId', async (req, res) => {
    try {
        const resultado = await EvolutionMultiService.listarPorAdmin(req.params.adminId);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/instancia/:id', async (req, res) => {
    try {
        const resultado = await EvolutionMultiService.deletarInstancia(req.params.id);
        res.json(resultado);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ==================== WEBHOOK MULTI-TENANT COM REBECA ====================
router.post('/webhook/:nomeInstancia', async (req, res) => {
    const { nomeInstancia } = req.params;
    const dados = req.body;
    
    console.log('[WEBHOOK ' + nomeInstancia + '] Evento:', dados.event);
    
    try {
        const instancia = await InstanciaWhatsapp.findOne({ nomeInstancia });
        if (!instancia) {
            console.log('[WEBHOOK] Instancia nao encontrada:', nomeInstancia);
            return res.headersSent || res.json({ received: true });
        }
        
        const adminId = instancia.adminId; // IMPORTANTE: pegar adminId da instancia
        
        // Atualizar status de conexao
        if (dados.event === 'connection.update') {
            instancia.status = dados.data?.state === 'open' ? 'conectado' : 'desconectado';
            if (dados.data?.state === 'open') {
                instancia.ultimaConexao = new Date();
                instancia.telefoneConectado = dados.data?.phoneNumber || null;
            }
            await instancia.save();
            console.log('[WEBHOOK] Status atualizado:', instancia.status);
        }
        
        // PROCESSAR MENSAGENS - REBECA MULTI-TENANT
        // Responder 200 imediato pro Evolution API
        if (!res.headersSent) res.json({ received: true });

        if (dados.event === 'messages.upsert') {
            console.log('[DEBUG] Dados:', JSON.stringify(dados).substring(0, 800));
            const mensagens = dados.data?.messages || (dados.data ? [dados.data] : []);
            
            // Anti-duplicacao de mensagens
            if (!global._msgProcessadas) global._msgProcessadas = new Map();
            const agora = Date.now();
            // Limpar msgs antigas (mais de 60s)
            for (const [k, v] of global._msgProcessadas) { if (agora - v > 60000) global._msgProcessadas.delete(k); }
            
            // MODO HUMANO: controla quando operador assume conversa
            if (!global._modoHumano) global._modoHumano = new Map();
            
            for (const msg of mensagens) {
                const remoteJidTemp = msg.key?.remoteJid || '';
                const telefoneTemp = remoteJidTemp.replace('@s.whatsapp.net', '');
                
                // Se mensagem é DO OPERADOR (fromMe), ativar modo humano para esse cliente
                if (msg.key?.fromMe && telefoneTemp && !remoteJidTemp.includes('@g.us')) {
                    // Usar chave composta: adminId + telefone para isolar por admin
                    const chaveHumano = adminId + '_' + telefoneTemp;
                    global._modoHumano.set(chaveHumano, Date.now());
                    console.log('[MODO-HUMANO] Operador respondeu para', telefoneTemp, '(admin:', adminId, ') - Rebeca pausada por 2 min');
                    continue;
                }
                
                // Se é mensagem do cliente, verificar se está em modo humano
                if (!msg.key?.fromMe && telefoneTemp) {
                    // Usar chave composta: adminId + telefone para isolar por admin
                    const chaveHumano = adminId + '_' + telefoneTemp;
                    const ultimaHumana = global._modoHumano.get(chaveHumano);
                    if (ultimaHumana && (Date.now() - ultimaHumana) < 120000) {
                        console.log('[MODO-HUMANO] Rebeca pausada para', telefoneTemp, '(admin:', adminId, ') - humano no controle');
                        continue; // Não processa - humano está atendendo
                    } else if (ultimaHumana) {
                        // Passou 2 min - limpar e Rebeca volta
                        global._modoHumano.delete(chaveHumano);
                        console.log('[MODO-HUMANO] Rebeca retomou controle de', telefoneTemp, '(admin:', adminId, ')');
                    }
                }
                
                if (msg.key?.fromMe) continue;
                
                // Dedup por messageId
                const msgId = msg.key?.id;
                if (msgId && global._msgProcessadas.has(msgId)) { console.log('[DEDUP] Msg duplicada ignorada:', msgId); continue; }
                if (msgId) global._msgProcessadas.set(msgId, agora);
                
                const remoteJid = msg.key?.remoteJid || '';
                if (remoteJid.includes('@g.us')) continue; // Ignorar grupos
                const telefone = remoteJid.replace('@s.whatsapp.net', '');
                const nome = msg.pushName || 'Cliente';
                
                let conteudo = null;
                if (msg.message?.conversation) {
                    conteudo = msg.message.conversation;
                } else if (msg.message?.extendedTextMessage?.text) {
                    conteudo = msg.message.extendedTextMessage.text;
                } else if (msg.message?.locationMessage) {
                    conteudo = { latitude: msg.message.locationMessage.degreesLatitude, longitude: msg.message.locationMessage.degreesLongitude };
                } else if (msg.message?.liveLocationMessage) {
                    conteudo = { latitude: msg.message.liveLocationMessage.degreesLatitude, longitude: msg.message.liveLocationMessage.degreesLongitude };
                } else if (msg.message?.audioMessage) {
                    // Áudio recebido - tentar transcrever
                    console.log('[WEBHOOK] Audio recebido de', telefone);
                    try {
                        const audioMsg = msg.message.audioMessage;
                        const mediaUrl = audioMsg.url || audioMsg.mediaUrl;
                        
                        if (mediaUrl) {
                            // Baixar áudio
                            const audioResponse = await axios.get(mediaUrl, { 
                                responseType: 'arraybuffer',
                                timeout: 15000 
                            });
                            
                            // Transcrever
                            const mimeType = audioMsg.mimetype || 'audio/ogg';
                            const transcricao = await OpenAIRebecaService.transcreverAudio(audioResponse.data, mimeType);
                            
                            if (transcricao) {
                                conteudo = transcricao;
                                console.log('[WEBHOOK] Audio transcrito:', transcricao);
                            } else {
                                conteudo = '[AUDIO]';
                            }
                        } else {
                            console.log('[WEBHOOK] Audio sem URL');
                            conteudo = '[AUDIO]';
                        }
                    } catch(e) {
                        console.log('[WEBHOOK] Erro transcrever audio:', e.message);
                        conteudo = '[AUDIO]';
                    }
                }
                
                if (!conteudo || !telefone) continue;
                
                console.log('[REBECA-' + (adminId || 'GLOBAL') + '] Msg de ' + telefone + ':', typeof conteudo === 'string' ? conteudo.substring(0, 30) : 'GPS');
                
                try {
                    // PASSAR adminId PARA REBECA (contexto multi-tenant)
                    const contexto = { adminId: adminId, instanciaId: instancia._id };
                    const resposta = await RebecaService.processarMensagem(telefone, conteudo, nome, contexto);
                    
                    if (resposta) {
                        // Anti-repeticao de RESPOSTAS
                        if (!global._respostasEnviadas) global._respostasEnviadas = new Map();
                        const chaveResposta = telefone + '_' + resposta.substring(0, 50);
                        const ultimaResposta = global._respostasEnviadas.get(chaveResposta);
                        
                        if (ultimaResposta && (Date.now() - ultimaResposta) < 30000) {
                            console.log('[ANTI-REP] Resposta repetida bloqueada para', telefone);
                        } else {
                            global._respostasEnviadas.set(chaveResposta, Date.now());
                            // Limpar respostas antigas (mais de 2 min)
                            for (const [k, v] of global._respostasEnviadas) { 
                                if (Date.now() - v > 120000) global._respostasEnviadas.delete(k); 
                            }
                            // Verificar se resposta tem partes (mais humano)
                            if (resposta.includes('|||')) {
                                // Resposta dividida - enviar em partes com delay
                                const partes = resposta.split('|||');
                                for (let i = 0; i < partes.length; i++) {
                                    if (partes[i].trim()) {
                                        await EvolutionMultiService.enviarMensagem(instancia._id, telefone, partes[i].trim());
                                        if (i < partes.length - 1) {
                                            await new Promise(r => setTimeout(r, 800 + Math.random() * 700)); // 800-1500ms
                                        }
                                    }
                                }
                            } else {
                                await EvolutionMultiService.enviarMensagem(instancia._id, telefone, resposta);
                            }
                            console.log('[REBECA] Resposta enviada para ' + telefone);
                        }
                    }
                } catch (e) {
                    console.error('[REBECA] Erro:', e.message);
                }
            }
        }
    } catch (e) {
        console.error('[WEBHOOK] Erro:', e.message);
    }
    
    if (!res.headersSent) res.json({ received: true });
});

// ==================== STATS POR ADMIN ====================
router.get('/stats/:adminId', async (req, res) => {
    try {
        const { adminId } = req.params;
        const motoristas = await Motorista.countDocuments({ adminId, ativo: true });
        const motOnline = await Motorista.countDocuments({ adminId, ativo: true, status: 'disponivel' });
        const clientes = await Cliente.countDocuments({ adminId });
        const corridas = await Corrida.countDocuments({ adminId });
        const corridasHoje = await Corrida.countDocuments({ adminId, createdAt: { $gte: new Date().setHours(0,0,0,0) } });
        
        res.json({ sucesso: true, motoristas, motOnline, clientes, corridas, corridasHoje });
    } catch (e) {
        res.json({ sucesso: false, erro: e.message });
    }
});

module.exports = router;
// Reconfigurar webhook de instância existente
router.post('/instancia/:id/reconfigurar-webhook', async (req, res) => {
    try {
        const instancia = await InstanciaWhatsapp.findById(req.params.id);
        if (!instancia) return res.status(404).json({ erro: 'Instancia nao encontrada' });
        
        const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook/' + instancia.nomeInstancia;
        
        // Formato Evolution API v2
        await axios.put(instancia.apiUrl + '/webhook/set/' + instancia.nomeInstancia, {
            webhook: {
                enabled: true,
                url: webhookUrl,
                webhookByEvents: false,
                webhookBase64: false,
                events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
            }
        }, { headers: { 'apikey': instancia.apiKey || process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' } });
        
        instancia.webhookUrl = webhookUrl;
        await instancia.save();
        
        res.json({ sucesso: true, webhookUrl });
    } catch (e) {
        res.json({ sucesso: false, erro: e.message });
    }
});
