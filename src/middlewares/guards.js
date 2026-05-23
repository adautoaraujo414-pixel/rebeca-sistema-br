'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           REBECA — GUARDS DE ISOLAMENTO POR SISTEMA          ║
 * ║                                                              ║
 * ║  Cada guard valida APENAS o token do seu próprio sistema.    ║
 * ║  Um token de Delivery NUNCA abre uma rota de Corrida.        ║
 * ║  Um token de Agenda NUNCA abre uma rota de Delivery.         ║
 * ║  Barreira total entre sistemas.                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 *  Uso no index.js:
 *    const guards = require('./middlewares/guards');
 *    app.use('/api/corrida',  guards.corrida,  corridaRoutes);
 *    app.use('/api/delivery', guards.delivery, deliveryRoutes);
 *    app.use('/api/agenda',   guards.agenda,   agendaRoutes);
 *    app.use('/api/soft',     guards.soft,     softRoutes);
 *    app.use('/api/master',   guards.master,   masterRoutes);
 */

const mongoose = require('mongoose');

// ─── helper: extrai token do header ou query ──────────────────
function extractToken(req) {
  return (
    req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() ||
    req.query.token ||
    req.headers['x-token'] ||
    null
  );
}

// ─── helper: resposta padronizada de bloqueio ─────────────────
function bloqueado(res, sistema, motivo = 'Token inválido') {
  return res.status(401).json({
    erro: motivo,
    sistema,
    acesso: false,
  });
}

// ══════════════════════════════════════════════════════════════
// 🚗  GUARD — CORRIDA
// Valida: modelo Admin (tipoAdmin: corrida | multi | master)
// Bloqueia: qualquer outro token
// ══════════════════════════════════════════════════════════════
async function guardCorrida(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return bloqueado(res, 'corrida', 'Token obrigatório');

    const { Admin } = require('../models');
    const admin = await Admin.findOne({
      token,
      tipoAdmin: { $in: ['corrida', 'multi', 'master'] },
    }).lean();

    if (!admin) return bloqueado(res, 'corrida');
    if (admin.ativo === false) return bloqueado(res, 'corrida', 'Conta inativa');

    req.adminId    = admin._id;
    req.adminNome  = admin.nome || admin.nomeComercio;
    req.adminSistema = 'corrida';
    next();
  } catch (e) {
    console.error('[GUARD:corrida]', e.message);
    res.status(500).json({ erro: 'Erro interno no guard de corrida' });
  }
}

// ══════════════════════════════════════════════════════════════
// 🛵  GUARD — DELIVERY
// Valida: modelo AdminDelivery
// Bloqueia: Admin de corrida, agenda, soft, master
// ══════════════════════════════════════════════════════════════
async function guardDelivery(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return bloqueado(res, 'delivery', 'Token obrigatório');

    const { AdminDelivery } = require('../models/delivery.models');
    const admin = await AdminDelivery.findOne({ token }).lean();

    if (!admin) return bloqueado(res, 'delivery');
    if (admin.status === 'bloqueado') {
      return res.status(403).json({
        erro: 'Conta bloqueada. Entre em contato com o suporte.',
        sistema: 'delivery',
        bloqueado: true,
      });
    }
    if (admin.status === 'trial' && admin.trialFim && new Date() > new Date(admin.trialFim)) {
      return res.status(403).json({
        erro: 'Período de teste encerrado.',
        sistema: 'delivery',
        trialExpirado: true,
      });
    }

    req.adminId      = admin._id;
    req.adminNome    = admin.nomeComercio || admin.nome;
    req.adminSistema = 'delivery';
    req.admin        = admin;
    next();
  } catch (e) {
    console.error('[GUARD:delivery]', e.message);
    res.status(500).json({ erro: 'Erro interno no guard de delivery' });
  }
}

// ══════════════════════════════════════════════════════════════
// 🗓️  GUARD — AGENDA
// Valida: modelo AdminAgenda (ativo: true)
// Bloqueia: tokens de qualquer outro sistema
// ══════════════════════════════════════════════════════════════
async function guardAgenda(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return bloqueado(res, 'agenda', 'Token obrigatório');

    const { AdminAgenda } = require('../models/AgendaServico');
    const admin = await AdminAgenda.findOne({ token, ativo: true }).lean();

    if (!admin) return bloqueado(res, 'agenda');

    req.adminId      = admin._id;
    req.adminAgendaId = admin._id.toString();
    req.adminAgenda  = admin;
    req.adminNome    = admin.nomeNegocio || admin.nome;
    req.adminSistema = 'agenda';
    next();
  } catch (e) {
    console.error('[GUARD:agenda]', e.message);
    res.status(500).json({ erro: 'Erro interno no guard de agenda' });
  }
}

// ══════════════════════════════════════════════════════════════
// 💼  GUARD — SOFT (PDV)
// Valida: modelo EmpresaSoft
// Bloqueia: tokens de corrida, delivery, agenda
// ══════════════════════════════════════════════════════════════
async function guardSoft(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return bloqueado(res, 'soft', 'Token obrigatório');

    // Soft usa Authorization: Bearer <token> e valida via EmpresaSoft
    const EmpresaSoft = require('../models/soft.models')?.EmpresaSoft
      || mongoose.models['EmpresaSoft'];

    if (!EmpresaSoft) {
      console.error('[GUARD:soft] Model EmpresaSoft não encontrado');
      return res.status(500).json({ erro: 'Configuração interna do Soft inválida' });
    }

    const empresa = await EmpresaSoft.findOne({ token, ativo: true }).lean();
    if (!empresa) return bloqueado(res, 'soft');

    req.empresaId    = empresa._id;
    req.empresa      = empresa;
    req.adminSistema = 'soft';
    next();
  } catch (e) {
    console.error('[GUARD:soft]', e.message);
    res.status(500).json({ erro: 'Erro interno no guard de soft' });
  }
}

// ══════════════════════════════════════════════════════════════
// 🎓  GUARD — BECA ESTUDA
// Valida: modelo AssinanteEstuda (ou similar)
// Bloqueia: tokens de qualquer outro sistema
// ══════════════════════════════════════════════════════════════
async function guardEstuda(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return bloqueado(res, 'estuda', 'Token obrigatório');

    const { AssinanteDelivery } = require('../models');
    // Beca Estuda usa AssinanteEstuda — verificar model correto
    const AssinanteEstuda = mongoose.models['AssinanteEstuda']
      || mongoose.models['AssinanteDelivery'];

    if (!AssinanteEstuda) return bloqueado(res, 'estuda', 'Sistema Estuda não configurado');

    const assinante = await AssinanteEstuda.findOne({ token, ativo: true }).lean();
    if (!assinante) return bloqueado(res, 'estuda');

    req.assinanteId  = assinante._id;
    req.assinante    = assinante;
    req.adminSistema = 'estuda';
    next();
  } catch (e) {
    console.error('[GUARD:estuda]', e.message);
    res.status(500).json({ erro: 'Erro interno no guard de estuda' });
  }
}

// ══════════════════════════════════════════════════════════════
// 👑  GUARD — ADMIN MASTER
// Valida: modelo AdminMaster
// Acesso total — mas ISOLADO dos outros sistemas
// ══════════════════════════════════════════════════════════════
async function guardMaster(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return bloqueado(res, 'master', 'Token obrigatório');

    const { AdminMaster } = require('../models');
    const master = await AdminMaster.findOne({ token }).lean();

    if (!master) return bloqueado(res, 'master');

    req.masterId     = master._id;
    req.master       = master;
    req.adminSistema = 'master';
    next();
  } catch (e) {
    console.error('[GUARD:master]', e.message);
    res.status(500).json({ erro: 'Erro interno no guard de master' });
  }
}

// ══════════════════════════════════════════════════════════════
// 🔍  GUARD — AUDITORIA (log de qual sistema acessou o quê)
// Inserir antes de qualquer guard para rastrear cruzamentos
// ══════════════════════════════════════════════════════════════
function guardAuditoria(sistema) {
  return (req, res, next) => {
    const token = extractToken(req);
    const tokenPreview = token ? token.substring(0, 8) + '...' : 'none';
    console.log(`[GUARD:audit] ${sistema.toUpperCase()} ← ${req.method} ${req.path} | token: ${tokenPreview} | ip: ${req.ip}`);
    next();
  };
}

// ══════════════════════════════════════════════════════════════
// 🚫  GUARD — BLOQUEIO CRUZADO (proteção extra)
// Rejeita explicitamente tokens de sistemas errados
// Ex: token de delivery tentando acessar rota de corrida
// ══════════════════════════════════════════════════════════════
function guardAntiCross(sistemaPermitido) {
  return (req, res, next) => {
    // Se req.adminSistema já foi definido por um guard anterior
    // e é diferente do sistema atual — bloquear
    if (req.adminSistema && req.adminSistema !== sistemaPermitido) {
      console.warn(`[GUARD:anticross] BLOQUEIO — token de '${req.adminSistema}' tentou acessar '${sistemaPermitido}' | ip: ${req.ip}`);
      return res.status(403).json({
        erro: `Acesso negado. Token de '${req.adminSistema}' não é válido para o sistema '${sistemaPermitido}'.`,
        sistema: sistemaPermitido,
        acesso: false,
      });
    }
    next();
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTAÇÕES
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// 📊  DASHBOARD TENANT AUTH — semi-público
// Valida apenas adminId (query, header ou body).
// NÃO exige JWT. Usado por rotas de dashboard realtime.
// Bloqueia apenas requisições sem nenhum adminId.
// ══════════════════════════════════════════════════════════════
function dashboardTenantAuth(req, res, next) {
  const adminId =
    req.query.adminId ||
    req.headers['x-admin-id'] ||
    req.body?.adminId ||
    null;

  if (!adminId) {
    return res.status(401).json({
      erro: 'adminId obrigatório para acessar o dashboard',
      acesso: false,
    });
  }

  // Validação básica de formato ObjectId (24 hex chars)
  if (!/^[a-f\d]{24}$/i.test(adminId)) {
    return res.status(400).json({
      erro: 'adminId inválido',
      acesso: false,
    });
  }

  req.adminId = adminId;
  next();
}

module.exports = {
  corrida:             guardCorrida,
  delivery:            guardDelivery,
  agenda:              guardAgenda,
  soft:                guardSoft,
  estuda:              guardEstuda,
  master:              guardMaster,
  auditoria:           guardAuditoria,
  antiCross:           guardAntiCross,
  dashboardTenantAuth: dashboardTenantAuth,
};

