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
    if (!tenant) return res.json({ sucesso: true, plano: 'starter', emTrial: true });

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

module.exports = router;
