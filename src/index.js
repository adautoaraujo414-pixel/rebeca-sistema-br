const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const motoristaRoutes = require('./routes/motorista.routes');
const corridaRoutes = require('./routes/corrida.routes');
const clienteRoutes = require('./routes/cliente.routes');
const statusRoutes = require('./routes/status.routes');
const gpsRoutes = require('./routes/gps.routes');
const gpsIntegradoRoutes = require('./routes/gps-integrado.routes');
const localidadeRoutes = require('./routes/localidade.routes');
const pontoReferenciaRoutes = require('./routes/pontos-referencia.routes');
const precoDinamicoRoutes = require('./routes/preco-dinamico.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const rebecaRoutes = require('./routes/rebeca.routes');
const motoristaAppRoutes = require('./routes/motorista-app.routes');
const authRoutes = require('./routes/auth.routes');

app.use('/api/motoristas', motoristaRoutes);
app.use('/api/corridas', corridaRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/gps-integrado', gpsIntegradoRoutes);
app.use('/api/localidades', localidadeRoutes);
app.use('/api/pontos-referencia', pontoReferenciaRoutes);
app.use('/api/preco-dinamico', precoDinamicoRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/rebeca', rebecaRoutes);
app.use('/api/motorista-app', motoristaAppRoutes);
app.use('/api/auth', authRoutes);

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', sistema: 'UBMAX/Rebeca' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(PORT, () => {
    console.log('Servidor UBMAX/Rebeca rodando na porta ' + PORT);
});
