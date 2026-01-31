const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');
const { Motorista } = require('../models');

// Middleware para extrair adminId
const extrairAdminId = (req, res, next) => {
    req.adminId = req.headers['x-admin-id'] || req.query.adminId || null;
    next();
};
router.use(extrairAdminId);

// Listar motoristas (filtrado por admin)
router.get('/', async (req, res) => {
    try {
        const motoristas = await MotoristaService.listar(req.adminId);
        res.json(motoristas);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Estatisticas
router.get('/estatisticas', async (req, res) => {
    try {
        const stats = await MotoristaService.estatisticas(req.adminId);
        res.json(stats);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Disponiveis
router.get('/disponiveis', async (req, res) => {
    try {
        const motoristas = await MotoristaService.listarDisponiveis(req.adminId);
        res.json(motoristas);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const motorista = await MotoristaService.buscarPorId(req.params.id);
        if (!motorista) return res.status(404).json({ erro: 'Nao encontrado' });
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Criar motorista (com adminId)
router.post('/', async (req, res) => {
    try {
        const adminId = req.body.adminId || req.adminId;
        if (!adminId) {
            return res.status(400).json({ error: 'Admin ID obrigatorio' });
        }
        // Gerar senha aleatoria
        const senhaGerada = Math.random().toString(36).slice(-6).toUpperCase();
        req.body.senha = senhaGerada;
        const motorista = await MotoristaService.criar(req.body, adminId);
        res.status(201).json({ motorista, senhaGerada });
    } catch (e) { 
        console.error('Erro ao criar motorista:', e);
        res.status(500).json({ error: e.message }); 
    }
});

// Atualizar
router.put('/:id', async (req, res) => {
    try {
        const motorista = await MotoristaService.atualizar(req.params.id, req.body);
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Deletar
router.delete('/:id', async (req, res) => {
    try {
        await MotoristaService.deletar(req.params.id);
        res.json({ sucesso: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar status
router.put('/:id/status', async (req, res) => {
    try {
        const motorista = await MotoristaService.atualizarStatus(req.params.id, req.body.status);
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar GPS
router.put('/:id/gps', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const motorista = await MotoristaService.atualizarGPS(req.params.id, latitude, longitude);
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { whatsapp, senha } = req.body;
        const resultado = await MotoristaService.login(whatsapp, senha);
        res.json(resultado);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;