/**
 * soft-estoque.routes.js
 * Prefixo: /api/soft/estoque
 */
const router = require('express').Router();

const ctrl = require('../controllers/soft-estoque.controller');
const { softAutenticar }                  = require('../middleware/soft-auth.middleware');
const { tenantGuard }                     = require('../middleware/soft-tenant.middleware');
const { softRequerCampos, softValidarObjectId } = require('../middleware/soft-validate.middleware');
const { softLimites }                     = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

// POST /api/soft/estoque/entrada
router.post('/entrada',
  softRequerCampos(['produtoId', 'quantidade']),
  ctrl.entrada
);

// POST /api/soft/estoque/saida
router.post('/saida',
  softRequerCampos(['produtoId', 'quantidade', 'motivo']),
  ctrl.saida
);

// POST /api/soft/estoque/ajuste
router.post('/ajuste',
  softRequerCampos(['produtoId', 'estoqueNovo', 'motivo']),
  ctrl.ajuste
);

// GET /api/soft/estoque/historico
router.get('/historico', ctrl.historico);

// GET /api/soft/estoque/alertas
router.get('/alertas', ctrl.alertasEstoque);

// GET /api/soft/estoque/saldo/:produtoId
router.get('/saldo/:produtoId',
  softValidarObjectId(['produtoId']),
  ctrl.saldoAtual
);

module.exports = router;
