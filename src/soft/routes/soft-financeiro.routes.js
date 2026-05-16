/**
 * soft-financeiro.routes.js
 * Prefixo: /api/soft/financeiro
 * SOMENTE GET — relatórios não alteram dados.
 */
const router = require('express').Router();
const ctrl   = require('../controllers/soft-financeiro.controller');
const { softAutenticar }         = require('../middleware/soft-auth.middleware');
const { tenantGuard }            = require('../middleware/soft-tenant.middleware');
const { softValidarObjectId }    = require('../middleware/soft-validate.middleware');
const { softLimites }            = require('../middleware/soft-rate-limit.middleware');

router.use(softAutenticar, tenantGuard, softLimites.geral);

// Resumo operacional (sem período — dados de hoje + 30 dias)
router.get('/operacional', ctrl.resumoOperacional);

// Fluxo financeiro por período
router.get('/fluxo', ctrl.fluxoPeriodo);

// Lucro bruto / DRE simplificado
router.get('/lucro', ctrl.lucroBruto);

// Vendas por forma de pagamento
router.get('/vendas/formas', ctrl.vendasPorFormaPagamento);

// Despesas por categoria
router.get('/despesas/categorias', ctrl.despesasPorCategoria);

// Compras por período
router.get('/compras', ctrl.comprasPorPeriodo);

// Resumo de caixa específico
router.get('/caixa/:caixaId/resumo',
  softValidarObjectId(['caixaId']),
  ctrl.resumoCaixa
);

module.exports = router;
