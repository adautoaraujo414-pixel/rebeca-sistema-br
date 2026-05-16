/**
 * soft-vendas.routes.js
 * Prefixo: /api/soft/vendas
 */
const router = require('express').Router();

const ctrl = require('../controllers/soft-venda.controller');
const { softAutenticar }              = require('../middleware/soft-auth.middleware');
const { tenantGuard }                 = require('../middleware/soft-tenant.middleware');
const { softRequerCampos, softValidarObjectId } = require('../middleware/soft-validate.middleware');
const { softLimites }                 = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

// POST /api/soft/vendas
router.post('/',
  softRequerCampos(['itens', 'formaPagamento']),
  ctrl.registrar
);

// GET /api/soft/vendas
router.get('/', ctrl.listar);

// GET /api/soft/vendas/caixa/:caixaId/resumo  — ANTES de /:id para não colidir
router.get('/caixa/:caixaId/resumo',
  softValidarObjectId(['caixaId']),
  ctrl.resumoDoCaixa
);

// GET /api/soft/vendas/:id
router.get('/:id',
  softValidarObjectId(['id']),
  ctrl.buscarPorId
);

// POST /api/soft/vendas/:id/cancelar
router.post('/:id/cancelar',
  softValidarObjectId(['id']),
  softRequerCampos(['motivo']),
  ctrl.cancelar
);

module.exports = router;
