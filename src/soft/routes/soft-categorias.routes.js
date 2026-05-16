/**
 * soft-categorias.routes.js
 * Prefixo: /api/soft/categorias
 */
const router = require('express').Router();

const ctrl                          = require('../controllers/soft-categorias.controller');
const { softAutenticar }            = require('../middleware/soft-auth.middleware');
const { tenantGuard, softInjetarAdminId } = require('../middleware/soft-tenant.middleware');
const { softValidarObjectId, softRequerCampos, softSanitizarString } = require('../middleware/soft-validate.middleware');
const { softLimites }               = require('../middleware/soft-rate-limit.middleware');

// Todas as rotas exigem autenticação + tenant guard
router.use(softAutenticar, tenantGuard, softLimites.geral);

// POST /api/soft/categorias
router.post('/',
  softInjetarAdminId,
  softRequerCampos(['nome']),
  softSanitizarString([{ campo: 'nome', max: 100 }]),
  ctrl.criar
);

// GET /api/soft/categorias
router.get('/', ctrl.listar);

// GET /api/soft/categorias/:id
router.get('/:id',
  softValidarObjectId(['id']),
  ctrl.buscarPorId
);

// PUT /api/soft/categorias/:id
router.put('/:id',
  softValidarObjectId(['id']),
  softSanitizarString([{ campo: 'nome', max: 100 }]),
  ctrl.atualizar
);

// DELETE /api/soft/categorias/:id
router.delete('/:id',
  softValidarObjectId(['id']),
  ctrl.remover
);

module.exports = router;
