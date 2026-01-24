const express = require('express');
const router = express.Router();

const usuariosAdmin = [
    { id: 'admin_001', usuario: 'admin', senha: 'admin123', nome: 'Administrador', role: 'admin' },
    { id: 'admin_002', usuario: 'operador', senha: 'operador123', nome: 'Operador', role: 'operador' }
];

router.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    
    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
    }

    const user = usuariosAdmin.find(u => u.usuario === usuario && u.senha === senha);
    
    if (!user) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = 'ADMIN_' + user.id + '_' + Date.now();

    res.json({
        sucesso: true,
        token,
        usuario: { id: user.id, nome: user.nome, role: user.role }
    });
});

router.post('/logout', (req, res) => {
    res.json({ sucesso: true, mensagem: 'Logout realizado' });
});

router.get('/verificar', (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ADMIN_')) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    res.json({ sucesso: true, valido: true });
});

module.exports = router;
