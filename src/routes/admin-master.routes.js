const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { AdminMaster, Admin, LogSistema, TicketSuporte, Motorista, Cliente, Corrida, PlanoAdmin, MensalidadeAdmin, ContabilidadeAdmin, ConfigMaster } = require('../models');

// Gerar token único
function gerarToken() { return crypto.randomBytes(32).toString('hex'); }
function gerarSenha() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }

// ========== AUTENTICAÇÃO MASTER ==========
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const master = await AdminMaster.findOne({ email, senha, ativo: true });
        if (!master) return res.status(401).json({ erro: 'Credenciais inválidas' });
        master.ultimoAcesso = new Date();
        await master.save();
        await LogSistema.create({ tipo: 'acesso', usuario: master.email, tipoUsuario: 'master', acao: 'Login Master', ip: req.ip });
        res.json({ sucesso: true, master: { id: master._id, nome: master.nome, email: master.email, permissoes: master.permissoes } });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== DASHBOARD MASTER ==========
router.get('/dashboard', async (req, res) => {
    try {
        const [totalAdmins, motoristas, clientes, corridas, ticketsAbertos] = await Promise.all([
            Admin.countDocuments(),
            Motorista.countDocuments(),
            Cliente.countDocuments(),
            Corrida.countDocuments(),
            TicketSuporte.countDocuments({ status: { $in: ['aberto', 'em_andamento'] } })
        ]);
        const adminsAtivos = await Admin.countDocuments({ ativo: true });
        const adminsPendentes = await Admin.countDocuments({ ativo: false, aprovadoPor: null });
        const adminsBloqueados = await Admin.countDocuments({ ativo: false, aprovadoPor: { $ne: null } });
        const corridasHoje = await Corrida.countDocuments({ createdAt: { $gte: new Date().setHours(0,0,0,0) } });
        
        // Faturamento do mês
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
        const faturamentoMes = await MensalidadeAdmin.aggregate([
            { $match: { status: 'pago', dataPagamento: { $gte: inicioMes } } },
            { $group: { _id: null, total: { $sum: '$valor' } } }
        ]);
        
        // Mensalidades pendentes
        const mensalidadesPendentes = await MensalidadeAdmin.countDocuments({ status: { $in: ['pendente', 'atrasado'] } });
        
        const logsRecentes = await LogSistema.find().sort({ createdAt: -1 }).limit(20);
        
        res.json({ 
            totalAdmins, adminsAtivos, adminsPendentes, adminsBloqueados,
            motoristas, clientes, corridas, corridasHoje, ticketsAbertos,
            faturamentoMes: faturamentoMes[0]?.total || 0,
            mensalidadesPendentes,
            logsRecentes 
        });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== CONTABILIDADE POR ADMIN ==========
router.get('/contabilidade', async (req, res) => {
    try {
        const admins = await Admin.find({ ativo: true });
        const contabilidade = await Promise.all(admins.map(async (admin) => {
            const motoristasAtivos = await Motorista.countDocuments({ adminId: admin._id, status: { $ne: 'inativo' } });
            const corridasMes = await Corrida.countDocuments({ adminId: admin._id, createdAt: { $gte: new Date(new Date().setDate(1)) } });
            const faturamento = await Corrida.aggregate([
                { $match: { adminId: admin._id, status: 'finalizada', createdAt: { $gte: new Date(new Date().setDate(1)) } } },
                { $group: { _id: null, total: { $sum: '$valor' } } }
            ]);
            const mensalidade = await MensalidadeAdmin.findOne({ adminId: admin._id }).sort({ dataVencimento: -1 });
            return {
                admin: { id: admin._id, nome: admin.nome, email: admin.email, empresa: admin.empresa },
                motoristasAtivos,
                corridasMes,
                faturamentoMes: faturamento[0]?.total || 0,
                mensalidade: mensalidade ? { valor: mensalidade.valor, status: mensalidade.status, vencimento: mensalidade.dataVencimento } : null
            };
        }));
        res.json(contabilidade);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== GERENCIAR ADMINS ==========
router.get('/admins', async (req, res) => {
    try {
        const admins = await Admin.find().sort({ createdAt: -1 });
        const adminsComDados = await Promise.all(admins.map(async (admin) => {
            const motoristas = await Motorista.countDocuments({ adminId: admin._id });
            const corridasMes = await Corrida.countDocuments({ adminId: admin._id, createdAt: { $gte: new Date(new Date().setDate(1)) } });
            return { ...admin.toObject(), motoristas, corridasMes };
        }));
        res.json(adminsComDados);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/admins/pendentes', async (req, res) => {
    try {
        const admins = await Admin.find({ ativo: false, aprovadoPor: null }).sort({ createdAt: -1 });
        res.json(admins);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admins', async (req, res) => {
    try {
        const token = gerarToken();
        const senha = req.body.senha || gerarSenha();
        const admin = await Admin.create({ 
            ...req.body, 
            senha,
            token,
            ativo: true, 
            dataAprovacao: new Date() 
        });
        await LogSistema.create({ tipo: 'acao', usuario: 'master', tipoUsuario: 'master', acao: 'Criou admin', detalhes: { adminId: admin._id, email: admin.email } });
        res.json({ sucesso: true, admin, credenciais: { email: admin.email, senha, token } });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/admins/:id/aprovar', async (req, res) => {
    try {
        const token = gerarToken();
        const senha = gerarSenha();
        const admin = await Admin.findByIdAndUpdate(req.params.id, { 
            ativo: true, 
            dataAprovacao: new Date(),
            aprovadoPor: req.body.masterId,
            token,
            senha
        }, { new: true });
        await LogSistema.create({ tipo: 'acao', usuario: 'master', tipoUsuario: 'master', acao: 'Aprovou admin', detalhes: { adminId: admin._id } });
        res.json({ sucesso: true, admin, credenciais: { email: admin.email, senha, token } });
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

router.put('/admins/:id/resetar-senha', async (req, res) => {
    try {
        const novaSenha = gerarSenha();
        const admin = await Admin.findByIdAndUpdate(req.params.id, { senha: novaSenha }, { new: true });
        res.json({ sucesso: true, novaSenha });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== PLANOS ==========
router.get('/planos', async (req, res) => {
    try {
        const planos = await PlanoAdmin.find().sort({ preco: 1 });
        res.json(planos);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/planos', async (req, res) => {
    try {
        const plano = await PlanoAdmin.create(req.body);
        res.json({ sucesso: true, plano });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/planos/:id', async (req, res) => {
    try {
        const plano = await PlanoAdmin.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ sucesso: true, plano });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/planos/:id', async (req, res) => {
    try {
        await PlanoAdmin.findByIdAndDelete(req.params.id);
        res.json({ sucesso: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== MENSALIDADES ADMIN ==========
router.get('/mensalidades', async (req, res) => {
    try {
        const mensalidades = await MensalidadeAdmin.find().populate('adminId', 'nome email empresa').sort({ dataVencimento: -1 });
        res.json(mensalidades);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/mensalidades', async (req, res) => {
    try {
        const mensalidade = await MensalidadeAdmin.create(req.body);
        res.json({ sucesso: true, mensalidade });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/mensalidades/:id/confirmar', async (req, res) => {
    try {
        const mensalidade = await MensalidadeAdmin.findByIdAndUpdate(req.params.id, { 
            status: 'pago', 
            dataPagamento: new Date(),
            formaPagamento: req.body.formaPagamento 
        }, { new: true });
        
        // Gerar próxima mensalidade
        const proximoVencimento = new Date(mensalidade.dataVencimento);
        proximoVencimento.setMonth(proximoVencimento.getMonth() + 1);
        await MensalidadeAdmin.create({
            adminId: mensalidade.adminId,
            planoId: mensalidade.planoId,
            valor: mensalidade.valor,
            dataVencimento: proximoVencimento
        });
        
        res.json({ sucesso: true, mensalidade });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== CONFIGURAÇÕES MASTER ==========
router.get('/config', async (req, res) => {
    try {
        let config = await ConfigMaster.findOne();
        if (!config) config = await ConfigMaster.create({});
        res.json(config);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/config', async (req, res) => {
    try {
        const config = await ConfigMaster.findOneAndUpdate({}, req.body, { new: true, upsert: true });
        res.json({ sucesso: true, config });
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
        const ticket = await TicketSuporte.findByIdAndUpdate(req.params.id, { 
            status: 'resolvido', 
            resolucao: req.body.resolucao, 
            dataResolucao: new Date() 
        }, { new: true });
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

// ========== CADASTRO ADMIN (BOAS VINDAS) ==========
router.post('/cadastro-admin', async (req, res) => {
    try {
        const { nome, email, telefone, empresa, planoId, senha: senhaEscolhida } = req.body;
        
        // Verificar se email já existe
        const existe = await Admin.findOne({ email });
        if (existe) return res.status(400).json({ erro: 'Email já cadastrado' });
        
        // Buscar plano
        const plano = planoId ? await PlanoAdmin.findById(planoId) : null;
        
        // Criar admin pendente
        const admin = await Admin.create({
            nome, email, telefone, empresa,
            senha: senhaEscolhida || gerarSenha(),
            token: gerarToken(),
            ativo: true,
            planoId
        });
        
        // Criar primeira mensalidade se tiver plano
        if (plano) {
            const vencimento = new Date();
            vencimento.setDate(vencimento.getDate() + 7); // 7 dias para primeiro pagamento
            await MensalidadeAdmin.create({
                adminId: admin._id,
                planoId: plano._id,
                valor: plano.preco,
                dataVencimento: vencimento
            });
        }
        
        await LogSistema.create({ tipo: 'acao', usuario: email, tipoUsuario: 'admin', acao: 'Cadastro novo admin', detalhes: { adminId: admin._id } });
        
        res.json({ 
            sucesso: true, 
            mensagem: 'Cadastro realizado! Aguarde aprovação do administrador master.',
            admin: { id: admin._id, nome, email }
        });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ========== SETUP INICIAL ==========
router.post('/setup', async (req, res) => {
    try {
        // Criar master padrão
        let master = await AdminMaster.findOne({ email: 'master@ubmax.com' });
        if (!master) {
            master = await AdminMaster.create({ 
                nome: 'Admin Master', 
                email: 'master@ubmax.com', 
                senha: 'master123', 
                telefone: '11999999999' 
            });
        }
        
        // Criar planos padrão
        const planosExistem = await PlanoAdmin.countDocuments();
        if (planosExistem === 0) {
            await PlanoAdmin.create([
                { nome: 'Starter', descricao: 'Ideal para começar', preco: 99.90, limiteMotoristas: 5, limiteCorridas: 500, recursos: ['Painel básico', 'Suporte email'] },
                { nome: 'Profissional', descricao: 'Para frotas médias', preco: 199.90, limiteMotoristas: 20, limiteCorridas: 2000, recursos: ['Painel completo', 'Relatórios', 'Suporte prioritário'] },
                { nome: 'Enterprise', descricao: 'Para grandes operações', preco: 399.90, limiteMotoristas: 100, limiteCorridas: 10000, recursos: ['Tudo ilimitado', 'API acesso', 'Suporte 24h', 'Customização'] }
            ]);
        }
        
        // Criar config padrão
        let config = await ConfigMaster.findOne();
        if (!config) {
            config = await ConfigMaster.create({
                comissaoPlataforma: 10,
                diasTolerancia: 5,
                mensagemBoasVindas: 'Bem-vindo ao UBMAX! Sua plataforma de gestão de corridas.'
            });
        }
        
        res.json({ sucesso: true, mensagem: 'Setup completo!', master: { email: 'master@ubmax.com', senha: 'master123' } });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
