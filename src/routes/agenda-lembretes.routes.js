const express = require('express');
const router  = express.Router();
const LembreteAgenda = require('../models/LembreteAgenda');
const { AdminAgenda } = require('../models/AgendaServico');
const mongoose = require('mongoose');

// Auth por token simples — igual ao resto da Agenda
async function authAgendaMiddleware(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim() || req.query.token || '';
    if (!token) return res.status(401).json({ erro: 'Token obrigatorio' });
    const admin = await AdminAgenda.findOne({ token }).lean();
    if (!admin) return res.status(401).json({ erro: 'Token invalido' });
    req.adminAgendaId = String(admin._id);
    req.adminToken = token;
    next();
  } catch(e) { res.status(401).json({ erro: e.message }); }
}

// GET — listar lembretes: busca na LembreteAgenda + admin.config.lembretes (WhatsApp)
router.get('/', authAgendaMiddleware, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const _oid = mongoose.Types.ObjectId.isValid(adminId) ? new mongoose.Types.ObjectId(adminId) : null;

    // 1. Lembretes criados pelo painel (collection LembreteAgenda)
    const doCollection = await LembreteAgenda.find({
      $or: _oid ? [{ adminId: _oid }, { adminId: adminId }] : [{ adminId: adminId }]
    }).sort({ dataEvento: 1 }).limit(50).lean();

    // 2. Lembretes criados pelo WhatsApp (admin.config.lembretes)
    const admin = await AdminAgenda.findById(adminId).select('config').lean();
    const doWhatsApp = (admin?.config?.lembretes || [])
      .filter(l => !l.enviado && l.dataEvento)
      .map((l, i) => ({
        _id: l._id || ('wpp_' + i),
        adminId: adminId,
        texto: l.texto,
        dataEvento: l.dataEvento,
        dataAviso: l.dataAviso,
        antecedencia: 30,
        enviado: false,
        origem: 'whatsapp',
        criadoEm: l.criadoEm
      }))
      .sort((a, b) => new Date(a.dataEvento) - new Date(b.dataEvento));

    // Unificar e ordenar por dataEvento
    const todos = [...doCollection, ...doWhatsApp]
      .sort((a, b) => new Date(a.dataEvento) - new Date(b.dataEvento));

    console.log('[LEMBRETES] adminId:', adminId, '| colecao:', doCollection.length, '| whatsapp:', doWhatsApp.length);
    res.json({ sucesso: true, lembretes: todos });
  } catch(e) {
    console.error('[LEMBRETES] erro GET:', e.message);
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});

// POST — criar lembrete pelo painel (salva na collection)
router.post('/', authAgendaMiddleware, async (req, res) => {
  try {
    const { texto, data, hora, antecedencia } = req.body;
    if (!texto || !data || !hora) return res.status(400).json({ sucesso: false, mensagem: 'Preencha todos os campos.' });

    const [ano, mes, dia] = data.split('-').map(Number);
    const [h, min]        = hora.split(':').map(Number);
    const dataEvento      = new Date(ano, mes - 1, dia, h, min, 0);
    const dataAviso       = new Date(dataEvento.getTime() - (antecedencia || 30) * 60000);

    const lembrete = await LembreteAgenda.create({
      adminId:      req.adminAgendaId,
      texto,
      dataEvento,
      dataAviso,
      antecedencia: antecedencia || 30
    });
    res.json({ sucesso: true, lembrete });
  } catch(e) {
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});

// DELETE — remover lembrete
router.delete('/:id', authAgendaMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const adminId = req.adminAgendaId;

    // Se for lembrete do WhatsApp (id começa com 'wpp_' ou não é ObjectId)
    if (!mongoose.Types.ObjectId.isValid(id)) {
      // Remover do array config.lembretes — por índice não é seguro, então remove por texto+data
      return res.json({ sucesso: true, aviso: 'Para cancelar lembretes do WhatsApp, manda "cancela lembrete N" no WhatsApp.' });
    }

    await LembreteAgenda.findOneAndDelete({ _id: id, adminId: adminId });
    res.json({ sucesso: true });
  } catch(e) {
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});

module.exports = router;
