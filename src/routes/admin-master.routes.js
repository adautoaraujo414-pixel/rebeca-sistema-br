const express = require('express');
const router = express.Router();
const { AdminMaster, Admin, LogSistema, TicketSuporte, Motorista, Cliente, Corrida } = require('../models');

// ========== AUTENTICAÇÃO MASTER ==========
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const master = await AdminMaster.findOne({ email, senha, ativo: true });
        if (!master) return res.status(401).json({ erro: 'Credenciais inválidas' });
        master.ultimoAcesso = new Date();
        await master.save();
        await LogSistema.create({ tipo: 'acesso', usuario: master.email, tipoUsuario: 'master', acao: 'Login', ip: req.ip });
        res.json({ sucesso: true, master: { id: master._id, nome: master.nome, email: master.email, permissoes: master.permissoes } });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== DASHBOARD MASTER ==========
router.get('/dashboard', async (req, res) => {
    try {
        const [admins, motoristas, clientes, corridas, ticketsAbertos] = await Promise.all([
            Admin.countDocuments(),
            Motorista.countDocuments(),
            Cliente.countDocuments(),
            Corrida.countDocuments(),
            TicketSuporte.countDocuments({ status: { $in: ['aberto', 'em_andamento'] } })
        ]);
        const adminsAtivos = await Admin.countDocuments({ ativo: true });
        const adminsPendentes = await Admin.countDocuments({ ativo: false });
        const corridasHoje = await Corrida.countDocuments({ createdAt: { $gte: new Date().setHours(0,0,0,0) } });
        const logsRecentes = await LogSistema.find().sort({ createdAt: -1 }).limit(20);
        res.json({ admins, adminsAtivos, adminsPendentes, motoristas, clientes, corridas, corridasHoje, ticketsAbertos, logsRecentes });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== GERENCIAR ADMINS ==========
router.get('/admins', async (req, res) => {
    try {
        const admins = await Admin.find().sort({ createdAt: -1 });
        res.json(admins);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/admins/pendentes', async (req, res) => {
    try {
        const admins = await Admin.find({ ativo: false }).sort({ createdAt: -1 });
        res.json(admins);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admins', async (req, res) => {
    try {
        const admin = await Admin.create({ ...req.body, ativo: true, dataAprovacao: new Date() });
        await LogSistema.create({ tipo: 'acao', usuario: 'master', tipoUsuario: 'master', acao: 'Criou admin', detalhes: { adminId: admin._id } });
        res.json({ sucesso: true, admin });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/admins/:id/aprovar', async (req, res) => {
    try {
        const admin = await Admin.findByIdAndUpdate(req.params.id, { ativo: true, dataAprovacao: new Date() }, { new: true });
        await LogSistema.create({ tipo: 'acao', usuario: 'master', tipoUsuario: 'master', acao: 'Aprovou admin', detalhes: { adminId: admin._id } });
        res.json({ sucesso: true, admin });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/admins/:id/bloquear', async (req, res) => {
    try {
        const admin = await Admin.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
        await LogSistema.create({ tipo: 'acao', usuario: 'master', tipoUsuario: 'master', acao: 'Bloqueou admin', detalhes: { adminId: admin._id } });
        res.json({ sucesso: true, admin });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/admins/:id/permissoes', async (req, res) => {
    try {
        const admin = await Admin.findByIdAndUpdate(req.params.id, { permissoes: req.body.permissoes }, { new: true });
        res.json({ sucesso: true, admin });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/admins/:id', async (req, res) => {
    try {
        await Admin.findByIdAndDelete(req.params.id);
        await LogSistema.create({ tipo: 'acao', usuario: 'master', tipoUsuario: 'master', acao: 'Excluiu admin', detalhes: { adminId: req.params.id } });
        res.json({ sucesso: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== LOGS ==========
router.get('/logs', async (req, res) => {
    try {
        const { tipo, limite = 100 } = req.query;
        const filtro = tipo ? { tipo } : {};
        const logs = await LogSistema.find(filtro).sort({ createdAt: -1 }).limit(parseInt(limite));
        res.json(logs);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== SUPORTE ==========
router.get('/tickets', async (req, res) => {
    try {
        const { status } = req.query;
        const filtro = status ? { status } : {};
        const tickets = await TicketSuporte.find(filtro).sort({ createdAt: -1 });
        res.json(tickets);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/tickets', async (req, res) => {
    try {
        const numero = 'TKT' + Date.now();
        const ticket = await TicketSuporte.create({ ...req.body, numero });
        res.json({ sucesso: true, ticket });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/tickets/:id/responder', async (req, res) => {
    try {
        const { mensagem, status } = req.body;
        const ticket = await TicketSuporte.findById(req.params.id);
        ticket.mensagens.push({ remetente: 'Suporte Master', tipoRemetente: 'master', mensagem });
        if (status) ticket.status = status;
        await ticket.save();
        res.json({ sucesso: true, ticket });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/tickets/:id/resolver', async (req, res) => {
    try {
        const ticket = await TicketSuporte.findByIdAndUpdate(req.params.id, { status: 'resolvido', resolucao: req.body.resolucao, dataResolucao: new Date() }, { new: true });
        res.json({ sucesso: true, ticket });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== ESTATÍSTICAS GLOBAIS ==========
router.get('/estatisticas', async (req, res) => {
    try {
        const hoje = new Date().setHours(0,0,0,0);
        const semana = new Date(Date.now() - 7*24*60*60*1000);
        const mes = new Date(Date.now() - 30*24*60*60*1000);
        const [corridasHoje, corridasSemana, corridasMes, faturamentoMes] = await Promise.all([
            Corrida.countDocuments({ createdAt: { $gte: hoje } }),
            Corrida.countDocuments({ createdAt: { $gte: semana } }),
            Corrida.countDocuments({ createdAt: { $gte: mes } }),
            Corrida.aggregate([{ $match: { createdAt: { $gte: mes }, status: 'finalizada' } }, { $group: { _id: null, total: { $sum: '$valor' } } }])
        ]);
        res.json({ corridasHoje, corridasSemana, corridasMes, faturamentoMes: faturamentoMes[0]?.total || 0 });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== CRIAR MASTER PADRÃO ==========
router.post('/setup', async (req, res) => {
    try {
        const existe = await AdminMaster.findOne({ email: 'master@ubmax.com' });
        if (existe) return res.json({ mensagem: 'Master já existe' });
        const master = await AdminMaster.create({ nome: 'Admin Master', email: 'master@ubmax.com', senha: 'master123', telefone: '11999999999' });
        res.json({ sucesso: true, master, mensagem: 'Master criado! Login: master@ubmax.com / master123' });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
