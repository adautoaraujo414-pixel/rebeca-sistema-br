// ============================================
// ROTAS FINANCEIRO + CONTAS A PAGAR + FILA DE ENCAIXE
// Rebeca Agenda
// ============================================
const mongoose = require('mongoose');
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
    const admin = await AdminAgendaAuth.findOne({ token });
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
    // Query compatível com adminId salvo como ObjectId ou String
    const mongoose = require('mongoose');
    const _sid = String(req.adminId);
    const _oid = mongoose.Types.ObjectId.isValid(_sid) ? new mongoose.Types.ObjectId(_sid) : null;
    const _filtroAdmin = _oid ? { $or: [{ adminId: _oid }, { adminId: _sid }] } : { adminId: req.adminId };
    const [receitas, despesas, contas, agendamentos] = await Promise.all([
      FinanceiroAgenda.find({ ..._filtroAdmin, tipo: 'receita', data: { $gte: inicio, $lte: fim } }),
      FinanceiroAgenda.find({ ..._filtroAdmin, tipo: 'despesa', data: { $gte: inicio, $lte: fim } }),
      ContaPagarAgenda.find({ ..._filtroAdmin, vencimento: { $gte: inicio, $lte: fim } }),
      AgendamentoAgenda.find({ ..._filtroAdmin, dataHora: { $gte: inicio, $lte: fim }, status: { $ne: 'cancelado' } })
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
    const mongoose2 = require('mongoose');
    const _sid2 = String(req.adminId);
    const _oid2 = mongoose2.Types.ObjectId.isValid(_sid2) ? new mongoose2.Types.ObjectId(_sid2) : null;
    const _fa2 = _oid2 ? { $or: [{ adminId: _oid2 }, { adminId: _sid2 }] } : { adminId: req.adminId };
    const query = { ..._fa2, data: { $gte: inicio, $lte: fim } };
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

// ── EXPORT PDF FINANCEIRO ─────────────────────────────────────────
router.get('/financeiro/exportar-pdf', authAgenda, async (req, res) => {
  try {
    const { mes, ano } = req.query;
    const m = parseInt(mes) || new Date().getMonth() + 1;
    const a = parseInt(ano) || new Date().getFullYear();
    const inicio = new Date(a, m - 1, 1);
    const fim = new Date(a, m, 0, 23, 59, 59);
    const mongoose = require('mongoose');
    const _sid = String(req.adminId);
    const _oid = mongoose.Types.ObjectId.isValid(_sid) ? new mongoose.Types.ObjectId(_sid) : null;
    const _f = _oid ? { $or: [{ adminId: _oid }, { adminId: _sid }] } : { adminId: req.adminId };

    const [receitas, despesas, admin] = await Promise.all([
      FinanceiroAgenda.find({ ..._f, tipo: 'receita', data: { $gte: inicio, $lte: fim } }).sort({ data: 1 }),
      FinanceiroAgenda.find({ ..._f, tipo: 'despesa', data: { $gte: inicio, $lte: fim } }).sort({ data: 1 }),
      AdminAgenda.findById(req.adminId).select('nome nomeNegocio email')
    ]);

    const totalR = receitas.reduce((s, r) => s + r.valor, 0);
    const totalD = despesas.reduce((s, d) => s + d.valor, 0);
    const lucro  = totalR - totalD;
    const meses  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    // Agrupar despesas por categoria
    const porCat = {};
    despesas.forEach(d => {
      const c = d.categoria || 'outros';
      if (!porCat[c]) porCat[c] = { total: 0, itens: [] };
      porCat[c].total += d.valor;
      porCat[c].itens.push(d);
    });

    const fmt = v => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    const fmtData = d => new Date(d).toLocaleDateString('pt-BR');

    const catRows = Object.entries(porCat).sort((a,b) => b[1].total - a[1].total).map(([cat, dados]) => `
      <tr class="cat-header">
        <td colspan="3"><strong>📂 ${cat.toUpperCase()}</strong></td>
        <td><strong>${fmt(dados.total)}</strong></td>
      </tr>
      ${dados.itens.map(i => `<tr class="item-row">
        <td style="padding-left:20px">${fmtData(i.data)}</td>
        <td colspan="2">${i.descricao || '-'}</td>
        <td>${fmt(i.valor)}</td>
      </tr>`).join('')}
    `).join('');

    const receitaRows = receitas.map(r => `<tr class="item-row">
      <td>${fmtData(r.data)}</td>
      <td>${r.descricao || '-'}</td>
      <td>${r.categoria || '-'}</td>
      <td>${fmt(r.valor)}</td>
    </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Financeiro — ${meses[m-1]} ${a}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 30px; }
  h1 { font-size: 22px; color: #6c47ff; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  .cards { display: flex; gap: 16px; margin-bottom: 28px; }
  .card { flex: 1; border-radius: 10px; padding: 16px 20px; }
  .card.rec { background: #e8faf0; border-left: 4px solid #22c55e; }
  .card.des { background: #fef2f2; border-left: 4px solid #ef4444; }
  .card.luc { background: #f0f4ff; border-left: 4px solid #6c47ff; }
  .card-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .5px; }
  .card-val { font-size: 22px; font-weight: bold; margin-top: 4px; }
  .card.rec .card-val { color: #16a34a; }
  .card.des .card-val { color: #dc2626; }
  .card.luc .card-val { color: #6c47ff; }
  h2 { font-size: 15px; color: #333; margin: 24px 0 10px; border-bottom: 2px solid #eee; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #f5f5f5; text-align: left; padding: 8px 10px; font-size: 12px; color: #555; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
  .cat-header td { background: #f8f6ff; color: #6c47ff; padding: 8px 10px; }
  .item-row td { font-size: 12px; color: #444; }
  .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #aaa; }
  @media print { body { padding: 10px; } }
</style></head><body>
<h1>📊 Relatório Financeiro</h1>
<div class="sub">${admin?.nomeNegocio || admin?.nome || ''} — ${meses[m-1]} de ${a}</div>

<div class="cards">
  <div class="card rec"><div class="card-label">Total Receitas</div><div class="card-val">${fmt(totalR)}</div><div style="font-size:11px;color:#666;margin-top:4px">${receitas.length} lançamento(s)</div></div>
  <div class="card des"><div class="card-label">Total Despesas</div><div class="card-val">${fmt(totalD)}</div><div style="font-size:11px;color:#666;margin-top:4px">${despesas.length} lançamento(s)</div></div>
  <div class="card luc"><div class="card-label">Lucro Líquido</div><div class="card-val">${fmt(lucro)}</div><div style="font-size:11px;color:#666;margin-top:4px">${lucro >= 0 ? '✅ Positivo' : '⚠️ Negativo'}</div></div>
</div>

<h2>💸 Despesas por Categoria</h2>
<table><thead><tr><th>Data</th><th>Descrição</th><th></th><th>Valor</th></tr></thead><tbody>${catRows || '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">Nenhuma despesa</td></tr>'}</tbody></table>

<h2>💰 Receitas</h2>
<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${receitaRows || '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">Nenhuma receita</td></tr>'}</tbody></table>

<div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} — Sistema Rebeca</div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="financeiro-${a}-${String(m).padStart(2,'0')}.html"`);
    res.send(html);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});
