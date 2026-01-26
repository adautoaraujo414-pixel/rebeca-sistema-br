const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp-evolution.service');

// Configurar credenciais
router.post('/config', async (req, res) => {
    try {
        const { serverUrl, apiKey, instanceName } = req.body;
        WhatsAppService.setConfig(serverUrl, apiKey, instanceName);
        res.json({ sucesso: true, mensagem: 'Configurações salvas!' });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Obter configurações
router.get('/config', async (req, res) => {
    res.json({
        serverUrl: WhatsAppService.config.serverUrl || '',
        apiKey: WhatsAppService.config.apiKey ? '***configurado***' : '',
        instanceName: WhatsAppService.config.instanceName || 'ubmax'
    });
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
            return res.status(400).json({ erro: 'Telefone e mensagem obrigatórios' });
        }
        const result = await WhatsAppService.enviarTexto(telefone, mensagem);
        res.json(result);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Webhook
router.post('/webhook', async (req, res) => {
    console.log('📩 Webhook WhatsApp:', JSON.stringify(req.body, null, 2));
    res.json({ received: true });
});

module.exports = router;
