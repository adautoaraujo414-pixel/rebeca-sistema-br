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

module.exports = router;