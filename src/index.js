const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Importar rotas
const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const motoristaRoutes = require('./routes/motorista.routes');
const motoristaAppRoutes = require('./routes/motorista-app.routes');
const corridaRoutes = require('./routes/corrida.routes');
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

// Registrar rotas API
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/motoristas', motoristaRoutes);
app.use('/api/motorista-app', motoristaAppRoutes);
app.use('/api/corridas', corridaRoutes);
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

// Página de rastreamento para clientes
app.get('/rastrear/:codigo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'rastrear.html'));
});

// Redirecionar /admin para login se necessário
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        versao: '2.9.0',
        funcionalidades: [
            'Rebeca Auto-Detect',
            'Rastreamento Cliente',
            'Notificações Tempo',
            'Preços Dinâmicos',
            'Despacho Inteligente'
        ]
    });
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

app.listen(PORT, () => {
    console.log('');
    console.log('🚀 UBMAX Rebeca v2.9.0');
    console.log('=================================');
    console.log('📡 Porta:', PORT);
    console.log('🤖 Rebeca: AUTO-DETECT ENDEREÇO');
    console.log('📲 Rastreamento: /rastrear/:codigo');
    console.log('🔔 Notificações: 3min, 1min, chegou');
    console.log('🚗 Despacho: BROADCAST / PRÓXIMO');
    console.log('⚙️  Admin: /admin');
    console.log('=================================');
});
