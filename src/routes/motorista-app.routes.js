const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');
const CorridaService = require('../services/corrida.service');
const GPSIntegradoService = require('../services/gps-integrado.service');

router.post('/login', (req, res) => {
    const { telefone, senha } = req.body;
    
    if (!telefone || !senha) {
        return res.status(400).json({ error: 'Telefone e senha obrigatórios' });
    }

    const motorista = MotoristaService.autenticar(telefone, senha);
    
    if (!motorista) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = 'MOT_' + motorista.id + '_' + Date.now();

    res.json({
        sucesso: true,
        token,
        motorista: {
            id: motorista.id,
            nome: motorista.nome,
            telefone: motorista.telefone,
            veiculo: motorista.veiculo,
            avaliacao: motorista.avaliacao
        }
    });
});

router.post('/atualizar-localizacao', (req, res) => {
    const { motoristaId, latitude, longitude } = req.body;
    
    if (!motoristaId || !latitude || !longitude) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    const resultado = GPSIntegradoService.atualizar(motoristaId, { latitude, longitude });
    
    if (!resultado) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }

    res.json({ sucesso: true, localizacao: resultado });
});

router.post('/ficar-disponivel', (req, res) => {
    const { motoristaId } = req.body;
    
    const motorista = MotoristaService.atualizarStatus(motoristaId, 'disponivel');
    GPSIntegradoService.atualizar(motoristaId, { status: 'disponivel' });
    
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }

    res.json({ sucesso: true, motorista });
});

router.post('/ficar-offline', (req, res) => {
    const { motoristaId } = req.body;
    
    const motorista = MotoristaService.atualizarStatus(motoristaId, 'offline');
    GPSIntegradoService.atualizar(motoristaId, { status: 'offline' });
    
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }

    res.json({ sucesso: true, motorista });
});

router.get('/corridas-disponiveis', (req, res) => {
    const corridas = CorridaService.listarPendentes();
    res.json(corridas);
});

router.post('/aceitar-corrida', (req, res) => {
    const { motoristaId, corridaId } = req.body;
    
    const motorista = MotoristaService.buscarPorId(motoristaId);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }

    const corrida = CorridaService.atribuirMotorista(corridaId, motoristaId, motorista.nome);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }

    MotoristaService.atualizarStatus(motoristaId, 'a_caminho');
    GPSIntegradoService.atualizar(motoristaId, { status: 'a_caminho' });

    res.json({ sucesso: true, corrida });
});

router.post('/iniciar-corrida', (req, res) => {
    const { motoristaId, corridaId } = req.body;
    
    const corrida = CorridaService.iniciar(corridaId);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }

    MotoristaService.atualizarStatus(motoristaId, 'em_corrida');
    GPSIntegradoService.atualizar(motoristaId, { status: 'em_corrida' });

    res.json({ sucesso: true, corrida });
});

router.post('/finalizar-corrida', (req, res) => {
    const { motoristaId, corridaId, valorCobrado } = req.body;
    
    const corrida = CorridaService.finalizar(corridaId, valorCobrado);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }

    MotoristaService.atualizarStatus(motoristaId, 'disponivel');
    GPSIntegradoService.atualizar(motoristaId, { status: 'disponivel' });

    res.json({ sucesso: true, corrida });
});

router.get('/ganhos/:motoristaId', (req, res) => {
    const corridas = CorridaService.listarTodas({ motoristaId: req.params.motoristaId });
    const finalizadas = corridas.filter(c => c.status === 'finalizada');
    
    const hoje = new Date().toISOString().split('T')[0];
    const corridasHoje = finalizadas.filter(c => c.dataFinalizacao?.startsWith(hoje));
    
    res.json({
        totalCorridas: finalizadas.length,
        corridasHoje: corridasHoje.length,
        ganhoTotal: finalizadas.reduce((sum, c) => sum + (c.precoFinal || 0), 0),
        ganhoHoje: corridasHoje.reduce((sum, c) => sum + (c.precoFinal || 0), 0)
    });
});

module.exports = router;
