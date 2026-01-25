const express = require('express');
const router = express.Router();
const MensalidadeService = require('../services/mensalidade.service');
const { Motorista } = require('../models');

// Listar todas mensalidades
router.get('/', async (req, res) => {
    const { status, motoristaId } = req.query;
    const mensalidades = await MensalidadeService.listar({ status, motoristaId });
    res.json(mensalidades);
});

// Estatísticas
router.get('/estatisticas', async (req, res) => {
    const stats = await MensalidadeService.estatisticas();
    res.json(stats);
});

// Config financeiro
router.get('/config', async (req, res) => {
    const config = await MensalidadeService.getConfigFinanceiro();
    res.json(config);
});

router.put('/config', async (req, res) => {
    const config = await MensalidadeService.salvarConfigFinanceiro(req.body);
    res.json({ sucesso: true, config });
});

// Buscar por motorista
router.get('/motorista/:motoristaId', async (req, res) => {
    const mensalidades = await MensalidadeService.buscarPorMotorista(req.params.motoristaId);
    res.json(mensalidades);
});

// Criar mensalidade manual
router.post('/', async (req, res) => {
    try {
        const { motoristaId, plano, valor, dataVencimento } = req.body;
        const motorista = await Motorista.findById(motoristaId);
        if (!motorista) return res.status(404).json({ erro: 'Motorista não encontrado' });

        const mensalidade = await MensalidadeService.criar({
            motoristaId,
            motoristaNome: motorista.nomeCompleto,
            motoristaWhatsapp: motorista.whatsapp,
            plano: plano || 'mensal',
            valor,
            dataVencimento: new Date(dataVencimento),
            status: 'pendente'
        });

        res.json({ sucesso: true, mensalidade });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Confirmar pagamento
router.post('/:id/confirmar', async (req, res) => {
    try {
        const { observacao } = req.body;
        const mensalidade = await MensalidadeService.confirmarPagamento(req.params.id, observacao);
        
        // Gerar próxima mensalidade automaticamente
        if (mensalidade) {
            await MensalidadeService.gerarProximaMensalidade(
                mensalidade.motoristaId,
                mensalidade.plano,
                mensalidade.valor
            );
        }

        res.json({ sucesso: true, mensalidade });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Bloquear motorista
router.post('/bloquear/:motoristaId', async (req, res) => {
    try {
        await MensalidadeService.bloquearMotorista(req.params.motoristaId);
        res.json({ sucesso: true, mensagem: 'Motorista bloqueado' });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Desbloquear motorista
router.post('/desbloquear/:motoristaId', async (req, res) => {
    try {
        await MensalidadeService.desbloquearMotorista(req.params.motoristaId);
        res.json({ sucesso: true, mensagem: 'Motorista desbloqueado' });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// Verificar vencimentos (pode ser chamado por cron)
router.post('/verificar-vencimentos', async (req, res) => {
    try {
        const notificacoes = await MensalidadeService.verificarVencimentos();
        res.json({ sucesso: true, notificacoes });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;
