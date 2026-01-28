const express = require('express');
const router = express.Router();
const EvolutionMultiService = require('../services/evolution-multi.service');
const { InstanciaWhatsapp } = require('../models');
const RebecaService = require('../services/rebeca.service');

router.post('/instancia', async (req, res) => {
    const { adminId, nomeEmpresa } = req.body;
    if (!adminId || !nomeEmpresa) return res.status(400).json({ erro: 'adminId e nomeEmpresa obrigatorios' });
    const resultado = await EvolutionMultiService.criarInstancia(adminId, nomeEmpresa);
    res.json(resultado);
});

router.get('/instancia/:id/qrcode', async (req, res) => {
    const resultado = await EvolutionMultiService.gerarQRCode(req.params.id);
    res.json(resultado);
});

router.get('/instancia/:id/status', async (req, res) => {
    const resultado = await EvolutionMultiService.verificarStatus(req.params.id);
    res.json(resultado);
});

router.post('/instancia/:id/desconectar', async (req, res) => {
    const resultado = await EvolutionMultiService.desconectar(req.params.id);
    res.json(resultado);
});

router.post('/instancia/:id/enviar', async (req, res) => {
    const { telefone, mensagem } = req.body;
    if (!telefone || !mensagem) return res.status(400).json({ erro: 'telefone e mensagem obrigatorios' });
    const resultado = await EvolutionMultiService.enviarMensagem(req.params.id, telefone, mensagem);
    res.json(resultado);
});

router.get('/instancias', async (req, res) => {
    const resultado = await EvolutionMultiService.listarTodas();
    res.json(resultado);
});

router.get('/instancias/admin/:adminId', async (req, res) => {
    const resultado = await EvolutionMultiService.listarPorAdmin(req.params.adminId);
    res.json(resultado);
});

router.delete('/instancia/:id', async (req, res) => {
    const resultado = await EvolutionMultiService.deletarInstancia(req.params.id);
    res.json(resultado);
});

// ==================== WEBHOOK - INTEGRADO COM REBECA ====================
router.post('/webhook/:nomeInstancia', async (req, res) => {
    const { nomeInstancia } = req.params;
    const dados = req.body;
    
    console.log('[WEBHOOK ' + nomeInstancia + '] Evento:', dados.event);
    
    try {
        // Buscar instancia
        const instancia = await InstanciaWhatsapp.findOne({ nomeInstancia });
        if (!instancia) {
            console.log('[WEBHOOK] Instancia nao encontrada:', nomeInstancia);
            return res.json({ received: true });
        }
        
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
        
        // PROCESSAR MENSAGENS RECEBIDAS - REBECA ATENDE
        if (dados.event === 'messages.upsert') {
            const mensagens = dados.data?.messages || [];
            
            for (const msg of mensagens) {
                // Ignorar mensagens enviadas por nos
                if (msg.key?.fromMe) continue;
                
                // Extrair dados da mensagem
                const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
                const nome = msg.pushName || 'Cliente';
                
                // Extrair conteudo da mensagem
                let conteudo = null;
                
                // Mensagem de texto
                if (msg.message?.conversation) {
                    conteudo = msg.message.conversation;
                }
                // Texto extendido
                else if (msg.message?.extendedTextMessage?.text) {
                    conteudo = msg.message.extendedTextMessage.text;
                }
                // Localizacao
                else if (msg.message?.locationMessage) {
                    conteudo = {
                        latitude: msg.message.locationMessage.degreesLatitude,
                        longitude: msg.message.locationMessage.degreesLongitude
                    };
                }
                // Localizacao ao vivo
                else if (msg.message?.liveLocationMessage) {
                    conteudo = {
                        latitude: msg.message.liveLocationMessage.degreesLatitude,
                        longitude: msg.message.liveLocationMessage.degreesLongitude
                    };
                }
                
                if (!conteudo || !telefone) continue;
                
                console.log('[REBECA] Mensagem de ' + telefone + ' (' + nome + '):', typeof conteudo === 'string' ? conteudo.substring(0, 50) : 'LOCALIZACAO');
                
                // CHAMAR REBECA PARA PROCESSAR
                try {
                    const resposta = await RebecaService.processarMensagem(telefone, conteudo, nome);
                    
                    if (resposta) {
                        // Enviar resposta pelo WhatsApp da instancia
                        await EvolutionMultiService.enviarMensagem(instancia._id, telefone, resposta);
                        console.log('[REBECA] Resposta enviada para ' + telefone);
                    }
                } catch (e) {
                    console.error('[REBECA] Erro ao processar:', e.message);
                }
            }
        }
        
    } catch (e) {
        console.error('[WEBHOOK] Erro:', e.message);
    }
    
    res.json({ received: true });
});

module.exports = router;