/**
 * soft-caixa.controller.js
 */
const caixaService = require('../services/soft-caixa.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS_NEGOCIO = [
  'NEG_003','NEG_004','NEG_005',
  'ACE_001','ACE_002',
  'VAL_001','VAL_002','VAL_003','VAL_004','VAL_005',
];

function _tratarErro(res, err) {
  if (ERROS_NEGOCIO.includes(err.message)) {
    return softErroRes(res, err.message, err.detalhe);
  }
  return softErroInterno(res, err);
}

// POST /api/soft/caixa/abrir
async function abrir(req, res) {
  try {
    const { saldoInicial, operadorNome } = req.body;
    const caixa = await caixaService.abrir({
      adminId:      req.softAdminId,
      operadorNome: operadorNome || req.softAdmin?.nome || 'Admin',
      saldoInicial,
    });
    return softCriado(res, caixa);
  } catch (err) { return _tratarErro(res, err); }
}

// POST /api/soft/caixa/fechar
async function fechar(req, res) {
  try {
    const { saldoFinal, observacao } = req.body;
    const caixa = await caixaService.fechar({
      adminId: req.softAdminId,
      saldoFinal, observacao,
    });
    return softOk(res, caixa);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/caixa/atual
async function caixaAtual(req, res) {
  try {
    const caixa = await caixaService.caixaAtual({ adminId: req.softAdminId });
    return softOk(res, caixa);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/caixa/historico
async function historico(req, res) {
  try {
    const resultado = await caixaService.historico({
      adminId: req.softAdminId,
      query:   req.query,
    });
    return softOk(res, resultado.caixas, resultado.meta);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/caixa/:id
async function buscarPorId(req, res) {
  try {
    const caixa = await caixaService.buscarPorId({
      adminId:  req.softAdminId,
      caixaId:  req.params.id,
    });
    return softOk(res, caixa);
  } catch (err) { return _tratarErro(res, err); }
}

// POST /api/soft/caixa/suprimento
async function suprimento(req, res) {
  try {
    const { valor, descricao } = req.body;
    const resultado = await caixaService.suprimento({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      valor, descricao,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

// POST /api/soft/caixa/sangria
async function sangria(req, res) {
  try {
    const { valor, descricao } = req.body;
    const resultado = await caixaService.sangria({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      valor, descricao,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/caixa/:id/movimentacoes
async function movimentacoesDoCaixa(req, res) {
  try {
    const resultado = await caixaService.movimentacoesDoCaixa({
      adminId:  req.softAdminId,
      caixaId:  req.params.id,
      query:    req.query,
    });
    return softOk(res, resultado.movimentacoes, resultado.meta);
  } catch (err) { return _tratarErro(res, err); }
}

module.exports = {
  abrir, fechar, caixaAtual, historico,
  buscarPorId, suprimento, sangria, movimentacoesDoCaixa,
};
