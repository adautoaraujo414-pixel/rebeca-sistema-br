const express = require('express');
const router = express.Router();
const MensalidadeService = require('../services/mensalidade.service');
const { Motorista, Admin } = require('../models');
const jwt = require('jsonwebtoken');

// Middleware para extrair adminId do token
const getAdminId = async (req) => {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) return null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rebeca_secret');
        return decoded.adminId || decoded.id || decoded._id || null;
    } catch(e) { return null; }
};

// Listar todas mensalidades
router.get('/', async (req, res) => {
    try {
        const { status, motoristaId } = req.query;
        const adminId = await getAdminId(req);
        const mensalidades = await MensalidadeService.listar({ status, motoristaId, adminId });
        res.json(mensalidades);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Estatísticas
router.get('/estatisticas', async (req, res) => {
    try {
        const adminId = await getAdminId(req);
        const stats = await MensalidadeService.estatisticas(adminId);
        res.json(stats);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Config financeiro
router.get('/config', async (req, res) => {
    try {    const config = await MensalidadeService.getConfigFinanceiro();
    res.json(config);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/config', async (req, res) => {
    try {    const config = await MensalidadeService.salvarConfigFinanceiro(req.body);
    res.json({ sucesso: true, config });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Buscar por motorista
router.get('/motorista/:motoristaId', async (req, res) => {
    try {    const mensalidades = await MensalidadeService.buscarPorMotorista(req.params.motoristaId);
    res.json(mensalidades);
    } catch(e) { res.status(500).json({ erro: e.message }); }
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
