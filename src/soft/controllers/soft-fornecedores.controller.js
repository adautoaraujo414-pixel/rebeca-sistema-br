/**
 * soft-fornecedores.controller.js
 */
const svc = require('../services/soft-fornecedor.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS = ['NEG_006','ACE_001','ACE_002','VAL_001','VAL_002','VAL_003','VAL_004','VAL_005'];
const _err  = (res, err) => ERROS.includes(err.message)
  ? softErroRes(res, err.message, err.detalhe)
  : softErroInterno(res, err);

async function criar(req, res) {
  try {
    const { nome, telefone, email, cnpj } = req.body;
    return softCriado(res, await svc.criar({ adminId: req.softAdminId, nome, telefone, email, cnpj }));
  } catch (err) { return _err(res, err); }
}

async function listar(req, res) {
  try {
    const r = await svc.listar({ adminId: req.softAdminId, query: req.query });
    return softOk(res, r.fornecedores, r.meta);
  } catch (err) { return _err(res, err); }
}

async function buscarPorId(req, res) {
  try {
    return softOk(res, await svc.buscarPorId({ adminId: req.softAdminId, fornecedorId: req.params.id }));
  } catch (err) { return _err(res, err); }
}

async function atualizar(req, res) {
  try {
    const { nome, telefone, email, cnpj } = req.body;
    return softOk(res, await svc.atualizar({ adminId: req.softAdminId, fornecedorId: req.params.id, nome, telefone, email, cnpj }));
  } catch (err) { return _err(res, err); }
}

async function remover(req, res) {
  try {
    return softOk(res, await svc.remover({ adminId: req.softAdminId, fornecedorId: req.params.id }));
  } catch (err) { return _err(res, err); }
}

module.exports = { criar, listar, buscarPorId, atualizar, remover };
