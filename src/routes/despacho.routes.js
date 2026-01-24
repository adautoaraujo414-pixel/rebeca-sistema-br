const express = require('express');
const router = express.Router();
const DespachoService = require('../services/despacho.service');
const CorridaService = require('../services/corrida.service');
const MotoristaService = require('../services/motorista.service');
const GPSIntegradoService = require('../services/gps-integrado.service');
const LogsService = require('../services/logs.service');

// ==================== CONFIGURAÇÃO ====================
router.get('/config', (req, res) => {
    res.json({
        modo: DespachoService.getModo(),
        tempoAceiteSegundos: DespachoService.tempoAceiteSegundos,
        modos: [
            { id: 'broadcast', nome: 'Broadcast (Todos)', descricao: 'Envia para todos motoristas, primeiro que aceitar leva' },
            { id: 'proximo', nome: 'Mais Próximo', descricao: 'Envia para o motorista mais próximo do cliente' }
        ]
    });
});

router.put('/config', (req, res) => {
    const { modo, tempoAceiteSegundos } = req.body;
    
    if (modo) {
        const result = DespachoService.setModo(modo);
        if (result.error) return res.status(400).json(result);
    }
    
    if (tempoAceiteSegundos) {
        DespachoService.setTempoAceite(parseInt(tempoAceiteSegundos));
    }
    
    LogsService.registrar({ tipo: 'config', acao: 'Modo despacho alterado', detalhes: { modo, tempoAceiteSegundos } });
    
    res.json({
        sucesso: true,
        modo: DespachoService.getModo(),
        tempoAceiteSegundos: DespachoService.tempoAceiteSegundos
    });
});

// ==================== ESTATÍSTICAS ====================
router.get('/estatisticas', (req, res) => {
    res.json(DespachoService.getEstatisticas());
});

// ==================== DESPACHAR CORRIDA ====================
router.post('/despachar/:corridaId', async (req, res) => {
    const { corridaId } = req.params;
    const { modoOverride } = req.body; // Permite forçar um modo específico
    
    // Buscar corrida
    const corrida = CorridaService.buscarPorId(corridaId);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    
    if (corrida.status !== 'pendente') {
        return res.status(400).json({ error: 'Corrida não está pendente' });
    }
    
    // Buscar motoristas disponíveis com localização
    const motoristasGPS = GPSIntegradoService.listarTodos();
    const motoristasDisponiveis = motoristasGPS.filter(m => m.status === 'disponivel');
    
    // Salvar modo atual e aplicar override se necessário
    const modoOriginal = DespachoService.getModo();
    if (modoOverride && ['broadcast', 'proximo'].includes(modoOverride)) {
        DespachoService.setModo(modoOverride);
    }
    
    // Despachar
    const resultado = await DespachoService.despacharCorrida(corrida, motoristasDisponiveis);
    
    // Restaurar modo original se foi override
    if (modoOverride) {
        DespachoService.setModo(modoOriginal);
    }
    
    if (!resultado.sucesso) {
        return res.status(400).json(resultado);
    }
    
    // Atualizar status da corrida
    CorridaService.atualizarStatus(corridaId, 'buscando_motorista');
    
    LogsService.registrar({ 
        tipo: 'despacho', 
        acao: `Corrida despachada (${resultado.modo})`, 
        detalhes: { corridaId, modo: resultado.modo } 
    });
    
    res.json(resultado);
});

// ==================== DESPACHO MANUAL ====================
router.post('/enviar-para-motorista', async (req, res) => {
    const { corridaId, motoristaId } = req.body;
    
    if (!corridaId || !motoristaId) {
        return res.status(400).json({ error: 'corridaId e motoristaId são obrigatórios' });
    }
    
    const corrida = CorridaService.buscarPorId(corridaId);
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    
    const motorista = MotoristaService.buscarPorId(motoristaId);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    
    // Buscar localização do motorista
    const gps = GPSIntegradoService.buscarPorMotoristaId(motoristaId);
    const motoristaComGPS = { ...motorista, ...gps };
    
    // Forçar modo próximo para enviar para motorista específico
    const modoOriginal = DespachoService.getModo();
    DespachoService.setModo('proximo');
    
    const resultado = await DespachoService.despacharCorrida(corrida, [motoristaComGPS]);
    
    DespachoService.setModo(modoOriginal);
    
    if (!resultado.sucesso) {
        return res.status(400).json(resultado);
    }
    
    CorridaService.atualizarStatus(corridaId, 'buscando_motorista');
    
    LogsService.registrar({ 
        tipo: 'despacho', 
        acao: 'Corrida enviada manualmente', 
        detalhes: { corridaId, motoristaId, motoristaNome: motorista.nomeCompleto || motorista.nome } 
    });
    
    res.json(resultado);
});

// ==================== ACEITAR CORRIDA ====================
router.post('/aceitar', (req, res) => {
    const { corridaId, motoristaId, motoristaNome } = req.body;
    
    if (!corridaId || !motoristaId) {
        return res.status(400).json({ error: 'corridaId e motoristaId são obrigatórios' });
    }
    
    const resultado = DespachoService.aceitarCorrida(corridaId, motoristaId, motoristaNome);
    
    if (!resultado.sucesso) {
        return res.status(400).json(resultado);
    }
    
    // Atualizar corrida
    CorridaService.atualizarStatus(corridaId, 'aceita');
    CorridaService.atribuirMotorista(corridaId, motoristaId, motoristaNome);
    
    // Atualizar status do motorista
    MotoristaService.atualizarStatus(motoristaId, 'a_caminho');
    GPSIntegradoService.atualizarStatus(motoristaId, 'a_caminho');
    
    LogsService.registrar({ 
        tipo: 'despacho', 
        acao: 'Corrida aceita', 
        detalhes: { corridaId, motoristaId, motoristaNome } 
    });
    
    res.json(resultado);
});

// ==================== RECUSAR CORRIDA ====================
router.post('/recusar', (req, res) => {
    const { corridaId, motoristaId, motivo } = req.body;
    
    if (!corridaId || !motoristaId) {
        return res.status(400).json({ error: 'corridaId e motoristaId são obrigatórios' });
    }
    
    const resultado = DespachoService.recusarCorrida(corridaId, motoristaId, motivo);
    
    LogsService.registrar({ 
        tipo: 'despacho', 
        acao: 'Corrida recusada', 
        detalhes: { corridaId, motoristaId, motivo, redirecionado: resultado.redirecionado } 
    });
    
    // Se não há mais motoristas, voltar corrida para pendente
    if (resultado.semMotoristas) {
        CorridaService.atualizarStatus(corridaId, 'pendente');
    }
    
    res.json(resultado);
});

// ==================== CONSULTAR STATUS ====================
router.get('/corrida/:corridaId', (req, res) => {
    const despacho = DespachoService.getCorridaPendente(req.params.corridaId);
    if (!despacho) {
        return res.status(404).json({ error: 'Despacho não encontrado' });
    }
    res.json(despacho);
});

// ==================== CORRIDAS DISPONÍVEIS PARA MOTORISTA ====================
router.get('/disponiveis/:motoristaId', (req, res) => {
    const corridas = DespachoService.getCorridasDisponiveis(req.params.motoristaId);
    
    // Enriquecer com dados da corrida
    const corridasCompletas = corridas.map(notif => {
        const corrida = CorridaService.buscarPorId(notif.corridaId);
        return {
            ...notif,
            corrida: corrida ? {
                id: corrida.id,
                clienteNome: corrida.clienteNome,
                origem: corrida.origem,
                destino: corrida.destino,
                precoEstimado: corrida.precoEstimado,
                distanciaKm: corrida.distanciaKm
            } : null
        };
    }).filter(c => c.corrida);
    
    res.json(corridasCompletas);
});

module.exports = router;
