/**
 * soft-produtos.routes.js
 * Prefixo: /api/soft/produtos
 */
const router = require('express').Router();

const ctrl = require('../controllers/soft-produtos.controller');
const { softAutenticar }                   = require('../middleware/soft-auth.middleware');
const { tenantGuard, softInjetarAdminId }  = require('../middleware/soft-tenant.middleware');
const { softValidarObjectId, softRequerCampos, softSanitizarString } = require('../middleware/soft-validate.middleware');
const { softLimites } = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

// POST /api/soft/produtos
router.post('/',
  softInjetarAdminId,
  softRequerCampos(['nome', 'preco']),
  softSanitizarString([{ campo: 'nome', max: 200 }, { campo: 'descricao', max: 1000 }]),
  ctrl.criar
);

// GET /api/soft/produtos
router.get('/', ctrl.listar);

// GET /api/soft/produtos/:id
router.get('/:id', softValidarObjectId(['id']), ctrl.buscarPorId);

// PUT /api/soft/produtos/:id
router.put('/:id',
  softValidarObjectId(['id']),
  softSanitizarString([{ campo: 'nome', max: 200 }, { campo: 'descricao', max: 1000 }]),
  ctrl.atualizar
);

// DELETE /api/soft/produtos/:id  (soft delete)
router.delete('/:id', softValidarObjectId(['id']), ctrl.remover);

// PATCH /api/soft/produtos/:id/reativar
router.patch('/:id/reativar', softValidarObjectId(['id']), ctrl.reativar);

module.exports = router;
