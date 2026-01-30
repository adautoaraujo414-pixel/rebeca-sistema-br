const express = require('express');
const cors = require('cors');
const path = require('path');
require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin-master', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-master.html')));
app.get('/cadastro-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro-admin.html')));
app.get('/parceiro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro-admin.html')));
app.get('/cadastro-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro-admin.html')));
app.get('/parceiro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cadastro-admin.html')));
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

// Páginas
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
