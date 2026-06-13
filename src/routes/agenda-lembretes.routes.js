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
      .filter(l => !l.enviado)
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
    const { texto, data, hora, antecedencia, recorrente, recorrencia } = req.body;
    if (!texto) return res.status(400).json({ sucesso: false, mensagem: 'Texto obrigatorio.' });

    let dataEvento = null, dataAviso = null;

    if (recorrente && recorrencia) {
      // Lembrete recorrente — calcular proxima ocorrencia
      const diasMap = { segunda:1, terca:2, quarta:3, quinta:4, sexta:5, sabado:6, domingo:0 };
      const diaNorm = (recorrencia.diaSemana||'').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g,'');
      const diaAlvo = diasMap[diaNorm] ?? null;
      if (diaAlvo !== null) {
        const agora = new Date();
        const proxData = new Date(agora);
        const diffDias = (diaAlvo - agora.getDay() + 7) % 7 || 7;
        proxData.setUTCDate(proxData.getUTCDate() + diffDias);
        const h = recorrencia.hora ?? 8;
        const min = recorrencia.minuto ?? 0;
        proxData.setUTCHours(h + 3, min, 0, 0);
        dataEvento = proxData;
        dataAviso = new Date(dataEvento.getTime() - (antecedencia || 30) * 60000);
      }
    } else if (data && hora) {
      const [ano, mes, dia] = data.split('-').map(Number);
      const [h, min]        = hora.split(':').map(Number);
      dataEvento = new Date(Date.UTC(ano, mes - 1, dia, h + 3, min, 0));
      dataAviso  = new Date(dataEvento.getTime() - (antecedencia || 30) * 60000);
    } else {
      return res.status(400).json({ sucesso: false, mensagem: 'Informe data+hora ou configure recorrencia.' });
    }

    const lembrete = await LembreteAgenda.create({
      adminId:      req.adminAgendaId,
      texto,
      dataEvento,
      dataAviso,
      antecedencia: antecedencia || 30,
      recorrente:   !!recorrente,
      recorrencia:  recorrencia || null,
      origem:       'painel'
    });
    res.json({ sucesso: true, lembrete });
  } catch(e) {
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});

// PATCH — marcar enviado ou avancar recorrente
router.patch('/:id/enviado', authAgendaMiddleware, async (req, res) => {
  try {
    const lmb = await LembreteAgenda.findOne({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!lmb) return res.status(404).json({ sucesso: false, mensagem: 'Nao encontrado' });
    if (lmb.recorrente && lmb.recorrencia) {
      lmb.dataEvento = new Date(lmb.dataEvento.getTime() + 7 * 24 * 60 * 60 * 1000);
      lmb.dataAviso  = new Date(lmb.dataEvento.getTime() - (lmb.antecedencia || 30) * 60000);
      lmb.enviado    = false;
    } else {
      lmb.enviado   = true;
      lmb.dataEnvio = new Date();
    }
    await lmb.save();
    res.json({ sucesso: true, lembrete: lmb });
  } catch(e) { res.status(500).json({ sucesso: false, mensagem: e.message }); }
});

// DELETE — remover lembrete
router.delete('/:id', authAgendaMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const adminId = req.adminAgendaId;

    // Se for lembrete do WhatsApp (id começa com 'wpp_' ou não é ObjectId)
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const admin = await AdminAgenda.findById(adminId).select('config').lean();
      const lembretes = admin?.config?.lembretes || [];
      // wpp_N — remover pelo índice
      const idx = parseInt((id + '').replace('wpp_', ''), 10);
      if (!isNaN(idx) && lembretes[idx]) {
        lembretes.splice(idx, 1);
      }
      await AdminAgenda.findByIdAndUpdate(adminId, { 'config.lembretes': lembretes });
      return res.json({ sucesso: true });
    }

    await LembreteAgenda.findOneAndDelete({ _id: id, adminId: adminId });
    res.json({ sucesso: true });
  } catch(e) {
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});

module.exports = router;
