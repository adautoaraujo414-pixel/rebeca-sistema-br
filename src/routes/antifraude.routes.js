const express = require('express');
const router = express.Router();
const AntiFraudeService = require('../services/antifraude.service');
const LogsService = require('../services/logs.service');

// ==================== DASHBOARD ====================
router.get('/estatisticas', (req, res) => {
    res.json(AntiFraudeService.obterEstatisticas());
});

// ==================== ALERTAS ====================
router.get('/alertas', (req, res) => {
    const filtros = {
        status: req.query.status,
        nivel: req.query.nivel,
        tipo: req.query.tipo
    };
    res.json(AntiFraudeService.listarAlertas(filtros));
});

router.get('/alertas/:id', (req, res) => {
    const alerta = AntiFraudeService.obterAlerta(req.params.id);
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    res.json(alerta);
});

router.put('/alertas/:id/analisar', (req, res) => {
    const { analisadoPor } = req.body;
    const alerta = AntiFraudeService.analisarAlerta(req.params.id, analisadoPor || 'Admin');
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    
    LogsService.registrar({ tipo: 'antifraude', acao: 'Alerta em análise', detalhes: { alertaId: alerta.id } });
    res.json({ sucesso: true, alerta });
});

router.put('/alertas/:id/resolver', (req, res) => {
    const { resolucao, acao } = req.body;
    if (!resolucao) return res.status(400).json({ error: 'Resolução é obrigatória' });
    
    const alerta = AntiFraudeService.resolverAlerta(req.params.id, resolucao, acao);
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    
    LogsService.registrar({ 
        tipo: 'antifraude', 
        acao: 'Alerta resolvido' + (acao === 'bloquear' ? ' (bloqueado)' : ''), 
        detalhes: { alertaId: alerta.id, resolucao } 
    });
    res.json({ sucesso: true, alerta });
});

router.put('/alertas/:id/ignorar', (req, res) => {
    const { motivo } = req.body;
    const alerta = AntiFraudeService.ignorarAlerta(req.params.id, motivo || 'Falso positivo');
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    
    LogsService.registrar({ tipo: 'antifraude', acao: 'Alerta ignorado', detalhes: { alertaId: alerta.id } });
    res.json({ sucesso: true, alerta });
});

// ==================== BLACKLIST ====================
router.get('/blacklist', (req, res) => {
    const tipo = req.query.tipo;
    res.json(AntiFraudeService.listarBlacklist(tipo));
});

router.post('/blacklist', (req, res) => {
    const { tipo, valor, motivo } = req.body;
    
    if (!tipo || !valor) {
        return res.status(400).json({ error: 'Tipo e valor são obrigatórios' });
    }
    
    // Verificar se já existe
    const existente = AntiFraudeService.verificarBlacklist(tipo, valor);
    if (existente) {
        return res.status(400).json({ error: 'Item já está na blacklist' });
    }
    
    const item = AntiFraudeService.adicionarBlacklist({
        tipo,
        valor,
        motivo: motivo || 'Adicionado manualmente',
        bloqueadoPor: 'Admin'
    });
    
    LogsService.registrar({ tipo: 'antifraude', acao: 'Adicionado à blacklist', detalhes: { tipo, valor } });
    res.status(201).json(item);
});

router.delete('/blacklist/:id', (req, res) => {
    AntiFraudeService.removerBlacklist(req.params.id);
    LogsService.registrar({ tipo: 'antifraude', acao: 'Removido da blacklist', detalhes: { id: req.params.id } });
    res.json({ sucesso: true });
});

router.get('/blacklist/verificar', (req, res) => {
    const { tipo, valor } = req.query;
    if (!tipo || !valor) {
        return res.status(400).json({ error: 'Tipo e valor são obrigatórios' });
    }
    
    const resultado = AntiFraudeService.verificarBlacklist(tipo, valor);
    res.json({ bloqueado: !!resultado, item: resultado });
});

// ==================== REGRAS ====================
router.get('/regras', (req, res) => {
    res.json(AntiFraudeService.listarRegras());
});

router.get('/regras/:id', (req, res) => {
    const regra = AntiFraudeService.obterRegra(req.params.id);
    if (!regra) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json(regra);
});

router.put('/regras/:id', (req, res) => {
    const regra = AntiFraudeService.atualizarRegra(req.params.id, req.body);
    if (!regra) return res.status(404).json({ error: 'Regra não encontrada' });
    
    LogsService.registrar({ tipo: 'antifraude', acao: 'Regra atualizada', detalhes: { regraId: regra.id } });
    res.json({ sucesso: true, regra });
});

// ==================== ANÁLISE MANUAL ====================
router.post('/analisar/corrida', (req, res) => {
    const resultado = AntiFraudeService.analisarCorrida(req.body);
    res.json(resultado);
});

router.post('/analisar/motorista', (req, res) => {
    const { motorista, estatisticas } = req.body;
    const resultado = AntiFraudeService.analisarMotorista(motorista, estatisticas);
    res.json(resultado);
});

router.post('/analisar/cliente', (req, res) => {
    const { cliente, estatisticas } = req.body;
    const resultado = AntiFraudeService.analisarCliente(cliente, estatisticas);
    res.json(resultado);
});

module.exports = router;
