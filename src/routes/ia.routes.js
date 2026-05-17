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


router.post('/resumo-operacional', async (req, res) => {
  try {
    const { contexto, metricas, alertas, produto } = req.body;
    const hora = new Date().getHours();
    const turno = hora < 12 ? 'manhã' : hora < 18 ? 'tarde' : 'noite';
    const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    const prompt = `Você é a Rebeca, assistente executiva de um negócio de ${
      produto === 'agenda' ? 'beleza/estética' :
      produto === 'delivery' ? 'delivery/restaurante' : 'varejo'
    }.

Gere um resumo executivo em NO MÁXIMO 3 frases curtas, em português, linguagem natural e direta.
Hoje é ${data}, período da ${turno}.
Métricas: ${JSON.stringify(metricas || {})}.
Alertas: ${JSON.stringify((alertas || []).map(a => a.titulo))}.
Tom: profissional mas humano. Sem bullet points. Sem listas. Só texto corrido.
Se houver alertas críticos, mencione brevemente. Se estiver tudo bem, seja positivo.
Responda APENAS o resumo, sem explicações adicionais.`;

    const resposta = await IAService.processarMensagem(prompt, { contexto: 'resumo-operacional' });
    res.json({ sucesso: true, resposta });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

module.exports = router;
