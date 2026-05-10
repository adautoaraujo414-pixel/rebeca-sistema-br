const cron = require('node-cron');
const { AdminAgenda, ClienteAgenda, AgendamentoAgenda, InstanciaWhatsapp } = require('../models/AgendaServico');
const EvolutionMultiService = require('./evolution-multi.service');

// Mensagens de recuperação variadas e humanizadas
const MENSAGENS_RECUPERACAO = [
  (nome, negocio, dias) => `Oi ${nome}! 😊 Tudo bem?\n\nFaz ${dias} dias que não te vemos aqui no ${negocio}. Sentimos sua falta!\n\nQuer agendar um horário? É só me responder aqui 💛`,
  (nome, negocio, dias) => `Olá ${nome}! 👋\n\n${negocio} aqui. Notamos que faz um tempinho (${dias} dias) desde sua última visita.\n\nQuer marcar um horário? Temos disponibilidade essa semana! 📅`,
  (nome, negocio, dias) => `${nome}, oi! 💇\n\nA gente tá com saudade de você aqui no ${negocio}! Já faz ${dias} dias...\n\nQue tal agendar um horário? Me manda uma mensagem e a gente resolve! 😄`,
];

const MENSAGENS_ANIVERSARIO = [
  (nome) => `🎂 Feliz aniversário, ${nome}!\n\nEm seu dia especial, queremos te desejar tudo de melhor! 🎉\n\nQue tal se presentear com um horário especial? Fala com a gente! 💛`,
];

const MENSAGENS_POS_SERVICO = [
  (nome, servico) => `Oi ${nome}! Como ficou o ${servico}? 😊\n\nEsperamos que tenha adorado! Sua opinião é muito importante pra gente.\n\nQuando quiser repetir, é só chamar! 💛`,
];

async function buscarInstanciaAdmin(adminId) {
  try {
    const inst = await InstanciaWhatsapp.findOne({
      adminId,
      status: { $in: ['conectado','open','connected'] }
    }).lean();
    return inst;
  } catch(e) { return null; }
}

async function enviarMensagemRecuperacao(instanciaId, telefone, mensagem) {
  try {
    await EvolutionMultiService.enviarMensagem(instanciaId, telefone, mensagem);
    return true;
  } catch(e) {
    console.error('[RECUPERACAO] Erro ao enviar para', telefone, ':', e.message);
    return false;
  }
}

// ===== RECUPERAÇÃO DE CLIENTES INATIVOS =====
async function executarRecuperacao() {
  console.log('[RECUPERACAO] Iniciando ciclo de recuperação...');
  try {
    const admins = await AdminAgenda.find({
      ativo: true,
      'config.recuperacaoAtiva': true
    }).lean();

    console.log(`[RECUPERACAO] ${admins.length} admins com recuperação ativa`);

    for (const admin of admins) {
      try {
        const diasInativo = admin.config?.diasInativo || 30;
        const instancia = await buscarInstanciaAdmin(admin._id);
        if (!instancia) continue;

        const corte = new Date(Date.now() - diasInativo * 24 * 60 * 60 * 1000);

        // Buscar clientes inativos há X dias
        const clientesInativos = await ClienteAgenda.find({
          adminId: admin._id,
          ultimoAtendimento: { $lt: corte, $exists: true },
          totalAtendimentos: { $gte: 1 }
        }).lean();

        console.log(`[RECUPERACAO] Admin ${admin.nomeNegocio}: ${clientesInativos.length} clientes inativos`);

        for (const cliente of clientesInativos) {
          // Verificar se já enviamos nos últimos 15 dias
          const chaveRecup = `recup_${admin._id}_${cliente._id}`;
          if (!global._recuperacaoEnviada) global._recuperacaoEnviada = new Map();
          const ultimoEnvio = global._recuperacaoEnviada.get(chaveRecup);
          if (ultimoEnvio && (Date.now() - ultimoEnvio) < 15 * 24 * 60 * 60 * 1000) continue;

          // Verificar se já tem agendamento futuro
          const agFuturo = await AgendamentoAgenda.findOne({
            adminId: admin._id,
            telefoneCliente: cliente.telefone,
            dataHora: { $gte: new Date() },
            status: { $in: ['pendente','confirmado'] }
          }).lean();
          if (agFuturo) continue;

          const dias = Math.floor((Date.now() - new Date(cliente.ultimoAtendimento)) / (24*60*60*1000));
          const idx = Math.floor(Math.random() * MENSAGENS_RECUPERACAO.length);
          const msg = MENSAGENS_RECUPERACAO[idx](
            cliente.nome.split(' ')[0],
            admin.nomeNegocio || 'nós',
            dias
          );

          const enviado = await enviarMensagemRecuperacao(instancia._id, cliente.telefone, msg);
          if (enviado) {
            global._recuperacaoEnviada.set(chaveRecup, Date.now());
            console.log(`[RECUPERACAO] Mensagem enviada para ${cliente.nome} (${cliente.telefone})`);
            // Delay entre mensagens para não parecer spam
            await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
          }
        }
      } catch(e) {
        console.error(`[RECUPERACAO] Erro admin ${admin._id}:`, e.message);
      }
    }
  } catch(e) {
    console.error('[RECUPERACAO] Erro geral:', e.message);
  }
}

// ===== PÓS-SERVIÇO: mensagem após conclusão =====
async function enviarPosSevico(agendamento) {
  try {
    const admin = await AdminAgenda.findById(agendamento.adminId).lean();
    if (!admin?.config?.posServicoAtivo) return;

    const instancia = await buscarInstanciaAdmin(agendamento.adminId);
    if (!instancia) return;

    // Aguardar 2h após o serviço antes de enviar
    const delayMs = 2 * 60 * 60 * 1000;
    setTimeout(async () => {
      try {
        const nome = agendamento.nomeCliente.split(' ')[0];
        const msg = MENSAGENS_POS_SERVICO[0](nome, agendamento.nomeServico || 'serviço');
        await enviarMensagemRecuperacao(instancia._id, agendamento.telefoneCliente, msg);
        console.log(`[POS-SERVICO] Mensagem enviada para ${agendamento.nomeCliente}`);
      } catch(e) { console.error('[POS-SERVICO] Erro:', e.message); }
    }, delayMs);
  } catch(e) { console.error('[POS-SERVICO] Erro:', e.message); }
}

// ===== ANIVERSÁRIO =====
async function verificarAniversarios() {
  try {
    const hoje = new Date();
    const dia = hoje.getDate();
    const mes = hoje.getMonth() + 1;

    const admins = await AdminAgenda.find({ ativo: true, 'config.aniversarioAtivo': true }).lean();

    for (const admin of admins) {
      const instancia = await buscarInstanciaAdmin(admin._id);
      if (!instancia) continue;

      // Buscar clientes com aniversário hoje (campo dataNascimento se existir)
      const clientes = await ClienteAgenda.find({
        adminId: admin._id,
        dataNascimento: { $exists: true, $ne: null }
      }).lean();

      for (const c of clientes) {
        if (!c.dataNascimento) continue;
        const dn = new Date(c.dataNascimento);
        if (dn.getDate() === dia && (dn.getMonth() + 1) === mes) {
          const msg = MENSAGENS_ANIVERSARIO[0](c.nome.split(' ')[0]);
          await enviarMensagemRecuperacao(instancia._id, c.telefone, msg);
          console.log(`[ANIVERSARIO] Parabéns enviado para ${c.nome}`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  } catch(e) { console.error('[ANIVERSARIO] Erro:', e.message); }
}

// ===== CRONS =====
// Recuperação: toda terça e quinta às 10h
cron.schedule('0 10 * * 2,4', async () => {
  console.log('[CRON] Recuperação de clientes inativos');
  await executarRecuperacao();
});

// Aniversários: todo dia às 9h
cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] Verificando aniversários');
  await verificarAniversarios();
});


// ===== ANTI-BLOQUEIO: enviar mensagem vazia/invisível periodicamente =====
const MSGS_ANTI_BLOQUEIO = [
  '.',
  '​', // zero-width space
];

async function executarAntiBloqueio() {
  try {
    const admins = await AdminAgenda.find({ ativo: true, 'config.antiBloqueioAtivo': true }).lean();
    for (const admin of admins) {
      try {
        const inst = await buscarInstanciaAdmin(admin._id);
        if (!inst) continue;
        // Enviar mensagem para o próprio número (eco) para manter sessão ativa
        const tel = inst.telefoneConectado;
        if (!tel) continue;
        await EvolutionMultiService.enviarMensagem(inst._id, tel, '​');
        console.log('[ANTI-BLOQUEIO] Ping enviado para instância', inst.nomeInstancia);
      } catch(e) { /* silencioso */ }
    }
  } catch(e) { console.error('[ANTI-BLOQUEIO] Erro:', e.message); }
}

// Anti-bloqueio: a cada 6 horas
cron.schedule('0 */6 * * *', async () => {
  await executarAntiBloqueio();
});

module.exports = {
  executarRecuperacao,
  enviarPosServico: enviarPosSevico,
  verificarAniversarios
};
