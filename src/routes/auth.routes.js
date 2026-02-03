const express = require('express');
const router = express.Router();
const { Admin } = require('../models');

// Login - busca admin no MongoDB
router.post('/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        if (!usuario || !senha) {
            return res.status(400).json({ error: 'Email e senha obrigatórios' });
        }

        // Buscar admin por email
        const admin = await Admin.findOne({ email: usuario });
        
        if (!admin) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        // Verificar senha (simples por enquanto - depois adicionar bcrypt)
        if (admin.senha !== senha) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        // Verificar se está ativo
        if (!admin.ativo) {
            return res.status(401).json({ error: 'Conta aguardando aprovação' });
        }

        // Atualizar último acesso
        admin.ultimoAcesso = new Date();
        await admin.save();

        // Gerar token
        const token = 'ADMIN_' + admin._id + '_' + Date.now();

        res.json({
            sucesso: true,
            token,
            usuario: {
                _id: admin._id,
                id: admin._id,
                nome: admin.nome,
                email: admin.email,
                empresa: admin.empresa,
                role: 'admin'
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.json({ sucesso: true, mensagem: 'Logout realizado' });
});

// Verificar token
router.get('/verificar', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ADMIN_')) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    res.json({ sucesso: true, valido: true });
});

// Cadastrar novo admin
router.post('/cadastrar', async (req, res) => {
    try {
        const { nome, email, senha, telefone, empresa } = req.body;
        
        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
        }

        // Verificar se já existe
        const existente = await Admin.findOne({ email });
        if (existente) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }

        // Criar admin (ativo por padrão para facilitar testes)
        const admin = new Admin({
            nome,
            email,
            senha,
            telefone,
            empresa,
            ativo: true
        });

        await admin.save();

        res.json({
            sucesso: true,
            mensagem: 'Cadastro realizado com sucesso!',
            admin: {
                _id: admin._id,
                nome: admin.nome,
                email: admin.email
            }
        });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ error: 'Erro ao cadastrar' });
    }
});

// Trocar senha
router.put('/trocar-senha', async (req, res) => {
    try {
        const { Admin } = require('../models');
        const token = req.headers.authorization?.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'segredo-rebeca-2024');
        const admin = await Admin.findById(decoded.id || decoded.adminId);
        if (!admin) return res.json({ sucesso: false, erro: 'Admin nao encontrado' });
        if (admin.senha !== req.body.senhaAtual) return res.json({ sucesso: false, erro: 'Senha atual incorreta' });
        admin.senha = req.body.senhaNova;
        await admin.save();
        res.json({ sucesso: true });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

// Buscar dados empresa
router.get('/empresa', async (req, res) => {
    try {
        const { Admin } = require('../models');
        const token = req.headers.authorization?.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'segredo-rebeca-2024');
        const admin = await Admin.findById(decoded.id || decoded.adminId);
        if (!admin) return res.json({ sucesso: false, erro: 'Admin nao encontrado' });
        res.json({ sucesso: true, empresa: { nome: admin.empresa || '', telefone: admin.telefone || '', horario: admin.horario || '24 horas', pagamento: admin.pagamento || 'Dinheiro, PIX', boasVindas: admin.boasVindas || '' } });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

// Salvar dados empresa
router.put('/empresa', async (req, res) => {
    try {
        const { Admin } = require('../models');
        const token = req.headers.authorization?.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'segredo-rebeca-2024');
        const admin = await Admin.findByIdAndUpdate(decoded.id || decoded.adminId, {
            empresa: req.body.empresa,
            telefone: req.body.telefone,
            horario: req.body.horario,
            pagamento: req.body.pagamento,
            boasVindas: req.body.boasVindas
        }, { new: true });
        res.json({ sucesso: true, admin });
    } catch(e) { res.json({ sucesso: false, erro: e.message }); }
});

module.exports = router;