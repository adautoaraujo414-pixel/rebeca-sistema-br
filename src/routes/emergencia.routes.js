const express = require('express');
const router = express.Router();
const { ContatoEmergencia } = require('../models');

// Listar todos contatos
router.get('/', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
        const contatos = await ContatoEmergencia.find({ ativo: true, adminId }).sort({ categoria: 1 });
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


// Rota para motorista buscar contatos de emergência do SEU adminId
router.get('/motorista', async (req, res) => {
    try {
        const { Motorista } = require('../models');
        let token = req.headers.authorization?.replace('Bearer ', '').trim();
        if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
        
        const motorista = await Motorista.findOne({ token });
        if (!motorista) return res.status(401).json({ erro: 'Token inválido' });
        
        // Buscar contatos do ContatoEmergencia pelo adminId do motorista
        const contatos = await ContatoEmergencia.find({ 
            adminId: motorista.adminId, 
            ativo: true 
        }).sort({ categoria: 1 });
        
        // Se não tiver contatos cadastrados, buscar telefone do admin como fallback
        if (!contatos || contatos.length === 0) {
            const { Admin } = require('../models');
            const admin = await Admin.findById(motorista.adminId).select('nomeMarca telefone contatosEmergencia');
            const fallback = admin?.contatosEmergencia?.length > 0
                ? admin.contatosEmergencia
                : admin?.telefone 
                    ? [{ nome: admin.nomeMarca || 'Suporte', telefone: admin.telefone, tipo: 'admin' }]
                    : [];
            return res.json({ sucesso: true, contatos: fallback });
        }
        
        res.json({ sucesso: true, contatos });
    } catch(e) {
        res.status(500).json({ sucesso: false, contatos: [], erro: e.message });
    }
});

module.exports = router;
