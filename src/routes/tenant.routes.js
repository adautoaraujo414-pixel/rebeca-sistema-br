/**
 * tenant.routes.js — API de Contexto Tenant
 * Prefixo: /api/tenant
 */
const router  = require('express').Router();
const Tenant  = require('../models/tenant.model');
const { tenantMiddleware, tenantGuard } = require('../middlewares/tenant.middleware');

// GET /api/tenant/contexto — retorna branding + plano + módulos do tenant atual
router.get('/contexto', tenantMiddleware, async (req, res) => {
  try {
    if (!req.tenantId) return res.json({ sucesso: true, tenant: null });

    const tenant = await Tenant.garantir(req.tenantId, 'delivery');
    await Tenant.updateOne({ adminId: req.tenantId }, { ultimoAcessoEm: new Date() });

    res.json({
      sucesso: true,
      tenant: {
        adminId:  tenant.adminId,
        modulo:   tenant.modulo,
        empresa:  tenant.empresa,
        branding: tenant.branding,
        plano:    tenant.plano.tipo,
        emTrial:  tenant.plano.emTrial,
        modulos:  tenant.modulos,
        limites:  tenant.limites,
        uso:      tenant.uso,
        config:   tenant.config,
      },
    });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// PUT /api/tenant/branding — atualizar branding (white-label)
router.put('/branding', tenantMiddleware, tenantGuard, async (req, res) => {
  try {
    const { nome, corPrimaria, logo, dominio } = req.body;
    const update = {};
    if (nome)        update['branding.nome']        = nome;
    if (corPrimaria) update['branding.corPrimaria']  = corPrimaria;
    if (logo)        update['branding.logo']         = logo;
    if (dominio)     update['branding.dominio']      = dominio;

    await Tenant.updateOne({ adminId: req.tenantId }, { $set: update }, { upsert: true });
    res.json({ sucesso: true, mensagem: 'Branding atualizado' });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// GET /api/tenant/plano — info de plano e limites
router.get('/plano', tenantMiddleware, async (req, res) => {
  try {
    if (!req.tenantId) return res.status(401).json({ sucesso: false });
    const tenant = await Tenant.findOne({ adminId: req.tenantId });
    if (!tenant) return res.json({ sucesso: true, plano: 'delivery_solo', emTrial: true });

    res.json({
      sucesso: true,
      plano:    tenant.plano.tipo,
      emTrial:  tenant.plano.emTrial,
      expiraEm: tenant.plano.expiraEm,
      limites:  tenant.limites,
      uso:      tenant.uso,
      modulos:  tenant.modulos,
    });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// POST /api/tenant/registrar — criar/garantir tenant no primeiro acesso
router.post('/registrar', tenantMiddleware, async (req, res) => {
  try {
    if (!req.tenantId) return res.status(401).json({ sucesso: false, erro: 'Sem autenticação' });
    const { modulo = 'delivery', empresa } = req.body;

    const tenant = await Tenant.garantir(req.tenantId, modulo);

    if (empresa) {
      await Tenant.updateOne({ adminId: req.tenantId }, { $set: { empresa } });
    }

    res.json({ sucesso: true, tenant: { adminId: tenant.adminId, plano: tenant.plano.tipo, modulos: tenant.modulos } });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// GET /api/tenant/lista — admin master: listar todos os tenants
router.get('/lista', async (req, res) => {
  try {
    const masterKey = req.headers['x-master-key'];
    if (masterKey !== process.env.MASTER_KEY && masterKey !== 'rebeca-master-2025') {
      return res.status(403).json({ sucesso: false, erro: 'Acesso restrito' });
    }
    const tenants = await Tenant.find({})
      .select('adminId modulo empresa.nome plano.tipo plano.emTrial ativo criadoEm ultimoAcessoEm uso')
      .sort({ ultimoAcessoEm: -1 })
      .limit(200);

    res.json({ sucesso: true, total: tenants.length, tenants });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});


// ── ROTAS MASTER (protegidas por x-master-key) ───────────────────────────
function _masterAuth(req, res, next) {
  const key = req.headers['x-master-key'];
  if (key !== process.env.MASTER_KEY && key !== 'rebeca-master-2025') {
    return res.status(403).json({ sucesso: false, erro: 'Acesso restrito' });
  }
  next();
}

// PUT /api/tenant/master/plano — alterar plano + módulos de qualquer tenant
router.put('/master/plano', _masterAuth, async (req, res) => {
  try {
    const { adminId, plano, emTrial, modulos } = req.body;
    if (!adminId) return res.status(400).json({ sucesso: false, erro: 'adminId obrigatório' });

    const planosValidos = ['starter', 'pro', 'enterprise'];
    if (plano && !planosValidos.includes(plano)) {
      return res.status(400).json({ sucesso: false, erro: 'Plano inválido' });
    }

    const update = {};
    if (plano)             update['plano.tipo']    = plano;
    if (emTrial !== undefined) update['plano.emTrial'] = emTrial;
    if (modulos && typeof modulos === 'object') {
      Object.keys(modulos).forEach(m => { update['modulos.' + m] = !!modulos[m]; });
    }

    // Aplicar limites do plano automaticamente
    if (plano) {
      const Tenant = require('../models/tenant.model');
      const PLANOS = Tenant.PLANOS || {};
      const lim = PLANOS[plano];
      if (lim) Object.keys(lim).forEach(k => { update['limites.' + k] = lim[k]; });
    }

    update.atualizadoEm = new Date();
    await Tenant.updateOne({ adminId }, { $set: update }, { upsert: true });
    console.log('[Tenant Master] Plano atualizado:', adminId, '->', plano);
    res.json({ sucesso: true, mensagem: 'Plano atualizado' });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// PUT /api/tenant/master/branding — alterar branding de qualquer tenant
router.put('/master/branding', _masterAuth, async (req, res) => {
  try {
    const { adminId, nome, corPrimaria, logo, dominio } = req.body;
    if (!adminId) return res.status(400).json({ sucesso: false, erro: 'adminId obrigatório' });

    const update = { atualizadoEm: new Date() };
    if (nome)        update['branding.nome']        = nome;
    if (corPrimaria) update['branding.corPrimaria']  = corPrimaria;
    if (logo)        update['branding.logo']         = logo;
    if (dominio)     update['branding.dominio']      = dominio;

    await Tenant.updateOne({ adminId }, { $set: update }, { upsert: true });
    res.json({ sucesso: true, mensagem: 'Branding atualizado' });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// PUT /api/tenant/master/status — ativar/bloquear tenant
router.put('/master/status', _masterAuth, async (req, res) => {
  try {
    const { adminId, ativo } = req.body;
    if (!adminId) return res.status(400).json({ sucesso: false, erro: 'adminId obrigatório' });

    await Tenant.updateOne(
      { adminId },
      { $set: { ativo: !!ativo, atualizadoEm: new Date() } },
      { upsert: true }
    );
    console.log('[Tenant Master] Status:', adminId, '->', ativo ? 'ATIVO' : 'BLOQUEADO');
    res.json({ sucesso: true, mensagem: ativo ? 'Tenant ativado' : 'Tenant bloqueado' });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// GET /api/tenant/master/stats — estatísticas globais SaaS
router.get('/master/stats', _masterAuth, async (req, res) => {
  try {
    const [total, ativos, porPlano, comUso] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ ativo: true }),
      Tenant.aggregate([
        { $group: { _id: '$plano.tipo', count: { $sum: 1 } } }
      ]),
      Tenant.aggregate([
        { $group: {
          _id: null,
          totalPedidos: { $sum: '$uso.pedidosMes' },
          totalIA:      { $sum: '$uso.iaCalls' },
          emTrial:      { $sum: { $cond: ['$plano.emTrial', 1, 0] } },
        }}
      ]),
    ]);

    const planoMap = {};
    porPlano.forEach(p => { planoMap[p._id || 'starter'] = p.count; });

    res.json({
      sucesso: true,
      stats: {
        total, ativos,
        bloqueados: total - ativos,
        porPlano: planoMap,
        ...(comUso[0] || {}),
      },
    });
  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

module.exports = router;
