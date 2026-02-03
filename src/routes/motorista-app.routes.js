const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');
const CorridaService = require('../services/corrida.service');

// Middleware de autenticação
const auth = async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    
    const motorista = await MotoristaService.buscarPorToken(token);
    if (!motorista) return res.status(401).json({ erro: 'Token inválido' });
    
    req.motorista = motorista;
    next();
};

// Login
router.post('/login', async (req, res) => {
    const { whatsapp, senha } = req.body;
    const resultado = await MotoristaService.login(whatsapp, senha || '123456');
    res.json(resultado);
});

// Perfil
router.get('/perfil', auth, (req, res) => {
    res.json({ motorista: req.motorista });
});

// Atualizar GPS
router.post('/gps', auth, async (req, res) => {
    const { latitude, longitude } = req.body;
    await MotoristaService.atualizarGPS(req.motorista._id, latitude, longitude);
    res.json({ sucesso: true });
});

// Atualizar Status
router.post('/status', auth, async (req, res) => {
    const { status } = req.body;
    await MotoristaService.atualizarStatus(req.motorista._id, status);
    res.json({ sucesso: true, status });
});

// Corridas disponíveis
router.get('/corridas-disponiveis', auth, async (req, res) => {
    const corridas = await CorridaService.listarPendentes();
    res.json({ corridas });
});

// Aceitar corrida
router.post('/aceitar', auth, async (req, res) => {
    const { corridaId } = req.body;
    try {
        const corrida = await CorridaService.atribuirMotorista(corridaId, req.motorista._id, req.motorista.nome);
        
        // Notificar cliente via WhatsApp
        if (corrida && corrida.clienteTelefone) {
            const EvolutionMultiService = require('../services/evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');
            const instancia = await InstanciaWhatsapp.findOne({ adminId: corrida.adminId, status: 'conectado' });
            if (instancia) {
                const msg = '🚗 *MOTORISTA A CAMINHO!*\n\n' +
                    '👤 *' + req.motorista.nome + '*\n' +
                    (req.motorista.veiculo ? '🚙 ' + req.motorista.veiculo + '\n' : '') +
                    (req.motorista.placa ? '🔢 Placa: ' + req.motorista.placa + '\n' : '') +
                    '\nFique tranquilo, ele ja esta indo te buscar!';
                await EvolutionMultiService.enviarMensagem(instancia._id, corrida.clienteTelefone, msg);
            }
        }
        
        res.json({ sucesso: true, corrida });
    } catch (e) {
        res.json({ sucesso: false, erro: e.message });
    }
});

// Iniciar corrida
router.post('/iniciar', auth, async (req, res) => {
    const { corridaId } = req.body;
    const corrida = await CorridaService.iniciar(corridaId);
    res.json({ sucesso: true, corrida });
});

// Finalizar corrida
router.post('/finalizar', auth, async (req, res) => {
    const { corridaId, precoFinal } = req.body;
    const resultado = await CorridaService.finalizar(corridaId, precoFinal);
    res.json(resultado);
});

// Cancelar corrida
router.post('/cancelar', auth, async (req, res) => {
    const { corridaId, motivo } = req.body;
    const resultado = await CorridaService.cancelar(corridaId, motivo || 'Cancelado pelo motorista');
    res.json(resultado);
});

// Histórico de corridas
router.get('/historico', auth, async (req, res) => {
    const corridas = await CorridaService.listarPorMotorista(req.motorista._id);
    res.json({ corridas });
});

// Corrida ativa
router.get('/corrida-ativa', auth, async (req, res) => {
    const corrida = await CorridaService.corridaAtivaMotorista(req.motorista._id);
    res.json({ corrida });
});

module.exports = router;
