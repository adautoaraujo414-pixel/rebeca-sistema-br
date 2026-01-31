const express = require('express');
const router = express.Router();
const { PrecoIntermunicipal } = require('../models');

const extrairAdminId = (req, res, next) => {
    req.adminId = req.headers['x-admin-id'] || req.query.adminId || req.body.adminId;
    next();
};
router.use(extrairAdminId);

router.get('/', async (req, res) => {
    try {
        const precos = await PrecoIntermunicipal.find({ adminId: req.adminId, ativo: true });
        res.json(precos);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/', async (req, res) => {
    try {
        const preco = await PrecoIntermunicipal.create({ ...req.body, adminId: req.adminId });
        res.status(201).json(preco);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        await PrecoIntermunicipal.findByIdAndDelete(req.params.id);
        res.json({ sucesso: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
