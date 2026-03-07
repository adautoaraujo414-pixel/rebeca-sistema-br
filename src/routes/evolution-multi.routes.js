const axios = require('axios');
const express = require('express');
const router = express.Router();
const EvolutionMultiService = require('../services/evolution-multi.service');
const { InstanciaWhatsapp, Motorista, Cliente, Corrida } = require('../models');
const RebecaService = require('../services/rebeca.service');
const RebecaDeliveryService = require('../services/rebeca-delivery.service');
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
            // Suprimir logs de grupos e mensagens proprias sem conteudo relevante
            const todasMsgs = dados.data?.messages || (dados.data ? [dados.data] : []);
            // Pre-filtro: ignorar grupos silenciosamente (sem log)
            const mensagens = todasMsgs.filter(m => !m.key?.remoteJid?.includes('@g.us'));
            if (mensagens.length === 0) return;
            
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
                    // Delivery também pausa
                    if (!global._modoHumanoDelivery) global._modoHumanoDelivery = new Map();
                    global._modoHumanoDelivery.set(chaveHumano, Date.now());
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
                
                // NUNCA responder mensagens do próprio número (admin enviando)
                if (msg.key?.fromMe) continue;
                
                // Ignorar mensagens sem texto/conteúdo útil (status, reações isoladas)
                const temConteudoUtil = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.audioMessage ||
                    msg.message?.locationMessage ||
                    msg.message?.liveLocationMessage ||
                    msg.message?.imageMessage?.caption;
                if (!temConteudoUtil && msg.messageType !== 'audioMessage' && msg.messageType !== 'locationMessage') continue;
                
                // ===== TRATAMENTO DE CHAMADA (LIGAÇÃO) =====
                if (msg.messageType === 'call' || msg.key?.remoteJid?.includes('call') || 
                    msg.message?.audioMessage?.ptt === false && msg.messageType === 'audioMessage' ||
                    (msg.messageStubType && [6,7,8].includes(msg.messageStubType))) {
                    // É uma chamada — rejeitar e responder via texto
                    const telChamada = (msg.key?.remoteJid || '').replace('@s.whatsapp.net','').replace('@c.us','');
                    if (telChamada && inst) {
                        try {
                            await EvolutionMultiService.enviarMensagem(inst._id, telChamada,
                                '📵 Olá! Não consigo atender ligações, mas posso te ajudar aqui pelo chat! 😊\n\n' +
                                '🚗 *Precisa de uma corrida?* Me manda só seu endereço de origem que a gente resolve! 📍'
                            );
                            console.log('[CHAMADA] Ligação rejeitada e mensagem enviada para:', telChamada);
                        } catch(callErr) { console.log('[CHAMADA] Erro:', callErr.message); }
                    }
                    continue;
                }

                // Dedup por messageId — persistido no MongoDB (sobrevive reinício)
                const msgId = msg.key?.id;
                if (msgId) {
                    try {
                        const { MsgDedup } = require('../models');
                        const existe = await MsgDedup.findOne({ msgId });
                        if (existe) { console.log('[DEDUP] Msg duplicada ignorada:', msgId); continue; }
                        await MsgDedup.create({ msgId });
                    } catch(dedupErr) {
                        // fallback: usar memória se modelo não existir ainda
                        if (!global._msgProcessadas) global._msgProcessadas = new Map();
                        if (global._msgProcessadas.has(msgId)) continue;
                        global._msgProcessadas.set(msgId, agora);
                    }
                }
                
                const remoteJid = msg.key?.remoteJid || '';
                if (remoteJid.includes('@g.us')) continue; // Ignorar grupos
                const telefone = remoteJid.replace('@s.whatsapp.net', '');
                console.log('[REBECA] Mensagem de', telefone, ':', (msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.messageType || '').substring(0, 80));
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
                } else if (msg.message?.stickerMessage) {
                    // Sticker/figurinha — responder com bom humor e redirecionar
                    const _stickers = [
                        'Haha, boa figurinha! 😄 Vai precisar de um carro hoje?',
                        '😂 Adorei! Me passa um endereço que eu chamo um carro!',
                        'Kkkk! 😄 Quando precisar de corrida é só falar!'
                    ];
                    conteudo = '__STICKER__';
                    const _resSticker = _stickers[Math.floor(Math.random() * _stickers.length)];
                    await EvolutionMultiService.enviarMensagem(instancia._id, telefone, _resSticker);
                    continue;

                } else if (msg.message?.imageMessage) {
                    // Imagem — responder naturalmente e redirecionar
                    const _caption = msg.message.imageMessage.caption || '';
                    if (_caption) {
                        conteudo = _caption; // processar legenda como mensagem normal
                    } else {
                        const _resImg = [
                            'Boa imagem! 😄 Vai precisar de um carro hoje?',
                            '😊 Legal! Me passa um endereço que eu chamo um carro!',
                            'Haha! 😄 Quando precisar de corrida é só falar!'
                        ];
                        await EvolutionMultiService.enviarMensagem(instancia._id, telefone, _resImg[Math.floor(Math.random() * _resImg.length)]);
                        continue;
                    }

                } else if (msg.message?.audioMessage) {
                    // Áudio recebido - baixar via Evolution API e transcrever
                    console.log('[WEBHOOK] Audio recebido de', telefone);
                    try {
                        const instanciaDoc = await InstanciaWhatsapp.findOne({ _id: instancia._id });
                        const nomeInstancia = instanciaDoc?.nomeInstancia;
                        
                        // Tentar múltiplos métodos de download do áudio
                        let base64 = null;
                        
                        // Método 1: getBase64FromMediaMessage (Evolution v1)
                        try {
                            const base64Resp = await axios.post(
                                `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${nomeInstancia}`,
                                { message: msg, convertToMp4: false },
                                { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, timeout: 25000 }
                            );
                            base64 = base64Resp.data?.base64 || base64Resp.data?.data?.base64;
                        } catch(e1) {
                            console.log('[AUDIO] Método 1 falhou:', e1.message);
                        }
                        
                        // Método 2: mediaUrl direto (Evolution v2)
                        if (!base64 && msg.message?.audioMessage?.url) {
                            try {
                                const mediaResp = await axios.get(msg.message.audioMessage.url, { 
                                    responseType: 'arraybuffer', timeout: 20000 
                                });
                                base64 = Buffer.from(mediaResp.data).toString('base64');
                            } catch(e2) { console.log('[AUDIO] Método 2 falhou:', e2.message); }
                        }
                        
                        // Método 3: getBase64 com key do msg (Evolution v2+)
                        if (!base64) {
                            try {
                                const msgKey = msg.key || msg.message?.key;
                                if (msgKey) {
                                    const base64Resp2 = await axios.post(
                                        `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${nomeInstancia}`,
                                        { message: { key: msgKey, message: msg.message }, convertToMp4: false },
                                        { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, timeout: 25000 }
                                    );
                                    base64 = base64Resp2.data?.base64 || base64Resp2.data?.data?.base64;
                                }
                            } catch(e3) { console.log('[AUDIO] Método 3 falhou:', e3.message); }
                        }
                        
                        if (base64) {
                            const audioBuffer = Buffer.from(base64, 'base64');
                            console.log('[AUDIO] Buffer size:', audioBuffer.length, 'bytes');
                            const mimeType = msg.message.audioMessage.mimetype || 'audio/ogg';
                            // Buscar conversa atual para contexto do audio
                            let conversaCtx = null;
                            try {
                                const { Conversa } = require('../models');
                                conversaCtx = await Conversa.findOne({ telefone, adminId }).lean();
                            } catch(_) {}

                            const transcricao = await OpenAIRebecaService.transcreverAudio(audioBuffer, mimeType, conversaCtx);

                            if (transcricao && transcricao.startsWith('__RESPOSTA_DIRETA__')) {
                                const msgDireta = transcricao.replace('__RESPOSTA_DIRETA__', '');
                                await EvolutionMultiService.enviarMensagem(instancia._id, telefone, msgDireta);
                                console.log('[AUDIO] Resposta direta GPT:', msgDireta.substring(0,60));
                                continue;
                            } else if (transcricao && transcricao.startsWith('__AUDIO_RACIOCINIO__')) {
                                try {
                                    const jsonStr = transcricao.replace('__AUDIO_RACIOCINIO__', '');
                                    const rac = JSON.parse(jsonStr);
                                    // Usar mongoose diretamente para evitar undefined por cache do require
                                    let Conversa;
                                    try { 
                                        const _m = require('../models'); 
                                        Conversa = _m.Conversa || require('mongoose').model('Conversa');
                                    } catch(_e) { 
                                        Conversa = require('mongoose').model('Conversa'); 
                                    }
                                    const upd = {};
                                    if (rac.origem_extraida) upd['dados.origem'] = rac.origem_extraida;
                                    if (rac.destino_extraido) upd['dados.destino'] = rac.destino_extraido;
                                    if (rac.nome_cliente) upd['dados.nome'] = rac.nome_cliente;
                                    if (rac.proxima_etapa) upd['etapa'] = rac.proxima_etapa;
                                    if (Object.keys(upd).length > 0 && Conversa) {
                                        try {
                                            await Conversa.findOneAndUpdate({ telefone, adminId }, { $set: upd }, { upsert: true });
                                        } catch(_dbErr) {
                                            console.log('[AUDIO] Aviso: nao salvou conversa no DB:', _dbErr.message);
                                            // Continua mesmo sem salvar — resposta ao cliente é prioridade
                                        }
                                    }
                                    if (rac.resposta_rebeca) {
                                        await EvolutionMultiService.enviarMensagem(instancia._id, telefone, rac.resposta_rebeca);
                                        console.log('[AUDIO RACIOCINIO] Enviado:', rac.resposta_rebeca.substring(0,60));
                                        conteudo = null;

                                        // Se notificar_admin=true: notifica dono e agenda acompanhamento
                                        if (rac.notificar_admin) {
                                            console.log('[AUDIO] Notificando admin sobre duvida/reclamacao de', telefone);
                                            try {
                                                await RebecaService.notificarAdmin(instancia._id, adminId,
                                                    '⚠️ Cliente ' + (nome || telefone) + ' precisa de atendimento:\n' +
                                                    '"' + (typeof conteudoOriginal === 'string' ? conteudoOriginal.substring(0,120) : 'audio') + '"'
                                                );
                                            } catch(e) { console.log('[AUDIO] Erro notif admin:', e.message); }

                                            // Agendar mensagem de acompanhamento se admin nao responder em 3 min
                                            if (!global._pendentesAdmin) global._pendentesAdmin = new Map();
                                            const _chaveP = telefone + '_' + Date.now();
                                            global._pendentesAdmin.set(_chaveP, {
                                                telefone, instanciaId: instancia._id, nome, ts: Date.now()
                                            });
                                            setTimeout(async () => {
                                                // Se ainda estiver pendente (admin nao respondeu)
                                                if (global._pendentesAdmin.has(_chaveP)) {
                                                    global._pendentesAdmin.delete(_chaveP);
                                                    try {
                                                        await EvolutionMultiService.enviarMensagem(
                                                            instancia._id, telefone,
                                                            'Já contatei meu supervisor e estou aguardando uma resposta! Em breve ele vai entrar em contato com você 😊'
                                                        );
                                                        console.log('[AUDIO] Mensagem de acompanhamento enviada para', telefone);
                                                    } catch(e) { console.log('[AUDIO] Erro acompanhamento:', e.message); }
                                                }
                                            }, 3 * 60 * 1000); // 3 minutos
                                        }
                                    }
                                } catch(racErr) {
                                    console.log('[AUDIO] Erro raciocinio:', racErr.message);
                                }
                                continue;
                            } else if (transcricao) {
                                conteudo = transcricao;
                                console.log('[WEBHOOK] Audio transcrito OK:', transcricao.substring(0, 80));
                            } else {
                                conteudo = '__AUDIO_SEM_TRANSCRICAO__';
                                console.log('[AUDIO] Todas tentativas falharam');
                            }
                        } else {
                            console.log('[AUDIO] Nenhum método conseguiu baixar o áudio');
                            // Audio não baixou - tratar como pedido de corrida
                            conteudo = '__AUDIO_SEM_TRANSCRICAO__';
                            console.log('[AUDIO] Download falhou, marcando para fallback inteligente');
                        }
                    } catch(e) {
                        console.log('[WEBHOOK] Erro geral audio:', e.message);
                        conteudo = '__AUDIO_SEM_TRANSCRICAO__';
                    }
                }
                
                if (!conteudo || !telefone) continue;

                // Anti-duplicata de MENSAGENS RECEBIDAS — bloqueia webhook duplicado
                if (!global._mensagensProcessadas) global._mensagensProcessadas = new Map();
                const _chaveMsgRecebida = telefone + '_' + (typeof conteudo === 'string' ? conteudo.substring(0,40) : 'GPS') + '_' + Math.floor(Date.now()/3000);
                if (global._mensagensProcessadas.has(_chaveMsgRecebida)) {
                    console.log('[ANTI-DUP] Mensagem duplicada bloqueada para', telefone);
                    continue;
                }
                global._mensagensProcessadas.set(_chaveMsgRecebida, Date.now());
                // Limpar entradas antigas (mais de 10s)
                for (const [k, v] of global._mensagensProcessadas) {
                    if (Date.now() - v > 10000) global._mensagensProcessadas.delete(k);
                }
                
                console.log('[REBECA-' + (adminId || 'GLOBAL') + '] Msg de ' + telefone + ':', typeof conteudo === 'string' ? conteudo.substring(0, 30) : 'GPS');
                
                try {
                    // PASSAR adminId PARA REBECA (contexto multi-tenant)
                    const contexto = { adminId: adminId, instanciaId: instancia._id };
                    // Rotear: Delivery ou Corridas baseado no tipoAdmin do admin
                    let resposta;
                    try {
                        const { Admin: AdminModel } = require('../models');
                        const adminDoc = await AdminModel.findById(adminId).select('tipoAdmin').lean();
                        // Fallback inteligente de áudio por tipo
                        if (conteudo === '__AUDIO_SEM_TRANSCRICAO__') {
                            // Usar GPT para interpretar o contexto do cliente e gerar resposta natural
                            try {
                                const axios2 = require('axios');
                                const promptAudio = `Você é a Rebeca, assistente comercial da empresa. NUNCA mencione táxi, central de táxi ou que é um robô.
Um cliente enviou um áudio que não conseguimos transcrever.
Gere uma resposta amigável e natural em português brasileiro, como se o cliente tivesse mandado uma saudação ou cumprimento.
Pergunte como pode ajudá-lo de forma calorosa.
Responda apenas com a mensagem para o cliente, sem explicações.`;
                                const gptResp = await axios2.post('https://api.openai.com/v1/chat/completions', {
                                    model: 'gpt-4o-mini',
                                    messages: [{ role: 'user', content: promptAudio }],
                                    max_tokens: 120,
                                    temperature: 0.7
                                }, {
                                    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                                    timeout: 8000
                                });
                                const respostaAudio = gptResp.data.choices[0]?.message?.content?.trim();
                                if (respostaAudio) {
                                    await EvolutionMultiService.enviarMensagem(instancia._id, telefone, respostaAudio);
                                    console.log('[AUDIO] Resposta inteligente enviada:', respostaAudio.substring(0, 60));
                                    continue;
                                }
                            } catch(gptErr) {
                                console.log('[AUDIO] GPT fallback falhou:', gptErr.message);
                            }
                            conteudo = 'oi';
                        }
                        if (adminDoc && adminDoc.tipoAdmin === 'delivery') {
                            resposta = await RebecaDeliveryService.processarMensagem(telefone, conteudo, nome, contexto);
                        } else {
                            resposta = await RebecaService.processarMensagem(telefone, conteudo, nome, contexto);
                        }
                    } catch(routeErr) {
                        console.log('[ROUTE] Erro roteamento delivery/corrida:', routeErr.message);
                        resposta = await RebecaService.processarMensagem(telefone, conteudo, nome, contexto);
                    }
                    
                    if (resposta) {
                        // Anti-repeticao de RESPOSTAS
                        if (!global._respostasEnviadas) global._respostasEnviadas = new Map();
                        const chaveResposta = telefone + '_' + resposta.substring(0, 50);
                        const ultimaResposta = global._respostasEnviadas.get(chaveResposta);
                        
                        if (ultimaResposta && (Date.now() - ultimaResposta) < 5000) {
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

module.exports = router;
