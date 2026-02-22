const express = require('express');
const router = express.Router();
const ConfigService = require('../services/config.service');
const LogsService = require('../services/logs.service');

// ========== CONFIGURAÇÕES GERAIS ==========
router.get('/', async (req, res) => {
    const adminId = req.query.adminId || req.headers['x-admin-id'];
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    const config = await ConfigService.obterTudo(adminId);
    res.json(config);
});

router.put('/', async (req, res) => {
    const adminId = req.body.adminId || req.headers['x-admin-id'];
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    const config = await ConfigService.salvarTudo(req.body, adminId);
    LogsService.registrar({ tipo: 'config', acao: 'Configurações atualizadas', adminId, detalhes: req.body });
    res.json({ sucesso: true, config });
});

// ========== WHATSAPP ==========
router.get('/whatsapp', (req, res) => {
    res.json(ConfigService.obterConfigWhatsApp());
});

router.put('/whatsapp', (req, res) => {
    const config = ConfigService.atualizarConfigWhatsApp(req.body);
    LogsService.registrar({ tipo: 'config', acao: 'Config WhatsApp atualizada' });
    res.json({ sucesso: true, config });
});

// ========== ÁREAS DE COBERTURA ==========
router.get('/areas', (req, res) => {
    const ativas = req.query.ativas === 'true';
    res.json(ConfigService.listarAreas(ativas));
});

router.get('/areas/:id', (req, res) => {
    const area = ConfigService.obterArea(req.params.id);
    if (!area) return res.status(404).json({ error: 'Área não encontrada' });
    res.json(area);
});

router.post('/areas', (req, res) => {
    const area = ConfigService.criarArea(req.body);
    LogsService.registrar({ tipo: 'config', acao: 'Área de cobertura criada', detalhes: { nome: area.nome } });
    res.status(201).json(area);
});

router.put('/areas/:id', (req, res) => {
    const area = ConfigService.atualizarArea(req.params.id, req.body);
    if (!area) return res.status(404).json({ error: 'Área não encontrada' });
    res.json({ sucesso: true, area });
});

router.delete('/areas/:id', (req, res) => {
    ConfigService.excluirArea(req.params.id);
    res.json({ sucesso: true });
});

router.get('/verificar-cobertura', (req, res) => {
    const { cidade, bairro } = req.query;
    if (!cidade) return res.status(400).json({ error: 'Cidade é obrigatória' });
    const resultado = ConfigService.verificarCobertura(cidade, bairro);
    res.json(resultado);
});

// ========== NÍVEIS DE ACESSO ==========
router.get('/niveis-acesso', (req, res) => {
    res.json(ConfigService.listarNiveis());
});

router.get('/niveis-acesso/:id', (req, res) => {
    const nivel = ConfigService.obterNivel(req.params.id);
    if (!nivel) return res.status(404).json({ error: 'Nível não encontrado' });
    res.json(nivel);
});

module.exports = router;
