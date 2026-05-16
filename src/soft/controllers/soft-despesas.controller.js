/**
 * soft-despesas.controller.js
 */
const svc = require('../services/soft-despesa.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS = [
  'NEG_005','NEG_009',
  'ACE_001','ACE_002',
  'VAL_001','VAL_002','VAL_003','VAL_004','VAL_005',
];
const _err = (res, err) => ERROS.includes(err.message)
  ? softErroRes(res, err.message, err.detalhe)
  : softErroInterno(res, err);

async function registrar(req, res) {
  try {
    const { tipo, descricao, valor, categoria, data, comprovante } = req.body;
    const despesa = await svc.registrar({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      tipo, descricao, valor, categoria, data, comprovante,
    });
    return softCriado(res, despesa);
  } catch (err) { return _err(res, err); }
}

async function listar(req, res) {
  try {
    const r = await svc.listar({ adminId: req.softAdminId, query: req.query });
    return softOk(res, r.despesas, r.meta, r.totais);
  } catch (err) { return _err(res, err); }
}

async function buscarPorId(req, res) {
  try {
    return softOk(res, await svc.buscarPorId({ adminId: req.softAdminId, despesaId: req.params.id }));
  } catch (err) { return _err(res, err); }
}

async function cancelar(req, res) {
  try {
    const { motivo } = req.body;
    return softOk(res, await svc.cancelar({
      adminId:      req.softAdminId,
      operadorNome: req.softAdmin?.nome || 'Admin',
      despesaId:    req.params.id,
      motivo,
    }));
  } catch (err) { return _err(res, err); }
}

async function categorias(req, res) {
  return softOk(res, svc.categorias());
}

module.exports = { registrar, listar, buscarPorId, cancelar, categorias };
