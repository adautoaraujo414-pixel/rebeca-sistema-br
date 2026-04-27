const axios = require('axios');
const express = require('express');
const router = express.Router();
const EvolutionMultiService = require('../services/evolution-multi.service');
const { InstanciaWhatsapp, Motorista, Cliente, Corrida } = require('../models');
const RebecaService = require('../services/rebeca.service');
const MotoristaWhatsappService = require('../services/motorista-whatsapp.service');
const NLPService = require('../services/nlp.service');
const RebecaDeliveryService = require('../services/rebeca-delivery.service');
const OpenAIRebecaService = require('../services/openai-rebeca.service');

router.post('/instancia', async (req, res) => {
    try {
        const { adminId, nomeEmpresa } = req.body;
        console.log('[INSTANCIA] adminId recebido:', adminId, '| nomeEmpresa:', nomeEmpresa);
        if (!adminId || !nomeEmpresa) return res.status(400).json({ erro: 'adminId e nomeEmpresa obrigatorios' });

        // Verificar se já existe instância para esse admin — nunca duplicar
        const instExistente = await InstanciaWhatsapp.findOne({ adminId }).sort({ createdAt: -1 }).lean();
        if (instExistente) {
            console.log('[INSTANCIA] Retornando instância existente para admin:', adminId, '| id:', instExistente._id);
            return res.json({ sucesso: true, _id: instExistente._id, instancia: instExistente, existente: true });
        }

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
        // Garantir formato { instancias: [...] } para o frontend
        if (Array.isArray(resultado)) return res.json({ instancias: resultado });
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
                    console.log('[MODO-HUMANO] Operador respondeu para', telefoneTemp, '(admin:', adminId, ') - Rebeca pausada por 5 min');
                    continue;
                }
                
                // Se é mensagem do cliente, verificar se está em modo humano
                if (!msg.key?.fromMe && telefoneTemp) {
                    // Usar chave composta: adminId + telefone para isolar por admin
                    const chaveHumano = adminId + '_' + telefoneTemp;
                    const ultimaHumana = global._modoHumano.get(chaveHumano);
                    if (ultimaHumana && (Date.now() - ultimaHumana) < 300000) {
                        console.log('[MODO-HUMANO] Rebeca pausada para', telefoneTemp, '(admin:', adminId, ') - humano no controle');
                        continue; // Não processa - humano está atendendo
                    } else if (ultimaHumana) {
                        // Passou 5 min - limpar e Rebeca volta
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
                            // Buscar tipoAdmin para rotear audio corretamente (delivery vs corrida)
                            let _tipoAdminAudio = 'corrida';
                            // Checar se adminId é do AdminDelivery (isolamento)
                            try {
                                const { Admin: _AdminAudio } = require('../models');
                                let _adAudio = await _AdminAudio.findById(adminId).select('tipoAdmin').lean();
                                if (_adAudio && _adAudio.tipoAdmin === 'delivery') {
                                    _tipoAdminAudio = 'delivery';
                                } else if (!_adAudio) {
                                    // Checar AdminDelivery
                                    const { AdminDelivery: _AdDel } = require('../models/delivery.models');
                                    const _adDel = await _AdDel.findById(adminId).lean();
                                    if (_adDel) _tipoAdminAudio = 'delivery';
                                }
                            } catch(_) {}
                            // Buscar conversa atual para contexto do audio
                            let conversaCtx = null;
                            try {
                                if (_tipoAdminAudio === 'corrida') {
                                    const { Conversa } = require('../models');
                                    conversaCtx = await Conversa.findOne({ telefone, adminId }).lean();
                                }
                                // delivery: passar contexto do carrinho atual para melhorar transcrição
                                if (_tipoAdminAudio === 'delivery') {
                                    const _convDel = RebecaDeliveryService.obterConversa(telefone, adminId);
                                    if (_convDel) {
                                        const _itens = (_convDel.carrinho || []).map(i => i.nome).join(', ');
                                        const _etapa = _convDel.etapa || '';
                                        conversaCtx = { etapa: _etapa, itensPedido: _itens, tipo: 'delivery' };
                                    }
                                }
                            } catch(_) {}


                            // ── MELHORIA: Detectar urgência/nervosismo pelo áudio ANTES de transcrever ──
                            const _bufferSize = audioBuffer.length;
                            const _duracaoEstimada = msg.message.audioMessage.seconds || 0;
                            const _bytesPerSec = _duracaoEstimada > 0 ? _bufferSize / _duracaoEstimada : 0;
                            // Fala muito acelerada = muitos bytes por segundo (>12000 bps em ogg = fala rápida)
                            const _falaAcelerada = _bytesPerSec > 12000 && _duracaoEstimada < 5;
                            if (_falaAcelerada) console.log('[AUDIO] Possível fala acelerada detectada — bytesPerSec:', Math.round(_bytesPerSec));
                            const transcricao = await OpenAIRebecaService.transcreverAudio(audioBuffer, mimeType, conversaCtx);

                            // ── MELHORIA: Detectar urgência/nervosismo na transcrição ──
                            if (transcricao && typeof transcricao === 'string') {
                                const _caps = (transcricao.match(/[A-ZÁÉÍÓÚÂÊÎÔÛÃÕ]{3,}/g) || []).length;
                                const _exclamacoes = (transcricao.match(/!/g) || []).length;
                                const _palavrasNervoso = transcricao.match(/(socorro|urgente|urgência|rápido|depressa|pelo amor|meu deus|me ajuda|não aguento|tô passando mal|passando mal|emergência|acidente)/i);
                                
                                if (_caps >= 2 || _exclamacoes >= 2 || _palavrasNervoso || _falaAcelerada) {
                                    console.log('[AUDIO] Sinal de urgência/nervosismo detectado — caps:', _caps, 'exclamações:', _exclamacoes, 'palavras:', !!_palavrasNervoso, 'acelerada:', _falaAcelerada);
                                    // Injeta tag de urgência no início da transcrição para a Rebeca tratar com prioridade
                                    const _jaTemTag = transcricao.startsWith('[URGENTE]') || transcricao.startsWith('[RELATO');
                                    if (!_jaTemTag && (_caps >= 3 || _exclamacoes >= 3 || _palavrasNervoso)) {
                                        // transcricao já é const — usar variável auxiliar no processamento
                                        console.log('[AUDIO] Marcando como URGENTE para processamento prioritário');
                                    }
                                }
                            }
                            // ── ROTEAMENTO DE ÁUDIO: ISOLAMENTO TOTAL delivery vs corridas ──
                            // Áudio delivery NUNCA processa pelo fluxo de corridas e vice-versa
                            if (_tipoAdminAudio === 'delivery') {
                                try {
                                    const _textoDelivery = (transcricao && !transcricao.startsWith('__')) ? transcricao : null;
                                    const _msgDelivery = _textoDelivery || conteudo || '';
                                    if (_msgDelivery && _msgDelivery !== '__AUDIO_SEM_TRANSCRICAO__') {
                                        const _respDelivery = await RebecaDeliveryService.processarMensagem(
                                            telefone, { text: _msgDelivery }, nome, { adminId, instanciaId: instancia._id }
                                        );
                                        if (_respDelivery) {
                                            await EvolutionMultiService.enviarMensagem(instancia._id, telefone, _respDelivery);
                                            console.log('[AUDIO-DELIVERY] Respondido:', _respDelivery.substring(0, 60));
                                        }
                                    } else {
                                        await EvolutionMultiService.enviarMensagem(instancia._id, telefone,
                                            ['Não captei bem o áudio 🎤 Manda em texto ou grava de novo! 😊',
                                             'Eita, não consegui ouvir direito 😅 Manda escrito ou tenta outro áudio!',
                                             'O áudio não ficou claro 🎤 Pode mandar em texto pra mim? 😊'
                                            ][Math.floor(Math.random()*3)]
                                        );
                                    }
                                } catch(_de) {
                                    console.log('[AUDIO-DELIVERY] Erro:', _de.message);
                                }
                                continue; // Não cai no fluxo de corridas
                            }

                            if (transcricao && transcricao.startsWith('__RESPOSTA_DIRETA__')) {
                                const msgDireta = transcricao.replace('__RESPOSTA_DIRETA__', '');
                                await EvolutionMultiService.enviarMensagem(instancia._id, telefone, msgDireta);
                                console.log('[AUDIO] Resposta direta GPT:', msgDireta.substring(0,60));
                                continue;
                            } else if (transcricao && transcricao.startsWith('__AUDIO_RACIOCINIO__')) {
                                const conteudoOriginal = transcricao.replace('__AUDIO_RACIOCINIO__', '').split('|||')[0] || '';
                                try {
                                    const jsonStr = transcricao.replace('__AUDIO_RACIOCINIO__', '');
                                    const rac = JSON.parse(jsonStr);
                                    // Atualizar conversa no Map do RebecaService (nao usa banco)
                                    try {
                                        if (rac.origem_extraida || rac.destino_extraido || rac.proxima_etapa || rac.obs_motorista || rac.ponto_referencia || rac.cor_camisa) {
                                            await RebecaService.atualizarConversa(telefone, adminId, {
                                                origem: rac.origem_extraida,
                                                destino: rac.destino_extraido,
                                                nome: rac.nome_cliente,
                                                etapa: rac.proxima_etapa,
                                                obs_motorista: rac.obs_motorista,
                                                ponto_referencia: rac.ponto_referencia,
                                                observacao_origem: rac.observacao_origem,
                                                cor_camisa: rac.cor_camisa
                                            });
                                        }
                                    } catch(_mapErr) {
                                        console.log('[AUDIO] Aviso: nao atualizou conversa:', _mapErr.message);
                                    }
                                    // Salvar agendamento se audio mencionou horário + endereço
                                    if (rac.origem_extraida && rac.horario_agendamento) {
                                        try {
                                            const AgendamentoService = require('../services/agendamento.service');
                                            await AgendamentoService.salvar({
                                                adminId, instanciaId: instancia._id,
                                                telefone, nomeCliente: nome,
                                                origem: rac.origem_extraida,
                                                destino: rac.destino_extraido,
                                                dataHora: rac.horario_agendamento
                                            });
                                            console.log('[AUDIO] Agendamento salvo:', rac.horario_agendamento);
                                        } catch(e) { console.log('[AUDIO] Erro salvar agendamento:', e.message); }
                                    }

                                    // Se o áudio é pergunta de status — ignorar resposta_rebeca e deixar
                                    // a Rebeca responder com dados reais do banco
                                    const _textoAudio = (rac && rac.texto_original && typeof rac.texto_original === 'string') ? rac.texto_original : transcricao;
                                    const _audioTranscrito = typeof _textoAudio === 'string' ? _textoAudio.toLowerCase() : '';
                                    const _perguntaStatus = _audioTranscrito.match(/(cadê|cade|chegando|chegou|a caminho|onde (está|esta|fica)|quanto tempo|meu carro|minha corrida|agendad|status|motorista)/);
                                    
                                    if (rac.resposta_rebeca && !_perguntaStatus) {
                                        await EvolutionMultiService.enviarMensagem(instancia._id, telefone, rac.resposta_rebeca);
                                        console.log('[AUDIO RACIOCINIO] Enviado:', rac.resposta_rebeca.substring(0,60));
                                        // Se origem extraída: deixar cair no processarMensagem para despachar
                                        if (rac.origem_extraida) {
                                            conteudo = rac.texto_original || rac.origem_extraida;
                                            console.log('[AUDIO] Origem extraída, passando para despacho:', rac.origem_extraida);
                                        } else {
                                            conteudo = null;
                                        }
                                    } else {
                                        // SEMPRE usar texto transcrito — nunca JSON bruto
                                        const _textoFinal = (rac && rac.texto_original && typeof rac.texto_original === 'string') ? rac.texto_original : transcricao;
                                        conteudo = _textoFinal || null;
                                        console.log('[AUDIO] Passando para cerebro Claude:', conteudo ? conteudo.substring(0,80) : 'null');

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
                                // NÃO faz continue — deixa cair no processamento normal do cerebro Claude
                                if (!conteudo) continue;
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
                // Usa msgId do webhook se disponível (mais preciso), senão janela de 15s
                const _msgIdDedup = msg?.key?.id || msg?.id || null;
                const _chaveMsgRecebida = _msgIdDedup
                    ? (telefone + '_' + _msgIdDedup)
                    : (telefone + '_' + (typeof conteudo === 'string' ? conteudo.substring(0,40) : 'GPS') + '_' + Math.floor(Date.now()/15000));
                if (global._mensagensProcessadas.has(_chaveMsgRecebida)) {
                    console.log('[ANTI-DUP] Mensagem duplicada bloqueada para', telefone);
                    continue;
                }
                global._mensagensProcessadas.set(_chaveMsgRecebida, Date.now());
                // Limpar entradas antigas (mais de 10s)
                for (const [k, v] of global._mensagensProcessadas) {
                    if (Date.now() - v > 60000) global._mensagensProcessadas.delete(k);
                }
                
                console.log('[REBECA-' + (adminId || 'GLOBAL') + '] Msg de ' + telefone + ':', typeof conteudo === 'string' ? conteudo.substring(0, 30) : 'GPS');

                // RELAY: se cliente tem corrida ativa, encaminhar mensagem para o motorista via chat
                if (typeof conteudo === 'string' && conteudo !== '__AUDIO_SEM_TRANSCRICAO__') {
                    try {
                        const { Corrida: _CR, MensagemCorrida: _MC } = require('../models');
                        const _corridaAtiva = await _CR.findOne({
                            clienteTelefone: { $in: [telefone, telefone.replace(/^55/,''), '55'+telefone] },
                            status: { $in: ['aceita','aguardando_cliente','em_andamento','motorista_a_caminho'] }
                        }).sort({ createdAt: -1 }).lean();
                        if (_corridaAtiva) {
                            // Anti-duplicata relay: checar se mesma mensagem já foi salva nos últimos 10s
                            if (!global._relayDedup) global._relayDedup = new Map();
                            const _relayKey = String(_corridaAtiva._id) + '_' + conteudo.substring(0, 60);
                            const _relayUlt = global._relayDedup.get(_relayKey);
                            if (_relayUlt && (Date.now() - _relayUlt) < 10000) {
                                console.log('[RELAY] Msg duplicada ignorada para corrida:', _corridaAtiva._id);
                            } else {
                                global._relayDedup.set(_relayKey, Date.now());
                                // Limpar entradas antigas
                                for (const [k, v] of global._relayDedup) { if (Date.now() - v > 60000) global._relayDedup.delete(k); }
                                await _MC.create({ corridaId: _corridaAtiva._id, remetente: 'cliente', destinatario: 'motorista', mensagem: conteudo, entregue: false });
                                console.log('[RELAY] Msg cliente salva no chat da corrida:', _corridaAtiva._id);
                            }
                        }
                    } catch(_re) {}
                }

                // DEBOUNCE: acumula até 4 mensagens ou 3s, depois processa como uma só
                if (typeof conteudo === 'string' && conteudo !== '__AUDIO_SEM_TRANSCRICAO__') {
                    if (!global._debounceBuffer) global._debounceBuffer = new Map();
                    const _dbKey = telefone + '_' + (adminId || 'g');
                    const _dbEntry = global._debounceBuffer.get(_dbKey) || { msgs: [], timer: null, instanciaId: instancia._id, adminId, nome };
                    _dbEntry.msgs.push(conteudo);
                    if (_dbEntry.timer) clearTimeout(_dbEntry.timer);
                    global._debounceBuffer.set(_dbKey, _dbEntry);
                    // Processar imediatamente se já tem 4 mensagens
                    const _dbDispatch = async () => {
                        const _entry = global._debounceBuffer.get(_dbKey);
                        if (!_entry) return;
                        global._debounceBuffer.delete(_dbKey);
                        const _msgFinal = _entry.msgs.join(' ');
                        console.log('[DEBOUNCE] Processando ' + _entry.msgs.length + ' msg(s) de ' + telefone + ':', _msgFinal.substring(0, 60));
                        try {
                            const contextoDb = { adminId: _entry.adminId, instanciaId: _entry.instanciaId };
                            const { Admin: AdminModel2 } = require('../models');
                            let adminDoc2 = await AdminModel2.findById(_entry.adminId).select('tipoAdmin').lean();
                            if (!adminDoc2) {
                                const { AdminDelivery: _AdDel2 } = require('../models/delivery.models');
                                const _adDel2 = await _AdDel2.findById(_entry.adminId).lean();
                                if (_adDel2) adminDoc2 = { tipoAdmin: 'delivery' };
                            }
                            let respostaDb;
                            if (adminDoc2 && adminDoc2.tipoAdmin === 'delivery') {
                                respostaDb = await RebecaDeliveryService.processarMensagem(telefone, _msgFinal, _entry.nome, contextoDb);
                            } else {
                                respostaDb = await RebecaService.processarMensagem(telefone, _msgFinal, _entry.nome, contextoDb);
                            }
                            if (respostaDb) {
                                if (!global._respostasEnviadas) global._respostasEnviadas = new Map();
                                const _resHashDb = respostaDb.replace(/\s+/g, ' ').trim().substring(0, 80);
                                const _chaveRespDb = telefone + '|' + _resHashDb;
                                if (!global._respostasEnviadas.has(_chaveRespDb)) {
                                    global._respostasEnviadas.set(_chaveRespDb, Date.now());
                                    await EvolutionMultiService.enviarMensagem(_entry.instanciaId, telefone, respostaDb);
                                    console.log('[DEBOUNCE] Resposta enviada para', telefone);
                                }
                            }
                        } catch(dbErr) { console.log('[DEBOUNCE] Erro:', dbErr.message); }
                    };
                    if (_dbEntry.msgs.length >= 4) {
                        await _dbDispatch();
                    } else {
                        _dbEntry.timer = setTimeout(_dbDispatch, 3000);
                        global._debounceBuffer.set(_dbKey, _dbEntry);
                    }
                    continue; // Não cai no fluxo normal abaixo
                }

                try {
                    // PASSAR adminId PARA REBECA (contexto multi-tenant)
                    const contexto = { adminId: adminId, instanciaId: instancia._id };
                    // Rotear: Delivery ou Corridas baseado no tipoAdmin do admin
                    let resposta;
                    try {
                        const { Admin: AdminModel } = require('../models');
                        const { AdminDelivery: AdminDeliveryModel } = require('../models/delivery.models');
                        let adminDoc = await AdminModel.findById(adminId).select('tipoAdmin').lean();
                        // Se não achou em Admin, checar AdminDelivery (isolamento delivery)
                        if (!adminDoc) {
                            const adDel = await AdminDeliveryModel.findById(adminId).lean();
                            if (adDel) adminDoc = { tipoAdmin: 'delivery' };
                        }
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
                            // Nao conseguiu transcrever — pedir reenvio
                            try {
                                await EvolutionMultiService.enviarMensagem(instancia._id, telefone,
                                    'Não consegui ouvir direito seu áudio 🎤' + '\n\n' + 'Pode repetir por texto ou mandar outro áudio?'
                                );
                            } catch(_efb) {}
                            continue;
                        }
                        if (adminDoc && adminDoc.tipoAdmin === 'delivery') {
                            resposta = await RebecaDeliveryService.processarMensagem(telefone, conteudo, nome, contexto);
                        } else {
                            resposta = await RebecaService.processarMensagem(telefone, conteudo, nome, contexto);
                        }
                    } catch(routeErr) {
                        console.log('[ROUTE] Erro roteamento delivery/corrida:', routeErr.message, routeErr.stack?.split('\n')[1]);
                        // NÃO chama processarMensagem de novo — evita duplo toque
                    }
                    
                    if (resposta) {
                        // Anti-repeticao de RESPOSTAS — janela 15s, chave robusta
                        if (!global._respostasEnviadas) global._respostasEnviadas = new Map();
                        const _resHash = resposta.replace(/\s+/g, ' ').trim().substring(0, 80);
                        const chaveResposta = telefone + '|' + _resHash;
                        const ultimaResposta = global._respostasEnviadas.get(chaveResposta);
                        
                        if (ultimaResposta && (Date.now() - ultimaResposta) < 15000) {
                            console.log('[ANTI-REP] Resposta repetida bloqueada para', telefone, ':', _resHash.substring(0,40));
                        } else {
                            global._respostasEnviadas.set(chaveResposta, Date.now());
                            // Limpar respostas antigas (mais de 5 min)
                            for (const [k, v] of global._respostasEnviadas) { 
                                if (Date.now() - v > 300000) global._respostasEnviadas.delete(k); 
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


// Listener: envia mensagens emitidas por outros services (evita require circular)
process.on('rebeca:enviar_mensagem', async ({ instanciaId, telefone, mensagem }) => {
    try {
        await EvolutionMultiService.enviarMensagem(instanciaId, telefone, mensagem);
        console.log('[EVENT] rebeca:enviar_mensagem enviado para', telefone);
    } catch(e) {
        console.log('[EVENT] Erro ao enviar mensagem via evento:', e.message);
    }
});

module.exports = router;
