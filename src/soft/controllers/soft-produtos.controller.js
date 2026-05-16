/**
 * soft-produtos.controller.js
 */
const produtoService = require('../services/soft-produto.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS_NEGOCIO = ['NEG_001','NEG_008','ACE_001','ACE_002','VAL_001','VAL_002','VAL_003','VAL_004','VAL_005'];

function _tratarErro(res, err) {
  if (ERROS_NEGOCIO.includes(err.message)) {
    return softErroRes(res, err.message, err.detalhe);
  }
  return softErroInterno(res, err);
}

async function criar(req, res) {
  try {
    const { nome, descricao, categoriaId, preco, precoCusto, estoque, estoqueMin, unidade, vendaOnline } = req.body;
    const produto = await produtoService.criar({ adminId: req.softAdminId, nome, descricao, categoriaId, preco, precoCusto, estoque, estoqueMin, unidade, vendaOnline });
    return softCriado(res, produto);
  } catch (err) { return _tratarErro(res, err); }
}

async function listar(req, res) {
  try {
    const resultado = await produtoService.listar({ adminId: req.softAdminId, query: req.query });
    return softOk(res, resultado.produtos, resultado.meta);
  } catch (err) { return _tratarErro(res, err); }
}

async function buscarPorId(req, res) {
  try {
    const produto = await produtoService.buscarPorId({ adminId: req.softAdminId, produtoId: req.params.id });
    return softOk(res, produto);
  } catch (err) { return _tratarErro(res, err); }
}

async function atualizar(req, res) {
  try {
    const { nome, descricao, categoriaId, preco, precoCusto, estoqueMin, unidade, vendaOnline } = req.body;
    const produto = await produtoService.atualizar({ adminId: req.softAdminId, produtoId: req.params.id, nome, descricao, categoriaId, preco, precoCusto, estoqueMin, unidade, vendaOnline });
    return softOk(res, produto);
  } catch (err) { return _tratarErro(res, err); }
}

async function remover(req, res) {
  try {
    const resultado = await produtoService.remover({ adminId: req.softAdminId, produtoId: req.params.id });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

async function reativar(req, res) {
  try {
    const resultado = await produtoService.reativar({ adminId: req.softAdminId, produtoId: req.params.id });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

module.exports = { criar, listar, buscarPorId, atualizar, remover, reativar };
