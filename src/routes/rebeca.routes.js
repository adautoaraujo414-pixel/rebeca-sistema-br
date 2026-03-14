const express = require('express');
const router = express.Router();
const RebecaService = require('../services/rebeca.service');
const RebecaDeliveryService = require('../services/rebeca-delivery.service');
const { Admin } = require('../models');
const CorridaService = require('../services/corrida.service');
const MotoristaService = require('../services/motorista.service');
const GPSIntegradoService = require('../services/gps-integrado.service');
const LogsService = require('../services/logs.service');

// ==================== CONFIG REBECA ====================
router.get('/config', (req, res) => {
    const adminId = req.query.adminId || req.headers['x-admin-id'];
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    res.json(RebecaService.getConfig(adminId));
});

router.put('/config', (req, res) => {
    const adminId = req.body.adminId || req.headers['x-admin-id'];
    if (!adminId) return res.status(400).json({ error: 'adminId obrigatório' });
    const config = RebecaService.setConfig({ ...req.body, adminId });
    LogsService.registrar({ tipo: 'config', acao: 'Configurações Rebeca atualizadas', adminId, detalhes: req.body });
    res.json({ sucesso: true, config });
});

// ==================== PROCESSAR MENSAGEM ====================
// Deduplicação de mensagens - evita Rebeca responder 2x ao mesmo webhook
if (!global._msgProcessadas) global._msgProcessadas = new Map();
setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of global._msgProcessadas) {
        if (agora - v > 60000) global._msgProcessadas.delete(k);
    }
}, 60000);

router.post('/mensagem', async (req, res) => {
    try {
        const { telefone, mensagem, nome, adminId, instanciaId, messageId } = req.body;
        if (!telefone || !mensagem) {
            return res.status(400).json({ error: 'Telefone e mensagem obrigatórios' });
        }
        if (!adminId) {
            return res.status(400).json({ error: 'adminId obrigatório' });
        }

        // Anti-duplicação: ignorar mesmo conteúdo nos últimos 30s
        const dedupKey = messageId || (telefone + '_' + mensagem.slice(0, 50).replace(/\s+/g,' ').trim() + '_' + Math.floor(Date.now() / 30000));
        if (global._msgProcessadas.has(dedupKey)) {
            console.log('[REBECA] Mensagem duplicada ignorada:', dedupKey);
            return res.json({ sucesso: true, resposta: null, duplicada: true });
        }
        global._msgProcessadas.set(dedupKey, Date.now());

        // Rotear para Delivery ou Corridas baseado no tipoAdmin
        let resposta;
        try {
            const adminDoc = await Admin.findById(adminId).lean();
            if (adminDoc && adminDoc.tipoAdmin === 'delivery') {
                resposta = await RebecaDeliveryService.processarMensagem(telefone, mensagem, nome, { adminId, instanciaId });
            } else {
                resposta = await RebecaService.processarMensagem(telefone, mensagem, nome, { adminId, instanciaId });
            }
        } catch(routeErr) {
            console.log('[REBECA] Erro roteamento:', routeErr.message);
            resposta = await RebecaService.processarMensagem(telefone, mensagem, nome, { adminId, instanciaId });
        }
        res.json({ sucesso: true, resposta });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar mensagem', detalhes: error.message });
    }
});

// ==================== RASTREAMENTO ====================
// Página HTML de rastreamento
router.get('/rastrear-page/:codigo', (req, res) => {
    res.sendFile(require('path').join(__dirname, '../public/rastrear.html'));
});

// API de rastreamento
router.get('/rastrear/:codigo', async (req, res) => {
    try {
        const codigo = req.params.codigo;
        const { Corrida, Motorista } = require('../models');
        
        // Buscar corrida pelo código (últimos caracteres do ID)
        // ObjectId não suporta regex, então buscamos as recentes e filtramos
        let corrida = null;
        // Buscar por tokenRastreamento primeiro
        corrida = await Corrida.findOne({ tokenRastreamento: codigo }).lean();
        if (!corrida) {
            const recentes = await Corrida.find({}).sort({ createdAt: -1 }).limit(500).lean();
            corrida = recentes.find(c => c._id.toString().endsWith(codigo)) || recentes.find(c => c._id.toString().includes(codigo));
        }
        
        // Fallback: tentar como ID completo
        if (!corrida && codigo.length >= 20) {
            try { corrida = await Corrida.findById(codigo).lean(); } catch(e) {}
        }
        
        if (!corrida) {
            return res.status(404).json({ error: 'Corrida não encontrada' });
        }
        
        // Link expira quando corrida finaliza ou cancela
        const statusCorrida = corrida.status || 'pendente';
        if (['finalizada', 'cancelada'].includes(statusCorrida)) {
            return res.json({ 
                expirado: true, 
                status: statusCorrida,
                mensagem: corrida.status === 'finalizada' ? 'Corrida finalizada - obrigado!' : 'Corrida cancelada'
            });
        }
        
        let motorista = null;
        let motoristaGPS = null;
        
        if (corrida.motoristaId) {
            try { motorista = await Motorista.findById(corrida.motoristaId); } catch(e) {}
            // Buscar GPS: primeiro no serviço em memória (mais atualizado), depois no banco
            try {
                // Tentar gps.service em memória (mais atualizado)
                try {
                    const gpsService = require('../services/gps.service');
                    const gpsMemoria = gpsService.obterLocalizacao(corrida.motoristaId.toString());
                    if (gpsMemoria && gpsMemoria.latitude) motoristaGPS = gpsMemoria;
                } catch(_e) {}
                // Fallback: usar lat/lng do banco do motorista
                if (!motoristaGPS && motorista && motorista.latitude) {
                    motoristaGPS = { latitude: motorista.latitude, longitude: motorista.longitude, atualizadoEm: motorista.updatedAt };
                }
            } catch(e) { console.log('[GPS] Erro:', e.message); }
        }
        
        res.json({
            corrida: {
                id: corrida._id.toString(),
                codigo: corrida._id.toString().slice(-6),
                status: corrida.status,
                origem: corrida.origem?.endereco || corrida.origem,
                destino: corrida.destino?.endereco || corrida.destino,
                origemLat: corrida.origem?.latitude,
                origemLng: corrida.origem?.longitude,
                precoEstimado: corrida.precoEstimado,
                tempoEstimado: corrida.tempoEstimado,
                distanciaKm: corrida.distanciaKm
            },
            motorista: motorista ? {
                nome: motorista.nomeCompleto || motorista.nome,
                veiculo: motorista.veiculo?.modelo || '',
                cor: motorista.veiculo?.cor || '',
                placa: motorista.veiculo?.placa || '',
                avaliacao: motorista.avaliacao || 5,
                foto: motorista.foto
            } : null,
            motoristaGPS: motoristaGPS ? {
                latitude: motoristaGPS.latitude,
                longitude: motoristaGPS.longitude,
                atualizadoEm: motoristaGPS.atualizadoEm
            } : null
        });
    } catch (e) {
        console.error('[RASTREAR] Erro:', e.message);
        res.status(500).json({ error: 'Erro ao buscar corrida' });
    }
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
