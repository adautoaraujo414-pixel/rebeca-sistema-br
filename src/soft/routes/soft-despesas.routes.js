/**
 * soft-despesas.routes.js
 * Prefixo: /api/soft/despesas
 */
const router = require('express').Router();
const ctrl   = require('../controllers/soft-despesas.controller');
const { softAutenticar }              = require('../middleware/soft-auth.middleware');
const { tenantGuard }                 = require('../middleware/soft-tenant.middleware');
const { softRequerCampos, softValidarObjectId,
        softSanitizarString }         = require('../middleware/soft-validate.middleware');
const { softLimites }                 = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

// GET /api/soft/despesas/categorias — ANTES de /:id para não colidir
router.get('/categorias', ctrl.categorias);

router.post('/',
  softRequerCampos(['tipo', 'descricao', 'valor']),
  softSanitizarString([{ campo: 'descricao', max: 300 }]),
  ctrl.registrar
);
router.get('/', ctrl.listar);
router.get('/:id',  softValidarObjectId(['id']), ctrl.buscarPorId);
router.post('/:id/cancelar',
  softValidarObjectId(['id']),
  softRequerCampos(['motivo']),
  ctrl.cancelar
);

module.exports = router;
