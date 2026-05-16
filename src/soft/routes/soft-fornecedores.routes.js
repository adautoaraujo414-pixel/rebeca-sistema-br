/**
 * soft-fornecedores.routes.js
 * Prefixo: /api/soft/fornecedores
 */
const router = require('express').Router();
const ctrl   = require('../controllers/soft-fornecedores.controller');
const { softAutenticar }                          = require('../middleware/soft-auth.middleware');
const { tenantGuard, softInjetarAdminId }         = require('../middleware/soft-tenant.middleware');
const { softValidarObjectId, softRequerCampos,
        softSanitizarString }                     = require('../middleware/soft-validate.middleware');
const { softLimites }                             = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

router.post('/',
  softInjetarAdminId,
  softRequerCampos(['nome']),
  softSanitizarString([{ campo: 'nome', max: 150 }]),
  ctrl.criar
);
router.get('/', ctrl.listar);
router.get('/:id', softValidarObjectId(['id']), ctrl.buscarPorId);
router.put('/:id',
  softValidarObjectId(['id']),
  softSanitizarString([{ campo: 'nome', max: 150 }]),
  ctrl.atualizar
);
router.delete('/:id', softValidarObjectId(['id']), ctrl.remover);

module.exports = router;
