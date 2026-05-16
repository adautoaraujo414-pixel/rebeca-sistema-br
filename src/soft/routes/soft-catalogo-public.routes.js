/**
 * soft-catalogo-public.routes.js
 * Prefixo: /api/catalogo
 * PÚBLICO — sem JWT. Rate limit próprio mais restritivo.
 */
const router = require('express').Router();
const ctrl   = require('../controllers/soft-catalogo-public.controller');
const { softLimites } = require('../middleware/soft-rate-limit.middleware');

// Rate limit público mais restritivo (sem auth = mais fácil de abusar)
const limitePublico = softLimites.publico || softLimites.geral;

router.get('/:slug',                    limitePublico, ctrl.info);
router.get('/:slug/categorias',         limitePublico, ctrl.categorias);
router.get('/:slug/produtos',           limitePublico, ctrl.produtos);
router.get('/:slug/produto/:produtoId', limitePublico, ctrl.produto);

module.exports = router;
