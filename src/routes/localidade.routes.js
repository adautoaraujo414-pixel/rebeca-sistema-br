const express = require('express');
const router = express.Router();
const localidadeService = require('../services/localidade.service');

function getAdminId(req) {
    return req.headers['x-admin-id'] || req.query.adminId || req.body?.adminId || null;
}

router.get('/', async (req, res) => {
    const adminId = getAdminId(req);
    const lista = await localidadeService.listarLocalidades(adminId, req.query.ativas === 'true');
    res.json(lista);
});

router.get('/:id', async (req, res) => {
    const loc = await localidadeService.obterLocalidade(getAdminId(req), req.params.id);
    if (!loc) return res.status(404).json({ error: 'Localidade não encontrada' });
    res.json(loc);
});

router.post('/', async (req, res) => {
    try {
        const loc = await localidadeService.criarLocalidade(getAdminId(req), req.body);
        res.status(201).json(loc);
    } catch(e) { res.status(400).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
    try {
        const loc = await localidadeService.atualizarLocalidade(getAdminId(req), req.params.id, req.body);
        res.json(loc);
    } catch(e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
    await localidadeService.excluirLocalidade(getAdminId(req), req.params.id);
    res.json({ sucesso: true });
});

module.exports = router;
