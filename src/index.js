require('dotenv').config();
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
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest.json')));
app.get('/manifest-admin.json', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest-admin.json')));
app.get('/admin-master', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-master.html')));

// ========== REBECA LANDING PAGE ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rebeca-landing.html')));

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

app.get('/cadastro-admin', (req, res) => res.redirect('/'));
app.get('/parceiro', (req, res) => res.redirect('/'));

const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const motoristaRoutes = require('./routes/motorista.routes');
const motoristaAppRoutes = require('./routes/motorista-app.routes');
const corridaRoutes = require('./routes/corrida.routes');
const adminMasterRoutes = require('./routes/admin-master.routes');
const cerebroRoutes = require('./routes/cerebro.routes');
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
const comunicacaoRoutes = require('./routes/comunicacao.routes');

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
// Middleware de autenticação para rotas admin
const _authAdmin = (req, res, next) => {
    // Rotas públicas do WhatsApp/Rebeca passam sem token
    const pub = ['/api/corridas/webhook', '/api/corridas/publica'];
    if (pub.some(p => req.path.startsWith(p))) return next();
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
    if (!token || !token.startsWith('ADMIN_')) {
        return res.status(401).json({ erro: 'Acesso não autorizado' });
    }
    req.adminId = token.split('_')[1];
    next();
};

app.use('/api/motoristas', _authAdmin, motoristaRoutes);
app.use('/api/motorista-app', motoristaAppRoutes);
app.use('/api/comunicacao', comunicacaoRoutes);
app.use('/api/corridas', _authAdmin, corridaRoutes);
app.use('/api/admin-master', adminMasterRoutes);
app.use('/api/cerebro', cerebroRoutes);
app.use('/api/clientes', _authAdmin, clienteRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/gps-integrado', gpsIntegradoRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/localidades', localidadeRoutes);
app.use('/api/pontos-referencia', pontosReferenciaRoutes);
app.use('/api/preco-dinamico', precoDinamicoRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/rebeca', rebecaRoutes);

// Rota IA config (stub)
app.get('/api/ia/config', (req, res) => {
    res.json({ ativo: false, modelo: 'rebeca-v1', mensagem: 'IA nao configurada' });
});

// Rota config areas
app.get('/api/config/areas', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) return res.json([]);
        // Retorna array vazio por padrao - areas configuradas via painel
        res.json([]);
    } catch(e) { res.status(500).json({ error: e.message }); }
});


// ROTA TEMPORARIA - deletar todas corridas do admin


// PRE-CADASTRO MOTORISTA PARCEIRO
app.post('/api/parceiro-motorista', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const { nome, telefone, cidade, carro, ano, appAtual } = req.body;
        if (!nome || !telefone || !cidade || !carro || !ano) {
            return res.status(400).json({ error: 'Campos obrigatorios faltando' });
        }
        // Salvar na collection parceiros_motoristas
        const col = mongoose.connection.collection('parceiros_motoristas');
        await col.insertOne({
            nome, telefone, cidade, carro, ano: parseInt(ano), appAtual: appAtual || '',
            status: 'pendente', criadoEm: new Date()
        });
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// VCF - salvar contato da Rebeca
app.get('/contato-rebeca.vcf', (req, res) => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Rebeca Corridas
TEL;TYPE=CELL:+5534984039955
URL:https://rebeca-sistema-br.onrender.com
NOTE:Peça seu transporte pelo WhatsApp!
END:VCARD`;
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', 'attachment; filename="Rebeca-Corridas.vcf"');
    res.send(vcf);
});


// Listar parceiros motoristas (admin master)
app.get('/api/parceiro-motorista', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const col = mongoose.connection.collection('parceiros_motoristas');
        const parceiros = await col.find({}).sort({ criadoEm: -1 }).toArray();
        res.json(parceiros);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Atualizar status parceiro
app.put('/api/parceiro-motorista/:id', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const col = mongoose.connection.collection('parceiros_motoristas');
        await col.updateOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) },
            { $set: { status: req.body.status, observacao: req.body.observacao || '' } }
        );
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

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
app.use('/api/emergencia', require('./routes/emergencia.routes'));

// Páginas

// ========== DELIVERY (100% ISOLADO) ==========
const deliveryRoutes = require('./routes/delivery.routes');
const deliveryAuthRoutes = require('./routes/delivery-auth.routes');
const deliveryMasterRoutes = require('./routes/delivery-master.routes');
app.use('/api/delivery', deliveryRoutes);
app.use('/api/delivery-auth', deliveryAuthRoutes);
app.use('/api/delivery-master', deliveryMasterRoutes);
app.use('/api/delivery', require('./routes/delivery-precadastro.routes'));
app.use('/api/delivery', require('./routes/delivery-assinantes.routes'));
app.get('/delivery-migracao', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-migracao.html')));
app.get('/delivery-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-admin.html')));
app.get('/delivery-entregador', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-entregador.html')));
app.get('/delivery-cozinha', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-cozinha.html')));
app.get('/delivery-garcom', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-garcom.html')));
app.get('/garcom', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-garcom.html')));
app.get('/delivery-caixa', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-caixa.html')));
app.get('/delivery-rastrear/:codigo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-rastrear.html')));
app.get('/delivery-cardapio/:adminId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-cardapio.html')));

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
        versao: '3.5.0',
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
    console.log('🚀 REBECA CORRIDAS v3.4.1 - Sistema Completo');
    console.log('📡 Porta:', PORT);
    console.log('🚗 App Motorista: /motorista');
    console.log('💰 Mensalidades: Ativo');
});

// ===== CRON: Reativação de clientes sumidos (roda 1x por dia às 10h) =====
setInterval(async () => {
    const agora = new Date();
    const _agoraBR = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    if (_agoraBR.getHours() !== 10 || _agoraBR.getMinutes() > 5) return; // Só roda às 10h Brasilia
    
    try {
        const { Cliente, Corrida, Admin, InstanciaWhatsapp } = require('./models');
        const EvolutionMultiService = require('./services/evolution-multi.service');
        
        // Buscar admins ativos
        const admins = await Admin.find({ ativo: true, tipoAdmin: 'transporte' }).lean();
        
        for (const admin of admins) {
            const instancia = await InstanciaWhatsapp.findOne({ adminId: admin._id, status: { $in: ['conectado','open','connected'] } });
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

// Cron delivery trial — bloqueia trials vencidos todo dia às 06h
const DeliveryTrialService = require('./services/delivery-trial.service');
const cron = require('node-cron');
cron.schedule('0 6 * * *', () => DeliveryTrialService.verificarTrialsVencidos());
// Cron delivery cardápio — 7h pergunta ao adm, 8h envia para assinantes
const CardapioDiaService = require('./services/cardapio-dia.service');
cron.schedule('0 7 * * *', () => CardapioDiaService.perguntarCardapioAdms());
console.log('✅ Cron cardápio do dia ativo (7h)');

DeliveryTrialService.verificarTrialsVencidos();
console.log('✅ Cron delivery trial ativo');


// redeploy Mon Apr 27 18:18:58 UTC 2026
