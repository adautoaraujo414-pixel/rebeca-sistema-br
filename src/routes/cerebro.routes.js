const express = require('express');
const router = express.Router();
const CerebroRebeca = require('../services/cerebro-rebeca.service');

// Webhook para invalidar cache do prompt — chamado pelo admin ou CI/CD
// POST /api/cerebro/prompt/refresh
router.post('/prompt/refresh', (req, res) => {
    try {
        CerebroRebeca.invalidarCache();
        console.log('[CEREBRO] Prompt atualizado via webhook');
        res.json({ sucesso: true, msg: 'Cache invalidado — próxima mensagem usará prompt atualizado' });
    } catch(e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
});

// GET /api/cerebro/status
router.get('/status', (req, res) => {
    res.json({
        ativo: CerebroRebeca.isAtivo(),
        cacheAtivo: !!(require('../services/cerebro-rebeca.service')._promptCacheTs),
        msg: CerebroRebeca.isAtivo() ? 'Cérebro ativo' : 'ANTHROPIC_API_KEY não configurada'
    });
});

module.exports = router;
