const express = require('express');
const router = express.Router();
const gpsIntegradoService = require('../services/gps-integrado.service');

const extrairAdminId = (req, res, next) => {
    req.adminId = req.headers['x-admin-id'] || req.query.adminId;
    next();
};

router.use(extrairAdminId);

router.get('/', async (req, res) => {
    try {
        const motoristas = await gpsIntegradoService.listarTodos(req.adminId);
        res.json(motoristas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/estatisticas', async (req, res) => {
    try {
        const estatisticas = await gpsIntegradoService.obterEstatisticas(req.adminId);
        res.json(estatisticas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/disponiveis', async (req, res) => {
    try {
        const { latitude, longitude } = req.query;
        const disponiveis = await gpsIntegradoService.listarDisponiveis(
            req.adminId,
            latitude ? parseFloat(latitude) : null,
            longitude ? parseFloat(longitude) : null
        );
        res.json(disponiveis);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/mais-proximo', async (req, res) => {
    try {
        const { latitude, longitude, raio } = req.query;
        const motorista = await gpsIntegradoService.buscarMaisProximo(
            req.adminId,
            parseFloat(latitude),
            parseFloat(longitude),
            parseFloat(raio) || 10
        );
        res.json(motorista || { error: 'Nenhum disponivel' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/status/:status', async (req, res) => {
    try {
        const motoristas = await gpsIntegradoService.listarPorStatus(req.adminId, req.params.status);
        res.json(motoristas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const motorista = await gpsIntegradoService.obterMotorista(req.params.id);
        res.json(motorista);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const resultado = await gpsIntegradoService.atualizar(req.params.id, req.body);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;