const express = require('express');
const router = express.Router();
const localidadeService = require('../services/localidade.service');

router.get('/', (req, res) => {
    const filtros = {
        localidadeId: req.query.localidadeId,
        tipo: req.query.tipo,
        apenasAtivos: req.query.ativos === 'true'
    };
    const pontos = localidadeService.listarPontosReferencia(filtros);
    res.json(pontos);
});

router.get('/tipos', (req, res) => {
    res.json(localidadeService.getTiposPontos());
});

router.get('/buscar', (req, res) => {
    const { texto } = req.query;
    if (!texto) {
        return res.status(400).json({ error: 'Texto de busca obrigatório' });
    }
    const pontos = localidadeService.buscarPontos(texto);
    res.json(pontos);
});

router.get('/:id', (req, res) => {
    const ponto = localidadeService.obterPontoReferencia(req.params.id);
    if (!ponto) {
        return res.status(404).json({ error: 'Ponto não encontrado' });
    }
    res.json(ponto);
});

router.post('/', (req, res) => {
    try {
        const ponto = localidadeService.criarPontoReferencia(req.body);
        res.status(201).json(ponto);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id', (req, res) => {
    try {
        const ponto = localidadeService.atualizarPontoReferencia(req.params.id, req.body);
        if (!ponto) {
            return res.status(404).json({ error: 'Ponto não encontrado' });
        }
        res.json(ponto);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/:id', (req, res) => {
    const deletado = localidadeService.excluirPontoReferencia(req.params.id);
    if (!deletado) {
        return res.status(404).json({ error: 'Ponto não encontrado' });
    }
    res.json({ sucesso: true });
});

module.exports = router;
