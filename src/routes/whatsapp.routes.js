const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp.service');

router.get('/status', async (req, res) => {
    const status = await WhatsAppService.verificarConexao();
    res.json(status);
});

router.post('/enviar', async (req, res) => {
    const { telefone, mensagem } = req.body;
    
    if (!telefone || !mensagem) {
        return res.status(400).json({ error: 'Telefone e mensagem obrigatórios' });
    }

    const resultado = await WhatsAppService.enviarMensagem(telefone, mensagem);
    res.json(resultado);
});

router.post('/enviar-localizacao', async (req, res) => {
    const { telefone, latitude, longitude, nome, endereco } = req.body;
    
    if (!telefone || !latitude || !longitude) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    const resultado = await WhatsAppService.enviarLocalizacao(telefone, latitude, longitude, nome, endereco);
    res.json(resultado);
});

router.post('/notificar/corrida-aceita', async (req, res) => {
    const { telefone, dados } = req.body;
    const resultado = await WhatsAppService.notificarCorridaAceita(telefone, dados);
    res.json(resultado);
});

router.post('/notificar/motorista-chegou', async (req, res) => {
    const { telefone, dados } = req.body;
    const resultado = await WhatsAppService.notificarMotoristaChegou(telefone, dados);
    res.json(resultado);
});

router.post('/notificar/corrida-finalizada', async (req, res) => {
    const { telefone, dados } = req.body;
    const resultado = await WhatsAppService.notificarCorridaFinalizada(telefone, dados);
    res.json(resultado);
});

router.post('/notificar/corrida-cancelada', async (req, res) => {
    const { telefone, dados } = req.body;
    const resultado = await WhatsAppService.notificarCorridaCancelada(telefone, dados);
    res.json(resultado);
});

router.post('/boas-vindas', async (req, res) => {
    const { telefone, nome } = req.body;
    const resultado = await WhatsAppService.enviarBoasVindas(telefone, nome);
    res.json(resultado);
});

module.exports = router;
