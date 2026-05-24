const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AdminDelivery } = require('../models/delivery.models');

// POST /api/delivery-auth/cadastro

router.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone, nomeComercio, tipoNegocio, cidade, origem } = req.body;
        if (!nome || !email || !senha || !telefone || !nomeComercio)
            return res.status(400).json({ erro: 'Campos obrigatórios: nome, email, senha, telefone, nomeComercio' });
        if (senha.length < 6)
            return res.status(400).json({ erro: 'Senha deve ter pelo menos 6 caracteres' });

        const existente = await AdminDelivery.findOne({ email: email.toLowerCase() });
        if (existente) return res.status(400).json({ erro: 'E-mail já cadastrado. Faça login.' });

        const hash = await bcrypt.hash(senha, 10);
        const token = crypto.randomBytes(32).toString('hex');

        const admin = await AdminDelivery.create({
            nome, email: email.toLowerCase(), senha: hash,
            telefone, nomeComercio, tipoNegocio: tipoNegocio || 'restaurante',
            cidade, token,
            status: 'pendente', origem: origem || 'landing'
        });

        console.log('[DELIVERY SOLICITACAO]', nome, '|', nomeComercio, '| aguardando aprovacao do master');
        res.json({
            sucesso: true,
            pendente: true,
            mensagem: 'Solicitação enviada com sucesso!'
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// POST /api/delivery-auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        if (!email || !senha) return res.status(400).json({ erro: 'Email e senha obrigatórios' });

        // Buscar em AdminDelivery ou Admin (tipoAdmin: delivery)
        let admin = await AdminDelivery.findOne({ email: email.toLowerCase() });
        let isAdminPrincipal = false;
        if (!admin) {
            const { Admin } = require('../models');
            admin = await Admin.findOne({ email: email.toLowerCase(), tipoAdmin: 'delivery' });
            isAdminPrincipal = true;
        }
        if (!admin) return res.status(401).json({ erro: 'E-mail não encontrado' });

        // Verificar senha (bcrypt ou texto puro)
        let ok = false;
        if (admin.senha && admin.senha.startsWith('$2')) {
            ok = await bcrypt.compare(senha, admin.senha);
        } else {
            ok = (senha === admin.senha);
        }
        if (!ok) return res.status(401).json({ erro: 'Senha incorreta' });


        if (admin.status === 'bloqueado')
            return res.status(403).json({ erro: 'Conta bloqueada. Entre em contato: (34) 98403-9955', bloqueado: true });

        // Verificar trial vencido
        if (admin.status === 'trial' && admin.trialFim && new Date() > admin.trialFim) {
            if (!isAdminPrincipal) {
                await AdminDelivery.findByIdAndUpdate(admin._id, { status: 'bloqueado', motivoBloqueio: 'Trial expirado' });
            }
            return res.status(403).json({ erro: 'Período de teste encerrado. Entre em contato para assinar.', trialExpirado: true });
        }

        // Garantir que o token existe — gerar se não tiver (Admin genérico pode não ter token)
        if (!admin.token) {
            const crypto = require('crypto');
            const novoToken = crypto.randomBytes(32).toString('hex');
            const ModeloUsar = isAdminPrincipal ? require('../models').Admin : AdminDelivery;
            await ModeloUsar.findByIdAndUpdate(admin._id, { token: novoToken });
            admin.token = novoToken;
        }

        res.json({
            sucesso: true,
            token: admin.token,
            adminId: admin._id,
            nome: admin.nome,
            nomeComercio: admin.nomeComercio,
            status: admin.status,
            trialFim: admin.trialFim,
            diasRestantes: admin.status === 'trial' ? Math.ceil((admin.trialFim - new Date()) / 86400000) : null
        });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// GET /api/delivery-auth/me (verifica token)
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
        if (!token) return res.status(401).json({ erro: 'Token obrigatório' });
        // Buscar em AdminDelivery ou Admin (tipoAdmin: delivery)
        let admin = await AdminDelivery.findOne({ token }).select('-senha');
        if (!admin) {
            const { Admin } = require('../models');
            admin = await Admin.findOne({ token, tipoAdmin: 'delivery' }).select('-senha');
        }
        if (!admin) return res.status(401).json({ erro: 'Token inválido' });
        if (admin.status === 'bloqueado') return res.status(403).json({ erro: 'Conta bloqueada', bloqueado: true });
        if (admin.status === 'trial' && new Date() > admin.trialFim) {
            await AdminDelivery.findByIdAndUpdate(admin._id, { status: 'bloqueado', motivoBloqueio: 'Trial expirado' });
            return res.status(403).json({ erro: 'Trial expirado', trialExpirado: true });
        }
        res.json({ sucesso: true, admin });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
