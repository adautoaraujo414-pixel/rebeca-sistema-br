const express = require('express');
const router = express.Router();
const AF = require('../services/antifraude.service');
const LogsService = require('../services/logs.service');

function getAdminId(req) {
    return req.headers['x-admin-id'] || req.query.adminId || req.body?.adminId || null;
}

router.get('/estatisticas', async (req, res) => {
    try {
      const adminId = getAdminId(req);
      if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
      res.json(await AF.obterEstatisticas(adminId));
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.get('/alertas', async (req, res) => {
    try {
      const adminId = getAdminId(req);
      if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
      res.json(await AF.listarAlertas({ adminId, status: req.query.status, nivel: req.query.nivel, tipo: req.query.tipo }));
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.get('/alertas/:id', async (req, res) => {
    try {
      const a = await AF.obterAlerta(getAdminId(req), req.params.id);
      if (!a) return res.status(404).json({ error: 'Alerta não encontrado' });
      res.json(a);
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.put('/alertas/:id/analisar', async (req, res) => {
    try {
      const r = await AF.analisarAlerta(getAdminId(req), req.params.id, req.body.analisadoPor || 'Admin');
      res.json({ sucesso: true, alerta: r });
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.put('/alertas/:id/resolver', async (req, res) => {
    try {
      if (!req.body.resolucao) return res.status(400).json({ error: 'Resolução obrigatória' });
      const r = await AF.resolverAlerta(getAdminId(req), req.params.id, req.body.resolucao);
      LogsService.registrar({ tipo: 'antifraude', acao: 'Alerta resolvido', detalhes: { id: req.params.id } });
      res.json({ sucesso: true, alerta: r });
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.put('/alertas/:id/ignorar', async (req, res) => {
    try {
      const r = await AF.ignorarAlerta(getAdminId(req), req.params.id, req.body.motivo || 'Falso positivo');
      res.json({ sucesso: true, alerta: r });
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.get('/blacklist', async (req, res) => {
    try {
      res.json(await AF.listarBlacklist(getAdminId(req), req.query.tipo));
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.post('/blacklist', async (req, res) => {
    try {
      const { tipo, valor, motivo } = req.body;
      if (!tipo || !valor) return res.status(400).json({ error: 'Tipo e valor obrigatórios' });
      const adminId = getAdminId(req);
      const existente = await AF.verificarBlacklist(tipo, valor, adminId);
      if (existente) return res.status(400).json({ error: 'Já está na blacklist' });
      const item = await AF.adicionarBlacklist(adminId, { tipo, valor, motivo, bloqueadoPor: 'Admin' });
      LogsService.registrar({ tipo: 'antifraude', acao: 'Adicionado à blacklist', detalhes: { tipo, valor } });
      res.status(201).json(item);
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.delete('/blacklist/:id', async (req, res) => {
    try {
      await AF.removerBlacklist(getAdminId(req), req.params.id);
      LogsService.registrar({ tipo: 'antifraude', acao: 'Removido da blacklist', detalhes: { id: req.params.id } });
      res.json({ sucesso: true });
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.get('/blacklist/verificar', async (req, res) => {
    try {
      const { tipo, valor } = req.query;
      if (!tipo || !valor) return res.status(400).json({ error: 'Tipo e valor obrigatórios' });
      const resultado = await AF.verificarBlacklist(tipo, valor, getAdminId(req));
      res.json({ bloqueado: !!resultado, item: resultado });
    } catch(e) { console.error("[antifraude.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.get('/regras', (req, res) => res.json(AF.listarRegras()));
router.get('/regras/:id', (req, res) => {
    const r = AF.obterRegra(req.params.id);
    if (!r) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json(r);
});
router.put('/regras/:id', (req, res) => {
    const r = AF.atualizarRegra(req.params.id, req.body);
    if (!r) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json({ sucesso: true, regra: r });
});

router.post('/analisar/corrida', (req, res) => {
    const adminId = getAdminId(req);
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    res.json(AF.analisarCorrida(req.body));
});
router.post('/analisar/motorista', (req, res) => {
    const adminId = getAdminId(req);
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    res.json(AF.analisarMotorista(req.body.motorista, req.body.estatisticas));
});
router.post('/analisar/cliente', (req, res) => {
    const adminId = getAdminId(req);
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    res.json(AF.analisarCliente(req.body.cliente, req.body.estatisticas));
});

module.exports = router;
