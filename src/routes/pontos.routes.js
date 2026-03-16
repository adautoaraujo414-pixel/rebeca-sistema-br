const express = require('express');
const router = express.Router();
const { PontoEmbarque, FilaPonto, Motorista } = require('../models');
const MapsService = require('../services/maps.service');

const authAdmin = async (req, res, next) => {
    const adminId = req.headers['x-admin-id'] || req.query.adminId || req.body?.adminId;
    if (!adminId) return res.status(401).json({ erro: 'Sem adminId' });
    req.adminId = adminId;
    next();
};

// Listar centrais
router.get('/', authAdmin, async (req, res) => {
    try {
        const centrais = await PontoEmbarque.find({ adminId: req.adminId }).sort({ principal: -1, nome: 1 });
        res.json(centrais);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Criar central
router.post('/', authAdmin, async (req, res) => {
    try {
        const { nome, endereco, diasSemana, horarioAbertura, horarioFechamento, 
                maxCorridasPonto, tempoAceiteSegundos, principal } = req.body;
        let lat, lng;
        try {
            const geo = await MapsService.geocodificar(endereco);
            lat = geo?.latitude; lng = geo?.longitude;
        } catch(e) {}
        // Se for principal, desmarcar as outras
        if (principal) {
            await PontoEmbarque.updateMany({ adminId: req.adminId }, { principal: false });
        }
        const central = await PontoEmbarque.create({
            adminId: req.adminId, nome, endereco, lat, lng,
            diasSemana: diasSemana || [1,2,3,4,5,6,0],
            horarioAbertura: horarioAbertura || '06:00',
            horarioFechamento: horarioFechamento || '22:00',
            maxCorridasPonto: maxCorridasPonto || 3,
            tempoAceiteSegundos: tempoAceiteSegundos || 30,
            principal: principal || false
        });
        res.json({ sucesso: true, central });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar central
router.put('/:id', authAdmin, async (req, res) => {
    try {
        if (req.body.principal) {
            await PontoEmbarque.updateMany({ adminId: req.adminId }, { principal: false });
        }
        const central = await PontoEmbarque.findOneAndUpdate(
            { _id: req.params.id, adminId: req.adminId },
            req.body, { new: true }
        );
        res.json({ sucesso: true, central });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Deletar central
router.delete('/:id', authAdmin, async (req, res) => {
    try {
        await PontoEmbarque.deleteOne({ _id: req.params.id, adminId: req.adminId });
        await FilaPonto.deleteMany({ pontoId: req.params.id });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Motorista entra na central (sai de qualquer outra automaticamente)
router.post('/:id/entrar', async (req, res) => {
    try {
        const { motoristaId } = req.body;
        const central = await PontoEmbarque.findById(req.params.id);
        if (!central) return res.status(404).json({ erro: 'Central não encontrada' });

        // Verificar se ponto está aberto
        const agora = new Date();
        const dia = agora.getDay();
        const hora = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
        if (!central.diasSemana.includes(dia) || hora < central.horarioAbertura || hora > central.horarioFechamento) {
            return res.status(400).json({ erro: `Central fechada. Funciona ${central.horarioAbertura}–${central.horarioFechamento}` });
        }

        // Sair de qualquer outra central automaticamente
        await FilaPonto.updateMany({ motoristaId, status: 'aguardando' }, { status: 'saiu' });

        // Verificar se já está nesta
        const jaEsta = await FilaPonto.findOne({ pontoId: req.params.id, motoristaId, status: 'aguardando' });
        if (jaEsta) return res.json({ sucesso: true, mensagem: 'Já está nesta central', ordemChegada: jaEsta.ordemChegada });

        // Ordem de chegada
        const ultimo = await FilaPonto.findOne({ pontoId: req.params.id, status: 'aguardando' }).sort({ ordemChegada: -1 });
        const ordemChegada = (ultimo?.ordemChegada || 0) + 1;

        const motorista = await Motorista.findById(motoristaId);
        await FilaPonto.create({
            adminId: central.adminId,
            pontoId: req.params.id,
            motoristaId,
            motoristaNome: motorista?.nomeCompleto || 'Motorista',
            ordemChegada,
            status: 'aguardando'
        });

        const totalFila = await FilaPonto.countDocuments({ pontoId: req.params.id, status: 'aguardando' });
        res.json({ sucesso: true, ordemChegada, totalFila });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Motorista sai da central
router.post('/:id/sair', async (req, res) => {
    try {
        const { motoristaId } = req.body;
        await FilaPonto.updateOne({ pontoId: req.params.id, motoristaId, status: 'aguardando' }, { status: 'saiu' });
        res.json({ sucesso: true });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Ver fila atual
router.get('/:id/fila', authAdmin, async (req, res) => {
    try {
        const fila = await FilaPonto.find({ pontoId: req.params.id, status: 'aguardando' }).sort({ ordemChegada: 1 });
        res.json(fila);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Centrais para o motorista ver
router.get('/motorista/:adminId', async (req, res) => {
    try {
        const agora = new Date();
        const dia = agora.getDay();
        const hora = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');
        const centrais = await PontoEmbarque.find({ adminId: req.params.adminId }).sort({ principal: -1, ativo: -1, nome: 1 });
        const result = await Promise.all(centrais.map(async c => {
            // aberto = ativo E dentro do horário E dia correto
            const aberto = c.ativo &&
                           (c.diasSemana || []).includes(dia) &&
                           hora >= (c.horarioAbertura || '00:00') &&
                           hora <= (c.horarioFechamento || '23:59');
            const totalFila = await FilaPonto.countDocuments({ pontoId: c._id, status: 'aguardando' });
            return { ...c.toObject(), aberto, totalFila };
        }));
        res.json(result);
    } catch(e) { res.status(500).json({ erro: e.message }); }
});


// Posição atual do motorista na fila (qualquer central)
router.get('/motorista-fila/:motoristaId', async (req, res) => {
    try {
        // Buscar fila ativa (aguardando) ou em corrida (para saber de onde veio)
        const fila = await FilaPonto.findOne({ 
            motoristaId: req.params.motoristaId, 
            status: { $in: ['aguardando'] }
        }).sort({ chegadaEm: -1 });
        if (!fila) return res.json({ pontoId: null });
        const ponto = await PontoEmbarque.findById(fila.pontoId);
        const totalFila = await FilaPonto.countDocuments({ pontoId: fila.pontoId, status: 'aguardando' });
        res.json({ pontoId: fila.pontoId?.toString(), ordemChegada: fila.ordemChegada, totalFila, nomeCentral: ponto?.nome || '' });
    } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
