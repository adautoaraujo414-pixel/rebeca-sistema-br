const express = require('express');
const router = express.Router();
const ConfigService = require('../services/config.service');
const LogsService = require('../services/logs.service');

// Listar reclamações
router.get('/', (req, res) => {
    const filtros = {
        status: req.query.status,
        tipo: req.query.tipo,
        prioridade: req.query.prioridade,
        motoristaId: req.query.motoristaId
    };
    res.json(ConfigService.listarReclamacoes(filtros));
});

// Estatísticas
router.get('/estatisticas', (req, res) => {
    res.json(ConfigService.obterEstatisticasReclamacoes());
});

// Buscar por ID
router.get('/:id', (req, res) => {
    const rec = ConfigService.obterReclamacao(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Reclamação não encontrada' });
    res.json(rec);
});

// Criar reclamação
router.post('/', (req, res) => {
    const rec = ConfigService.criarReclamacao(req.body);
    LogsService.registrar({ tipo: 'atendimento', acao: 'Reclamação registrada', detalhes: { id: rec.id, assunto: rec.assunto } });
    res.status(201).json(rec);
});

// Atualizar reclamação
router.put('/:id', (req, res) => {
    const rec = ConfigService.atualizarReclamacao(req.params.id, req.body);
    if (!rec) return res.status(404).json({ error: 'Reclamação não encontrada' });
    res.json({ sucesso: true, reclamacao: rec });
});

// Resolver reclamação
router.put('/:id/resolver', (req, res) => {
    const { resolucao } = req.body;
    if (!resolucao) return res.status(400).json({ error: 'Resolução é obrigatória' });
    
    const rec = ConfigService.resolverReclamacao(req.params.id, resolucao);
    if (!rec) return res.status(404).json({ error: 'Reclamação não encontrada' });
    
    LogsService.registrar({ tipo: 'atendimento', acao: 'Reclamação resolvida', detalhes: { id: rec.id } });
    res.json({ sucesso: true, reclamacao: rec });
});

module.exports = router;
