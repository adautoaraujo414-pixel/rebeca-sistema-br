const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const PreCadastroSchema = new mongoose.Schema({
    nome: String,
    comercio: String,
    telefone: String,
    cidade: String,
    tipo: String,
    origem: { type: String, default: 'landing_delivery' },
    status: { type: String, default: 'pendente' },
    dataRegistro: { type: Date, default: Date.now }
});
const PreCadastro = mongoose.models.PreCadastroDelivery || mongoose.model('PreCadastroDelivery', PreCadastroSchema);

router.post('/pre-cadastro', async (req, res) => {
    try {
        const { nome, comercio, telefone, cidade, tipo, origem } = req.body;
        if (!nome || !comercio || !telefone || !cidade)
            return res.status(400).json({ erro: 'Campos obrigatórios: nome, comercio, telefone, cidade' });
        const existente = await PreCadastro.findOne({ telefone });
        if (existente) return res.json({ sucesso: true, mensagem: 'Já cadastrado!' });
        await new PreCadastro({ nome, comercio, telefone, cidade, tipo, origem }).save();
        console.log('[PRÉ-CADASTRO DELIVERY]', nome, '|', comercio, '|', cidade);
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/pre-cadastros', async (req, res) => {
    try {
        const lista = await PreCadastro.find({}).sort({ dataRegistro: -1 });
        res.json({ total: lista.length, lista });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
