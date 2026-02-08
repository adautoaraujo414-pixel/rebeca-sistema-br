const express = require('express');
const router = express.Router();
const RebecaService = require('../services/rebeca.service');
const CorridaService = require('../services/corrida.service');
const MotoristaService = require('../services/motorista.service');
const GPSIntegradoService = require('../services/gps-integrado.service');
const LogsService = require('../services/logs.service');

// ==================== CONFIG REBECA ====================
router.get('/config', (req, res) => {
    res.json(RebecaService.getConfig());
});

router.put('/config', (req, res) => {
    const config = RebecaService.setConfig(req.body);
    LogsService.registrar({ tipo: 'config', acao: 'Configurações Rebeca atualizadas', detalhes: req.body });
    res.json({ sucesso: true, config });
});

// ==================== PROCESSAR MENSAGEM ====================
router.post('/mensagem', async (req, res) => {
    try {
        const { telefone, mensagem, nome } = req.body;
        if (!telefone || !mensagem) {
            return res.status(400).json({ error: 'Telefone e mensagem obrigatórios' });
        }
        
        const resposta = await RebecaService.processarMensagem(telefone, mensagem, nome);
        res.json({ sucesso: true, resposta });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar mensagem', detalhes: error.message });
    }
});

// ==================== RASTREAMENTO ====================
// Página HTML de rastreamento
router.get('/rastrear-page/:codigo', (req, res) => {
    res.sendFile('rastrear.html', { root: 'public' });
});

// API de rastreamento
router.get('/rastrear/:codigo', (req, res) => {
    const codigo = req.params.codigo;
    
    // Buscar corrida pelo código (últimos 8 caracteres do ID)
    const corridas = CorridaService.listarTodas({});
    const corrida = corridas.find(c => c.id.endsWith(codigo) || c.id.slice(-8) === codigo || c.id.slice(-6) === codigo);
    
    if (!corrida) {
        return res.status(404).json({ error: 'Corrida não encontrada' });
    }
    
    // Link expira quando corrida inicia, finaliza ou cancela
    if (['em_andamento', 'finalizada', 'cancelada'].includes(corrida.status)) {
        return res.json({ 
            expirado: true, 
            status: corrida.status,
            mensagem: corrida.status === 'em_andamento' ? 'Corrida em andamento - rastreamento encerrado' :
                      corrida.status === 'finalizada' ? 'Corrida finalizada - obrigado!' :
                      'Corrida cancelada'
        });
    }
    
    let motorista = null;
    let motoristaGPS = null;
    
    if (corrida.motoristaId) {
        motorista = MotoristaService.buscar(corrida.motoristaId);
        motoristaGPS = GPSIntegradoService.obterLocalizacao(corrida.motoristaId);
    }
    
    res.json({
        corrida: {
            id: corrida.id,
            codigo: corrida.id.slice(-6),
            status: corrida.status,
            statusTexto: RebecaService.formatarStatus(corrida.status),
            origem: corrida.origem,
            destino: corrida.destino,
            precoEstimado: corrida.precoEstimado,
            tempoEstimado: corrida.tempoEstimado,
            distanciaKm: corrida.distanciaKm
        },
        motorista: motorista ? {
            nome: motorista.nomeCompleto || motorista.nome,
            veiculo: motorista.veiculo,
            avaliacao: motorista.avaliacao || 5,
            foto: motorista.foto
        } : null,
        localizacao: motoristaGPS ? {
            latitude: motoristaGPS.latitude,
            longitude: motoristaGPS.longitude,
            atualizadoEm: motoristaGPS.atualizadoEm
        } : null
    });
});

// ==================== NOTIFICAÇÕES ====================
router.post('/notificar-tempo', async (req, res) => {
    const { corridaId, minutos } = req.body;
    
    const corrida = CorridaService.buscar(corridaId);
    if (!corrida) return res.status(404).json({ error: 'Corrida não encontrada' });
    
    const motorista = corrida.motoristaId ? MotoristaService.buscar(corrida.motoristaId) : null;
    if (!motorista) return res.status(404).json({ error: 'Motorista não encontrado' });
    
    const mensagem = RebecaService.gerarNotificacaoTempo(minutos, motorista, corrida);
    
    res.json({ 
        sucesso: true, 
        mensagem,
        telefoneCliente: corrida.clienteTelefone
    });
});

router.post('/notificar-boa-viagem', async (req, res) => {
    const { corridaId } = req.body;
    
    const corrida = CorridaService.buscar(corridaId);
    if (!corrida) return res.status(404).json({ error: 'Corrida não encontrada' });
    
    const motorista = corrida.motoristaId ? MotoristaService.buscar(corrida.motoristaId) : null;
    
    const mensagem = RebecaService.gerarMensagemBoaViagem(corrida, motorista);
    
    res.json({ 
        sucesso: true, 
        mensagem,
        telefoneCliente: corrida.clienteTelefone
    });
});

// ==================== TESTAR DETECÇÃO ====================
router.post('/testar-endereco', (req, res) => {
    const { texto } = req.body;
    const pareceEndereco = RebecaService.pareceEndereco(texto);
    res.json({ texto, pareceEndereco });
});

module.exports = router;
