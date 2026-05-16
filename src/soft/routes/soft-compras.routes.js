/**
 * soft-compras.routes.js
 * Prefixo: /api/soft/compras
 */
const router = require('express').Router();
const ctrl   = require('../controllers/soft-compras.controller');
const { softAutenticar }              = require('../middleware/soft-auth.middleware');
const { tenantGuard }                 = require('../middleware/soft-tenant.middleware');
const { softRequerCampos, softValidarObjectId } = require('../middleware/soft-validate.middleware');
const { softLimites }                 = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

router.post('/',   softRequerCampos(['itens']), ctrl.registrar);
router.get('/',    ctrl.listar);
router.get('/:id', softValidarObjectId(['id']), ctrl.buscarPorId);
router.post('/:id/cancelar',
  softValidarObjectId(['id']),
  softRequerCampos(['motivo']),
  ctrl.cancelar
);

module.exports = router;
