const express = require('express');
const router = express.Router();
const EvolutionMultiService = require('../services/evolution-multi.service');
const { InstanciaWhatsapp } = require('../models');

router.post('/instancia', async (req, res) => {
    const { adminId, nomeEmpresa } = req.body;
    if (!adminId || !nomeEmpresa) return res.status(400).json({ erro: 'adminId e nomeEmpresa obrigatorios' });
    const resultado = await EvolutionMultiService.criarInstancia(adminId, nomeEmpresa);
    res.json(resultado);
});

router.get('/instancia/:id/qrcode', async (req, res) => {
    const resultado = await EvolutionMultiService.gerarQRCode(req.params.id);
    res.json(resultado);
});

router.get('/instancia/:id/status', async (req, res) => {
    const resultado = await EvolutionMultiService.verificarStatus(req.params.id);
    res.json(resultado);
});

router.post('/instancia/:id/desconectar', async (req, res) => {
    const resultado = await EvolutionMultiService.desconectar(req.params.id);
    res.json(resultado);
});

router.post('/instancia/:id/enviar', async (req, res) => {
    const { telefone, mensagem } = req.body;
    if (!telefone || !mensagem) return res.status(400).json({ erro: 'telefone e mensagem obrigatorios' });
    const resultado = await EvolutionMultiService.enviarMensagem(req.params.id, telefone, mensagem);
    res.json(resultado);
});

router.get('/instancias', async (req, res) => {
    const resultado = await EvolutionMultiService.listarTodas();
    res.json(resultado);
});

router.get('/instancias/admin/:adminId', async (req, res) => {
    const resultado = await EvolutionMultiService.listarPorAdmin(req.params.adminId);
    res.json(resultado);
});

router.delete('/instancia/:id', async (req, res) => {
    const resultado = await EvolutionMultiService.deletarInstancia(req.params.id);
    res.json(resultado);
});

router.post('/webhook/:nomeInstancia', async (req, res) => {
    const { nomeInstancia } = req.params;
    console.log('[WEBHOOK ' + nomeInstancia + ']');
    if (req.body.event === 'connection.update') {
        try {
            const instancia = await InstanciaWhatsapp.findOne({ nomeInstancia });
            if (instancia) {
                instancia.status = req.body.data?.state === 'open' ? 'conectado' : 'desconectado';
                if (req.body.data?.state === 'open') instancia.ultimaConexao = new Date();
                await instancia.save();
            }
        } catch (e) { console.error('Erro webhook:', e.message); }
    }
    res.json({ received: true });
});

module.exports = router;