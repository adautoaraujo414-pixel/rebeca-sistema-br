const express = require('express');
const router = express.Router();
const { AdminAgenda, ClienteAgenda, AgendamentoAgenda, RetornoAgenda } = require('../models/AgendaServico');

// ── AUTH (mesmo padrão da Agenda) ──────────────────────────────────────────
sed -n '11,25p' /workspaces/rebeca-sistema-br/src/routes/agenda-financeiro.routes.jsasync function authAgenda(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ','') || '';
    const admin = await AdminAgenda.findOne({ token, ativo: true });
    if (!admin) return res.status(401).json({ erro: 'Token inválido' });
    req.adminAgenda = admin;
    req.adminAgendaId = admin._id.toString();
    next();
  } catch(e) { res.status(500).json({ erro: e.message }); }
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function diasDesde(data) {
  if (!data) return null;
  return Math.floor((Date.now() - new Date(data)) / (24*60*60*1000));
}

function msgSugerida(tipo, nome, dias) {
  const n = (nome||'').split(' ')[0] || 'cliente';
  if (tipo === 'retorno')
    return `Olá, ${n}! Tudo bem? Passando para lembrar que está na época do seu retorno. Quer que eu veja um horário para você? 😊`;
  if (tipo === 'manutencao')
    return `Olá, ${n}! Já faz um tempinho desde o seu último atendimento. Quer agendar uma manutenção? 💛`;
  if (tipo === 'inativo')
    return `Oi, ${n}! Sentimos sua falta por aqui${dias ? ` (${dias} dias)` : ''}. Temos horários disponíveis esta semana. Quer que eu te envie algumas opções? 😊`;
  if (tipo === 'recadastramento')
    return `Olá, ${n}! Estamos atualizando nosso cadastro para melhorar seu atendimento. Pode confirmar seus dados? 🙏`;
  return `Olá, ${n}! Tudo bem? Gostaríamos de te ver novamente por aqui. Quer agendar um horário? 😊`;
}

// ══════════════════════════════════════════════════════════════════════════
// GET /api/agenda/crm/dashboard
// Cards de resumo para o painel CRM
// ══════════════════════════════════════════════════════════════════════════
router.get('/dashboard', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    const corte30 = new Date(Date.now() - 30*24*60*60*1000);
    const corte7  = new Date(Date.now() -  7*24*60*60*1000);

    // Retornos pendentes
    const retornosPendentes = await RetornoAgenda.countDocuments({ adminId, statusContato: 'pendente' });

    // Retornos para hoje
    const retornosHoje = await RetornoAgenda.countDocuments({
      adminId, statusContato: 'pendente',
      proximoContatoEm: { $gte: hoje, $lt: amanha }
    });

    // Clientes inativos 30 dias (sem agendamento futuro e último atendimento > 30 dias)
    const clientesInativos30 = await ClienteAgenda.countDocuments({
      adminId,
      ultimoAtendimento: { $lt: corte30, $exists: true },
      totalAtendimentos: { $gte: 1 }
    });

    // Contatos feitos hoje (statusContato atualizado hoje)
    const contatosHoje = await RetornoAgenda.countDocuments({
      adminId,
      statusContato: { $in: ['contatado','agendado'] },
      updatedAt: { $gte: hoje }
    });

    // Agendamentos recuperados (criados via retorno nos últimos 30 dias)
    const agendamentosRecuperados = await AgendamentoAgenda.countDocuments({
      adminId,
      createdAt: { $gte: corte30 },
      origem: 'whatsapp'
    });

    res.json({
      sucesso: true,
      cards: {
        retornosPendentes,
        retornosHoje,
        clientesInativos30,
        contatosHoje,
        agendamentosRecuperados
      }
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/agenda/crm/clientes-inativos?dias=30
// ══════════════════════════════════════════════════════════════════════════
router.get('/clientes-inativos', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const dias = parseInt(req.query.dias) || 30;
    const corte = new Date(Date.now() - dias*24*60*60*1000);

    // Buscar clientes com último atendimento anterior ao corte
    const clientes = await ClienteAgenda.find({
      adminId,
      ultimoAtendimento: { $lt: corte, $exists: true, $ne: null },
      totalAtendimentos: { $gte: 1 }
    }).sort({ ultimoAtendimento: 1 }).lean();

    // Filtrar quem não tem agendamento futuro
    const result = [];
    for (const c of clientes) {
      const agFuturo = await AgendamentoAgenda.findOne({
        adminId,
        telefoneCliente: c.telefone,
        dataHora: { $gte: new Date() },
        status: { $in: ['pendente','confirmado'] }
      }).lean();
      if (agFuturo) continue;

      const d = diasDesde(c.ultimoAtendimento);
      result.push({
        _id: c._id,
        nome: c.nome,
        telefone: c.telefone,
        ultimoAtendimento: c.ultimoAtendimento,
        ultimoServico: c.ultimoServico || '',
        diasSemVir: d,
        totalAtendimentos: c.totalAtendimentos,
        msgSugerida: msgSugerida('inativo', c.nome, d),
        acaoRecomendada: d > 60 ? 'recadastramento' : d > 30 ? 'retorno' : 'lembrete'
      });
    }

    res.json({ sucesso: true, total: result.length, clientes: result });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/agenda/crm/retornos
// ══════════════════════════════════════════════════════════════════════════
router.get('/retornos', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const { status, tipo, profissional } = req.query;

    const filtro = { adminId };
    if (status) filtro.statusContato = status;
    if (tipo) filtro.tipoRetorno = tipo;

    const retornos = await RetornoAgenda.find(filtro)
      .sort({ proximoContatoEm: 1, createdAt: -1 })
      .lean();

    const result = retornos.map(r => ({
      ...r,
      diasSemVir: diasDesde(r.ultimoAtendimentoEm),
      msgSugerida: msgSugerida(r.tipoRetorno, r.nome, diasDesde(r.ultimoAtendimentoEm))
    }));

    res.json({ sucesso: true, total: result.length, retornos: result });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// POST /api/agenda/crm/retornos
// Criar retorno manual
// ══════════════════════════════════════════════════════════════════════════
router.post('/retornos', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const {
      clienteId, nome, telefone, tipoRetorno,
      dataRetornoSugerida, proximoContatoEm,
      observacaoRetorno, ultimoAtendimentoEm, ultimoServico
    } = req.body;

    if (!nome || !telefone) return res.status(400).json({ erro: 'nome e telefone obrigatórios' });

    // Buscar dados do cliente se clienteId fornecido
    let nomeCliente = nome, telefoneCliente = telefone;
    let ultimoAte = ultimoAtendimentoEm, ultimoSrv = ultimoServico;

    if (clienteId) {
      const cli = await ClienteAgenda.findOne({ _id: clienteId, adminId }).lean();
      if (cli) {
        nomeCliente = cli.nome;
        telefoneCliente = cli.telefone;
        if (!ultimoAte) ultimoAte = cli.ultimoAtendimento;
        if (!ultimoSrv) ultimoSrv = cli.ultimoServico;
      }
    }

    const retorno = await RetornoAgenda.create({
      adminId,
      clienteId: clienteId || null,
      nome: nomeCliente,
      telefone: telefoneCliente,
      tipoRetorno: tipoRetorno || 'retorno',
      dataRetornoSugerida: dataRetornoSugerida || null,
      proximoContatoEm: proximoContatoEm || null,
      observacaoRetorno: observacaoRetorno || '',
      ultimoAtendimentoEm: ultimoAte || null,
      ultimoServico: ultimoSrv || '',
      statusContato: 'pendente'
    });

    res.json({ sucesso: true, retorno });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// PATCH /api/agenda/crm/retornos/:id/status
// Atualizar status do retorno
// ══════════════════════════════════════════════════════════════════════════
router.patch('/retornos/:id/status', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const { status, obs } = req.body;
    const statusValidos = ['pendente','contatado','agendado','sem_resposta','dispensado'];
    if (!statusValidos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });

    const retorno = await RetornoAgenda.findOne({ _id: req.params.id, adminId });
    if (!retorno) return res.status(404).json({ erro: 'Retorno não encontrado' });

    retorno.statusContato = status;
    retorno.updatedAt = new Date();
    retorno.historicoContatos.push({ data: new Date(), status, obs: obs || '' });
    await retorno.save();

    res.json({ sucesso: true, retorno });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/agenda/crm/msg-sugerida?tipo=retorno&nome=Ana&dias=45
// ══════════════════════════════════════════════════════════════════════════
router.get('/msg-sugerida', authAgenda, async (req, res) => {
  try {
    const { tipo, nome, dias } = req.query;
    const msg = msgSugerida(tipo || 'retorno', nome || 'cliente', parseInt(dias) || null);
    res.json({ sucesso: true, mensagem: msg });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
// DELETE /api/agenda/crm/retornos/:id
// ══════════════════════════════════════════════════════════════════════════
router.delete('/retornos/:id', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    await RetornoAgenda.deleteOne({ _id: req.params.id, adminId });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
