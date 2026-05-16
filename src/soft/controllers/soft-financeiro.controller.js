/**
 * soft-financeiro.controller.js
 * SOMENTE LEITURA — nenhum handler altera dados.
 */
const svc = require('../services/soft-financeiro.service');
const { softOk, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS = ['ACE_002','VAL_001','VAL_002','VAL_003','VAL_004','VAL_005'];
const _err  = (res, err) => ERROS.includes(err.message)
  ? softErroRes(res, err.message, err.detalhe)
  : softErroInterno(res, err);

// GET /api/soft/financeiro/caixa/:caixaId/resumo
async function resumoCaixa(req, res) {
  try {
    return softOk(res, await svc.resumoCaixa({
      adminId: req.softAdminId, caixaId: req.params.caixaId,
    }));
  } catch (err) { return _err(res, err); }
}

// GET /api/soft/financeiro/fluxo?de=&ate=
async function fluxoPeriodo(req, res) {
  try {
    return softOk(res, await svc.fluxoPeriodo({
      adminId: req.softAdminId, de: req.query.de, ate: req.query.ate,
    }));
  } catch (err) { return _err(res, err); }
}

// GET /api/soft/financeiro/vendas/formas?de=&ate=
async function vendasPorFormaPagamento(req, res) {
  try {
    return softOk(res, await svc.vendasPorFormaPagamento({
      adminId: req.softAdminId, de: req.query.de, ate: req.query.ate,
    }));
  } catch (err) { return _err(res, err); }
}

// GET /api/soft/financeiro/despesas/categorias?de=&ate=
async function despesasPorCategoria(req, res) {
  try {
    return softOk(res, await svc.despesasPorCategoria({
      adminId: req.softAdminId, de: req.query.de, ate: req.query.ate,
    }));
  } catch (err) { return _err(res, err); }
}

// GET /api/soft/financeiro/compras?de=&ate=
async function comprasPorPeriodo(req, res) {
  try {
    return softOk(res, await svc.comprasPorPeriodo({
      adminId: req.softAdminId, de: req.query.de, ate: req.query.ate,
    }));
  } catch (err) { return _err(res, err); }
}

// GET /api/soft/financeiro/lucro?de=&ate=
async function lucroBruto(req, res) {
  try {
    return softOk(res, await svc.lucroBruto({
      adminId: req.softAdminId, de: req.query.de, ate: req.query.ate,
    }));
  } catch (err) { return _err(res, err); }
}

// GET /api/soft/financeiro/operacional
async function resumoOperacional(req, res) {
  try {
    return softOk(res, await svc.resumoOperacional({ adminId: req.softAdminId }));
  } catch (err) { return _err(res, err); }
}

module.exports = {
  resumoCaixa, fluxoPeriodo, vendasPorFormaPagamento,
  despesasPorCategoria, comprasPorPeriodo, lucroBruto, resumoOperacional,
};
