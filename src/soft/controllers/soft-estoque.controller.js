/**
 * soft-estoque.controller.js
 * Sem lógica de negócio — HTTP → service → response.
 */
const estoqueService = require('../services/soft-estoque.service');
const { softOk, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS_NEGOCIO = [
  'NEG_001','NEG_002','NEG_008',
  'ACE_001','ACE_002',
  'VAL_001','VAL_002','VAL_003','VAL_004','VAL_005',
];

function _tratarErro(res, err) {
  if (ERROS_NEGOCIO.includes(err.message)) {
    return softErroRes(res, err.message, err.detalhe);
  }
  return softErroInterno(res, err);
}

// POST /api/soft/estoque/entrada
async function entrada(req, res) {
  try {
    const { produtoId, quantidade, motivo } = req.body;
    const resultado = await estoqueService.entrada({
      adminId:      req.softAdminId,
      operadorId:   req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      produtoId, quantidade, motivo,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

// POST /api/soft/estoque/saida
async function saida(req, res) {
  try {
    const { produtoId, quantidade, motivo } = req.body;
    const resultado = await estoqueService.saida({
      adminId:      req.softAdminId,
      operadorId:   req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      produtoId, quantidade, motivo,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

// POST /api/soft/estoque/ajuste
async function ajuste(req, res) {
  try {
    const { produtoId, estoqueNovo, motivo } = req.body;
    const resultado = await estoqueService.ajuste({
      adminId:      req.softAdminId,
      operadorId:   req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      produtoId, estoqueNovo, motivo,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/estoque/historico
async function historico(req, res) {
  try {
    const resultado = await estoqueService.historico({
      adminId: req.softAdminId,
      query:   req.query,
    });
    return softOk(res, resultado.movimentacoes, resultado.meta);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/estoque/saldo/:produtoId
async function saldoAtual(req, res) {
  try {
    const resultado = await estoqueService.saldoAtual({
      adminId:   req.softAdminId,
      produtoId: req.params.produtoId,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/estoque/alertas
async function alertasEstoque(req, res) {
  try {
    const resultado = await estoqueService.alertasEstoque({
      adminId: req.softAdminId,
      query:   req.query,
    });
    return softOk(res, resultado.produtos, resultado.meta);
  } catch (err) { return _tratarErro(res, err); }
}

module.exports = { entrada, saida, ajuste, historico, saldoAtual, alertasEstoque };
