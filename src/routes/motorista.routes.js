const express = require('express');
const router = express.Router();
const MotoristaService = require('../services/motorista.service');

// Listar todos (apenas admin)
router.get('/', (req, res) => {
    const filtros = {
        status: req.query.status,
        ativo: req.query.ativo === 'true' ? true : req.query.ativo === 'false' ? false : undefined,
        busca: req.query.busca
    };
    const motoristas = MotoristaService.listarTodos(filtros);
    
    // Remove dados sensíveis
    const motoristasLimpos = motoristas.map(m => ({
        id: m.id,
        nomeCompleto: m.nomeCompleto,
        whatsapp: m.whatsapp,
        veiculo: m.veiculo,
        status: m.status,
        avaliacao: m.avaliacao,
        corridasRealizadas: m.corridasRealizadas,
        ativo: m.ativo,
        dataCadastro: m.dataCadastro
    }));
    
    res.json(motoristasLimpos);
});

// Estatísticas
router.get('/estatisticas', (req, res) => {
    const estatisticas = MotoristaService.obterEstatisticas();
    res.json(estatisticas);
});

// Verificar se WhatsApp já existe
router.get('/verificar-whatsapp/:whatsapp', (req, res) => {
    const existe = MotoristaService.verificarWhatsAppExiste(req.params.whatsapp);
    res.json({ existe });
});

// Buscar por ID
router.get('/:id', (req, res) => {
    const motorista = MotoristaService.buscarPorId(req.params.id);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    
    // Remove token da resposta pública
    const { token, ...dadosPublicos } = motorista;
    res.json(dadosPublicos);
});

// Criar novo motorista
router.post('/', (req, res) => {
    try {
        const { nomeCompleto, whatsapp, cnh, veiculo } = req.body;
        
        // Validações
        if (!nomeCompleto || nomeCompleto.length < 3) {
            return res.status(400).json({ error: 'Nome completo é obrigatório (mínimo 3 caracteres)' });
        }
        
        if (!whatsapp || whatsapp.replace(/\D/g, '').length < 10) {
            return res.status(400).json({ error: 'WhatsApp inválido' });
        }
        
        if (!cnh || cnh.length < 5) {
            return res.status(400).json({ error: 'Número da CNH é obrigatório' });
        }
        
        if (!veiculo?.modelo || !veiculo?.cor || !veiculo?.placa) {
            return res.status(400).json({ error: 'Dados do veículo são obrigatórios (modelo, cor, placa)' });
        }
        
        // Verifica se WhatsApp já existe
        if (MotoristaService.verificarWhatsAppExiste(whatsapp)) {
            return res.status(400).json({ error: 'Este WhatsApp já está cadastrado' });
        }
        
        const motorista = MotoristaService.criar(req.body);
        
        res.status(201).json({
            sucesso: true,
            mensagem: 'Motorista cadastrado com sucesso!',
            motorista: {
                id: motorista.id,
                nomeCompleto: motorista.nomeCompleto,
                whatsapp: motorista.whatsapp,
                veiculo: motorista.veiculo,
                token: motorista.token,
                senhaGerada: motorista.senhaGerada
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Atualizar motorista
router.put('/:id', (req, res) => {
    const motorista = MotoristaService.atualizar(req.params.id, req.body);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json({ sucesso: true, motorista });
});

// Atualizar status
router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    const statusValidos = ['offline', 'disponivel', 'a_caminho', 'em_corrida', 'pausa'];
    
    if (!statusValidos.includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
    }
    
    const motorista = MotoristaService.atualizarStatus(req.params.id, status);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json({ sucesso: true, motorista });
});

// Regenerar token
router.post('/:id/regenerar-token', (req, res) => {
    const novoToken = MotoristaService.regenerarToken(req.params.id);
    if (!novoToken) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json({ sucesso: true, token: novoToken });
});

// Desativar motorista
router.delete('/:id', (req, res) => {
    const motorista = MotoristaService.desativar(req.params.id);
    if (!motorista) {
        return res.status(404).json({ error: 'Motorista não encontrado' });
    }
    res.json({ sucesso: true, mensagem: 'Motorista desativado' });
});

module.exports = router;
