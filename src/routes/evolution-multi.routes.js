const axios = require('axios');
const express = require('express');
const router = express.Router();
const EvolutionMultiService = require('../services/evolution-multi.service');
const { InstanciaWhatsapp, Motorista, Cliente, Corrida } = require('../models');
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

// ==================== WEBHOOK MULTI-TENANT COM REBECA ====================
router.post('/webhook/:nomeInstancia', async (req, res) => {
    const { nomeInstancia } = req.params;
    const dados = req.body;
    
    console.log('[WEBHOOK ' + nomeInstancia + '] Evento:', dados.event);
    
    try {
        const instancia = await InstanciaWhatsapp.findOne({ nomeInstancia });
        if (!instancia) {
            console.log('[WEBHOOK] Instancia nao encontrada:', nomeInstancia);
            return res.json({ received: true });
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
        if (dados.event === 'messages.upsert') {
            console.log('[DEBUG] Dados:', JSON.stringify(dados).substring(0, 800));
            const mensagens = dados.data?.messages || [];
            
            for (const msg of mensagens) {
                if (msg.key?.fromMe) continue;
                
                const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
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
                }
                
                if (!conteudo || !telefone) continue;
                
                console.log('[REBECA-' + (adminId || 'GLOBAL') + '] Msg de ' + telefone + ':', typeof conteudo === 'string' ? conteudo.substring(0, 30) : 'GPS');
                
                try {
                    // PASSAR adminId PARA REBECA (contexto multi-tenant)
                    const contexto = { adminId: adminId, instanciaId: instancia._id };
                    const resposta = await RebecaService.processarMensagem(telefone, conteudo, nome, contexto);
                    
                    if (resposta) {
                        await EvolutionMultiService.enviarMensagem(instancia._id, telefone, resposta);
                        console.log('[REBECA] Resposta enviada para ' + telefone);
                    }
                } catch (e) {
                    console.error('[REBECA] Erro:', e.message);
                }
            }
        }
    } catch (e) {
        console.error('[WEBHOOK] Erro:', e.message);
    }
    
    res.json({ received: true });
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
