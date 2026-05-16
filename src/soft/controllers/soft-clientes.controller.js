/**
 * soft-clientes.controller.js
 */
const svc = require('../services/soft-cliente.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS = ['NEG_006','NEG_009','ACE_001','ACE_002','VAL_001','VAL_002','VAL_003','VAL_004','VAL_005'];
const _err  = (res, err) => ERROS.includes(err.message)
  ? softErroRes(res, err.message, err.detalhe)
  : softErroInterno(res, err);

async function criar(req, res) {
  try {
    const { nome, telefone, email, cpf, endereco } = req.body;
    return softCriado(res, await svc.criar({ adminId: req.softAdminId, nome, telefone, email, cpf, endereco }));
  } catch (err) { return _err(res, err); }
}

async function listar(req, res) {
  try {
    const r = await svc.listar({ adminId: req.softAdminId, query: req.query });
    return softOk(res, r.clientes, r.meta);
  } catch (err) { return _err(res, err); }
}

async function buscarPorId(req, res) {
  try {
    return softOk(res, await svc.buscarPorId({ adminId: req.softAdminId, clienteId: req.params.id }));
  } catch (err) { return _err(res, err); }
}

async function atualizar(req, res) {
  try {
    const { nome, telefone, email, cpf, endereco } = req.body;
    return softOk(res, await svc.atualizar({
      adminId: req.softAdminId, clienteId: req.params.id,
      nome, telefone, email, cpf, endereco,
    }));
  } catch (err) { return _err(res, err); }
}

async function remover(req, res) {
  try {
    return softOk(res, await svc.remover({ adminId: req.softAdminId, clienteId: req.params.id }));
  } catch (err) { return _err(res, err); }
}

async function resumo(req, res) {
  try {
    return softOk(res, await svc.resumo({ adminId: req.softAdminId, clienteId: req.params.id }));
  } catch (err) { return _err(res, err); }
}

module.exports = { criar, listar, buscarPorId, atualizar, remover, resumo };
