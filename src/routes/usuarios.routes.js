const express = require('express');
const router = express.Router();
const UsuariosService = require('../services/usuarios-mongo.service');
const LogsService = require('../services/logs.service');

const getAdminId = (req) => req.query.adminId || req.headers['x-admin-id'] || req.body?.adminId || null;

router.post('/login', async (req, res) => {
    try {
      const { login, senha } = req.body;
      if (!login || !senha) return res.status(400).json({ error: 'Login e senha obrigatórios' });
      const result = await UsuariosService.login(login, senha);
      if (result.error) return res.status(401).json(result);
      res.json(result);
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.get('/verificar', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    const usuario = UsuariosService.verificarToken(token);
    if (!usuario) return res.status(401).json({ error: 'Token inválido' });
    res.json({ valido: true, usuario });
});

router.post('/logout', (req, res) => res.json(UsuariosService.logout()));

router.get('/niveis', (req, res) => res.json(UsuariosService.listarNiveis()));

router.get('/estatisticas', async (req, res) => res.json(await UsuariosService.obterEstatisticas()));

router.get('/', async (req, res) => {
    try {
      const adminId = getAdminId(req);
      const filtros = { ativo: req.query.ativo === 'true' ? true : req.query.ativo === 'false' ? false : undefined, busca: req.query.busca };
      res.json(await UsuariosService.listarTodos(filtros, adminId));
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.get('/:id', async (req, res) => {
    try {
      const usuario = await UsuariosService.buscarPorId(req.params.id);
      if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
      res.json(usuario);
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.post('/', async (req, res) => {
    try {
      const adminId = getAdminId(req);
      const { nome, email, login, senha, nivel, telefone } = req.body;
      if (!nome || !email) return res.status(400).json({ error: 'Nome e email obrigatórios' });
      const result = await UsuariosService.criar({ nome, email, login, senha, nivel, telefone }, adminId);
      if (result.error) return res.status(400).json(result);
      LogsService.registrar({ tipo: 'usuario', acao: 'Usuário criado: ' + nome, adminId });
      res.status(201).json(result);
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.put('/:id', async (req, res) => {
    try {
      const result = await UsuariosService.atualizar(req.params.id, req.body);
      if (!result) return res.status(404).json({ error: 'Usuário não encontrado' });
      res.json({ sucesso: true, usuario: result });
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.put('/:id/senha', async (req, res) => {
    try {
      const { senhaAtual, novaSenha } = req.body;
      if (!senhaAtual || !novaSenha) return res.status(400).json({ error: 'Senhas obrigatórias' });
      const result = await UsuariosService.alterarSenha(req.params.id, senhaAtual, novaSenha);
      if (result.error) return res.status(400).json(result);
      res.json({ sucesso: true });
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.post('/:id/resetar-senha', async (req, res) => {
    try {
      const result = await UsuariosService.resetarSenha(req.params.id);
      res.json(result);
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.put('/:id/ativar', async (req, res) => {
    try {
      const result = await UsuariosService.ativar(req.params.id);
      if (!result) return res.status(404).json({ error: 'Usuário não encontrado' });
      res.json({ sucesso: true, usuario: result });
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.put('/:id/desativar', async (req, res) => {
    try {
      const result = await UsuariosService.desativar(req.params.id);
      if (!result) return res.status(404).json({ error: 'Usuário não encontrado' });
      res.json({ sucesso: true, usuario: result });
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
      const result = await UsuariosService.excluir(req.params.id);
      LogsService.registrar({ tipo: 'usuario', acao: 'Usuário excluído', detalhes: { id: req.params.id } });
      res.json(result);
    } catch(e) { console.error("[usuarios.routes.js]", e.message); res.status(500).json({ erro: e.message }); }
});

module.exports = router;
