const express = require('express');
const router = express.Router();
const gpsIntegradoService = require('../services/gps-integrado.service');

router.get('/', (req, res) => {
    const motoristas = gpsIntegradoService.listarTodos();
    res.json(motoristas);
});

router.get('/estatisticas', (req, res) => {
    const estatisticas = gpsIntegradoService.obterEstatisticas();
    res.json(estatisticas);
});

router.get('/disponiveis', (req, res) => {
    const { latitude, longitude } = req.query;
    const disponiveis = gpsIntegradoService.listarDisponiveis(
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null
    );
    res.json(disponiveis);
});

router.get('/mais-proximo', (req, res) => {
    const { latitude, longitude, raio } = req.query;
    
    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude e longitude obrigatórios' });
    }

    const motorista = gpsIntegradoService.buscarMaisProximo(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(raio) || 10
    );

    if (!motorista) {
        return res.status(404).json({ error: 'Nenhum motorista disponível na área' });
    }

    res.json(motorista);
});

router.get('/status/:status', (req, res) => {
    const motoristas = gpsIntegradoService.listarPorStatus(req.params.status);
    res.json(motoristas);
});

router.get('/:id', (req, res) => {
    const motorista = gpsIntegradoService.obterMotorista(req.params.id);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json(motorista);
});

router.put('/:id', (req, res) => {
    const resultado = gpsIntegradoService.atualizar(req.params.id, req.body);
    if (!resultado) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json(resultado);
});

module.exports = router;
