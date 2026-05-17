const express = require('express');
const router  = express.Router();
const LembreteAgenda = require('../models/LembreteAgenda');
const { authAgendaMiddleware } = require('../middleware/authAgenda');

// GET — listar lembretes do admin
router.get('/', authAgendaMiddleware, async (req, res) => {
  try {
    const lembretes = await LembreteAgenda.find({ adminId: String(req.adminAgendaId) })
      .sort({ dataEvento: 1 }).limit(50).lean();
    res.json({ sucesso: true, lembretes });
  } catch(e) {
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});

// POST — criar lembrete
router.post('/', authAgendaMiddleware, async (req, res) => {
  try {
    const { texto, data, hora, antecedencia } = req.body;
    if (!texto || !data || !hora) return res.status(400).json({ sucesso: false, mensagem: 'Preencha todos os campos.' });

    const [ano, mes, dia] = data.split('-').map(Number);
    const [h, min]        = hora.split(':').map(Number);
    const dataEvento      = new Date(ano, mes - 1, dia, h, min, 0);

    const lembrete = await LembreteAgenda.create({
      adminId:      String(req.adminAgendaId),
      texto,
      dataEvento,
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
    await LembreteAgenda.findOneAndDelete({ _id: req.params.id, adminId: String(req.adminAgendaId) });
    res.json({ sucesso: true });
  } catch(e) {
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});

module.exports = router;
