const express = require('express');
const router = express.Router();
const { ZonaPreco } = require('../models');

const authAdmin = async (req, res, next) => {
    const adminId = req.headers['x-admin-id'] || req.query.adminId || req.body?.adminId;
    if (!adminId) return res.status(401).json({ erro: 'Sem adminId' });
    req.adminId = adminId;
    next();
};

// Listar zonas do admin
router.get('/', authAdmin, async (req, res) => {
    try {
        const zonas = await ZonaPreco.find({ adminId: req.adminId }).sort({ criadoEm: -1 });
        res.json(zonas);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar zona
router.post('/', authAdmin, async (req, res) => {
    try {
        const { nome, enderecoReferencia, raioKm, precoFixo,
                diasSemana, horaInicio, horaFim, descricao } = req.body;
        if (!nome || !precoFixo || !raioKm)
            return res.status(400).json({ erro: 'Campos obrigatórios: nome, raioKm, precoFixo' });

        // Geocodificar endereço de referência para obter lat/lng
        let lat = req.body.lat, lng = req.body.lng;
        if ((!lat || !lng) && enderecoReferencia) {
            try {
                const MapsService = require('../services/maps.service');
                const geo = await MapsService.geocodificar(enderecoReferencia);
                if (geo?.sucesso) { lat = geo.latitude; lng = geo.longitude; }
            } catch(e) {}
        }
        if (!lat || !lng) return res.status(400).json({ erro: 'Não foi possível localizar o endereço. Informe um endereço válido.' });

        const zona = await ZonaPreco.create({
            adminId: req.adminId,
            lat: lat || req.body.lat,
            lng: lng || req.body.lng, nome, lat, lng,
            enderecoReferencia: enderecoReferencia || '',
            raioKm, precoFixo,
            diasSemana: diasSemana || [],
            horaInicio: horaInicio || '00:00',
            horaFim: horaFim || '23:59',
            descricao: descricao || ''
        });
        res.json({ sucesso: true, zona });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar zona
router.put('/:id', authAdmin, async (req, res) => {
    try {
        const zona = await ZonaPreco.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            req.body, { new: true }
        );
        res.json({ sucesso: true, zona });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Deletar zona
router.delete('/:id', authAdmin, async (req, res) => {
    try {
        await ZonaPreco.deleteOne({ _id: req.params.id, adminId: req.adminId });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Verificar se ponto está dentro de alguma zona ativa (usado no cálculo de preço)
router.post('/verificar', authAdmin, async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const zona = await ZonaPreco.verificarZona(req.adminId, lat, lng);
        res.json(zona ? { zona, precoFixo: zona.precoFixo } : { zona: null });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
