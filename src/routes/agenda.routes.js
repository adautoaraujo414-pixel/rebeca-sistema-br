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
const ModoDono = require('../services/agenda-modo-dono.service');

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
    const campos = ['nome','nomeNegocio','segmento','telefone','whatsapp','logo','descricao','endereco','cidade','instagram'];
    const upd = {};
    campos.forEach(c => { if (req.body[c] !== undefined) upd[c] = req.body[c]; });
    if (req.body.config && typeof req.body.config === 'object') {
      Object.keys(req.body.config).forEach(k => {
        if (req.body.config[k] !== undefined) upd['config.' + k] = req.body.config[k];
      });
    }
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, { $set: upd });
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
    const { nome, descricao, duracao, preco, precoPromocional, categoria, foto, ordem } = req.body;
    if (!nome || !duracao || preco === undefined) return res.status(400).json({ erro: 'nome, duracao e preco obrigatórios' });
    const s = await ServicoAgenda.create({ adminId: req.adminAgendaId, nome, descricao, duracao, preco, precoPromocional: precoPromocional || null, categoria, foto, ordem: ordem || 0 });
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
    const { nome, foto, especialidades, atribuicoes, cargo, telefone, bio, diasAtendimento, horario, ordem, comissaoPercentual, senha } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
    if (!telefone) return res.status(400).json({ erro: 'WhatsApp do profissional é obrigatório' });
    if (!senha) return res.status(400).json({ erro: 'Senha de acesso é obrigatória' });
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const token = crypto.randomBytes(24).toString('hex');
    const senhaGerada = senha;
    const senhaHash = await bcrypt.hash(senhaGerada, 10);
    const p = await ProfissionalAgenda.create({
      adminId: req.adminAgendaId,
      nome, foto, especialidades: especialidades || [],
      atribuicoes: atribuicoes || [],
      cargo: cargo || '',
      telefone: telefone || '',
      bio: bio || '',
      token,
      senha: senhaHash,
      comissaoPercentual: comissaoPercentual || 0,
      diasAtendimento: diasAtendimento || [1,2,3,4,5],
      horario: horario || { inicio: '08:00', fim: '18:00', almocoInicio: '12:00', almocoFim: '13:00' },
      ordem: ordem || 0
    });

    // Enviar boas-vindas + credenciais via WhatsApp (Rebeca)
    try {
      const { AdminAgenda } = require('../models/AgendaServico');
      const admin = await AdminAgenda.findById(req.adminAgendaId);
      const { enviarMensagem } = require('../services/whatsapp.provider');
      const linkApp = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/agenda-profissional.html?token=' + token;
      const msg = `Olá ${nome} 😊\n\nVocê foi cadastrado(a) como profissional de *${admin?.nomeNegocio || 'nosso espaço'}*!\n\n🔗 *Seu link de acesso:*\n${linkApp}\n\n🔑 *Seu PIN:* ${senhaGerada}\n\nClique no link e digite o PIN para acessar sua agenda. Por ali você vê seus atendimentos do dia, pode cancelar ou pedir reagendamento e acompanhar sua comissão. Qualquer dúvida é só chamar!`;
      await enviarMensagem(admin?.instanciaWhatsappId, telefone, msg);
      p.boasVindasEnviado = true;
      await p.save();
    } catch(eMsg) { console.error('[profissionais] erro ao enviar boas-vindas:', eMsg.message); }

    res.json({ sucesso: true, profissional: p });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/profissionais/:id', authAgenda, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const updates = { ...req.body };
    if (updates.senha) {
      if (!/^\d{4}$/.test(updates.senha)) return res.status(400).json({ erro: 'PIN deve ter exatamente 4 digitos' });
      updates.senha = await bcrypt.hash(updates.senha, 10);
    } else { delete updates.senha; }
    const p = await ProfissionalAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, updates, { new: true });
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
    const { data, servicoId, servicoIds, profissionalId } = req.query;
    if (!data) return res.status(400).json({ erro: 'data obrigatória (YYYY-MM-DD)' });

    let duracao;
    if (servicoIds) {
      const ids = String(servicoIds).split(',').map(s => s.trim()).filter(Boolean);
      const servicosMulti = await ServicoAgenda.find({ _id: { $in: ids } });
      duracao = servicosMulti.reduce((soma, s) => soma + (s.duracao || 0), 0) || admin.config?.intervaloAgendamento || 30;
    } else {
      const servico = servicoId ? await ServicoAgenda.findById(servicoId) : null;
      duracao = servico?.duracao || admin.config?.intervaloAgendamento || 30;
    }

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
    const filtroAgendados = {
      adminId: req.params.adminId,
      dataHora: { $gte: inicioDia, $lte: fimDia },
      status: { $nin: ['cancelado'] }
    };
    if (profissionalId) filtroAgendados.profissionalId = profissionalId;
    const agendados = await AgendamentoAgenda.find(filtroAgendados);
    const filtroBloqueios = {
      adminId: req.params.adminId,
      dataHoraInicio: { $lte: fimDia },
      dataHoraFim: { $gte: inicioDia }
    };
    if (profissionalId) filtroBloqueios.$or = [{ profissionalId: profissionalId }, { profissionalId: null }, { profissionalId: { $exists: false } }];
    const bloqueios = await BloqueioAgenda.find(filtroBloqueios);

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
    const { nomeCliente, telefoneCliente, telefone, servicoId, servicoIds, profissionalId, observacoes, origem } = req.body;
    // Aceita dataHora completo OU data+hora separados (frontend espaco-digital.html)
    let dataHora = req.body.dataHora;
    if (!dataHora && req.body.data && req.body.hora) {
      dataHora = `${req.body.data}T${req.body.hora}:00-03:00`; // fuso Brasil
    }
    const telCliente = telefoneCliente || telefone;
    if (!nomeCliente || !telCliente || !dataHora) return res.status(400).json({ erro: 'Dados obrigatórios faltando' });
    const admin = await AdminAgenda.findById(req.params.adminId);
    if (!admin) return res.status(404).json({ erro: 'Espaço não encontrado' });
    const prof = profissionalId ? await ProfissionalAgenda.findById(profissionalId) : null;

    let servico = null;
    let servicosMulti = [];
    let nomeServicoFinal = '';
    let duracaoFinal = 0;
    let precoFinal = 0;
    if (Array.isArray(servicoIds) && servicoIds.length > 0) {
      servicosMulti = await ServicoAgenda.find({ _id: { $in: servicoIds } });
      nomeServicoFinal = servicosMulti.map(s => s.nome).join(' + ');
      duracaoFinal = servicosMulti.reduce((soma, s) => soma + (s.duracao || 0), 0);
      precoFinal = servicosMulti.reduce((soma, s) => soma + (s.preco || 0), 0);
      servico = servicosMulti[0] || null;
    } else {
      servico = servicoId ? await ServicoAgenda.findById(servicoId) : null;
      nomeServicoFinal = servico?.nome || '';
      duracaoFinal = servico?.duracao || 0;
      precoFinal = servico?.preco || 0;
    }

    // Criar/atualizar cliente
    let cliente = await ClienteAgenda.findOne({ adminId: req.params.adminId, telefone: telCliente });
    if (!cliente) {
      cliente = await ClienteAgenda.create({ adminId: req.params.adminId, nome: nomeCliente, telefone: telCliente });
    }

    // Verificar double-booking
    const dataHoraObj = new Date(dataHora);
    const durMin = duracaoFinal || admin.config?.intervaloAgendamento || 30;
    const dataHoraFim = new Date(dataHoraObj.getTime() + durMin * 60000);
    // Verificar conflito por profissional (se informado) ou geral
    const filtroConflito = {
      adminId: req.params.adminId,
      status: { $nin: ['cancelado'] },
      dataHora: { $lt: dataHoraFim },
      $expr: { $gt: [{ $add: ['$dataHora', { $multiply: [{ $ifNull: ['$duracao', durMin] }, 60000] }] }, dataHoraObj] }
    };
    if (profissionalId) filtroConflito.profissionalId = profissionalId;
    const conflito = await AgendamentoAgenda.findOne(filtroConflito);
    if (conflito) return res.status(409).json({ erro: 'Horário já ocupado para este profissional. Escolha outro horário.' });

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
      servicoId: (servico && servico._id) || null,
      servicosIds: servicosMulti.length > 0 ? servicosMulti.map(s => s._id) : undefined,
      profissionalId: profissionalId || null,
      nomeCliente, telefoneCliente: telCliente,
      nomeServico: nomeServicoFinal,
      nomeProfissional: prof?.nome || '',
      dataHora: new Date(dataHora),
      duracao: duracaoFinal || 30,
      preco: precoFinal || 0,
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

    // Notificar cliente via WhatsApp (template Meta - obrigatorio pois cliente nunca escreveu antes, fora da janela de 24h)
    if (telCliente) {
      (async () => {
        try {
          const MetaWA = require('../services/meta-whatsapp.service');
          const dataFmt = ag.dataHora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const horaFmt = ag.dataHora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
          const primeiroNome = (ag.nomeCliente || '').split(' ')[0] || 'Cliente';
          const components = [{
            type: 'body',
            parameters: [
              { type: 'text', text: primeiroNome },
              { type: 'text', text: dataFmt },
              { type: 'text', text: horaFmt },
              { type: 'text', text: ag.nomeServico || 'Servico' }
            ]
          }];
          const r = await MetaWA.enviarTemplate(telCliente, 'confirmacao_agendamento_v2', 'pt_BR', components);
          if (!r.sucesso) console.error('[Agenda] Template confirmacao falhou (provavelmente ainda em analise na Meta):', r.erro);
        } catch(eTpl) { console.error('[Agenda] Erro notif cliente (template):', eTpl.message); }
      })();
    }

    // Notificar profissional via WhatsApp sobre o novo agendamento
    if (prof && prof.telefone) {
      (async () => {
        try {
          const { enviarMensagem } = require('../services/whatsapp.provider');
          const dataFmt = ag.dataHora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const horaFmt = ag.dataHora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
          const msgProf = `Novo agendamento! 📅 ${dataFmt} às ${horaFmt} - Cliente: ${ag.nomeCliente} - Serviço: ${ag.nomeServico}`;
          await enviarMensagem(admin?.instanciaWhatsappId, prof.telefone, msgProf);
        } catch(eProf) { console.error('[Agenda] Erro notif profissional:', eProf.message); }
      })();
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
    const { status, motivoCancelamento } = req.body;
    const agAntes = await AgendamentoAgenda.findOne({ _id: req.params.id, adminId: req.adminAgendaId });
    const ag = await AgendamentoAgenda.findOneAndUpdate({ _id: req.params.id, adminId:req.adminAgendaId }, { status, ...(motivoCancelamento ? { motivoCancelamento } : {}) }, { new: true });
    if (!ag) return res.status(404).json({ erro: 'Agendamento n\u00e3o encontrado' });
    // Notificar cliente se cancelado pelo admin
    if (status === 'cancelado' && agAntes?.status !== 'cancelado' && ag.telefoneCliente) {
      try {
        const { AdminAgenda, InstanciaWhatsapp } = require('../models/AgendaServico');
        const ModoDono = require('../services/agenda-modo-dono.service');
        const admin = await AdminAgenda.findById(req.adminAgendaId).lean();
        const inst = await InstanciaWhatsapp.findOne({ adminId: String(req.adminAgendaId), status: 'conectado' }).lean();
        const instEnvio = inst || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };
        const dataFmt = ag.dataHora ? new Date(ag.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        const horaFmt = ag.dataHora ? new Date(ag.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const nomeNeg = admin?.nomeNegocio || 'nosso espa\u00e7o';
        const motivo = motivoCancelamento ? `\n\nMotivo: _${motivoCancelamento}_` : '';
        const msg = `Ol\u00e1 *${ag.nomeCliente || 'cliente'}*! \ud83d\ude0a\n\nInfelizmente precisamos cancelar seu agendamento:\n\n\ud83d\udcc5 *${dataFmt}* \u00e0s *${horaFmt}*\n\ud83d\udd16 ${ag.nomeServico || 'Servi\u00e7o'}${motivo}\n\nSentimos muito pelo inconveniente! Para remarcar, \u00e9 s\u00f3 responder esta mensagem. \ud83d\udc99\n\n_${nomeNeg}_`;
        await ModoDono._enviarMsg(instEnvio, ag.telefoneCliente, msg).catch(()=>{});
      } catch(eNotif) { console.error('[CancelAdmin] erro notif cliente:', eNotif.message); }
    }
    res.json({ sucesso: true, agendamento: ag });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/agendamentos/:id', authAgenda, async (req, res) => {
  try {
    const _del = await AgendamentoAgenda.findOneAndUpdate({ _id: req.params.id, adminId: req.adminAgendaId }, { status: 'cancelado' });
    if (!_del) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    // Notificar cliente
    if (_del.telefoneCliente && _del.status !== 'cancelado') {
      try {
        const { AdminAgenda, InstanciaWhatsapp } = require('../models/AgendaServico');
        const ModoDono = require('../services/agenda-modo-dono.service');
        const admin = await AdminAgenda.findById(req.adminAgendaId).lean();
        const inst = await InstanciaWhatsapp.findOne({ adminId: String(req.adminAgendaId), status: 'conectado' }).lean();
        const instEnvio = inst || { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' };
        const dataFmt = _del.dataHora ? new Date(_del.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        const horaFmt = _del.dataHora ? new Date(_del.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const msg = `Olá *${_del.nomeCliente || 'cliente'}*! 😊

Infelizmente precisamos cancelar seu agendamento:

📅 *${dataFmt}* às *${horaFmt}*
🔖 ${_del.nomeServico || 'Serviço'}

Sentimos muito pelo inconveniente! Para remarcar, é só responder esta mensagem. 💙

_${admin?.nomeNegocio || 'nosso espaço'}_`;
        await ModoDono._enviarMsg(instEnvio, _del.telefoneCliente, msg).catch(()=>{});
      } catch(eNotif) { console.error('[DeleteAdmin] erro notif cliente:', eNotif.message); }
    }
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

// Login do profissional (telefone + senha)
router.post('/profissional-app/login', async (req, res) => {
  try {
    const { token, pin } = req.body;
    if (!token || !pin) return res.status(400).json({ erro: 'Token e PIN obrigatórios' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ erro: 'PIN deve ter 4 dígitos' });
    const prof = await ProfissionalAgenda.findOne({ token, ativo: true });
    if (!prof || !prof.senha) return res.status(401).json({ erro: 'PIN inválido' });
    const ok = await bcrypt.compare(pin, prof.senha);
    if (!ok) return res.status(401).json({ erro: 'PIN inválido' });
    res.json({ sucesso: true, token: prof.token, nome: prof.nome });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Auth do profissional via token
async function authProfissional(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ','') || req.params.token || '';
    if (!token) return res.status(401).json({ erro: 'Token ausente' });
    const prof = await ProfissionalAgenda.findOne({ token, ativo: true });
    if (!prof) return res.status(401).json({ erro: 'Token inválido' });
    req.profissional = prof;
    next();
  } catch(e) { res.status(500).json({ erro: e.message }); }
}

// Rota pública: profissional ver seus agendamentos pelo token
router.get('/profissional-app/:token', async (req, res) => {
  try {
    const { AgendamentoAgenda, AdminAgenda, FinanceiroAgenda } = require('../models/AgendaServico');
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

    // Comissão do mês corrente
    const inicioMes = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 3, 0, 0));
    const concluidosMes = await AgendamentoAgenda.find({
      profissionalId: prof._id, status: 'concluido', dataHora: { $gte: inicioMes }
    });
    const faturamentoMes = concluidosMes.reduce((s, a) => s + (a.preco || 0), 0);
    const comissaoMes = faturamentoMes * ((prof.comissaoPercentual || 0) / 100);

    res.json({
      sucesso: true,
      profissional: { nome: prof.nome, foto: prof.foto, cargo: prof.cargo, horario: prof.horario, diasAtendimento: prof.diasAtendimento, atribuicoes: prof.atribuicoes, comissaoPercentual: prof.comissaoPercentual || 0 },
      negocio: { nome: admin ? admin.nomeNegocio : '', segmento: admin ? admin.segmento : '', logo: admin ? admin.logo : '' },
      agendamentos,
      financeiro: { faturamentoMes, comissaoMes, atendimentosMes: concluidosMes.length }
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Profissional cancela um agendamento
router.put('/profissional-app/:token/agendamento/:id/cancelar', authProfissional, async (req, res) => {
  try {
    const { AgendamentoAgenda, AdminAgenda } = require('../models/AgendaServico');
    const { enviarMensagem } = require('../services/whatsapp.provider');
    const ag = await AgendamentoAgenda.findOneAndUpdate(
      { _id: req.params.id, profissionalId: req.profissional._id },
      { status: 'cancelado' },
      { new: true }
    );
    if (!ag) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    const admin = await AdminAgenda.findById(req.profissional.adminId);
    if (admin && ag.telefoneCliente) {
      const dataFmt = new Date(ag.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      await enviarMensagem(admin.instanciaWhatsappId, ag.telefoneCliente, `Olá ${ag.nomeCliente || ''} 😊

Seu horário do dia ${dataFmt} com ${req.profissional.nome} precisou ser cancelado. Quer remarcar? É só me responder aqui que eu já organizo um novo horário pra você 💛`);
    }
    res.json({ sucesso: true, agendamento: ag });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Profissional conclui atendimento
router.put('/profissional-app/:token/agendamento/:id/concluir', authProfissional, async (req, res) => {
  try {
    const { AgendamentoAgenda, FinanceiroAgenda } = require('../models/AgendaServico');
    const ag = await AgendamentoAgenda.findOneAndUpdate(
      { _id: req.params.id, profissionalId: req.profissional._id, status: { $nin: ['cancelado','concluido'] } },
      { status: 'concluido' },
      { new: true }
    );
    if (!ag) return res.status(404).json({ erro: 'Agendamento não encontrado ou já concluído' });
    // Gerar receita automática no financeiro, evitando duplicar se a rota for chamada de novo
    if (ag.preco && ag.preco > 0) {
      const jaExiste = await FinanceiroAgenda.findOne({ agendamentoId: ag._id, tipo: 'receita' });
      if (!jaExiste) {
        await FinanceiroAgenda.create({
          adminId: ag.adminId,
          agendamentoId: ag._id,
          tipo: 'receita',
          descricao: `${ag.nomeServico || 'Serviço'} — ${ag.nomeCliente || 'Cliente'}`,
          valor: ag.preco,
          categoria: 'servico',
          data: new Date(),
          pago: true
        });
      }
    }
    res.json({ sucesso: true, agendamento: ag });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Profissional pede reagendamento — Rebeca intermedia com o cliente
router.put('/profissional-app/:token/agendamento/:id/reagendar', authProfissional, async (req, res) => {
  try {
    const { motivo } = req.body;
    const { AgendamentoAgenda, AdminAgenda } = require('../models/AgendaServico');
    const { enviarMensagem } = require('../services/whatsapp.provider');
    const ag = await AgendamentoAgenda.findOneAndUpdate(
      { _id: req.params.id, profissionalId: req.profissional._id },
      { status: 'pendente', observacoes: `[Reagendamento solicitado por ${req.profissional.nome}] ${motivo || ''}` },
      { new: true }
    );
    if (!ag) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    const admin = await AdminAgenda.findById(req.profissional.adminId);
    if (admin && ag.telefoneCliente) {
      const dataFmt = new Date(ag.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      await enviarMensagem(admin.instanciaWhatsappId, ag.telefoneCliente, `Olá ${ag.nomeCliente || ''} 😊

${req.profissional.nome} precisou remarcar seu horário do dia ${dataFmt}${motivo ? ' (' + motivo + ')' : ''}. Qual seria o melhor dia e horário pra você? Assim que confirmar eu já deixo remarcado 💛`);
    }
    if (admin) {
      await enviarMensagem(admin.instanciaWhatsappId, admin.whatsapp || admin.telefone, `📋 ${req.profissional.nome} pediu reagendamento do atendimento de ${ag.nomeCliente || 'cliente'} (${ag.nomeServico || ''}). Já avisei o cliente e estou aguardando o melhor horário pra remarcar.`);
    }
    res.json({ sucesso: true, agendamento: ag });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Profissional manda mensagem livre — Rebeca intermedia com o admin
router.post('/profissional-app/:token/mensagem', authProfissional, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ erro: 'Mensagem vazia' });
    const { AdminAgenda } = require('../models/AgendaServico');
    const { enviarMensagem } = require('../services/whatsapp.provider');
    const admin = await AdminAgenda.findById(req.profissional.adminId);
    if (admin) {
      await enviarMensagem(admin.instanciaWhatsappId, admin.whatsapp || admin.telefone, `💬 Mensagem de ${req.profissional.nome}:

"${texto}"`);
    }
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Relatório de faturamento por comissionado (admin)
router.get('/profissionais/:id/relatorio', authAgenda, async (req, res) => {
  try {
    const { AgendamentoAgenda } = require('../models/AgendaServico');
    const prof = await ProfissionalAgenda.findOne({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!prof) return res.status(404).json({ erro: 'Profissional não encontrado' });
    const { mes, ano } = req.query;
    const agora = new Date(Date.now() - 3*60*60*1000);
    const m = parseInt(mes) || (agora.getUTCMonth() + 1);
    const a = parseInt(ano) || agora.getUTCFullYear();
    const inicio = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0));
    const fim = new Date(Date.UTC(a, m, 1, 2, 59, 59, 999));
    const concluidos = await AgendamentoAgenda.find({
      profissionalId: prof._id, status: 'concluido', dataHora: { $gte: inicio, $lte: fim }
    }).sort({ dataHora: 1 });
    const faturamento = concluidos.reduce((s, x) => s + (x.preco || 0), 0);
    const comissao = faturamento * ((prof.comissaoPercentual || 0) / 100);
    res.json({ sucesso: true, profissional: prof.nome, comissaoPercentual: prof.comissaoPercentual || 0, totalAtendimentos: concluidos.length, faturamento, comissao, atendimentos: concluidos });
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

// ── MINHA CONTA (cliente final: historico + agendamentos futuros) ──
router.get('/espaco/:adminId/minha-conta', async (req, res) => {
  try {
    const telBruto = req.query.telefone || '';
    const tel = telBruto.replace(/\D/g, '');
    if (!tel) return res.status(400).json({ erro: 'Informe o WhatsApp' });
    const cliente = await ClienteAgenda.findOne({ adminId: req.params.adminId, telefone: tel });
    if (!cliente) return res.status(404).json({ erro: 'Nenhum cadastro encontrado com esse WhatsApp' });
    const agora = new Date();
    const todos = await AgendamentoAgenda.find({ adminId: req.params.adminId, clienteId: cliente._id })
      .sort({ dataHora: -1 }).limit(100).lean();
    const futuros = todos.filter(a => new Date(a.dataHora) >= agora && a.status !== 'cancelado');
    const historico = todos.filter(a => new Date(a.dataHora) < agora || a.status === 'cancelado' || a.status === 'concluido');
    res.json({
      sucesso: true,
      cliente: { nome: cliente.nome, telefone: cliente.telefone },
      futuros: futuros.map(a => ({ _id: a._id, dataHora: a.dataHora, nomeServico: a.nomeServico, nomeProfissional: a.nomeProfissional, status: a.status, preco: a.preco, servicoId: a.servicoId, profissionalId: a.profissionalId, duracao: a.duracao })),
      historico: historico.slice(0, 20).map(a => ({ _id: a._id, dataHora: a.dataHora, nomeServico: a.nomeServico, nomeProfissional: a.nomeProfissional, status: a.status, preco: a.preco }))
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/espaco/:adminId/minha-conta/cancelar/:agendamentoId', async (req, res) => {
  try {
    const telBruto = req.body.telefone || '';
    const tel = telBruto.replace(/\D/g, '');
    if (!tel) return res.status(400).json({ erro: 'Informe o WhatsApp' });
    const cliente = await ClienteAgenda.findOne({ adminId: req.params.adminId, telefone: tel });
    if (!cliente) return res.status(404).json({ erro: 'Cadastro não encontrado' });
    const ag = await AgendamentoAgenda.findOne({ _id: req.params.agendamentoId, adminId: req.params.adminId, clienteId: cliente._id });
    if (!ag) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    if (ag.status === 'cancelado') return res.status(400).json({ erro: 'Agendamento já está cancelado' });
    if (ag.status === 'concluido') return res.status(400).json({ erro: 'Não é possível cancelar um atendimento já concluído' });
    if (new Date(ag.dataHora) < new Date()) return res.status(400).json({ erro: 'Não é possível cancelar um horário que já passou' });
    ag.status = 'cancelado';
    await ag.save();
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/espaco/:adminId/minha-conta/reagendar/:agendamentoId', async (req, res) => {
  try {
    const telBruto = req.body.telefone || '';
    const tel = telBruto.replace(/\D/g, '');
    const { data, hora } = req.body;
    if (!tel) return res.status(400).json({ erro: 'Informe o WhatsApp' });
    if (!data || !hora) return res.status(400).json({ erro: 'Informe data e horário' });
    const cliente = await ClienteAgenda.findOne({ adminId: req.params.adminId, telefone: tel });
    if (!cliente) return res.status(404).json({ erro: 'Cadastro não encontrado' });
    const ag = await AgendamentoAgenda.findOne({ _id: req.params.agendamentoId, adminId: req.params.adminId, clienteId: cliente._id });
    if (!ag) return res.status(404).json({ erro: 'Agendamento não encontrado' });
    if (ag.status === 'cancelado' || ag.status === 'concluido') return res.status(400).json({ erro: 'Este agendamento não pode mais ser alterado' });
    const novaDataHora = new Date(`${data}T${hora}:00-03:00`);
    if (novaDataHora < new Date()) return res.status(400).json({ erro: 'Escolha uma data futura' });
    const admin = await AdminAgenda.findById(req.params.adminId);
    const durMin = ag.duracao || admin?.config?.intervaloAgendamento || 30;
    const novaDataHoraFim = new Date(novaDataHora.getTime() + durMin * 60000);
    const filtroConflito = {
      adminId: req.params.adminId,
      _id: { $ne: ag._id },
      status: { $nin: ['cancelado'] },
      dataHora: { $lt: novaDataHoraFim },
      $expr: { $gt: [{ $add: ['$dataHora', { $multiply: [{ $ifNull: ['$duracao', durMin] }, 60000] }] }, novaDataHora] }
    };
    if (ag.profissionalId) filtroConflito.profissionalId = ag.profissionalId;
    const conflito = await AgendamentoAgenda.findOne(filtroConflito);
    if (conflito) return res.status(409).json({ erro: 'Horário já ocupado. Escolha outro horário.' });
    ag.dataHora = novaDataHora;
    ag.status = 'pendente';
    await ag.save();
    res.json({ sucesso: true, agendamento: ag });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
