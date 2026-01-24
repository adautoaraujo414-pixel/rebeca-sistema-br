const express = require('express');
const router = express.Router();
const localidadeService = require('../services/localidade.service');

router.get('/', (req, res) => {
    const apenasAtivas = req.query.ativas === 'true';
    const localidades = localidadeService.listarLocalidades(apenasAtivas);
    res.json(localidades);
});

router.get('/:id', (req, res) => {
    const localidade = localidadeService.obterLocalidade(req.params.id);
    if (!localidade) {
        return res.status(404).json({ error: 'Localidade não encontrada' });
    }
    res.json(localidade);
});

router.post('/', (req, res) => {
    try {
        const localidade = localidadeService.criarLocalidade(req.body);
        res.status(201).json(localidade);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id', (req, res) => {
    try {
        const localidade = localidadeService.atualizarLocalidade(req.params.id, req.body);
        if (!localidade) {
            return res.status(404).json({ error: 'Localidade não encontrada' });
        }
        res.json(localidade);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/:id', (req, res) => {
    const deletado = localidadeService.excluirLocalidade(req.params.id);
    if (!deletado) {
        return res.status(404).json({ error: 'Localidade não encontrada' });
    }
    res.json({ sucesso: true });
});

module.exports = router;
