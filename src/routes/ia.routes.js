const express = require('express');
const router = express.Router();
const IAService = require('../services/ia.service');

router.get('/status', (req, res) => {
  res.json({ ativo: !!process.env.ANTHROPIC_API_KEY });
});

router.post('/chat', async (req, res) => {
  try {
    const { mensagem, contexto } = req.body;
    const resposta = await IAService.processarMensagem(mensagem, contexto);
    res.json({ sucesso: true, resposta });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

module.exports = router;
