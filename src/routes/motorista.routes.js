const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');
const { Motorista } = require('../models');

// Middleware para extrair adminId
const extrairAdminId = (req, res, next) => {
    req.adminId = req.headers['x-admin-id'] || req.query.adminId || null;
    next();
};
router.use(extrairAdminId);

// Listar motoristas (filtrado por admin)
router.get('/', async (req, res) => {
    try {
        const motoristas = await MotoristaService.listar(req.adminId);
        res.json(motoristas);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Estatisticas
router.get('/estatisticas', async (req, res) => {
    try {
        const stats = await MotoristaService.estatisticas(req.adminId);
        res.json(stats);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Disponiveis
router.get('/disponiveis', async (req, res) => {
    try {
        const motoristas = await MotoristaService.listarDisponiveis(req.adminId);
        res.json(motoristas);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const motorista = await MotoristaService.buscarPorId(req.params.id);
        if (!motorista) return res.status(404).json({ erro: 'Nao encontrado' });
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Criar motorista (com adminId)
router.post('/', async (req, res) => {
    try {
        const adminId = req.body.adminId || req.adminId;
        if (!adminId) {
            return res.status(400).json({ error: 'Admin ID obrigatorio' });
        }
        
        const senhaGerada = req.body.senhaPin || Math.random().toString(36).slice(-6).toUpperCase();
        req.body.senha = senhaGerada;
        const motorista = await MotoristaService.criar(req.body, adminId);
        
        // Criar mensalidade automatica
        const { Mensalidade, InstanciaWhatsapp } = require('../models');
        const valorMensalidade = req.body.valorMensalidade || 100;
        const plano = req.body.plano || 'mensal';
        const diasVencimento = plano === 'semanal' ? 7 : 30;
        const dataVencimento = new Date();
        dataVencimento.setDate(dataVencimento.getDate() + diasVencimento);
        
        let mensalidadeCriada = false;
        try {
            await Mensalidade.create({
                motoristaId: motorista._id,
                motoristaNome: motorista.nomeCompleto,
                motoristaWhatsapp: motorista.whatsapp,
                plano: plano,
                valor: valorMensalidade,
                dataVencimento: dataVencimento,
                status: 'pendente'
            });
            mensalidadeCriada = true;
        } catch (e) { console.log('Erro mensalidade:', e.message); }
        
        // Enviar WhatsApp se solicitado
        let whatsappEnviado = false;
        if (req.body.enviarWhatsApp !== false) {
            try {
                const instancia = await InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });
                if (instancia) {
                    const EvolutionMultiService = require('../services/evolution-multi.service');
                    const linkApp = 'https://rebeca-sistema-br.onrender.com/motorista-app.html';
                    const msg = '🚗 *BEM-VINDO À FROTA UBMAX!*\n\n' +
                        'Voce foi cadastrado como motorista parceiro!\n\n' +
                        '📱 *SUAS CREDENCIAIS:*\n' +
                        '• Token: ' + motorista.token + '\n' +
                        '• Senha: ' + senhaGerada + '\n\n' +
                        '🔗 *ACESSE O APP:*\n' + linkApp + '\n\n' +
                        '✅ Faca login e comece a receber corridas!\n\n' +
                        '💰 Plano: ' + plano.toUpperCase() + ' - R$ ' + valorMensalidade.toFixed(2);
                    await EvolutionMultiService.enviarMensagem(instancia.nomeInstancia, motorista.whatsapp, msg);
                    whatsappEnviado = true;
                }
            } catch (e) { console.log('Erro WhatsApp:', e.message); }
        }
        
        res.status(201).json({ motorista, senhaGerada, mensalidadeCriada, whatsappEnviado });
    } catch (e) { 
        console.error('Erro ao criar motorista:', e);
        res.status(500).json({ error: e.message }); 
    }
});

// Atualizar
router.put('/:id', async (req, res) => {
    try {
        const motorista = await MotoristaService.atualizar(req.params.id, req.body);
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Deletar
router.delete('/:id', async (req, res) => {
    try {
        await MotoristaService.deletar(req.params.id);
        res.json({ sucesso: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar status
router.put('/:id/status', async (req, res) => {
    try {
        const motorista = await MotoristaService.atualizarStatus(req.params.id, req.body.status);
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar GPS
router.put('/:id/gps', async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const motorista = await MotoristaService.atualizarGPS(req.params.id, latitude, longitude);
        res.json(motorista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { whatsapp, senha } = req.body;
        const resultado = await MotoristaService.login(whatsapp, senha);
        res.json(resultado);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;