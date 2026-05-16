/**
 * soft-compras.controller.js
 */
const svc = require('../services/soft-compra.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS = [
  'NEG_001','NEG_002','NEG_005','NEG_006','NEG_007','NEG_008',
  'ACE_001','ACE_002',
  'VAL_001','VAL_002','VAL_003','VAL_004','VAL_005',
];
const _err = (res, err) => ERROS.includes(err.message)
  ? softErroRes(res, err.message, err.detalhe)
  : softErroInterno(res, err);

async function registrar(req, res) {
  try {
    const { fornecedorId, itens, notaFiscal, observacao } = req.body;
    const compra = await svc.registrar({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      fornecedorId, itens, notaFiscal, observacao,
    });
    return softCriado(res, compra);
  } catch (err) { return _err(res, err); }
}

async function listar(req, res) {
  try {
    const r = await svc.listar({ adminId: req.softAdminId, query: req.query });
    return softOk(res, r.compras, r.meta);
  } catch (err) { return _err(res, err); }
}

async function buscarPorId(req, res) {
  try {
    return softOk(res, await svc.buscarPorId({ adminId: req.softAdminId, compraId: req.params.id }));
  } catch (err) { return _err(res, err); }
}

async function cancelar(req, res) {
  try {
    const { motivo } = req.body;
    const r = await svc.cancelar({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      compraId:     req.params.id,
      motivo,
    });
    return softOk(res, r);
  } catch (err) { return _err(res, err); }
}

module.exports = { registrar, listar, buscarPorId, cancelar };
