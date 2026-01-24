const express = require('express');
const router = express.Router();
const precoDinamicoService = require('../services/preco-dinamico.service');

router.get('/calcular', (req, res) => {
    const { distancia, localidadeId } = req.query;
    
    if (!distancia) {
        return res.status(400).json({ error: 'Distância obrigatória' });
    }

    const calculo = precoDinamicoService.calcularPreco(
        parseFloat(distancia),
        localidadeId || null
    );
    res.json(calculo);
});

router.get('/config', (req, res) => {
    res.json(precoDinamicoService.getConfigBase());
});

router.put('/config', (req, res) => {
    const config = precoDinamicoService.setConfigBase(req.body);
    res.json(config);
});

router.get('/regras', (req, res) => {
    const apenasAtivas = req.query.ativas === 'true';
    const regras = precoDinamicoService.listarRegras(apenasAtivas);
    res.json(regras);
});

router.get('/regras/:id', (req, res) => {
    const regra = precoDinamicoService.obterRegra(req.params.id);
    if (!regra) {
        return res.status(404).json({ error: 'Regra não encontrada' });
    }
    res.json(regra);
});

router.post('/regras', (req, res) => {
    try {
        const regra = precoDinamicoService.criarRegra(req.body);
        res.status(201).json(regra);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/regras/:id', (req, res) => {
    try {
        const regra = precoDinamicoService.atualizarRegra(req.params.id, req.body);
        if (!regra) {
            return res.status(404).json({ error: 'Regra não encontrada' });
        }
        res.json(regra);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/regras/:id', (req, res) => {
    const deletado = precoDinamicoService.excluirRegra(req.params.id);
    if (!deletado) {
        return res.status(404).json({ error: 'Regra não encontrada' });
    }
    res.json({ sucesso: true });
});

module.exports = router;
