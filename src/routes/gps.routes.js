const express = require('express');
const router = express.Router();
const gpsService = require('../services/gps.service');
const { _authAdmin } = require('../middleware/auth');

router.get('/', _authAdmin, (req, res) => {
    const adminId = req.usuario?.id || req.usuario?._id || 'global';
    const localizacoes = gpsService.listarLocalizacoes(adminId);
    res.json(localizacoes);
});

router.get('/proximos', (req, res) => {
    const { latitude, longitude, raio } = req.query;
    
    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude e longitude obrigatórios' });
    }

    const adminId = req.query.adminId || req.usuario?.id || 'global';
    const proximos = gpsService.buscarProximos(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(raio) || 10,
        adminId
    );
    res.json(proximos);
});

router.get('/:motoristaId', (req, res) => {
    const localizacao = gpsService.obterLocalizacao(req.params.motoristaId);
    if (!localizacao) {
        return res.status(404).json({ error: 'Localização não encontrada' });
    }
    res.json(localizacao);
});

router.post('/atualizar', (req, res) => {
    const { motoristaId, latitude, longitude, precisao, velocidade } = req.body;
    
    if (!motoristaId || !latitude || !longitude) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    const adminId = req.body.adminId || 'global';
    const localizacao = gpsService.atualizarLocalizacao(motoristaId, {
        latitude, longitude, precisao, velocidade
    }, adminId);
    res.json(localizacao);
});

router.delete('/:motoristaId', (req, res) => {
    gpsService.removerLocalizacao(req.params.motoristaId);
    res.json({ sucesso: true });
});

router.get('/calcular/distancia', (req, res) => {
    const { lat1, lon1, lat2, lon2 } = req.query;
    
    if (!lat1 || !lon1 || !lat2 || !lon2) {
        return res.status(400).json({ error: 'Coordenadas incompletas' });
    }

    const distancia = gpsService.calcularDistancia(
        parseFloat(lat1), parseFloat(lon1),
        parseFloat(lat2), parseFloat(lon2)
    );
    res.json({ distanciaKm: distancia });
});

module.exports = router;
