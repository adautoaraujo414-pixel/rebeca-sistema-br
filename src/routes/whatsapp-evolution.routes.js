const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp-evolution.service');
const { ConfigFinanceiro } = require('../models');

// Configurar credenciais
router.post('/config', async (req, res) => {
    try {
        const { serverUrl, apiKey, instanceName } = req.body;
        
        WhatsAppService.setConfig(serverUrl, apiKey, instanceName);
        
        // Salvar no banco
        await ConfigFinanceiro.findOneAndUpdate({}, {
            evolutionApiUrl: serverUrl,
            evolutionApiKey: apiKey,
            evolutionInstance: instanceName
        }, { upsert: true });
        
        res.json({ sucesso: true, mensagem: 'Configurações salvas!' });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Obter configurações
router.get('/config', async (req, res) => {
    try {
        const config = await ConfigFinanceiro.findOne();
        res.json({
            serverUrl: config?.evolutionApiUrl || '',
            apiKey: config?.evolutionApiKey ? '***configurado***' : '',
            instanceName: config?.evolutionInstance || 'ubmax'
        });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Criar instância
router.post('/criar-instancia', async (req, res) => {
    try {
        const result = await WhatsAppService.criarInstancia();
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Conectar (gerar QR Code)
router.get('/conectar', async (req, res) => {
    try {
        const result = await WhatsAppService.conectar();
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Status da conexão
router.get('/status', async (req, res) => {
    try {
        const result = await WhatsAppService.getStatus();
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Desconectar
router.post('/desconectar', async (req, res) => {
    try {
        const result = await WhatsAppService.desconectar();
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Enviar mensagem de teste
router.post('/teste', async (req, res) => {
    try {
        const { telefone, mensagem } = req.body;
        const result = await WhatsAppService.enviarTexto(telefone, mensagem || 'Teste UBMAX Rebeca! 🚗');
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Enviar mensagem genérica
router.post('/enviar', async (req, res) => {
    try {
        const { telefone, mensagem } = req.body;
        if (!telefone || !mensagem) {
            return res.status(400).json({ erro: 'Telefone e mensagem são obrigatórios' });
        }
        const result = await WhatsAppService.enviarTexto(telefone, mensagem);
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Enviar localização
router.post('/enviar-localizacao', async (req, res) => {
    try {
        const { telefone, latitude, longitude, nome, endereco } = req.body;
        const result = await WhatsAppService.enviarLocalizacao(telefone, latitude, longitude, nome, endereco);
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Webhook para receber mensagens
router.post('/webhook', async (req, res) => {
    try {
        const data = req.body;
        console.log('📩 Webhook WhatsApp:', JSON.stringify(data, null, 2));
        
        // Processar mensagem recebida
        if (data.event === 'messages.upsert' && data.data?.message) {
            const msg = data.data.message;
            const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '');
            const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
            
            if (telefone && texto) {
                console.log(`📱 Mensagem de ${telefone}: ${texto}`);
                // Aqui pode integrar com Rebeca para processar
            }
        }
        
        res.json({ received: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;
