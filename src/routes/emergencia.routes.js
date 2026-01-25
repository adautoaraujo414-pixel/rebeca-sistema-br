const express = require('express');
const router = express.Router();
const { ContatoEmergencia } = require('../models');

// Listar todos contatos
router.get('/', async (req, res) => {
    try {
        const contatos = await ContatoEmergencia.find({ ativo: true }).sort({ categoria: 1 });
        res.json(contatos);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Listar por categoria
router.get('/categoria/:categoria', async (req, res) => {
    try {
        const contatos = await ContatoEmergencia.find({ 
            categoria: req.params.categoria, 
            ativo: true 
        });
        res.json(contatos);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Criar contato
router.post('/', async (req, res) => {
    try {
        const contato = await ContatoEmergencia.create(req.body);
        res.json({ sucesso: true, contato });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Atualizar contato
router.put('/:id', async (req, res) => {
    try {
        const contato = await ContatoEmergencia.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        res.json({ sucesso: true, contato });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Deletar contato
router.delete('/:id', async (req, res) => {
    try {
        await ContatoEmergencia.findByIdAndUpdate(req.params.id, { ativo: false });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;
