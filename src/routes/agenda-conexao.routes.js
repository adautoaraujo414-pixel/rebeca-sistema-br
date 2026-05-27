const express = require('express');

// Helper UTC-3 Brasil
function _iniDia(d) { const b = d ? new Date(d) : new Date(); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0, 0)); }
function _fimDia(d) { const b = d ? new Date(d) : new Date(); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()+1, 2, 59, 59, 999)); }
const router = express.Router();
const { AdminAgenda, ClienteAgenda, AgendamentoAgenda, MensagemModeloAgenda, ConexaoClienteAgenda } = require('../models/AgendaServico');

async function authAgenda(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ','') || '';
    const admin = await AdminAgenda.findOne({ token, ativo: true });
    if (!admin) return res.status(401).json({ erro: 'Token inválido' });
    req.adminAgenda = admin;
    req.adminAgendaId = admin._id.toString();
    next();
  } catch(e) { res.status(500).json({ erro: e.message }); }
}

// Modelos padrão globais (adminId null)
const MODELOS_PADRAO = [
  { categoria:'agradecimento', titulo:'Agradecimento simples', diasAposAtendimento:0,
    texto:'Oi, {nome}! Muito obrigado por ter escolhido a gente. Ficamos muito felizes em te atender. Sempre que precisar, estamos por aqui! 😊' },
  { categoria:'agradecimento', titulo:'Agradecimento com confiança', diasAposAtendimento:0,
    texto:'Oi, {nome}! Sua confiança é muito importante para nós. Obrigado por nos escolher. Qualquer coisa, é só chamar! 🙏' },
  { categoria:'pos_atendimento', titulo:'Como ficou o resultado', diasAposAtendimento:1,
    texto:'Oi, {nome}! Tudo bem? Passando para saber como você está depois do atendimento. O resultado ficou como você esperava? 😊' },
  { categoria:'pos_atendimento', titulo:'Satisfação geral', diasAposAtendimento:1,
    texto:'Oi, {nome}! Queremos saber se você gostou do atendimento e se ficou tudo certinho. Pode nos contar? 💛' },
  { categoria:'cuidado', titulo:'Cuidado pós-atendimento', diasAposAtendimento:3,
    texto:'Oi, {nome}! Tudo bem? Passando para saber como está o resultado do serviço que fizemos. Está tudo do jeito que você esperava?' },
  { categoria:'cuidado', titulo:'Melhoria do atendimento', diasAposAtendimento:2,
    texto:'Oi, {nome}! Teve algo que poderíamos melhorar no seu atendimento? Sua opinião ajuda muito a gente a crescer. 🙏' },
  { categoria:'avaliacao', titulo:'Opinião do cliente', diasAposAtendimento:1,
    texto:'Oi, {nome}! Você gostou do atendimento? Sua opinião ajuda muito a gente a melhorar. 😊' },
  { categoria:'avaliacao', titulo:'Experiência completa', diasAposAtendimento:2,
    texto:'Oi, {nome}! Se puder, conta pra gente como foi sua experiência. O atendimento, o ambiente e o resultado ficaram bons para você?' },
  { categoria:'avaliacao', titulo:'Indicação', diasAposAtendimento:2,
    texto:'Oi, {nome}! De 0 a 10, quanto você indicaria nosso atendimento para outra pessoa? 😊' },
  { categoria:'retorno', titulo:'Lembrete de retorno', diasAposAtendimento:30,
    texto:'Oi, {nome}! Tudo bem? Já está chegando o momento ideal para o seu retorno. Quer que eu veja alguns horários para você? 📅' },
  { categoria:'manutencao', titulo:'Lembrete de manutenção', diasAposAtendimento:21,
    texto:'Oi, {nome}! Passando para lembrar da sua manutenção. Tenho alguns horários disponíveis esta semana, quer que eu te envie? 💛' },
  { categoria:'cliente_inativo', titulo:'Sentimos sua falta', diasAposAtendimento:45,
    texto:'Oi, {nome}! Tudo bem? Faz um tempinho que não te vemos por aqui. Sentimos sua falta. Quer agendar um horário? 😊' },
  { categoria:'cliente_inativo', titulo:'Horários disponíveis', diasAposAtendimento:60,
    texto:'Oi, {nome}! Temos alguns horários disponíveis nos próximos dias. Quer que eu veja uma opção boa para você? 📅' },
  { categoria:'cliente_inativo', titulo:'Verificação de bem-estar', diasAposAtendimento:45,
    texto:'Oi, {nome}! Passando para saber se está tudo bem e se podemos te ajudar com algum novo horário. Estamos por aqui! 💛' },
  { categoria:'recadastramento', titulo:'Atualização de cadastro', diasAposAtendimento:null,
    texto:'Oi, {nome}! Estamos atualizando nosso cadastro para melhorar seu atendimento. Pode confirmar seus dados rapidinho? 🙏' },
  { categoria:'recuperacao', titulo:'Recuperação de cliente', diasAposAtendimento:90,
    texto:'Oi, {nome}! Tudo bem? Passando para saber como você está. Temos novidades por aqui e adoraríamos te ver novamente. 😊' },
];

function renderMsg(texto, vars) {
  return texto
    .replace(/\{nome\}/g, vars.nome || 'cliente')
    .replace(/\{servico\}/g, vars.servico || '')
    .replace(/\{profissional\}/g, vars.profissional || '')
    .replace(/\{diasSemVir\}/g, vars.diasSemVir || '')
    .replace(/\{nomeEmpresa\}/g, vars.nomeEmpresa || '')
    .replace(/\{linkAgenda\}/g, vars.linkAgenda || '')
    .replace(/\{telefoneEmpresa\}/g, vars.telefoneEmpresa || '')
    .replace(/\{dataUltimoAtendimento\}/g, vars.dataUltimoAtendimento || '');
}

// ── GET /modelos — listar modelos (globais + do admin)
router.get('/modelos', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const { categoria } = req.query;
    const filtro = { ativo: true, $or: [{ adminId: null }, { adminId }] };
    if (categoria) filtro.categoria = categoria;
    const modelos = await MensagemModeloAgenda.find(filtro).sort({ categoria:1, diasAposAtendimento:1 }).lean();
    // Se não houver nenhum, seed automático
    if (!modelos.length) {
      await MensagemModeloAgenda.insertMany(MODELOS_PADRAO.map(m => ({ ...m, adminId: null })));
      const novos = await MensagemModeloAgenda.find({ ativo: true, $or: [{ adminId: null }, { adminId }] }).lean();
      return res.json({ sucesso: true, total: novos.length, modelos: novos });
    }
    res.json({ sucesso: true, total: modelos.length, modelos });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /modelos/seed — recriar modelos padrão
router.post('/modelos/seed', authAgenda, async (req, res) => {
  try {
    await MensagemModeloAgenda.deleteMany({ adminId: null });
    await MensagemModeloAgenda.insertMany(MODELOS_PADRAO.map(m => ({ ...m, adminId: null })));
    res.json({ sucesso: true, inseridos: MODELOS_PADRAO.length });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /modelos — criar modelo personalizado
router.post('/modelos', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const { categoria, titulo, texto, diasAposAtendimento } = req.body;
    if (!categoria || !titulo || !texto) return res.status(400).json({ erro: 'categoria, titulo e texto obrigatórios' });
    const modelo = await MensagemModeloAgenda.create({ adminId, categoria, titulo, texto, diasAposAtendimento: diasAposAtendimento || null });
    res.json({ sucesso: true, modelo });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE /modelos/:id
router.delete('/modelos/:id', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    await MensagemModeloAgenda.deleteOne({ _id: req.params.id, adminId });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /sugestoes — clientes com ações sugeridas
router.get('/sugestoes', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const admin = req.adminAgenda;
    const hoje = _fimDia();
    const corte1 = new Date(Date.now() - 1*24*60*60*1000);
    const corte2 = new Date(Date.now() - 2*24*60*60*1000);
    const corte3 = new Date(Date.now() - 3*24*60*60*1000);
    const corte30 = new Date(Date.now() - 30*24*60*60*1000);

    // Agendamentos concluídos hoje/ontem sem conexão registrada
    const ags = await AgendamentoAgenda.find({
      adminId,
      status: { $in: ['concluido','confirmado','pendente'] },
      dataHora: { $gte: corte2, $lte: hoje }
    }).lean();

    // Clientes inativos 30+ dias
    const inativos = await ClienteAgenda.find({
      adminId,
      ultimoAtendimento: { $lt: corte30, $exists: true, $ne: null },
      totalAtendimentos: { $gte: 1 }
    }).sort({ ultimoAtendimento: 1 }).limit(20).lean();

    // Montar sugestões
    const sugestoes = [];

    for (const ag of ags) {
      const diasAtras = Math.floor((Date.now() - new Date(ag.dataHora)) / (24*60*60*1000));
      const categorias = [];
      if (diasAtras <= 1) { categorias.push('agradecimento'); categorias.push('avaliacao'); }
      if (diasAtras >= 2 && diasAtras <= 4) categorias.push('cuidado');
      if (diasAtras >= 5) categorias.push('pos_atendimento');

      // Checar se já foi contatado recentemente
      const jaContatado = await ConexaoClienteAgenda.findOne({
        adminId, agendamentoId: ag._id,
        statusContato: { $in: ['enviado','contatado','satisfeito','quer_retorno'] }
      }).lean();
      if (jaContatado) continue;

      for (const cat of categorias) {
        const modelo = await MensagemModeloAgenda.findOne({
          ativo: true, categoria: cat,
          $or: [{ adminId: null }, { adminId }]
        }).lean();
        if (!modelo) continue;
        const diasSemVir = Math.floor((Date.now() - new Date(ag.dataHora)) / (24*60*60*1000));
        const vars = {
          nome: ag.nomeCliente, servico: ag.nomeServico,
          profissional: ag.nomeProfissional, diasSemVir,
          nomeEmpresa: admin.nomeNegocio || '', linkAgenda: admin.linkAgenda || '',
          telefoneEmpresa: admin.telefone || '',
          dataUltimoAtendimento: new Date(ag.dataHora).toLocaleDateString('pt-BR')
        };
        sugestoes.push({
          tipo: 'atendimento_recente', categoria: cat,
          clienteId: ag.clienteId, agendamentoId: ag._id,
          nome: ag.nomeCliente, telefone: ag.telefoneCliente || '',
          ultimoServico: ag.nomeServico, ultimoAtendimento: ag.dataHora,
          profissional: ag.nomeProfissional, diasAtras,
          modeloId: modelo._id, modeloTitulo: modelo.titulo,
          mensagem: renderMsg(modelo.texto, vars),
          prioridade: diasAtras <= 1 ? 'alta' : 'media'
        });
      }
    }

    for (const c of inativos) {
      const diasSemVir = Math.floor((Date.now() - new Date(c.ultimoAtendimento)) / (24*60*60*1000));
      const jaContatado = await ConexaoClienteAgenda.findOne({
        adminId, telefone: c.telefone,
        statusContato: { $in: ['enviado','contatado'] },
        createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
      }).lean();
      if (jaContatado) continue;

      const modelo = await MensagemModeloAgenda.findOne({
        ativo: true, categoria: diasSemVir > 60 ? 'recuperacao' : 'cliente_inativo',
        $or: [{ adminId: null }, { adminId }]
      }).lean();
      if (!modelo) continue;
      const vars = {
        nome: c.nome, servico: c.ultimoServico || '', diasSemVir,
        nomeEmpresa: admin.nomeNegocio || '', linkAgenda: admin.linkAgenda || '',
        dataUltimoAtendimento: c.ultimoAtendimento ? new Date(c.ultimoAtendimento).toLocaleDateString('pt-BR') : ''
      };
      sugestoes.push({
        tipo: 'cliente_inativo', categoria: diasSemVir > 60 ? 'recuperacao' : 'cliente_inativo',
        clienteId: c._id, agendamentoId: null,
        nome: c.nome, telefone: c.telefone,
        ultimoServico: c.ultimoServico, ultimoAtendimento: c.ultimoAtendimento,
        profissional: '', diasAtras: diasSemVir,
        modeloId: modelo._id, modeloTitulo: modelo.titulo,
        mensagem: renderMsg(modelo.texto, vars),
        prioridade: diasSemVir > 60 ? 'alta' : 'media'
      });
    }

    sugestoes.sort((a,b) => (a.prioridade==='alta'?0:1) - (b.prioridade==='alta'?0:1));
    res.json({ sucesso: true, total: sugestoes.length, sugestoes });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /conexoes — registrar contato/envio
router.post('/conexoes', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const { clienteId, agendamentoId, nome, telefone, ultimoServico, ultimoAtendimento, profissional, categoria, mensagemEnviada } = req.body;
    if (!nome || !telefone || !categoria) return res.status(400).json({ erro: 'nome, telefone e categoria obrigatórios' });
    const conexao = await ConexaoClienteAgenda.create({
      adminId, clienteId: clienteId||null, agendamentoId: agendamentoId||null,
      nome, telefone, ultimoServico: ultimoServico||'', ultimoAtendimento: ultimoAtendimento||null,
      profissional: profissional||'', categoria, mensagemEnviada: mensagemEnviada||'',
      statusContato: 'enviado', enviadoEm: new Date()
    });
    res.json({ sucesso: true, conexao });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /conexoes — listar conexões
router.get('/conexoes', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const { status, categoria } = req.query;
    const filtro = { adminId };
    if (status) filtro.statusContato = status;
    if (categoria) filtro.categoria = categoria;
    const conexoes = await ConexaoClienteAgenda.find(filtro).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ sucesso: true, total: conexoes.length, conexoes });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PATCH /conexoes/:id/resposta — registrar resposta do cliente
router.patch('/conexoes/:id/resposta', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const { status, observacao } = req.body;
    const statusValidos = ['contatado','sem_resposta','satisfeito','insatisfeito','quer_retorno','quer_reclamar','precisa_humano'];
    if (!statusValidos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
    const cx = await ConexaoClienteAgenda.findOne({ _id: req.params.id, adminId });
    if (!cx) return res.status(404).json({ erro: 'Não encontrado' });
    cx.statusContato = status;
    cx.observacao = observacao || '';
    cx.respondidoEm = new Date();
    cx.updatedAt = new Date();
    await cx.save();
    res.json({ sucesso: true, conexao: cx });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /dashboard-conexao — cards do painel Conexão
router.get('/dashboard-conexao', authAgenda, async (req, res) => {
  try {
    const adminId = req.adminAgendaId;
    const hoje = _iniDia();
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    const corte2 = new Date(Date.now() - 2*24*60*60*1000);
    const corte30 = new Date(Date.now() - 30*24*60*60*1000);

    const posAtendimentosHoje = await AgendamentoAgenda.countDocuments({
      adminId, dataHora: { $gte: hoje, $lt: amanha }, status: { $in: ['concluido','confirmado','pendente'] }
    });
    const agradecimentosPendentes = await AgendamentoAgenda.countDocuments({
      adminId, dataHora: { $gte: corte2, $lt: hoje }, status: { $in: ['concluido','confirmado','pendente'] }
    });
    const insatisfeitos = await ConexaoClienteAgenda.countDocuments({ adminId, statusContato: 'insatisfeito' });
    const semResposta = await ConexaoClienteAgenda.countDocuments({ adminId, statusContato: 'sem_resposta' });
    const inativos30 = await ClienteAgenda.countDocuments({
      adminId, ultimoAtendimento: { $lt: corte30, $exists: true }, totalAtendimentos: { $gte: 1 }
    });
    const avaliacoesPendentes = await ConexaoClienteAgenda.countDocuments({ adminId, categoria: 'avaliacao', statusContato: 'sugerido' });

    res.json({ sucesso: true, cards: {
      posAtendimentosHoje, agradecimentosPendentes,
      insatisfeitos, semResposta, inativos30, avaliacoesPendentes
    }});
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
