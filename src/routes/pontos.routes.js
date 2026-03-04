const express = require('express');
const router = express.Router();
const { PontoEmbarque, FilaPonto, Motorista } = require('../models');
const MapsService = require('../services/maps.service');

// Middleware auth admin
const authAdmin = async (req, res, next) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ erro: 'Sem adminId' });
    req.adminId = adminId;
    next();
};

// Listar pontos do admin
router.get('/', authAdmin, async (req, res) => {
    try {
        const pontos = await PontoEmbarque.find({ adminId: req.adminId }).sort({ nome: 1 });
        res.json(pontos);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar ponto
router.post('/', authAdmin, async (req, res) => {
    try {
        const { nome, endereco, diasSemana, horarioAbertura, horarioFechamento, maxCorridasPonto, maxCorridasBroadcast } = req.body;
        let lat, lng;
        try {
            const geo = await MapsService.geocodificar(endereco);
            lat = geo?.latitude; lng = geo?.longitude;
        } catch(e) {}
        const ponto = await PontoEmbarque.create({
            adminId: req.adminId, nome, endereco, lat, lng,
            diasSemana: diasSemana || [1,2,3,4,5],
            horarioAbertura: horarioAbertura || '06:00',
            horarioFechamento: horarioFechamento || '22:00',
            maxCorridasPonto: maxCorridasPonto || 3,
            maxCorridasBroadcast: maxCorridasBroadcast || 5
        });
        res.json({ sucesso: true, ponto });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar ponto
router.put('/:id', authAdmin, async (req, res) => {
    try {
        const ponto = await PontoEmbarque.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            req.body, { new: true }
        );
        res.json({ sucesso: true, ponto });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Deletar ponto
router.delete('/:id', authAdmin, async (req, res) => {
    try {
        await PontoEmbarque.deleteOne({ _id: req.params.id, adminId: req.adminId });
        await FilaPonto.deleteMany({ pontoId: req.params.id });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Motorista entra no ponto
router.post('/:id/entrar', async (req, res) => {
    try {
        const { motoristaId } = req.body;
        const ponto = await PontoEmbarque.findById(req.params.id);
        if (!ponto) return res.status(404).json({ erro: 'Ponto não encontrado' });

        // Verificar se já está na fila
        const jaEsta = await FilaPonto.findOne({ pontoId: req.params.id, motoristaId, status: 'aguardando' });
        if (jaEsta) return res.json({ sucesso: true, mensagem: 'Já está no ponto', fila: jaEsta });

        // Calcular ordem de chegada
        const ultimoNaFila = await FilaPonto.findOne({ pontoId: req.params.id, status: 'aguardando' }).sort({ ordemChegada: -1 });
        const ordemChegada = (ultimoNaFila?.ordemChegada || 0) + 1;

        const motorista = await Motorista.findById(motoristaId);
        const entrada = await FilaPonto.create({
            adminId: ponto.adminId,
            pontoId: req.params.id,
            motoristaId,
            motoristaNome: motorista?.nomeCompleto || 'Motorista',
            ordemChegada,
            status: 'aguardando'
        });

        // Contar fila atual
        const totalFila = await FilaPonto.countDocuments({ pontoId: req.params.id, status: 'aguardando' });
        res.json({ sucesso: true, ordemChegada, totalFila, entrada });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Motorista sai do ponto
router.post('/:id/sair', async (req, res) => {
    try {
        const { motoristaId } = req.body;
        await FilaPonto.updateOne(
            { pontoId: req.params.id, motoristaId, status: 'aguardando' },
            { status: 'saiu' }
        );
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Ver fila atual de um ponto
router.get('/:id/fila', authAdmin, async (req, res) => {
    try {
        const fila = await FilaPonto.find({ pontoId: req.params.id, status: 'aguardando' }).sort({ ordemChegada: 1 });
        res.json(fila);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Listar pontos ativos para o motorista (com status do ponto - aberto/fechado)
router.get('/motorista/:adminId', async (req, res) => {
    try {
        const agora = new Date();
        const diaSemana = agora.getDay();
        const hora = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
        
        const pontos = await PontoEmbarque.find({ adminId: req.params.adminId, ativo: true });
        const pontosComStatus = await Promise.all(pontos.map(async p => {
            const aberto = p.diasSemana.includes(diaSemana) && hora >= p.horarioAbertura && hora <= p.horarioFechamento;
            const totalFila = await FilaPonto.countDocuments({ pontoId: p._id, status: 'aguardando' });
            return { ...p.toObject(), aberto, totalFila };
        }));
        res.json(pontosComStatus);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
