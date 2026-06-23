'use strict';
require('dotenv').config();

// ─────────────────────────────────────────────
// 1. CRASH PROTECTION
// ─────────────────────────────────────────────
process.on('uncaughtException',  (err) => { console.error('[FATAL] Uncaught Exception:', err.message, err.stack); });
process.on('unhandledRejection', (reason) => { console.error('[FATAL] Unhandled Rejection:', reason); });

// ─────────────────────────────────────────────
// 2. LIBS EXTERNAS
// ─────────────────────────────────────────────
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');
const mongoose = require('mongoose');
const cron     = require('node-cron');
const RODAR_CRONS = process.env.WORKER_ROLE !== 'web'; // false só quando WORKER_ROLE=web (isola crons do processo web)
console.log('[BOOT] WORKER_ROLE:', process.env.WORKER_ROLE || '(nao definido - padrao atual: web+crons juntos)', '| RODAR_CRONS:', RODAR_CRONS);

// ─────────────────────────────────────────────
// 3. CONFIG / DATABASE
// ─────────────────────────────────────────────
require('./config/database');
const guards = require('./middlewares/guards');

// ─────────────────────────────────────────────
// 4. APP + MIDDLEWARES
// ─────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// ─────────────────────────────────────────────
// 5. AUTH MIDDLEWARE
// ─────────────────────────────────────────────
const _authAdmin = (req, res, next) => {
    const pub = ['/api/corridas/webhook', '/api/corridas/publica'];
    if (pub.some(p => req.path.startsWith(p))) return next();
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
    if (!token || !token.startsWith('ADMIN_')) {
        return res.status(401).json({ erro: 'Acesso não autorizado' });
    }
    req.adminId = token.split('_')[1];
    next();
};

// ─────────────────────────────────────────────
// 6. ROUTES — importar todas no topo
// ─────────────────────────────────────────────

// — Core / Auth
const authRoutes          = require('./routes/auth.routes');
const usuariosRoutes      = require('./routes/usuarios.routes');
const adminMasterRoutes   = require('./routes/admin-master.routes');
const adminRoutes         = require('./routes/admin.routes');
const tenantRoutes        = require('./routes/tenant.routes');
const configRoutes        = require('./routes/config.routes');
const statusRoutes        = require('./routes/status.routes');
const logsRoutes          = require('./routes/logs.routes');
const mensalidadeRoutes   = require('./routes/mensalidade.routes');

// — Rebeca Corrida
const motoristaRoutes        = require('./routes/motorista.routes');
const motoristaAppRoutes     = require('./routes/motorista-app.routes');
const corridaRoutes          = require('./routes/corrida.routes');
const clienteRoutes          = require('./routes/cliente.routes');
const gpsRoutes              = require('./routes/gps.routes');
const gpsIntegradoRoutes     = require('./routes/gps-integrado.routes');
const localidadeRoutes       = require('./routes/localidade.routes');
const pontosReferenciaRoutes = require('./routes/pontos-referencia.routes');
const precoDinamicoRoutes    = require('./routes/preco-dinamico.routes');
const precoAdminRoutes       = require('./routes/preco-admin.routes');
const despachoRoutes         = require('./routes/despacho.routes');
const antifraudeRoutes       = require('./routes/antifraude.routes');
const estatisticasRoutes     = require('./routes/estatisticas.routes');
const reclamacoesRoutes      = require('./routes/reclamacoes.routes');
const mapsRoutes             = require('./routes/maps.routes');
const cerebroRoutes          = require('./routes/cerebro.routes');
const comunicacaoRoutes      = require('./routes/comunicacao.routes');
const evolutionMultiRoutes   = require('./routes/evolution-multi.routes');

// — Rebeca Delivery
const deliveryRoutes          = require('./routes/delivery.routes');
const deliveryAuthRoutes      = require('./routes/delivery-auth.routes');
const deliveryMasterRoutes    = require('./routes/delivery-master.routes');
const caixaRoutes             = require('./routes/caixa.routes');
const comandaRoutes           = require('./routes/comanda.routes');

// — Rebeca Agenda
const agendaRoutes            = require('./routes/agenda.routes');
const agendaFinanceiroRoutes  = require('./routes/agenda-financeiro.routes');
const agendaCatalogoRoutes   = require('./routes/agenda-catalogo.routes');

// — Infra / IA / Outros
const iaRoutes         = require('./routes/ia.routes');
const whatsappRoutes   = require('./routes/whatsapp.routes');
const rebecaRoutes     = require('./routes/rebeca.routes');

// ─────────────────────────────────────────────
// 7. PÁGINAS ESTÁTICAS — Landing pages
// ─────────────────────────────────────────────
app.get('/manifest.json',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest.json')));
app.get('/manifest-admin.json', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest-admin.json')));

app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'rebeca-landing.html')));
app.get('/rebeca',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'rebeca-landing.html')));
app.get('/rebeca-delivery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rebeca-delivery-landing.html')));

// Redirects legados
app.get('/cadastro-admin', (req, res) => res.redirect('/'));
app.get('/parceiro',       (req, res) => res.redirect('/'));

// ─────────────────────────────────────────────
// 8. APIs INLINE (auth/cadastro/login)
// ─────────────────────────────────────────────
app.post('/api/rebeca-delivery-cadastro', async (req, res) => {
    try {
        const { Admin } = require('./models');
        const { nome, email, telefone, empresa, senha } = req.body;
        if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios' });
        const existe = await Admin.findOne({ email });
        if (existe) return res.status(400).json({ erro: 'Email já cadastrado. Faça login.' });
        const dataFim = new Date(); dataFim.setDate(dataFim.getDate() + 3);
        const admin = await Admin.create({
            nome, email, telefone, empresa: empresa || nome,
            senha, token: crypto.randomBytes(16).toString('hex'),
            ativo: true, testeGratis: true, dataInicioTeste: new Date(), dataFimTeste: dataFim,
            origem: 'landing_page', tipoAdmin: 'delivery', nomeAssistente: 'Rebeca Delivery'
        });
        res.json({ sucesso: true, admin: { id: admin._id, nome: admin.nome, email: admin.email, token: admin.token, testeGratis: true, dataFimTeste: dataFim } });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post('/api/rebeca-cadastro', async (req, res) => {
    try {
        const { Admin } = require('./models');
        const { nome, email, telefone, empresa, senha } = req.body;
        if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios' });
        const existe = await Admin.findOne({ email });
        if (existe) return res.status(400).json({ erro: 'Email já cadastrado. Faça login.' });
        const dataFim = new Date(); dataFim.setDate(dataFim.getDate() + 3);
        const admin = await Admin.create({
            nome, email, telefone, empresa: empresa || nome,
            senha, token: crypto.randomBytes(16).toString('hex'),
            ativo: true, testeGratis: true, dataInicioTeste: new Date(), dataFimTeste: dataFim,
            origem: 'landing_page', nomeAssistente: 'Rebeca'
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
        if (admin.testeGratis && admin.dataFimTeste && new Date(admin.dataFimTeste) < new Date()) {
            return res.status(403).json({ erro: 'Seu teste grátis expirou! Entre em contato pelo WhatsApp (34) 98403-9955 para continuar usando.' });
        }
        admin.ultimoAcesso = new Date();
        await admin.save();
        res.json({ sucesso: true, admin: { id: admin._id, nome: admin.nome, email: admin.email, token: admin.token, empresa: admin.empresa, testeGratis: admin.testeGratis, dataFimTeste: admin.dataFimTeste } });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Parceiro motorista
app.post('/api/parceiro-motorista', async (req, res) => {
    try {
        const { nome, telefone, cidade, carro, ano, appAtual } = req.body;
        if (!nome || !telefone || !cidade || !carro || !ano) return res.status(400).json({ error: 'Campos obrigatorios faltando' });
        const col = mongoose.connection.collection('parceiros_motoristas');
        await col.insertOne({ nome, telefone, cidade, carro, ano: parseInt(ano), appAtual: appAtual || '', status: 'pendente', criadoEm: new Date() });
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/parceiro-motorista', async (req, res) => {
    try {
        const col = mongoose.connection.collection('parceiros_motoristas');
        res.json(await col.find({}).sort({ criadoEm: -1 }).toArray());
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/parceiro-motorista/:id', async (req, res) => {
    try {
        const col = mongoose.connection.collection('parceiros_motoristas');
        await col.updateOne({ _id: new mongoose.Types.ObjectId(req.params.id) }, { $set: { status: req.body.status, observacao: req.body.observacao || '' } });
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ia/config', (req, res) => res.json({ ativo: false, modelo: 'rebeca-v1', mensagem: 'IA nao configurada' }));

app.get('/api/config/areas', async (req, res) => {
    try {
        const adminId = req.query.adminId || req.headers['x-admin-id'];
        if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) return res.json([]);
        res.json([]);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// VCF contato
app.get('/contato-rebeca.vcf', (req, res) => {
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', 'attachment; filename="Rebeca-Corridas.vcf"');
    res.send(`BEGIN:VCARD\nVERSION:3.0\nFN:Rebeca Corridas\nTEL;TYPE=CELL:+5534984039955\nURL:https://rebeca-sistema-br.onrender.com\nNOTE:Peça seu transporte pelo WhatsApp!\nEND:VCARD`);
});

// ─────────────────────────────────────────────
// 9. API ROUTES — Core
// ─────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/usuarios',     usuariosRoutes);
app.use('/api/admin-master', adminMasterRoutes);          // auth interna — senha env
app.use('/api/admin',        adminRoutes);
app.use('/api/tenant',       tenantRoutes);
app.use('/api/config',       configRoutes);
app.use('/api/status',       statusRoutes);
app.use('/api/logs',         logsRoutes);
app.use('/api/mensalidades', mensalidadeRoutes);

// ─────────────────────────────────────────────
// 10. API ROUTES — Rebeca Corrida
// ─────────────────────────────────────────────
app.use('/api/motoristas',       guards.dashboardTenantAuth, motoristaRoutes);      // semi-público: valida adminId
app.use('/api/motorista-app',    motoristaAppRoutes);          // público — motorista se autentica internamente
app.use('/api/corridas',         guards.dashboardTenantAuth, corridaRoutes);        // semi-público: valida adminId
app.use('/api/clientes',         guards.corrida, clienteRoutes);
app.use('/api/comunicacao',      comunicacaoRoutes);           // webhook público
app.use('/api/gps',              gpsRoutes);                   // GPS público (motorista posta posição)
app.use('/api/gps-integrado',    gpsIntegradoRoutes);
app.use('/api/localidades',      localidadeRoutes);            // leitura pública de cidades
app.use('/api/pontos-referencia', guards.dashboardTenantAuth, pontosReferenciaRoutes); // semi-público: valida adminId
app.use('/api/pontos',           require('./routes/pontos.routes'));                 // semi-público: auth interna por adminId
app.use('/api/preco-dinamico',   guards.corrida, precoDinamicoRoutes);
app.use('/api/precos',           guards.corrida, precoAdminRoutes);
app.use('/api/zona-preco',       guards.corrida, require('./routes/zona-preco.routes'));
app.use('/api/precos-intermunicipais', guards.corrida, require('./routes/preco-intermunicipal.routes'));
app.use('/api/despacho',         guards.dashboardTenantAuth, despachoRoutes);       // semi-público: valida adminId
app.use('/api/antifraude',       guards.dashboardTenantAuth, antifraudeRoutes);     // semi-público: valida adminId
app.use('/api/estatisticas', estatisticasRoutes); // publico-adminId
app.use('/api/reclamacoes',      guards.corrida, reclamacoesRoutes);
app.use('/api/maps',             mapsRoutes);                  // Google Maps público
app.use('/api/cerebro',          guards.corrida, cerebroRoutes);
app.use('/api/evolution',        evolutionMultiRoutes);        // webhook Evolution público
app.use('/api/emergencia',       guards.corrida, require('./routes/emergencia.routes'));

// ─────────────────────────────────────────────
// 11. API ROUTES — Rebeca Delivery
// ─────────────────────────────────────────────
app.use('/api/delivery',         deliveryRoutes);              // auth interna por rota
app.use('/api/delivery-auth',    deliveryAuthRoutes);          // login/cadastro — público
app.use('/api/delivery-master',  guards.master, deliveryMasterRoutes);
app.use('/api/delivery',         require('./routes/delivery-precadastro.routes')); // pré-cadastro público
app.use('/api/delivery',         require('./routes/delivery-assinantes.routes'));  // assinantes público
app.use('/api/caixa',            guards.delivery, caixaRoutes);
app.use('/api/comanda',          guards.delivery, comandaRoutes);

// ─────────────────────────────────────────────
// 12. API ROUTES — Rebeca Agenda
// ─────────────────────────────────────────────
app.use('/api/agenda',              agendaRoutes);             // auth interna por rota
app.use('/api/agenda',              agendaFinanceiroRoutes);   // auth interna por rota
app.use('/api/agenda-upload',       guards.agenda, require('./routes/agenda-upload.routes'));
app.use('/api/agenda-push',         require('./routes/agenda-push.routes').router); // push público
app.use('/api/agenda-ia-servico',   guards.agenda, require('./routes/agenda-ia-servico.routes'));
app.use('/api/agenda/whatsapp',     require('./routes/agenda-whatsapp.routes'));    // webhook público
app.use('/api/agenda/lembretes',    require('./routes/agenda-lembretes.routes'));   // cron interno
app.use('/api/agenda',              require('./routes/agenda-pagamento.routes'));  // pagamento pix

// ── Cron: verificar vencimentos diariamente às 9h
setInterval(async () => {
  const agora = new Date();
  if (new Date(agora.getTime() - 3*60*60*1000).getUTCHours() === 9 && agora.getMinutes() < 5) {
    try {
      const res = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/agenda/verificar-vencimentos');
      const d = await res.json();
      console.log('[cron-vencimento] avisados:', d.avisados);
    } catch(e) { console.warn('[cron-vencimento]', e.message); }
  }
}, 5 * 60 * 1000); // verifica a cada 5 min
app.use('/api/agenda/crm',          guards.agenda, require('./routes/agenda-crm.routes'));
app.use('/api/agenda/conexao',      guards.agenda, require('./routes/agenda-conexao.routes'));
app.use('/api/agenda',              agendaCatalogoRoutes);         // catálogo digital — exclusivo agenda

// ─────────────────────────────────────────────
// 13. API ROUTES — Rebeca Soft (PDV)
// ─────────────────────────────────────────────
app.use('/api/soft',     require('./soft/routes/_index.routes'));
app.use('/api/catalogo', require('./soft/routes/soft-catalogo-public.routes'));

// ─────────────────────────────────────────────
// 14. API ROUTES — Beca Estuda
// ─────────────────────────────────────────────
app.use('/api/beca-estuda/assinantes', require('./routes/beca-estuda.routes'));

// ─────────────────────────────────────────────
// 15. API ROUTES — IA / WhatsApp / Rebeca
// ─────────────────────────────────────────────
app.use('/api/ia',           iaRoutes);
app.use('/api/whatsapp',     whatsappRoutes);
app.use('/api/rebeca',       rebecaRoutes);
app.use('/api/rebeca-oficial', require('./routes/rebeca-oficial-whatsapp.routes'));
app.use('/api/meta-whatsapp', require('./routes/meta-whatsapp.routes'));
app.use('/api/landing', require('./routes/landing.routes'));
app.use('/api/landing-upload', require('./routes/landing-upload.routes'));
app.use('/api/meta-whatsapp',  require('./routes/meta-whatsapp.routes'));
app.use('/api/cozinha',        require('./routes/cozinha.routes'));
// PWA Cozinha
app.get('/cozinha-manifest.json', (req,res) => res.sendFile(require('path').join(__dirname,'public/cozinha-manifest.json')));
app.get('/cozinha-sw.js',         (req,res) => res.sendFile(require('path').join(__dirname,'public/cozinha-sw.js')));

// ─────────────────────────────────────────────
// 16. PÁGINAS — Rebeca Corrida
// ─────────────────────────────────────────────
app.get('/admin',             (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/login',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin-master',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-master.html')));
app.get('/motorista',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'motorista-app.html')));
app.get('/motorista-app',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'motorista-app.html')));
app.get('/mapa-motoristas',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'mapa-motoristas.html')));
app.get('/conectar-whatsapp', (req, res) => res.sendFile(path.join(__dirname, 'public', 'conectar-whatsapp.html')));
app.get('/rastrear/:codigo',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'rastrear.html')));
app.get('/contato-rebeca.vcf', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contato.html')));

// ─────────────────────────────────────────────
// 17. PÁGINAS — Rebeca Delivery
// ─────────────────────────────────────────────
app.get('/delivery-admin', (req, res) => {
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
    const forceDesktop = req.query.desktop === '1';
    res.setHeader('X-Device-Type', isMobile && !forceDesktop ? 'mobile' : 'desktop');
    res.sendFile(path.join(__dirname, 'public', 'delivery-admin.html'));
});
app.get('/delivery-entregador',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-entregador.html')));
app.get('/delivery-cozinha',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-cozinha.html')));
app.get('/delivery-garcom',          (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-garcom.html')));
app.get('/garcom',                   (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-garcom.html')));
app.get('/mesa',                     (req, res) => res.sendFile(path.join(__dirname, 'public', 'mesa.html')));
app.get('/delivery-caixa',           (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'delivery-caixa.html'));
});
app.get('/delivery-caixa-v2',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-caixa-v2.html')));
app.get('/delivery-rastrear/:codigo',(req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-rastrear.html')));
app.get('/delivery-cardapio/:adminId',(req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-cardapio.html')));
app.get('/delivery-migracao',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'delivery-migracao.html')));

// ─────────────────────────────────────────────
// 18. PÁGINAS — Rebeca Agenda
// ─────────────────────────────────────────────
app.get('/agenda',             (req, res) => res.sendFile(path.join(__dirname, 'public', 'agenda-landing.html')));
app.get('/agenda-adm',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'agenda-adm.html')));
app.get('/agenda-profissional',(req, res) => res.sendFile(path.join(__dirname, 'public', 'agenda-profissional.html')));
app.get('/agenda-cadastro',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'agenda-cadastro.html')));
app.get('/agenda-financeiro',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'agenda-financeiro.html')));
app.get('/espaco-digital',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'espaco-digital.html')));

// ─────────────────────────────────────────────
// 19. PÁGINAS — Beca Estuda
// ─────────────────────────────────────────────
app.get('/beca-estuda', (req, res) => { res.set('Cache-Control','no-store'); res.sendFile(path.join(__dirname, 'public', 'beca-estuda.html')); });
app.get('/beca-estuda-landing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'beca-estuda-landing.html')));
app.get('/beca-manifest.json',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'beca-manifest.json')));
app.get('/beca-sw.js', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, 'public', 'beca-sw.js'));
});

// ─────────────────────────────────────────────
// 20. PÁGINAS — Rebeca Soft (PDV React)
// ─────────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.get('/soft',   (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
app.get('/soft/*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
app.use('/soft',   require('express').static(frontendDist));
app.get('/login',  (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));

// ─────────────────────────────────────────────
// 21. PÁGINAS — Legais / Utilitários
// ─────────────────────────────────────────────
app.get('/politica-privacidade.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'politica-privacidade.html')));
app.get('/privacidade', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacidade.html')));
app.get('/termos',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'termos.html')));
app.get('/contato',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'contato.html')));

// ─────────────────────────────────────────────
// 22. HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
    const IAService = require('./services/ia.service');
    res.json({
        status: 'ok',
        versao: '3.5.0',
        banco: mongoose.connection.readyState === 1 ? 'MongoDB CONECTADO' : 'Desconectado',
        ia: IAService.isAtivo() ? 'ATIVA (Claude)' : 'Desativada',
        funcionalidades: ['MongoDB', 'IA Claude', 'GPS Real', 'App Motorista', 'Mensalidades', 'Rastreamento']
    });
});

// ─────────────────────────────────────────────
// Rota de disparo manual da saudade
app.post('/api/admin/disparar-saudade', async (req, res) => {
  try {
    await ModoDono.rodarSaudadeRebeca();
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// 23. 404 HANDLER
// ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// ─────────────────────────────────────────────
// 24. START SERVER
// ─────────────────────────────────────────────

// ── ROTA TEMPORÁRIA: upgrade plano para espaco_digital_ia ──
app.post('/api/admin-upgrade-plano', async (req, res) => {
  try {
    if (req.body.secret !== 'rebeca-upgrade-2026') {
      return res.status(403).json({ erro: 'Proibido' });
    }
    const { AdminAgenda } = require('./models/AgendaServico');
    const r = await AdminAgenda.updateMany(
      { plano: { $in: ['espaco_digital', null, ''] } },
      { $set: { plano: 'espaco_digital_ia' } }
    );
    const todos = await AdminAgenda.find({}, 'nome email plano').lean();
    res.json({ sucesso: true, atualizados: r.modifiedCount, admins: todos.map(a=>({email:a.email,plano:a.plano})) });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

function _depoisDoBoot() {
    // Iniciar job de lembretes APÓS servidor subir (ou apos worker iniciar)
    setTimeout(() => {
      try {
        const lembretesJob = require('./jobs/lembretes-clientes.job');
        if (RODAR_CRONS) lembretesJob.iniciar();
      } catch(e) {
        console.error('[LembretesJob] Erro ao iniciar:', e.message);
      }
    }, 5000); // aguarda 5s para DB conectar
    console.log('💰 Mensalidades: Ativo');
}

if (process.env.WORKER_ROLE === 'worker') {
    // Modo worker: nao abre porta HTTP, so roda os crons (RODAR_CRONS=true aqui)
    console.log('⚙️  REBECA WORKER v3.4.1 - somente jobs/crons em segundo plano (sem HTTP)');
    _depoisDoBoot();
} else {
    // Modo web (padrao atual, com ou sem WORKER_ROLE=web): abre porta HTTP normalmente
    app.listen(PORT, () => {
        console.log('🚀 REBECA CORRIDAS v3.4.1 - Sistema Completo');
        console.log('📡 Porta:', PORT);
        console.log('🚗 App Motorista: /motorista');
        _depoisDoBoot();
    });
}

// ─────────────────────────────────────────────
// 25. KEEP-ALIVE (evita hibernação no Render)
// ─────────────────────────────────────────────
const _urlSelf = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || null;
if (_urlSelf) {
    setInterval(() => {
        require('https').get(_urlSelf + '/health', (r) => console.log('[KEEP-ALIVE] ping OK:', r.statusCode))
            .on('error', (e) => console.log('[KEEP-ALIVE] erro:', e.message));
    }, 10 * 60 * 1000);
    console.log('✅ Keep-alive ativo para:', _urlSelf);
}

const _evolutionUrl = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-19af.up.railway.app';
setInterval(() => {
    require('https').get(_evolutionUrl, (r) => console.log('[EVO-KEEPALIVE] ping OK:', r.statusCode))
        .on('error', (e) => console.log('[EVO-KEEPALIVE] erro:', e.message));
}, 8 * 60 * 1000);
console.log('✅ Keep-alive Evolution API ativo para:', _evolutionUrl);

// ─────────────────────────────────────────────
// 26. SERVIÇOS DE RECUPERAÇÃO / INICIALIZAÇÃO
// ─────────────────────────────────────────────
if (RODAR_CRONS) {
  require('./services/agenda-recuperacao.service');
  console.log('🔄 Agenda: recuperação de clientes ativa');
}

// ─────────────────────────────────────────────
// 27. CRON JOBS
// ─────────────────────────────────────────────

// Mensalidades — verificar vencimentos a cada 1h
const MensalidadeService = require('./services/mensalidade.service');
if (RODAR_CRONS) setInterval(async () => {
    try {
        const notificacoes = await MensalidadeService.verificarVencimentos();
        if (notificacoes.length > 0) console.log('📢 Notificações de mensalidade:', notificacoes.length);
    } catch(e) { console.error('Erro ao verificar mensalidades:', e.message); }
}, 60 * 60 * 1000);

// Reativação de clientes inativos — roda 1x por dia às 10h
if (RODAR_CRONS) setInterval(async () => {
    const agora = new Date();
    const _agoraBR = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    if (_agoraBR.getHours() !== 10 || _agoraBR.getMinutes() > 5) return;
    try {
        const { Cliente, Corrida, Admin, InstanciaWhatsapp } = require('./models');
        const EvolutionMultiService = require('./services/evolution-multi.service');
        const admins = await Admin.find({ ativo: true, tipoAdmin: 'transporte' }).lean();
        for (const admin of admins) {
            const instancia = await InstanciaWhatsapp.findOne({ adminId: admin._id, status: { $in: ['conectado','open','connected'] } });
            if (!instancia) continue;
            const clientesInativos = await Cliente.find({ adminId: admin._id }).lean();
            let reativados = 0;
            for (const cliente of clientesInativos) {
                if (!cliente.telefone || reativados >= 5) break;
                const tels = [cliente.telefone, '55' + cliente.telefone, cliente.telefone.replace(/^55/, '')];
                const ultimaCorrida = await Corrida.findOne({ clienteTelefone: { $in: tels }, adminId: admin._id }).sort({ createdAt: -1 }).lean();
                if (!ultimaCorrida) continue;
                const diasSemPedir = (Date.now() - new Date(ultimaCorrida.createdAt).getTime()) / (24*60*60*1000);
                if (diasSemPedir >= 7 && diasSemPedir <= 14) {
                    if (!global._reativacoes) global._reativacoes = new Map();
                    const chave = cliente.telefone + '_' + admin._id;
                    const ultimaReativacao = global._reativacoes.get(chave);
                    if (ultimaReativacao && (Date.now() - ultimaReativacao) < 7 * 24 * 60 * 60 * 1000) continue;
                    const frases = [
                        'Oi ' + (cliente.nome || '') + '! Faz tempo que não te vejo por aqui 😊 Precisando de carro é só chamar!',
                        'Ei ' + (cliente.nome || '') + '! Sentimos sua falta! Quando precisar de corrida é só mandar mensagem 🚗',
                        'Olá ' + (cliente.nome || '') + '! Tudo bem? Estamos aqui sempre que precisar de um carro 😊'
                    ];
                    await EvolutionMultiService.enviarMensagem(instancia._id, cliente.telefone, frases[Math.floor(Math.random() * frases.length)]);
                    global._reativacoes.set(chave, Date.now());
                    reativados++;
                    console.log('[REATIVAR] Msg enviada para', cliente.nome || cliente.telefone, '(' + Math.floor(diasSemPedir) + ' dias inativo)');
                }
            }
            if (reativados > 0) console.log('[REATIVAR] Admin', admin.nome, ':', reativados, 'clientes reativados');
        }
    } catch(e) { console.log('[REATIVAR] Erro:', e.message); }
}, 60 * 60 * 1000);
if (RODAR_CRONS) console.log(RODAR_CRONS ? '✅ Cron reativação de clientes ativo' : '⏸️  Cron reativação de clientes (desativado neste processo - WORKER_ROLE=web)');

// Agenda — lembretes de agendamento
const AgendamentoService = require('./services/agendamento.service');
if (RODAR_CRONS) { AgendamentoService.iniciarCron(); console.log(RODAR_CRONS ? '✅ Cron agendamentos ativo' : '⏸️  Cron agendamentos (desativado neste processo - WORKER_ROLE=web)'); }

// Delivery — trial e cardápio
const DeliveryTrialService = require('./services/delivery-trial.service');
const CardapioDiaService   = require('./services/cardapio-dia.service');
if (RODAR_CRONS) {
  cron.schedule('0 6 * * *', () => DeliveryTrialService.verificarTrialsVencidos());
  cron.schedule('0 10 * * *', () => CardapioDiaService.perguntarCardapioAdms());
  DeliveryTrialService.verificarTrialsVencidos();
  console.log('✅ Cron delivery trial ativo');
  console.log('✅ Cron cardápio do dia ativo (7h)');
}

// Agenda — lembretes pessoais e modo dono
const ModoDono = require('./services/agenda-modo-dono.service');
const BomDia = require('./services/bomdia-inteligente.service');
if (RODAR_CRONS) {
  cron.schedule('*/5 * * * *', () => ModoDono.rodarLembretes());
  // rodarLembretesPessoais e rodarLembretesClientes já rodam via lembretes-clientes.job (a cada 30min)
  // Fix: evitar execução duplicada que causava envio duplo de lembretes
  cron.schedule('0 10 * * *', () => ModoDono.rodarRelatorioDiario(), { timezone: 'America/Sao_Paulo' }); // 10h BRT
  // Bom dia inteligente — horário aleatório entre 7h e 8h30 (cron às 7h, delay interno)
  cron.schedule('0 10 * * *', () => BomDia.rodarBomDia(), { timezone: 'America/Sao_Paulo' }); // 10h BRT
  // Boas-vindas pendentes — todo dia às 10h05 BRT (10h05 UTC = sem conflito com bom dia)
  cron.schedule('5 10 * * *', () => ModoDono.rodarBoasVindasPendentes(), { timezone: 'America/Sao_Paulo' }); // 10h05 BRT
  // Saudade Rebeca — verifica 3x por dia (9h, 14h, 20h BRT)
  cron.schedule('0 9 * * *',  () => ModoDono.rodarSaudadeRebeca(), { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 14 * * *', () => ModoDono.rodarSaudadeRebeca(), { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 20 * * *', () => ModoDono.rodarSaudadeRebeca(), { timezone: 'America/Sao_Paulo' });
  console.log(RODAR_CRONS ? '✅ Cron lembretes dono (5min) + relatório diário (7h) + bom dia inteligente (7h) ativos' : '⏸️  Cron lembretes dono/relatório/bom dia (desativado neste processo - WORKER_ROLE=web)');
}



// ── CRON TRIAL AGENDA — roda todo dia às 9h BRT ──────────────────
if (RODAR_CRONS) require('node-cron').schedule('0 12 * * *', async () => {
  try {
    const { AdminAgenda: _AA, InstanciaWhatsapp: _IW } = require('./models/AgendaServico');
    const agora = new Date();

    const PIX_CC = '00020101021226840014BR.GOV.BCB.PIX0136f09d7ae0-7754-4a98-94f5-134c007b56120222Pagamento francisca_da5204000053039865406147.005802BR5924FRANCISCA DAMACENA ROCHA6010COSTA RICA62290525QRCCTFj4aZBeZAHKCqLQQhBIc63044772';
    const VALOR  = 'R$ 147,00';
    const WPP_ADM = '5534999535060';
    const LINK_PAG = 'https://rebecasistemas.com.br/agenda-cadastro';

    const _instancia = async () => {
      const i = await _IW.findOne({ isOficial: true, status: 'conectado' }).lean()
             || await _IW.findOne({ adminTipo: 'agenda', status: 'conectado' }).lean();
      return i;
    };

    const _enviarWpp = async (inst, numero, msg) => {
      if (!inst || !numero) return;
      const num = numero.replace(/\D/g,'').replace(/^(?!55)/, '55');
      await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${inst.instancia}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: num, text: msg })
      }).catch(e => console.warn('[TRIAL] Erro wpp:', e.message));
    };

    // ── Avisar clientes com trial expirando HOJE (dia 7) ──
    const inicioDia = new Date(agora); inicioDia.setHours(0,0,0,0);
    const fimDia    = new Date(agora); fimDia.setHours(23,59,59,999);
    const vencendoHoje = await _AA.find({
      statusPagamento: 'trial',
      trialExpira: { $gte: inicioDia, $lte: fimDia },
      avisadoTrial: { $ne: true }
    }).lean();

    for (const adm of vencendoHoje) {
      try {
        const inst = await _instancia();
        const wpp = adm.whatsapp || adm.telefone || '';
        const nome = adm.nome || adm.nomeNegocio || '';

        // Mensagem para o cliente
        const msgCliente = `⏰ *Seu período de teste gratuito termina hoje!*

Olá, ${nome}! 👋

Você usou a *Rebeca Agenda* por 7 dias gratuitos. Esperamos que tenha gostado! 😊

Para continuar usando *sem interrupção*, faça o pagamento agora:

💰 *Valor: ${VALOR}*

📋 *PIX Copia e Cola:*
${PIX_CC}

Após o pagamento, envie o comprovante em:
🔗 ${LINK_PAG}

Qualquer dúvida estou aqui! 💙`;

        await _enviarWpp(inst, wpp, msgCliente);

        // Notificar admin (você) com cópia e cola
        const msgAdm = `🔔 *Cliente em período de teste vencendo*

*Nome:* ${nome}
*Email:* ${adm.email}
*WhatsApp:* ${wpp}

Já enviei a cobrança pra ele. Aqui está a chave PIX caso precise reenviar:

📋 *PIX Copia e Cola:*
${PIX_CC}

💰 Valor: ${VALOR}`;

        await _enviarWpp(inst, WPP_ADM, msgAdm);
        await _AA.findByIdAndUpdate(adm._id, { statusPagamento: 'trial_expirado', avisadoTrial: true });
        console.log('[TRIAL] Aviso enviado para', nome, wpp);
      } catch(e) { console.error('[TRIAL] Erro aviso:', e.message); }
    }

    // ── Bloquear clientes com trial_expirado há 3+ dias sem pagar ──
    const limite3dias = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000);
    const paraBloquear = await _AA.find({
      statusPagamento: 'trial_expirado',
      trialExpira: { $lt: limite3dias },
      ativo: true
    }).lean();

    for (const adm of paraBloquear) {
      try {
        const inst = await _instancia();
        const wpp = adm.whatsapp || adm.telefone || '';
        const nome = adm.nome || adm.nomeNegocio || '';

        const msgBloqueio = `🔒 *Acesso encerrado*

Olá, ${nome}!

Seu acesso à *Rebeca Agenda* foi encerrado por falta de pagamento após o período de teste.

Para reativar, faça o pagamento:

💰 *Valor: ${VALOR}*

📋 *PIX Copia e Cola:*
${PIX_CC}

🔗 ${LINK_PAG}

Assim que confirmarmos o pagamento, reativamos imediatamente! 💙`;

        await _enviarWpp(inst, wpp, msgBloqueio);
        await _AA.findByIdAndUpdate(adm._id, { ativo: false, statusPagamento: 'bloqueado' });
        console.log('[TRIAL] Bloqueado:', nome, adm.email);
      } catch(e) { console.error('[TRIAL] Erro bloqueio:', e.message); }
    }

    console.log('[TRIAL] Cron concluido — avisados:', vencendoHoje.length, '| bloqueados:', paraBloquear.length);
  } catch(e) { console.error('[TRIAL] Erro cron:', e.message); }
}, { timezone: 'America/Sao_Paulo' });
// ─────────────────────────────────────────────────────────────────
// ── RESET CONTADOR COZINHA ÀS 15H ────────────────────────────────
if (RODAR_CRONS) require('node-cron').schedule('0 15 * * *', async () => {
  try {
    const { ContadorPedido } = require('./models/cozinha.model');
    await ContadorPedido.deleteMany({});
    console.log('[Cozinha] Contador resetado às 15h');
  } catch(e) { console.error('[Cozinha] Erro reset contador:', e.message); }
}, { timezone: 'America/Sao_Paulo' });
