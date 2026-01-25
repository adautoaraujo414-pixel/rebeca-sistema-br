const express = require('express');
const router = express.Router();
const IAService = require('../services/ia.service');

router.get('/config', (req, res) => {
    res.json(IAService.getConfig());
});

router.put('/config', (req, res) => {
    const config = IAService.setConfig(req.body);
    res.json({ sucesso: true, config });
});

router.post('/testar', async (req, res) => {
    const resultado = await IAService.testarConexao();
    res.json(resultado);
});

router.post('/analisar', async (req, res) => {
    const { mensagem, contexto } = req.body;
    const analise = await IAService.analisarMensagem(mensagem, contexto);
    res.json(analise);
});

module.exports = router;
