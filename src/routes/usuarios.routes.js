const express = require('express');
const router = express.Router();
const UsuariosService = require('../services/usuarios.service');
const LogsService = require('../services/logs.service');

// Login
router.post('/login', (req, res) => {
    const { login, senha } = req.body;
    if (!login || !senha) return res.status(400).json({ error: 'Login e senha obrigatórios' });
    
    const result = UsuariosService.login(login, senha);
    if (result.error) {
        LogsService.registrar({ tipo: 'login', acao: 'Login falhou: ' + login, detalhes: { erro: result.error } });
        return res.status(401).json(result);
    }
    
    LogsService.registrar({ tipo: 'login', acao: 'Login realizado', usuarioId: result.usuario.id, usuarioNome: result.usuario.nome });
    res.json(result);
});

// Verificar token
router.get('/verificar', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    
    const usuario = UsuariosService.verificarToken(token);
    if (!usuario) return res.status(401).json({ error: 'Token inválido' });
    
    res.json({ valido: true, usuario });
});

// Logout
router.post('/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) UsuariosService.logout(token);
    res.json({ sucesso: true });
});

// Listar níveis
router.get('/niveis', (req, res) => {
    res.json(UsuariosService.listarNiveis());
});

// Estatísticas
router.get('/estatisticas', (req, res) => {
    res.json(UsuariosService.obterEstatisticas());
});

// Listar usuários
router.get('/', (req, res) => {
    const filtros = { nivel: req.query.nivel, ativo: req.query.ativo === 'true' ? true : req.query.ativo === 'false' ? false : undefined, busca: req.query.busca };
    res.json(UsuariosService.listarTodos(filtros));
});

// Buscar por ID
router.get('/:id', (req, res) => {
    const usuario = UsuariosService.buscarPorId(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(usuario);
});

// Criar usuário
router.post('/', (req, res) => {
    const { nome, email, login, senha, nivel, telefone } = req.body;
    if (!nome || !email || !login) return res.status(400).json({ error: 'Nome, email e login obrigatórios' });
    
    const result = UsuariosService.criar({ nome, email, login, senha, nivel, telefone });
    if (result.error) return res.status(400).json(result);
    
    LogsService.registrar({ tipo: 'usuario', acao: 'Usuário criado: ' + nome, detalhes: { nivel } });
    res.status(201).json(result);
});

// Atualizar usuário
router.put('/:id', (req, res) => {
    const result = UsuariosService.atualizar(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (result.error) return res.status(400).json(result);
    
    LogsService.registrar({ tipo: 'usuario', acao: 'Usuário atualizado', detalhes: { id: req.params.id } });
    res.json({ sucesso: true, usuario: result });
});

// Alterar senha
router.put('/:id/senha', (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) return res.status(400).json({ error: 'Senhas obrigatórias' });
    
    const result = UsuariosService.alterarSenha(req.params.id, senhaAtual, novaSenha);
    if (result.error) return res.status(400).json(result);
    
    res.json({ sucesso: true });
});

// Resetar senha (admin)
router.post('/:id/resetar-senha', (req, res) => {
    const result = UsuariosService.resetarSenha(req.params.id);
    if (result.error) return res.status(400).json(result);
    
    LogsService.registrar({ tipo: 'usuario', acao: 'Senha resetada', detalhes: { id: req.params.id } });
    res.json(result);
});

// Ativar usuário
router.put('/:id/ativar', (req, res) => {
    const result = UsuariosService.ativar(req.params.id);
    if (!result) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    LogsService.registrar({ tipo: 'usuario', acao: 'Usuário ativado', detalhes: { id: req.params.id } });
    res.json({ sucesso: true, usuario: result });
});

// Desativar usuário
router.put('/:id/desativar', (req, res) => {
    const result = UsuariosService.desativar(req.params.id);
    if (!result) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (result.error) return res.status(400).json(result);
    
    LogsService.registrar({ tipo: 'usuario', acao: 'Usuário desativado', detalhes: { id: req.params.id } });
    res.json({ sucesso: true, usuario: result });
});

// Excluir usuário
router.delete('/:id', (req, res) => {
    const result = UsuariosService.excluir(req.params.id);
    if (result.error) return res.status(400).json(result);
    
    LogsService.registrar({ tipo: 'usuario', acao: 'Usuário excluído', detalhes: { id: req.params.id } });
    res.json({ sucesso: true });
});

module.exports = router;
