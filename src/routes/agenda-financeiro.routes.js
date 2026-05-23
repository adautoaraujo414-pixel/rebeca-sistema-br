// ============================================
// ROTAS FINANCEIRO + CONTAS A PAGAR + FILA DE ENCAIXE
// Rebeca Agenda
// ============================================
const express = require('express');
const router = express.Router();
const { AdminAgenda, AgendamentoAgenda, ServicoAgenda, ClienteAgenda } = require('../models/AgendaServico');
const { FinanceiroAgenda, ContaPagarAgenda, FilaEncaixeAgenda } = require('../models/AgendaServico');
// Middleware auth — token simples (compatível com agenda.routes.js)
async function authAgenda(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim() || req.query.token || '';
    if (!token) return res.status(401).json({ erro: 'Token obrigatório' });
    const { AdminAgenda: AdminAgendaAuth } = require('../models/AgendaServico');
    const admin = await AdminAgendaAuth.findOne({ token, ativo: true });
    if (!admin) return res.status(401).json({ erro: 'Token inválido' });
    req.adminId = admin._id;
    req.admin   = admin;
    next();
  } catch(e) { res.status(401).json({ erro: e.message }); }
}

// =================== FINANCEIRO ===================

// GET resumo financeiro do mes
router.get('/financeiro/resumo', authAgenda, async (req, res) => {
  try {
    const { mes, ano } = req.query;
    const m = parseInt(mes) || new Date().getMonth() + 1;
    const a = parseInt(ano) || new Date().getFullYear();
    const inicio = new Date(a, m - 1, 1);
    const fim = new Date(a, m, 0, 23, 59, 59);

    const [receitas, despesas, contas, agendamentos] = await Promise.all([
      FinanceiroAgenda.find({ adminId: req.adminId, tipo: 'receita', data: { $gte: inicio, $lte: fim } }),
      FinanceiroAgenda.find({ adminId: req.adminId, tipo: 'despesa', data: { $gte: inicio, $lte: fim } }),
      ContaPagarAgenda.find({ adminId: req.adminId, vencimento: { $gte: inicio, $lte: fim } }),
      AgendamentoAgenda.find({ adminId: req.adminId, dataHora: { $gte: inicio, $lte: fim }, status: { $ne: 'cancelado' } })
    ]);

    const totalReceitas = receitas.reduce((s, r) => s + r.valor, 0);
    const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
    const totalContas = contas.reduce((s, c) => s + c.valor, 0);
    const contasPendentes = contas.filter(c => !c.pago);
    const totalPendente = contasPendentes.reduce((s, c) => s + c.valor, 0);

    // Calcular horarios vazios (prejuizo potencial)
    const admin = await AdminAgenda.findById(req.adminId);
    const cfg = admin.config || {};
    const ab = cfg.horarioAbertura || '08:00';
    const fe = cfg.horarioFechamento || '18:00';
    const intervalo = cfg.intervaloAgendamento || 30;
    const [ha, ma] = ab.split(':').map(Number);
    const [hf, mf] = fe.split(':').map(Number);
    const slotsPerDia = Math.floor(((hf * 60 + mf) - (ha * 60 + ma)) / intervalo);
    const diasNoMes = fim.getDate();
    const totalSlots = slotsPerDia * diasNoMes;
    const slotsCheios = agendamentos.length;
    const slotsVazios = Math.max(0, totalSlots - slotsCheios);
    const servicos = await ServicoAgenda.find({ adminId: req.adminId, ativo: true });
    const precoMedio = servicos.length ? servicos.reduce((s, sv) => s + (sv.preco || 0), 0) / servicos.length : 0;
    const prejuizoPotencial = slotsVazios * precoMedio;

    res.json({
      sucesso: true,
      mes: m, ano: a,
      receitas: { total: totalReceitas, quantidade: receitas.length, itens: receitas },
      despesas: { total: totalDespesas, quantidade: despesas.length, itens: despesas },
      contas: { total: totalContas, pendente: totalPendente, itens: contas, pendentes: contasPendentes },
      lucro: totalReceitas - totalDespesas - totalContas,
      agendamentos: { total: agendamentos.length, slotsVazios, prejuizoPotencial: Math.round(prejuizoPotencial) },
      ia: {
        analise: prejuizoPotencial > 0
          ? `Voce perdeu R$ ${Math.round(prejuizoPotencial).toLocaleString('pt-BR')} este mes com ${slotsVazios} horarios vazios. Ative a lista de encaixe para preencher automaticamente.`
          : 'Agenda bem aproveitada este mes! Continue assim.',
        alertas: contasPendentes.map(c => `Conta a pagar: ${c.descricao} - R$ ${c.valor.toFixed(2)} vence em ${new Date(c.vencimento).toLocaleDateString('pt-BR')}`)
      }
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// GET lancamentos
router.get('/financeiro', authAgenda, async (req, res) => {
  try {
    const { mes, ano, tipo } = req.query;
    const m = parseInt(mes) || new Date().getMonth() + 1;
    const a = parseInt(ano) || new Date().getFullYear();
    const inicio = new Date(a, m - 1, 1);
    const fim = new Date(a, m, 0, 23, 59, 59);
    const query = { adminId: req.adminId, data: { $gte: inicio, $lte: fim } };
    if (tipo) query.tipo = tipo;
    const itens = await FinanceiroAgenda.find(query).sort({ data: -1 });
    res.json({ sucesso: true, itens });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// POST lancamento manual
router.post('/financeiro', authAgenda, async (req, res) => {
  try {
    const item = await FinanceiroAgenda.create({ adminId: req.adminId, ...req.body });
    res.json({ sucesso: true, item });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// DELETE lancamento
router.delete('/financeiro/:id', authAgenda, async (req, res) => {
  try {
    await FinanceiroAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminId });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// =================== CONTAS A PAGAR ===================

router.get('/contas-pagar', authAgenda, async (req, res) => {
  try {
    const { mes, ano, pago } = req.query;
    const query = { adminId: req.adminId };
    if (mes && ano) {
      const inicio = new Date(parseInt(ano), parseInt(mes) - 1, 1);
      const fim = new Date(parseInt(ano), parseInt(mes), 0, 23, 59, 59);
      query.vencimento = { $gte: inicio, $lte: fim };
    }
    if (pago !== undefined) query.pago = pago === 'true';
    const contas = await ContaPagarAgenda.find(query).sort({ vencimento: 1 });
    res.json({ sucesso: true, contas });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/contas-pagar', authAgenda, async (req, res) => {
  try {
    const conta = await ContaPagarAgenda.create({ adminId: req.adminId, ...req.body });
    res.json({ sucesso: true, conta });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/contas-pagar/:id', authAgenda, async (req, res) => {
  try {
    const conta = await ContaPagarAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminId },
      req.body, { new: true }
    );
    res.json({ sucesso: true, conta });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/contas-pagar/:id', authAgenda, async (req, res) => {
  try {
    await ContaPagarAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminId });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// =================== FILA DE ENCAIXE ===================

router.get('/fila-encaixe', authAgenda, async (req, res) => {
  try {
    const fila = await FilaEncaixeAgenda.find({ adminId: req.adminId, status: 'aguardando' })
      .populate('servicoId', 'nome duracao preco')
      .populate('profissionalId', 'nome')
      .sort({ createdAt: 1 });
    res.json({ sucesso: true, fila });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/fila-encaixe', authAgenda, async (req, res) => {
  try {
    const item = await FilaEncaixeAgenda.create({ adminId: req.adminId, ...req.body });
    res.json({ sucesso: true, item });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Quando agendamento cancelado — notificar proximo da fila
router.post('/fila-encaixe/notificar/:horario', authAgenda, async (req, res) => {
  try {
    const { horario, data } = req.body;
    const proximo = await FilaEncaixeAgenda.findOne({
      adminId: req.adminId, status: 'aguardando'
    }).sort({ createdAt: 1 });
    if (!proximo) return res.json({ sucesso: true, mensagem: 'Fila vazia' });
    proximo.status = 'notificado';
    proximo.notificadoEm = new Date();
    proximo.expiradoEm = new Date(Date.now() + 30 * 60000); // 30min para responder
    await proximo.save();
    res.json({
      sucesso: true,
      notificado: proximo,
      mensagem: `O horario das ${horario} acabou de liberar, deseja confirmar?`,
      whatsapp: proximo.telefoneCliente
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/fila-encaixe/:id', authAgenda, async (req, res) => {
  try {
    await FilaEncaixeAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminId });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
