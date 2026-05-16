/**
 * soft-caixa.routes.js
 * Prefixo: /api/soft/caixa
 */
const router = require('express').Router();

const ctrl = require('../controllers/soft-caixa.controller');
const { softAutenticar }              = require('../middleware/soft-auth.middleware');
const { tenantGuard }                 = require('../middleware/soft-tenant.middleware');
const { softRequerCampos, softValidarObjectId } = require('../middleware/soft-validate.middleware');
const { softLimites }                 = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

// POST /api/soft/caixa/abrir
router.post('/abrir',
  softRequerCampos(['saldoInicial']),
  ctrl.abrir
);

// POST /api/soft/caixa/fechar
router.post('/fechar',
  softRequerCampos(['saldoFinal']),
  ctrl.fechar
);

// GET /api/soft/caixa/atual
router.get('/atual', ctrl.caixaAtual);

// GET /api/soft/caixa/historico
router.get('/historico', ctrl.historico);

// POST /api/soft/caixa/suprimento
router.post('/suprimento',
  softRequerCampos(['valor']),
  ctrl.suprimento
);

// POST /api/soft/caixa/sangria
router.post('/sangria',
  softRequerCampos(['valor', 'descricao']),
  ctrl.sangria
);

// GET /api/soft/caixa/:id
router.get('/:id',
  softValidarObjectId(['id']),
  ctrl.buscarPorId
);

// GET /api/soft/caixa/:id/movimentacoes
router.get('/:id/movimentacoes',
  softValidarObjectId(['id']),
  ctrl.movimentacoesDoCaixa
);

module.exports = router;
