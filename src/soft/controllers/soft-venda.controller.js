/**
 * soft-venda.controller.js
 */
const vendaService = require('../services/soft-venda.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS_NEGOCIO = [
  'NEG_001','NEG_002','NEG_004','NEG_005',
  'ACE_001','ACE_002',
  'VAL_001','VAL_002','VAL_003','VAL_004','VAL_005',
];

function _tratarErro(res, err) {
  if (ERROS_NEGOCIO.includes(err.message)) {
    return softErroRes(res, err.message, err.detalhe);
  }
  return softErroInterno(res, err);
}

async function registrar(req, res) {
  try {
    const { itens, desconto, formaPagamento, clienteNome } = req.body;
    const venda = await vendaService.registrar({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      clienteNome, itens, desconto, formaPagamento,
    });
    return softCriado(res, venda);
  } catch (err) { return _tratarErro(res, err); }
}

async function cancelar(req, res) {
  try {
    const { motivo } = req.body;
    const venda = await vendaService.cancelar({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      vendaId:      req.params.id,
      motivo,
    });
    return softOk(res, venda);
  } catch (err) { return _tratarErro(res, err); }
}

async function listar(req, res) {
  try {
    const resultado = await vendaService.listar({
      adminId: req.softAdminId,
      query:   req.query,
    });
    return softOk(res, resultado.vendas, resultado.meta);
  } catch (err) { return _tratarErro(res, err); }
}

async function buscarPorId(req, res) {
  try {
    const venda = await vendaService.buscarPorId({
      adminId: req.softAdminId,
      vendaId: req.params.id,
    });
    return softOk(res, venda);
  } catch (err) { return _tratarErro(res, err); }
}

async function resumoDoCaixa(req, res) {
  try {
    const resultado = await vendaService.resumoDoCaixa({
      adminId:  req.softAdminId,
      caixaId:  req.params.caixaId,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

module.exports = { registrar, cancelar, listar, buscarPorId, resumoDoCaixa };
