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
    // Verificar bloqueio por trial expirado sem pagamento
    if (admin.statusPagamento === 'bloqueado') {
      return res.status(403).json({ erro: 'acesso_bloqueado', msg: 'Acesso bloqueado por falta de pagamento. Entre em contato.' });
    }
    // Trial expirado → bloquear chamadas de API (front trata)
    if (admin.statusPagamento === 'trial_expirado') {
      return res.status(403).json({ erro: 'trial_expirado', msg: 'Período de teste encerrado. Efetue o pagamento para continuar.' });
    }
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
    const _agora = new Date(Date.now() - 3*60*60*1000); // hora Brasil
    const m = parseInt(mes) || (_agora.getUTCMonth() + 1);
    const a = parseInt(ano) || _agora.getUTCFullYear();
    // Início e fim em UTC compensando GMT-3: dia 1 às 03:00 UTC = 00:00 BRT
    const inicio = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0));
    const fim    = new Date(Date.UTC(a, m,     0, 26, 59, 59)); // último dia às 23:59:59 BRT = 02:59:59 UTC do dia seguinte
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
    const _agora = new Date(Date.now() - 3*60*60*1000); // hora Brasil
    const m = parseInt(mes) || (_agora.getUTCMonth() + 1);
    const a = parseInt(ano) || _agora.getUTCFullYear();
    // Início e fim em UTC compensando GMT-3: dia 1 às 03:00 UTC = 00:00 BRT
    const inicio = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0));
    const fim    = new Date(Date.UTC(a, m,     0, 26, 59, 59)); // último dia às 23:59:59 BRT = 02:59:59 UTC do dia seguinte
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
    const _del = await FinanceiroAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminId });
    if (!_del) return res.status(404).json({ erro: 'Lançamento não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// =================== CONTAS A PAGAR ===================

router.get('/contas-pagar', authAgenda, async (req, res) => {
  try {
    const { mes, ano, pago } = req.query;
    const query = { adminId: req.adminId };
    if (mes && ano) {
      const inicio = new Date(Date.UTC(parseInt(ano), parseInt(mes) - 1, 1, 3, 0, 0));
      const fim    = new Date(Date.UTC(parseInt(ano), parseInt(mes), 0, 26, 59, 59));
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
    if (!conta) return res.status(404).json({ erro: 'Conta a pagar não encontrado' });
    res.json({ sucesso: true, conta });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/contas-pagar/:id', authAgenda, async (req, res) => {
  try {
    const _del = await ContaPagarAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminId });
    if (!_del) return res.status(404).json({ erro: 'Conta a pagar não encontrado' });
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

// Quando agendamento cancelado - notificar proximo da fila
router.post('/fila-encaixe/notificar/:horario', authAgenda, async (req, res) => {
  try {
    const { horario, data, servicoId, profissionalId } = req.body;
    const filtro = { adminId: req.adminId, status: 'aguardando' };
    if (servicoId) filtro.servicoId = servicoId;
    if (profissionalId) filtro.profissionalId = profissionalId;
    let proximo = await FilaEncaixeAgenda.findOne(filtro).sort({ createdAt: 1 });
    // Fallback: se ninguem da fila pediu esse servico/profissional especifico, pega o proximo da fila geral
    if (!proximo && (servicoId || profissionalId)) {
      proximo = await FilaEncaixeAgenda.findOne({ adminId: req.adminId, status: 'aguardando' }).sort({ createdAt: 1 });
    }
    if (!proximo) return res.json({ sucesso: true, mensagem: 'Fila vazia' });
    proximo.status = 'notificado';
    proximo.notificadoEm = new Date();
    proximo.expiradoEm = new Date(Date.now() + 30 * 60000); // 30min para responder
    await proximo.save();
    const mensagemTexto = `Oi *${proximo.nomeCliente}*! \ud83d\ude0a O hor\u00e1rio das *${horario}*${data ? ' ('+data+')' : ''} acabou de ficar livre! Voc\u00ea quer confirmar esse hor\u00e1rio? Responde aqui que eu j\u00e1 garanto pra voc\u00ea! \ud83d\udc99`;
    // Envia WhatsApp de fato
    try {
      const { AdminAgenda, InstanciaWhatsapp } = require('../models/AgendaServico');
      const ModoDono = require('../services/agenda-modo-dono.service');
      const inst = await InstanciaWhatsapp.findOne({ adminId: String(req.adminId), status: 'conectado' }).lean();
      const instEnvio = inst || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };
      await ModoDono._enviarMsg(instEnvio, proximo.telefoneCliente, mensagemTexto).catch(()=>{});
    } catch(eNotif) { console.error('[FilaEncaixe] erro envio whatsapp:', eNotif.message); }
    res.json({
      sucesso: true,
      notificado: proximo,
      mensagem: mensagemTexto,
      whatsapp: proximo.telefoneCliente
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/fila-encaixe/:id', authAgenda, async (req, res) => {
  try {
    const _del = await FilaEncaixeAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminId });
    if (!_del) return res.status(404).json({ erro: 'Item da fila n\u00e3o encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ── EXPORT PDF FINANCEIRO ─────────────────────────────────────────
router.get('/financeiro/exportar-pdf', authAgenda, async (req, res) => {
  try {
    const { mes, ano, dataInicio, dataFim } = req.query;
    const _agora = new Date(Date.now() - 3*60*60*1000);
    let inicio, fim, periodoLabel;
    if (dataInicio && dataFim) {
      // Período personalizado: converter datas locais para UTC
      inicio = new Date(dataInicio + 'T03:00:00.000Z'); // meia-noite BRT = 03:00 UTC
      fim    = new Date(dataFim   + 'T26:59:59.999Z');
      // Ajustar fim para 23:59:59 BRT = próximo dia 02:59:59 UTC
      fim = new Date(dataFim + 'T00:00:00.000-03:00');
      fim.setHours(23, 59, 59, 999);
      const fmtPt = d => new Date(d).toLocaleDateString('pt-BR');
      periodoLabel = fmtPt(dataInicio + 'T12:00:00') + ' a ' + fmtPt(dataFim + 'T12:00:00');
    } else {
      const m = parseInt(mes) || (_agora.getUTCMonth() + 1);
      const a = parseInt(ano) || _agora.getUTCFullYear();
      inicio = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0));
      fim    = new Date(Date.UTC(a, m,     0, 26, 59, 59));
      const meses2 = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      periodoLabel = meses2[m-1] + ' de ' + a;
    }
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

    const fmt = v => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    const fmtData = d => new Date(d).toLocaleDateString('pt-BR');

    // Agrupar despesas por categoria, depois por data somando itens do mesmo dia
    const porCat = {};
    despesas.forEach(d => {
      const cat = d.categoria || 'outros';
      const dataKey = new Date(d.data).toISOString().slice(0,10); // YYYY-MM-DD
      if (!porCat[cat]) porCat[cat] = { total: 0, porData: {} };
      porCat[cat].total += d.valor;
      if (!porCat[cat].porData[dataKey]) porCat[cat].porData[dataKey] = { valor: 0, descricoes: [] };
      porCat[cat].porData[dataKey].valor += d.valor;
      if (d.descricao) porCat[cat].porData[dataKey].descricoes.push(d.descricao);
    });

    const catRows = Object.entries(porCat).sort((a,b) => b[1].total - a[1].total).map(([cat, dados]) => {
      const linhasDia = Object.entries(dados.porData).sort((a,b) => a[0].localeCompare(b[0])).map(([dataKey, info]) => {
        const desc = info.descricoes.length > 0 ? info.descricoes.join(', ') : '-';
        const dataFmt = new Date(dataKey + 'T12:00:00').toLocaleDateString('pt-BR');
        return `<tr class="item-row">
          <td style="padding-left:20px">${dataFmt}</td>
          <td colspan="2" style="color:#555">${desc}</td>
          <td>${fmt(info.valor)}</td>
        </tr>`;
      }).join('');
      return `
      <tr class="cat-header">
        <td colspan="3"><strong>📂 ${cat.toUpperCase()}</strong></td>
        <td><strong>${fmt(dados.total)}</strong></td>
      </tr>
      ${linhasDia}
    `;
    }).join('');

    const receitaRows = receitas.map(r => `<tr class="item-row">
      <td>${fmtData(r.data)}</td>
      <td>${r.descricao || '-'}</td>
      <td>${r.categoria || '-'}</td>
      <td>${fmt(r.valor)}</td>
    </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Financeiro — ${periodoLabel}</title>
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
<div class="sub">${admin?.nomeNegocio || admin?.nome || ''} — ${periodoLabel}</div>

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
    res.setHeader('Content-Disposition', `inline; filename="financeiro-${(dataInicio||'').replace(/-/g,'') || a+String(m||'').padStart(2,'0')}-${(dataFim||'').replace(/-/g,'')}.html"`);
    res.send(html);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
