const express = require('express');
const router = express.Router();
const { Admin, Motorista } = require('../models');

// Middleware auth motorista
const authMot = async (req, res, next) => {
    try {
        let token = req.headers.authorization?.replace('Bearer ', '').trim();
        if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
        const mot = await Motorista.findOne({ token });
        if (!mot) return res.status(401).json({ erro: 'Token inválido' });
        req.motorista = mot;
        next();
    } catch(e) { res.status(500).json({ erro: e.message }); }
};

// GET contatos de emergência do adm do motorista
router.get('/emergencia', authMot, async (req, res) => {
    try {
        const admin = await Admin.findById(req.motorista.adminId).select('contatosEmergencia nomeMarca telefone');
        const contatos = admin?.contatosEmergencia?.length > 0
            ? admin.contatosEmergencia
            : [
                { nome: admin?.nomeMarca || 'Suporte', telefone: admin?.telefone || '', tipo: 'admin' }
              ].filter(c => c.telefone);
        res.json({ sucesso: true, contatos });
    } catch(e) { res.json({ sucesso: false, contatos: [] }); }
});

// PUT atualizar contatos de emergência (admin logado)
router.put('/emergencia', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '').trim();
        const { contatos } = req.body;
        // Auth admin via token de sessão
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rebeca_secret');
        await Admin.findByIdAndUpdate(decoded.id || decoded._id, { contatosEmergencia: contatos });
        res.json({ sucesso: true });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

module.exports = router;
