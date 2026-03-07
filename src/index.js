const express = require('express');

// ==================== CRASH PROTECTION ====================
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Rejection:', reason);
});
const cors = require('cors');
const path = require('path');
require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, setHeaders: (res, path) => { if (path.endsWith('.js')) { res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); } } }));
app.get('/admin-master', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-master.html')));

// ========== REBECA LANDING PAGE ==========

// ========== REBECA DELIVERY LANDING (ISOLADO) ==========
app.get('/rebeca-delivery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rebeca-delivery-landing.html')));

app.post('/api/rebeca-delivery-cadastro', async (req, res) => {
    try {
        const { Admin } = require('./models');
        const { nome, email, telefone, empresa, senha } = req.body;
        if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios' });
        const existe = await Admin.findOne({ email });
        if (existe) return res.status(400).json({ erro: 'Email já cadastrado. Faça login.' });
        const dataFim = new Date(); dataFim.setDate(dataFim.getDate() + 3);
        const crypto = require('crypto');
        const admin = await Admin.create({
            nome, email, telefone, empresa: empresa || nome,
            senha, token: crypto.randomBytes(16).toString('hex'),
            ativo: true, testeGratis: true, dataInicioTeste: new Date(), dataFimTeste: dataFim,
            origem: 'landing_page', tipoAdmin: 'delivery', nomeAssistente: 'Rebeca Delivery'
        });
        res.json({ sucesso: true, admin: { id: admin._id, nome: admin.nome, email: admin.email, token: admin.token, testeGratis: true, dataFimTeste: dataFim } });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.get('/rebeca', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rebeca-landing.html')));

app.post('/api/rebeca-cadastro', async (req, res) => {
    try {
        const { Admin } = require('./models');
        const { nome, email, telefone, empresa, senha } = req.body;
        
        if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios' });
        
        const existe = await Admin.findOne({ email });
        if (existe) return res.status(400).json({ erro: 'Email já cadastrado. Faça login.' });
        
        const dataFim = new Date();
        dataFim.setDate(dataFim.getDate() + 3); // 3 dias de teste
        
        const crypto = require('crypto');
        const admin = await Admin.create({
            nome, email, telefone, empresa: empresa || nome,
            senha,
            token: crypto.randomBytes(16).toString('hex'),
            ativo: true,
            testeGratis: true,
            dataInicioTeste: new Date(),
            dataFimTeste: dataFim,
            origem: 'landing_page',
            nomeAssistente: 'Rebeca'
        });
        
        res.json({ sucesso: true, admin: { id: admin._id, nome: admin.nome, email: admin.email, token: admin.token, testeGratis: true, dataFimTeste: dataFim } });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/rebeca-login', async (req, res) => {
    try {
        const { Admin } = require('./models');
        const { email, senha } = req.body;
        
        const admin = await Admin.findOne({ email, senha });
        if (!admin) return res.status(401).json({ erro: 'Email ou senha incorretos' });
        
        if (admin.bloqueado) return res.status(403).json({ erro: 'Sua conta foi bloqueada. Entre em contato pelo WhatsApp (34) 98403-9955' });
        
        // Verificar teste expirado
        if (admin.testeGratis && admin.dataFimTeste && new Date(admin.dataFimTeste) < new Date()) {
            return res.status(403).json({ erro: 'Seu teste grátis expirou! Entre em contato pelo WhatsApp (34) 98403-9955 para continuar usando.' });
        }
        
        admin.ultimoAcesso = new Date();
        await admin.save();
        
        res.json({ sucesso: true, admin: { id: admin._id, nome: admin.nome, email: admin.email, token: admin.token, empresa: admin.empresa, testeGratis: admin.testeGratis, dataFimTeste: admin.dataFimTeste } });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.get('/cadastro-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro-admin.html')));
app.get('/parceiro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro-admin.html')));

const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const motoristaRoutes = require('./routes/motorista.routes');
const motoristaAppRoutes = require('./routes/motorista-app.routes');
const corridaRoutes = require('./routes/corrida.routes');
const adminMasterRoutes = require('./routes/admin-master.routes');
const clienteRoutes = require('./routes/cliente.routes');
const gpsRoutes = require('./routes/gps.routes');
const gpsIntegradoRoutes = require('./routes/gps-integrado.routes');
const statusRoutes = require('./routes/status.routes');
const localidadeRoutes = require('./routes/localidade.routes');
const pontosReferenciaRoutes = require('./routes/pontos-referencia.routes');
const precoDinamicoRoutes = require('./routes/preco-dinamico.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const rebecaRoutes = require('./routes/rebeca.routes');
const configRoutes = require('./routes/config.routes');
const reclamacoesRoutes = require('./routes/reclamacoes.routes');
const logsRoutes = require('./routes/logs.routes');
const estatisticasRoutes = require('./routes/estatisticas.routes');
const antifraudeRoutes = require('./routes/antifraude.routes');
const mapsRoutes = require('./routes/maps.routes');
const despachoRoutes = require('./routes/despacho.routes');
const iaRoutes = require('./routes/ia.routes');
const mensalidadeRoutes = require('./routes/mensalidade.routes');
const evolutionMultiRoutes = require('./routes/evolution-multi.routes');
const precoAdminRoutes = require('./routes/preco-admin.routes');
const adminRoutes = require('./routes/admin.routes');

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/motoristas', motoristaRoutes);
app.use('/api/motorista-app', motoristaAppRoutes);
app.use('/api/corridas', corridaRoutes);
app.use('/api/admin-master', adminMasterRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/gps-integrado', gpsIntegradoRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/localidades', localidadeRoutes);
app.use('/api/pontos-referencia', pontosReferenciaRoutes);
app.use('/api/preco-dinamico', precoDinamicoRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/rebeca', rebecaRoutes);
app.use('/api/config', configRoutes);
app.use('/api/reclamacoes', reclamacoesRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/estatisticas', estatisticasRoutes);
app.use('/api/antifraude', antifraudeRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/api/despacho', despachoRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/mensalidades', mensalidadeRoutes);
app.use('/api/evolution', evolutionMultiRoutes);
app.use('/api/precos', precoAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pontos', require('./routes/pontos.routes'));
app.use('/api/zona-preco', require('./routes/zona-preco.routes'));
app.use('/api/precos-intermunicipais', require('./routes/preco-intermunicipal.routes'));
app.use('/api/comunicacao', require('./routes/comunicacao.routes'));
app.use('/api/emergencia', require('./routes/emergencia.routes'));

// Páginas

// ========== DELIVERY (100% ISOLADO) ==========
const deliveryRoutes = require('./routes/delivery.routes');
app.use('/api/delivery', deliveryRoutes);
app.use('/api/delivery', require('./routes/delivery-precadastro.routes'));
app.get('/delivery-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-admin.html')));
app.get('/delivery-entregador', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-entregador.html')));
app.get('/delivery-cozinha', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-cozinha.html')));
app.get('/delivery-rastrear/:codigo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-rastrear.html')));

app.get('/rastrear/:codigo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rastrear.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/motorista', (req, res) => res.sendFile(path.join(__dirname, 'public', 'motorista-app.html')));
app.get('/conectar-whatsapp', (req, res) => res.sendFile(path.join(__dirname, 'public', 'conectar-whatsapp.html')));

app.get('/health', (req, res) => {
    const mongoose = require('mongoose');
    const IAService = require('./services/ia.service');
    res.json({ 
        status: 'ok', 
        versao: '3.4.0',
        banco: mongoose.connection.readyState === 1 ? 'MongoDB CONECTADO' : 'Desconectado',
        ia: IAService.isAtivo() ? 'ATIVA (Claude)' : 'Desativada',
        funcionalidades: ['MongoDB', 'IA Claude', 'GPS Real', 'App Motorista', 'Mensalidades', 'Rastreamento']
    });
});

// Keep-alive — evita que o Render durma e mate os crons
const _urlSelf = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || null;
if (_urlSelf) {
    setInterval(() => {
        require('https').get(_urlSelf + '/health', (r) => {
            console.log('[KEEP-ALIVE] ping OK:', r.statusCode);
        }).on('error', (e) => console.log('[KEEP-ALIVE] erro:', e.message));
    }, 10 * 60 * 1000); // a cada 10 min
    console.log('✅ Keep-alive ativo para:', _urlSelf);
} else {
    console.log('⚠️  RENDER_EXTERNAL_URL não definida — keep-alive desativado');
}

// Verificar mensalidades a cada hora
const MensalidadeService = require('./services/mensalidade.service');
setInterval(async () => {
    try {
        const notificacoes = await MensalidadeService.verificarVencimentos();
        if (notificacoes.length > 0) {
            console.log('📢 Notificações de mensalidade:', notificacoes.length);
            // Aqui integrar com Rebeca para enviar WhatsApp
        }
    } catch (e) {
        console.error('Erro ao verificar mensalidades:', e.message);
    }
}, 60 * 60 * 1000); // 1 hora

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

app.listen(PORT, () => {
    console.log('🚀 UBMAX v3.4.0 - Sistema Completo');
    console.log('📡 Porta:', PORT);
    console.log('🚗 App Motorista: /motorista');
    console.log('💰 Mensalidades: Ativo');
});

// ===== CRON: Reativação de clientes sumidos (roda 1x por dia às 10h) =====
setInterval(async () => {
    const agora = new Date();
    if (agora.getHours() !== 10 || agora.getMinutes() > 5) return; // Só roda às 10h
    
    try {
        const { Cliente, Corrida, Admin, InstanciaWhatsapp } = require('./models');
        const EvolutionMultiService = require('./services/evolution-multi.service');
        
        // Buscar admins ativos
        const admins = await Admin.find({ ativo: true, tipoAdmin: 'transporte' }).lean();
        
        for (const admin of admins) {
            const instancia = await InstanciaWhatsapp.findOne({ adminId: admin._id, status: 'conectado' });
            if (!instancia) continue;
            
            // Buscar clientes que não pedem há 7-14 dias
            const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const quatorzeDiasAtras = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            
            const clientesInativos = await Cliente.find({ adminId: admin._id }).lean();
            
            let reativados = 0;
            for (const cliente of clientesInativos) {
                if (!cliente.telefone || reativados >= 5) break; // Max 5 por admin por dia
                
                // Verificar última corrida
                const tels = [cliente.telefone, '55' + cliente.telefone, cliente.telefone.replace(/^55/, '')];
                const ultimaCorrida = await Corrida.findOne({ clienteTelefone: { $in: tels }, adminId: admin._id }).sort({ createdAt: -1 }).lean();
                
                if (!ultimaCorrida) continue;
                const diasSemPedir = (Date.now() - new Date(ultimaCorrida.createdAt).getTime()) / (24*60*60*1000);
                
                // Só reativar quem sumiu entre 7-14 dias (não incomodar demais)
                if (diasSemPedir >= 7 && diasSemPedir <= 14) {
                    // Verificar se já mandou reativação recente (evitar spam)
                    if (!global._reativacoes) global._reativacoes = new Map();
                    const chave = cliente.telefone + '_' + admin._id;
                    const ultimaReativacao = global._reativacoes.get(chave);
                    if (ultimaReativacao && (Date.now() - ultimaReativacao) < 7 * 24 * 60 * 60 * 1000) continue;
                    
                    const frases = [
                        'Oi ' + (cliente.nome || '') + '! Faz tempo que não te vejo por aqui 😊 Precisando de carro é só chamar!',
                        'Ei ' + (cliente.nome || '') + '! Sentimos sua falta! Quando precisar de corrida é só mandar mensagem 🚗',
                        'Olá ' + (cliente.nome || '') + '! Tudo bem? Estamos aqui sempre que precisar de um carro 😊'
                    ];
                    const msg = frases[Math.floor(Math.random() * frases.length)];
                    
                    await EvolutionMultiService.enviarMensagem(instancia._id, cliente.telefone, msg);
                    global._reativacoes.set(chave, Date.now());
                    reativados++;
                    console.log('[REATIVAR] Msg enviada para', cliente.nome || cliente.telefone, '(' + Math.floor(diasSemPedir) + ' dias inativo)');
                }
            }
            if (reativados > 0) console.log('[REATIVAR] Admin', admin.nome, ':', reativados, 'clientes reativados');
        }
    } catch(e) {
        console.log('[REATIVAR] Erro:', e.message);
    }
}, 60 * 60 * 1000); // Verifica a cada 1h (mas só executa às 10h)
console.log('✅ Cron reativação de clientes ativo')
const AgendamentoService = require('./services/agendamento.service');
AgendamentoService.iniciarCron();;

