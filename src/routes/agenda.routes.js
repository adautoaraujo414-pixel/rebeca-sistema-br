// deploy 1778470865

const express = require('express');

// Helper UTC-3 Brasil
function _iniDia(d) { const b = d ? new Date(d) : new Date(); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0, 0)); }
function _fimDia(d) { const b = d ? new Date(d) : new Date(); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()+1, 2, 59, 59, 999)); }
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  AdminAgenda, ServicoAgenda, ProfissionalAgenda,
  ClienteAgenda, AgendamentoAgenda, BloqueioAgenda,
  FotoAgenda, PreCadastroAgenda,
  ProdutoAgenda, CatalogoAgenda
} = require('../models/AgendaServico');

// ===== AUTH MIDDLEWARE =====
// auth middleware v2
async function authAgenda(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ','') || '';
    if (!token) return res.status(401).json({ erro: 'Token ausente' });
    // Busca sem filtro ativo — permite gerenciar conta mesmo com status pendente
    const admin = await AdminAgenda.findOne({ token });
    if (!admin) return res.status(401).json({ erro: 'Token inválido' });
    req.adminAgenda = admin;
    req.adminAgendaId = admin._id.toString();
    next();
  } catch(e) { res.status(500).json({ erro: e.message }); }
}

// ===== PRÉ-CADASTRO =====
router.post('/pre-cadastro', async (req, res) => {
  try {
    const { nome, whatsapp, email, nomeNegocio, segmento, cidade, planoInteresse } = req.body;
    if (!nome || !whatsapp) return res.status(400).json({ erro: 'Nome e WhatsApp obrigatórios' });
    const pc = await PreCadastroAgenda.create({ nome, whatsapp, email, nomeNegocio, segmento, cidade, planoInteresse });
    res.json({ sucesso: true, id: pc._id });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== CADASTRO ADMIN =====
router.post('/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, nomeNegocio, segmento, telefone, whatsapp, plano } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
    const existe = await AdminAgenda.findOne({ email });
    if (existe) return res.status(400).json({ erro: 'Email já cadastrado' });
    const hash = await bcrypt.hash(senha, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const trialExpira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const admin = await AdminAgenda.create({ nome, email, senha: hash, token, nomeNegocio, segmento, telefone, whatsapp, plano: plano || 'espaco_digital_ia', ativo: true, statusPagamento: 'trial', trialExpira, avisadoTrial: false });
    res.json({ sucesso: true, token, adminId: admin._id });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const admin = await AdminAgenda.findOne({ email });
    if (!admin) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const ok = await bcrypt.compare(senha, admin.senha);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas' });
    if (!admin.ativo && admin.statusPagamento !== 'trial') return res.status(403).json({ erro: 'Acesso pendente. Entre em contato para liberar sua conta.', pendentePagamento: true }); if (admin.statusPagamento === 'aguardando_comprovante') return res.status(403).json({ erro: 'Acesso pendente. Envie o comprovante do PIX para liberar sua conta.', pendentePagamento: true });
    if (admin.statusPagamento === 'expirado') return res.status(403).json({ erro: 'Plano expirado. Renove seu acesso enviando o comprovante.', expirado: true });
    const token = admin.token || crypto.randomBytes(32).toString('hex');
    if (!admin.token) await AdminAgenda.findByIdAndUpdate(admin._id, { token });
    res.json({ sucesso: true, token, nome: admin.nome, nomeNegocio: admin.nomeNegocio, segmento: admin.segmento, plano: admin.plano, admin: { _id: admin._id, nome: admin.nome, nomeNegocio: admin.nomeNegocio, segmento: admin.segmento, plano: admin.plano, email: admin.email } });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== PERFIL =====
router.get('/perfil', authAgenda, async (req, res) => {
  try {
    const a = req.adminAgenda;
    res.json({ sucesso: true, admin: { _id: a._id, id: a._id, nome: a.nome, email: a.email, nomeNegocio: a.nomeNegocio, segmento: a.segmento, telefone: a.telefone, whatsapp: a.whatsapp, logo: a.logo, descricao: a.descricao, endereco: a.endereco, cidade: a.cidade, instagram: a.instagram, plano: a.plano, config: a.config } });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Configurar gênero do admin (para apelidos corretos na Rebeca)
router.patch('/perfil/genero', authAgenda, async (req, res) => {
  try {
    const { genero } = req.body;
    if (!['M','F',''].includes(genero)) return res.status(400).json({ erro: 'genero deve ser M, F ou vazio' });
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, { 'modoWhatsappDono.genero': genero });
    res.json({ sucesso: true, genero });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/perfil', authAgenda, async (req, res) => {
  try {
    const campos = ['nome','nomeNegocio','segmento','telefone','whatsapp','logo','descricao','endereco','cidade','instagram','config'];
    const upd = {};
    campos.forEach(c => { if (req.body[c] !== undefined) upd[c] = req.body[c]; });
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, upd);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== SERVIÇOS =====
router.get('/servicos', authAgenda, async (req, res) => {
  try {
    const servicos = await ServicoAgenda.find({ adminId: req.adminAgendaId }).sort({ ordem: 1, nome: 1 });
    res.json({ sucesso: true, servicos });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/servicos', authAgenda, async (req, res) => {
  try {
    const { nome, descricao, duracao, preco, categoria, foto, ordem } = req.body;
    if (!nome || !duracao || preco === undefined) return res.status(400).json({ erro: 'nome, duracao e preco obrigatórios' });
    const s = await ServicoAgenda.create({ adminId: req.adminAgendaId, nome, descricao, duracao, preco, categoria, foto, ordem: ordem || 0 });
    res.json({ sucesso: true, servico: s });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/servicos/:id', authAgenda, async (req, res) => {
  try {
    const s = await ServicoAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, req.body, { new: true });
    if (!s) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.json({ sucesso: true, servico: s });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/servicos/:id', authAgenda, async (req, res) => {
  try {
    const _del = await ServicoAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!_del) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== PROFISSIONAIS =====
router.get('/profissionais', authAgenda, async (req, res) => {
  try {
    const prof = await ProfissionalAgenda.find({ adminId: req.adminAgendaId, ativo: true }).sort({ ordem: 1 });
    res.json({ sucesso: true, profissionais: prof });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/profissionais', authAgenda, async (req, res) => {
  try {
    const { nome, foto, especialidades, atribuicoes, cargo, telefone, bio, diasAtendimento, horario, ordem } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    const p = await ProfissionalAgenda.create({
      adminId: req.adminAgendaId,
      nome, foto, especialidades: especialidades || [],
      atribuicoes: atribuicoes || [],
      cargo: cargo || '',
      telefone: telefone || '',
      bio: bio || '',
      token,
      diasAtendimento: diasAtendimento || [1,2,3,4,5],
      horario: horario || { inicio: '08:00', fim: '18:00', almocoInicio: '12:00', almocoFim: '13:00' },
      ordem: ordem || 0
    });
    res.json({ sucesso: true, profissional: p });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/profissionais/:id', authAgenda, async (req, res) => {
  try {
    const p = await ProfissionalAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, req.body, { new: true });
    if (!p) return res.status(404).json({ erro: 'Profissional não encontrado' });
    res.json({ sucesso: true, profissional: p });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/profissionais/:id', authAgenda, async (req, res) => {
  try {
    const _del = await ProfissionalAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, { ativo: false });
    if (!_del) return res.status(404).json({ erro: 'Profissional não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== HORÁRIOS DISPONÍVEIS (público) =====
router.get('/espaco/:adminId/horarios', async (req, res) => {
  try {
    const admin = await AdminAgenda.findById(req.params.adminId);
    if (!admin) return res.status(404).json({ erro: 'Espaço não encontrado' });
    const { data, servicoId } = req.query;
    if (!data) return res.status(400).json({ erro: 'data obrigatória (YYYY-MM-DD)' });

    const servico = servicoId ? await ServicoAgenda.findById(servicoId) : null;
    const duracao = servico?.duracao || admin.config?.intervaloAgendamento || 30;

    const cfg = admin.config || {};
    const abertura = cfg.horarioAbertura || '08:00';
    const fechamento = cfg.horarioFechamento || '18:00';
    const intervalo = cfg.intervaloAgendamento || 30;
    const diasFunc = cfg.diasFuncionamento || [1,2,3,4,5,6];

    const dataObj = new Date(data + 'T00:00:00-03:00');
    const diaSemana = dataObj.getDay();
    if (!diasFunc.includes(diaSemana)) return res.json({ sucesso: true, horarios: [], mensagem: 'Fechado neste dia' });

    const [hAb, mAb] = abertura.split(':').map(Number);
    const [hFe, mFe] = fechamento.split(':').map(Number);
    const inicioMin = hAb * 60 + mAb;
    const fimMin = hFe * 60 + mFe;

    // Buscar agendamentos do dia
    const inicioDia = new Date(data + 'T00:00:00-03:00');
    const fimDia = new Date(data + 'T23:59:59-03:00');
    const agendados = await AgendamentoAgenda.find({
      adminId: req.params.adminId,
      dataHora: { $gte: inicioDia, $lte: fimDia },
      status: { $nin: ['cancelado'] }
    });
    const bloqueios = await BloqueioAgenda.find({
      adminId: req.params.adminId,
      dataHoraInicio: { $lte: fimDia },
      dataHoraFim: { $gte: inicioDia }
    });

    const horarios = [];
    const agora = new Date();

    for (let min = inicioMin; min + duracao <= fimMin; min += intervalo) {
      const h = Math.floor(min / 60).toString().padStart(2,'0');
      const m = (min % 60).toString().padStart(2,'0');
      const slotInicio = new Date(`${data}T${h}:${m}:00-03:00`);
      const slotFim = new Date(slotInicio.getTime() + duracao * 60000);

      // Verificar antecedência mínima
      const antecMin = (cfg.antecedenciaMinima || 0) * 60000;
      if (slotInicio.getTime() - agora.getTime() < antecMin) continue;

      // Verificar conflito com agendamentos
      const ocupado = agendados.some(ag => {
        const agFim = new Date(ag.dataHora.getTime() + (ag.duracao || intervalo) * 60000);
        return slotInicio < agFim && slotFim > ag.dataHora;
      });

      // Verificar bloqueios
      const bloqueado = bloqueios.some(b => slotInicio < b.dataHoraFim && slotFim > b.dataHoraInicio);

      if (!ocupado && !bloqueado) horarios.push(`${h}:${m}`);
    }

    res.json({ sucesso: true, horarios, nomeNegocio: admin.nomeNegocio, segmento: admin.segmento });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== AGENDAR (público) =====
router.post('/espaco/:adminId/agendar', async (req, res) => {
  try {
    const { nomeCliente, telefoneCliente, telefone, servicoId, profissionalId, observacoes, origem } = req.body;
    // Aceita dataHora completo OU data+hora separados (frontend espaco-digital.html)
    let dataHora = req.body.dataHora;
    if (!dataHora && req.body.data && req.body.hora) {
      dataHora = `${req.body.data}T${req.body.hora}:00-03:00`; // fuso Brasil
    }
    const telCliente = telefoneCliente || telefone;
    if (!nomeCliente || !telCliente || !dataHora) return res.status(400).json({ erro: 'Dados obrigatórios faltando' });
    const admin = await AdminAgenda.findById(req.params.adminId);
    if (!admin) return res.status(404).json({ erro: 'Espaço não encontrado' });
    const servico = servicoId ? await ServicoAgenda.findById(servicoId) : null;
    const prof = profissionalId ? await ProfissionalAgenda.findById(profissionalId) : null;

    // Criar/atualizar cliente
    let cliente = await ClienteAgenda.findOne({ adminId: req.params.adminId, telefone: telCliente });
    if (!cliente) {
      cliente = await ClienteAgenda.create({ adminId: req.params.adminId, nome: nomeCliente, telefone: telCliente });
    }

    // Verificar double-booking
    const dataHoraObj = new Date(dataHora);
    const durMin = servico?.duracao || admin.config?.intervaloAgendamento || 30;
    const dataHoraFim = new Date(dataHoraObj.getTime() + durMin * 60000);
    const conflito = await AgendamentoAgenda.findOne({
      adminId: req.params.adminId,
      status: { $nin: ['cancelado'] },
      dataHora: { $lt: dataHoraFim },
      $expr: { $gt: [{ $add: ['$dataHora', { $multiply: [{ $ifNull: ['$duracao', durMin] }, 60000] }] }, dataHoraObj] }
    });
    if (conflito) return res.status(409).json({ erro: 'Horário já ocupado. Escolha outro horário.' });

    // Verificar se está bloqueado
    const bloqueado = await BloqueioAgenda.findOne({
      adminId: req.params.adminId,
      dataHoraInicio: { $lt: dataHoraFim },
      dataHoraFim: { $gt: dataHoraObj }
    });
    if (bloqueado) return res.status(409).json({ erro: 'Horário bloqueado. Escolha outro horário.' });

    const ag = await AgendamentoAgenda.create({
      adminId: req.params.adminId,
      clienteId: cliente._id,
      servicoId: servicoId || null,
      profissionalId: profissionalId || null,
      nomeCliente, telefoneCliente: telCliente,
      nomeServico: servico?.nome || '',
      nomeProfissional: prof?.nome || '',
      dataHora: new Date(dataHora),
      duracao: servico?.duracao || 30,
      preco: servico?.preco || 0,
      observacoes,
      origem: origem || 'site'
    });

    await ClienteAgenda.findByIdAndUpdate(cliente._id, { ultimoAtendimento: new Date(), $inc: { totalAtendimentos: 1 } });

    // Notificar dono via WhatsApp
    ModoDono.notificarDonoNovoAgendamento(req.params.adminId, {
      nomeCliente: ag.nomeCliente,
      nomeServico: ag.nomeServico,
      nomeProfissional: ag.nomeProfissional,
      dataHora: ag.dataHora,
      valor: ag.preco
    }).catch(e => console.error('[Agenda] Erro notif dono:', e.message));

    // Notificar cliente via WhatsApp
    if (telCliente) {
      const { InstanciaWhatsapp } = require('../models/index');
      InstanciaWhatsapp.findOne({ adminId: req.params.adminId, adminTipo: 'agenda' }).lean()
        .then(inst => {
          if (!inst || inst.status !== 'conectado') return;
          return ModoDono.notificarCliente(inst, telCliente, 'confirmacao', {
            nome: ag.nomeCliente,
            dataHora: ag.dataHora,
            servico: ag.nomeServico
          });
        }).catch(e => console.error('[Agenda] Erro notif cliente:', e.message));
    }

    res.json({ sucesso: true, agendamento: ag, mensagem: admin.config?.mensagemConfirmacao || 'Agendamento confirmado! 💛' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== AGENDAMENTOS (admin) =====
router.get('/agendamentos', authAgenda, async (req, res) => {
  try {
    const { data, dataInicio, status } = req.query;
    const filtro = { adminId: req.adminAgendaId };
    if (data) {
      filtro.dataHora = { $gte: new Date(data + 'T00:00:00-03:00'), $lte: new Date(data + 'T23:59:59-03:00') };
    } else if (dataInicio) {
      const inicio = new Date(dataInicio + 'T00:00:00-03:00');
      const fim = new Date(dataInicio + 'T23:59:59-03:00');
      fim.setDate(fim.getDate() + 7);
      filtro.dataHora = { $gte: inicio, $lte: fim };
    }
    if (status) filtro.status = status;
    const ags = await AgendamentoAgenda.find(filtro).sort({ dataHora: 1 });
    res.json({ sucesso: true, agendamentos: ags });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/agendamentos/:id/status', authAgenda, async (req, res) => {
  try {
    const { status } = req.body;
    const ag = await AgendamentoAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, { status }, { new: true });
    if (!ag) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    res.json({ sucesso: true, agendamento: ag });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/agendamentos/:id', authAgenda, async (req, res) => {
  try {
    const _del = await AgendamentoAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, { status: 'cancelado' });
    if (!_del) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ===== FINANCEIRO RESUMO =====

// ===== BLOQUEIOS =====
router.get('/bloqueios', authAgenda, async (req, res) => {
  try {
    const b = await BloqueioAgenda.find({ adminId: req.adminAgendaId, dataHoraFim: { $gte: new Date() } }).sort({ dataHoraInicio: 1 });
    res.json({ sucesso: true, bloqueios: b });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/bloqueios', authAgenda, async (req, res) => {
  try {
    const { dataHoraInicio, dataHoraFim, motivo, profissionalId } = req.body;
    const b = await BloqueioAgenda.create({ adminId: req.adminAgendaId, dataHoraInicio, dataHoraFim, motivo, profissionalId });
    res.json({ sucesso: true, bloqueio: b });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/bloqueios/:id', authAgenda, async (req, res) => {
  try {
    const _del = await BloqueioAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!_del) return res.status(404).json({ erro: 'Bloqueio não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== CLIENTES =====

router.post('/clientes', authAgenda, async (req, res) => {
  try {
    const { nome, telefone, email, observacoes, restricoes } = req.body;
    if (!nome || !telefone) return res.status(400).json({ erro: 'Nome e telefone obrigatorios' });
    const existente = await ClienteAgenda.findOne({ adminId: req.adminAgendaId, telefone });
    if (existente) {
      await ClienteAgenda.findByIdAndUpdate(existente._id, { nome, email, observacoes, restricoes });
      return res.json({ sucesso: true, cliente: existente, atualizado: true });
    }
    const c = await ClienteAgenda.create({ adminId: req.adminAgendaId, nome, telefone, email: email||'', observacoes: observacoes||'', restricoes: restricoes||'' });
    res.json({ sucesso: true, cliente: c });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/clientes', authAgenda, async (req, res) => {
  try {
    const clientes = await ClienteAgenda.find({ adminId: req.adminAgendaId }).sort({ nome: 1 });
    res.json({ sucesso: true, clientes });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/clientes/:id', authAgenda, async (req, res) => {
  try {
    const c = await ClienteAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, req.body, { new: true });
    if (!c) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.json({ sucesso: true, cliente: c });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== FOTOS =====
router.get('/fotos', authAgenda, async (req, res) => {
  try {
    const fotos = await FotoAgenda.find({ adminId: req.adminAgendaId, ativo: true }).sort({ ordem: 1 });
    res.json({ sucesso: true, fotos });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/fotos', authAgenda, async (req, res) => {
  try {
    const { url, tipo, legenda, ordem } = req.body;
    const f = await FotoAgenda.create({ adminId: req.adminAgendaId, url, tipo: tipo || 'resultado', legenda, ordem: ordem || 0 });
    res.json({ sucesso: true, foto: f });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/fotos/:id', authAgenda, async (req, res) => {
  try {
    const _del = await FotoAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, { ativo: false });
    if (!_del) return res.status(404).json({ erro: 'Foto não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== DASHBOARD =====
router.get('/dashboard', authAgenda, async (req, res) => {
  try {
    const hoje = _iniDia();
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    const [agHoje, agPendentes, totalClientes, agMes] = await Promise.all([
      AgendamentoAgenda.countDocuments({ adminId: req.adminAgendaId, dataHora: { $gte: hoje, $lt: amanha }, status: { $nin: ['cancelado'] } }),
      AgendamentoAgenda.countDocuments({ adminId: req.adminAgendaId, status: 'pendente', dataHora: { $gte: new Date() } }),
      ClienteAgenda.countDocuments({ adminId: req.adminAgendaId }),
      AgendamentoAgenda.find({ adminId: req.adminAgendaId, dataHora: { $gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1) }, status: 'concluido' }).select('preco')
    ]);
    const receitaMes = agMes.reduce((s, a) => s + (a.preco || 0), 0);
    const proximosHoje = await AgendamentoAgenda.find({ adminId: req.adminAgendaId, dataHora: { $gte: new Date(), $lt: amanha }, status: { $nin: ['cancelado','concluido'] } }).sort({ dataHora: 1 }).limit(10);
    res.json({ sucesso: true, agHoje, agPendentes, totalClientes, receitaMes, proximosHoje });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== ESPAÇO DIGITAL PÚBLICO =====
router.get('/espaco/:adminId', async (req, res) => {
  try {
    const admin = await AdminAgenda.findById(req.params.adminId).select('-senha -token');
    if (!admin) return res.status(404).json({ erro: 'Espaço não encontrado' });
    const [servicos, profissionais, fotos, produtos, catalogos] = await Promise.all([
      ServicoAgenda.find({ adminId: req.params.adminId, ativo: true }).sort({ ordem: 1 }),
      ProfissionalAgenda.find({ adminId: req.params.adminId, ativo: true }).sort({ ordem: 1 }),
      FotoAgenda.find({ adminId: req.params.adminId, ativo: true }).sort({ ordem: 1 }).limit(20),
      ProdutoAgenda.find({ adminId: req.params.adminId, ativo: true }).sort({ ordem: 1 }).limit(50).lean(),
      CatalogoAgenda.find({ adminId: req.params.adminId, ativo: true }).sort({ ordem: 1 }).lean()
    ]);
    res.json({ sucesso: true, admin, servicos, profissionais, fotos, produtos, catalogos });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});



// Rota pública: auto-cadastrar cliente ao agendar
router.post('/espaco/:adminId/cliente', async (req, res) => {
  try {
    const { nome, telefone } = req.body;
    if (!nome || !telefone) return res.json({ sucesso: false });
    // Upsert por telefone
    const existente = await ClienteAgenda.findOne({ adminId: req.params.adminId, telefone });
    if (existente) {
      await ClienteAgenda.findByIdAndUpdate(existente._id, { nome, ultimoAtendimento: new Date(), $inc: { totalAtendimentos: 1 } });
    } else {
      await ClienteAgenda.create({ adminId: req.params.adminId, nome, telefone, totalAtendimentos: 1, ultimoAtendimento: new Date() });
    }
    res.json({ sucesso: true });
  } catch(e) { res.json({ sucesso: false }); }
});

// Rota pública: profissional ver seus agendamentos pelo token
router.get('/profissional-app/:token', async (req, res) => {
  try {
    const { AgendamentoAgenda, AdminAgenda } = require('../models/AgendaServico');
    const prof = await ProfissionalAgenda.findOne({ token: req.params.token, ativo: true });
    if (!prof) return res.status(404).json({ erro: 'Profissional não encontrado' });
    const admin = await AdminAgenda.findById(prof.adminId);
    const hoje = _iniDia();
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + 30);
    const agendamentos = await AgendamentoAgenda.find({
      profissionalId: prof._id,
      dataHora: { $gte: hoje, $lte: fim },
      status: { $nin: ['cancelado'] }
    }).sort({ dataHora: 1 });
    res.json({
      sucesso: true,
      profissional: { nome: prof.nome, foto: prof.foto, cargo: prof.cargo, horario: prof.horario, diasAtendimento: prof.diasAtendimento, atribuicoes: prof.atribuicoes },
      negocio: { nome: admin ? admin.nomeNegocio : '', segmento: admin ? admin.segmento : '', logo: admin ? admin.logo : '' },
      agendamentos
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ─── CONFIG BOT ───────────────────────────────────────────────────────────────
router.get('/config-bot', authAgenda, async (req, res) => {
  try {
    const { AdminAgenda } = require('../models/AgendaServico');
    const admin = await AdminAgenda.findById(req.adminId).select('configBot').lean();
    res.json({ sucesso: true, configBot: admin?.configBot || { ativo: false, foraHorario: false, linkAgenda: true, atenderClientes: false } });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

router.put('/config-bot', authAgenda, async (req, res) => {
  try {
    const { AdminAgenda } = require('../models/AgendaServico');
    const { ativo, foraHorario, linkAgenda, atenderClientes } = req.body;
    await AdminAgenda.findByIdAndUpdate(req.adminId, {
      'configBot.ativo':           !!ativo,
      'configBot.foraHorario':     !!foraHorario,
      'configBot.linkAgenda':      !!linkAgenda,
      'configBot.atenderClientes': !!atenderClientes
    });
    res.json({ sucesso: true, mensagem: 'Configurações do bot salvas!' });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// ── ALTERAR SENHA ──
router.put('/alterar-senha', authAgenda, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) return res.status(400).json({ erro: 'Preencha todos os campos' });
    if (novaSenha.length < 6) return res.status(400).json({ erro: 'Nova senha deve ter mínimo 6 caracteres' });
    const bcrypt = require('bcryptjs');
    const admin = await AdminAgenda.findById(req.adminAgendaId);
    const ok = await bcrypt.compare(senhaAtual, admin.senha);
    if (!ok) return res.status(401).json({ erro: 'Senha atual incorreta' });
    const hash = await bcrypt.hash(novaSenha, 10);
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, { senha: hash });
    res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso!' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── EXCLUIR CONTA ──
router.delete('/excluir-conta', authAgenda, async (req, res) => {
  try {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Confirme sua senha para excluir' });
    const bcrypt = require('bcryptjs');
    const admin = await AdminAgenda.findById(req.adminAgendaId);
    const ok = await bcrypt.compare(senha, admin.senha);
    if (!ok) return res.status(401).json({ erro: 'Senha incorreta' });
    await AdminAgenda.findByIdAndDelete(req.adminAgendaId);
    res.json({ sucesso: true, mensagem: 'Conta excluída com sucesso' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── AVALIAÇÕES (agendamentos finalizados com nota/comentário) ──
router.get('/avaliacoes', authAgenda, async (req, res) => {
  try {
    const ags = await AgendamentoAgenda.find({
      adminId: req.adminAgendaId,
      $or: [
        { nota: { $exists: true, $ne: null } },
        { comentario: { $exists: true, $ne: null } },
        { avaliacao: { $exists: true, $ne: null } }
      ]
    }).sort({ dataHora: -1 }).limit(100).lean();
    const avaliacoes = ags.map(a => ({
      _id: a._id,
      clienteNome: a.clienteNome || 'Cliente',
      nota: a.nota || a.avaliacao || 5,
      comentario: a.comentario || a.observacao || '',
      servicoNome: a.servicoNome || '',
      criadoEm: a.dataHora || a.createdAt
    }));
    res.json({ sucesso: true, avaliacoes });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── RECEBER AVALIAÇÃO DO CLIENTE ──
router.post('/espaco/:adminId/avaliar', async (req, res) => {
  try {
    const { agendamentoId, nota, comentario } = req.body;
    if (!agendamentoId || !nota) return res.status(400).json({ erro: 'Dados incompletos' });
    const ag = await AgendamentoAgenda.findOneAndUpdate(
      { _id: agendamentoId, adminId: req.params.adminId },
      { nota: parseInt(nota), comentario: comentario || '' },
      { new: true }
    );
    if (!ag) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
