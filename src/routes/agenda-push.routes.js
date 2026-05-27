const express = require('express');

// Helper UTC-3 Brasil
function _iniDia(d) { const b = d ? new Date(d) : new Date(); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0, 0)); }
function _fimDia(d) { const b = d ? new Date(d) : new Date(); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()+1, 2, 59, 59, 999)); }
const router = express.Router();
const webpush = require('web-push');
const cron = require('node-cron');
const { AdminAgenda, AgendamentoAgenda, PushSubscriptionAgenda } = require('../models/AgendaServico');

// Configurar VAPID
// Configurar VAPID apenas se as chaves existirem
const VAPID_OK = process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE;
if (VAPID_OK) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:contato@rebecaagenda.com.br',
    process.env.VAPID_PUBLIC,
    process.env.VAPID_PRIVATE
  );
} else {
  console.warn('[PUSH] VAPID keys não configuradas - notificações push desativadas');
}

// Auth middleware
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

// ===== SALVAR SUBSCRIPTION (admin) =====
router.post('/subscribe/admin', authAgenda, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ erro: 'Subscription inválida' });
    await PushSubscriptionAgenda.findOneAndUpdate(
      { endpoint },
      { adminId: req.adminAgendaId, endpoint, keys, tipo: 'admin', ativo: true },
      { upsert: true, new: true }
    );
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== SALVAR SUBSCRIPTION (cliente do espaço) =====
router.post('/subscribe/cliente/:adminId', async (req, res) => {
  try {
    const { endpoint, keys, telefone } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ erro: 'Subscription inválida' });
    await PushSubscriptionAgenda.findOneAndUpdate(
      { endpoint },
      { adminId: req.params.adminId, clienteTelefone: telefone || '', endpoint, keys, tipo: 'cliente', ativo: true },
      { upsert: true, new: true }
    );
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== ENVIAR NOTIFICAÇÃO MANUAL =====
router.post('/enviar', authAgenda, async (req, res) => {
  try {
    const { titulo, corpo, url, para } = req.body; // para: 'admin' | 'clientes' | 'todos'
    const filtro = { adminId: req.adminAgendaId, ativo: true };
    if (para === 'admin') filtro.tipo = 'admin';
    else if (para === 'clientes') filtro.tipo = 'cliente';
    const subs = await PushSubscriptionAgenda.find(filtro);
    let enviados = 0, erros = 0;
    const payload = JSON.stringify({ titulo, corpo, url: url || '/espaco-digital', icon: '/agenda-icon.svg' });
    for (const sub of subs) {
      try {
        if (!VAPID_OK) return; await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        enviados++;
      } catch(e) {
        erros++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          await PushSubscriptionAgenda.findByIdAndUpdate(sub._id, { ativo: false });
        }
      }
    }
    res.json({ sucesso: true, enviados, erros });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== FUNÇÃO INTERNA: enviar push para admin =====
async function notificarAdmin(adminId, titulo, corpo, url) {
  try {
    const subs = await PushSubscriptionAgenda.find({ adminId, tipo: 'admin', ativo: true });
    const payload = JSON.stringify({ titulo, corpo, url: url || '/agenda-adm', icon: '/agenda-icon.svg' });
    for (const sub of subs) {
      try {
        if (!VAPID_OK) return; await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
      } catch(e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await PushSubscriptionAgenda.findByIdAndUpdate(sub._id, { ativo: false });
        }
      }
    }
  } catch(e) { console.error('Push admin erro:', e.message); }
}

// ===== FUNÇÃO INTERNA: enviar push para cliente =====
async function notificarCliente(telefone, adminId, titulo, corpo, url) {
  try {
    const subs = await PushSubscriptionAgenda.find({ clienteTelefone: telefone, adminId, tipo: 'cliente', ativo: true });
    const payload = JSON.stringify({ titulo, corpo, url: url || '/espaco-digital', icon: '/agenda-icon.svg' });
    for (const sub of subs) {
      try {
        if (!VAPID_OK) return; await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
      } catch(e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await PushSubscriptionAgenda.findByIdAndUpdate(sub._id, { ativo: false });
        }
      }
    }
  } catch(e) { console.error('Push cliente erro:', e.message); }
}

// ===== CRON: lembrete 24h antes =====
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Verificando lembretes de agendamento...');
  try {
    const agora = new Date();
    const amanha = new Date(agora);
    amanha.setDate(agora.getDate() + 1);
    const inicio = _iniDia(amanha);
    const fim = _fimDia(amanha);

    const ags = await AgendamentoAgenda.find({
      dataHora: { $gte: inicio, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    });

    console.log(`[CRON] ${ags.length} agendamentos para amanhã`);

    for (const ag of ags) {
      const hora = new Date(ag.dataHora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const servico = ag.nomeServico || 'seu horário';

      // Notificar admin
      await notificarAdmin(
        ag.adminId,
        '📅 Agendamento amanhã',
        `${ag.nomeCliente} - ${servico} às ${hora}`,
        '/agenda-adm'
      );

      // Notificar cliente
      await notificarCliente(
        ag.telefoneCliente,
        ag.adminId,
        '⏰ Lembrete de agendamento',
        `Seu ${servico} está marcado para amanhã às ${hora}. Confirme sua presença!`,
        '/espaco-digital?id=' + ag.adminId
      );
    }
  } catch(e) { console.error('[CRON] Erro lembretes:', e.message); }
});

// ===== CRON: lembrete 2h antes =====
cron.schedule('0 * * * *', async () => {
  try {
    const agora = new Date();
    const em2h = new Date(agora.getTime() + 2 * 60 * 60 * 1000);
    const inicio = new Date(em2h); inicio.setMinutes(0,0,0);
    const fim = new Date(em2h); fim.setMinutes(59,59,999);

    const ags = await AgendamentoAgenda.find({
      dataHora: { $gte: inicio, $lte: fim },
      status: { $in: ['pendente','confirmado'] }
    });

    for (const ag of ags) {
      const hora = new Date(ag.dataHora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const servico = ag.nomeServico || 'horário';
      await notificarCliente(
        ag.telefoneCliente, ag.adminId,
        '⏰ Em 2 horas!',
        `Seu ${servico} está confirmado para hoje às ${hora}. Te esperamos!`,
        '/espaco-digital?id=' + ag.adminId
      );
    }
  } catch(e) { console.error('[CRON] Erro lembrete 2h:', e.message); }
});

// ===== VAPID PUBLIC KEY (para o frontend) =====
router.get('/vapid-public', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC });
});

// ===== STATUS =====
router.get('/status', authAgenda, async (req, res) => {
  try {
    const total = await PushSubscriptionAgenda.countDocuments({ adminId: req.adminAgendaId, ativo: true });
    const admins = await PushSubscriptionAgenda.countDocuments({ adminId: req.adminAgendaId, tipo: 'admin', ativo: true });
    const clientes = await PushSubscriptionAgenda.countDocuments({ adminId: req.adminAgendaId, tipo: 'cliente', ativo: true });
    res.json({ sucesso: true, total, admins, clientes });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = { router, notificarAdmin, notificarCliente };
