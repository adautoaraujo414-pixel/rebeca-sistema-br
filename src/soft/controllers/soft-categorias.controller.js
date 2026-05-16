/**
 * soft-categorias.controller.js
 * Sem lógica de negócio — apenas HTTP → service → response.
 */
const categoriaService = require('../services/soft-categoria.service');
const { softOk, softCriado, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS_NEGOCIO = ['NEG_006','NEG_008','NEG_009','ACE_001','ACE_002','VAL_001','VAL_002','VAL_003','VAL_004','VAL_005'];

function _tratarErro(res, err) {
  if (ERROS_NEGOCIO.includes(err.message)) {
    return softErroRes(res, err.message, err.detalhe);
  }
  return softErroInterno(res, err);
}

// POST /api/soft/categorias
async function criar(req, res) {
  try {
    const { nome, ordem } = req.body;
    const categoria = await categoriaService.criar({
      adminId: req.softAdminId,
      nome,
      ordem,
    });
    return softCriado(res, categoria);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/categorias
async function listar(req, res) {
  try {
    const resultado = await categoriaService.listar({
      adminId: req.softAdminId,
      query:   req.query,
    });
    return softOk(res, resultado.categorias, resultado.meta);
  } catch (err) { return _tratarErro(res, err); }
}

// GET /api/soft/categorias/:id
async function buscarPorId(req, res) {
  try {
    const categoria = await categoriaService.buscarPorId({
      adminId:     req.softAdminId,
      categoriaId: req.params.id,
    });
    return softOk(res, categoria);
  } catch (err) { return _tratarErro(res, err); }
}

// PUT /api/soft/categorias/:id
async function atualizar(req, res) {
  try {
    const { nome, ordem } = req.body;
    const categoria = await categoriaService.atualizar({
      adminId:     req.softAdminId,
      categoriaId: req.params.id,
      nome,
      ordem,
    });
    return softOk(res, categoria);
  } catch (err) { return _tratarErro(res, err); }
}

// DELETE /api/soft/categorias/:id
async function remover(req, res) {
  try {
    const resultado = await categoriaService.remover({
      adminId:     req.softAdminId,
      categoriaId: req.params.id,
    });
    return softOk(res, resultado);
  } catch (err) { return _tratarErro(res, err); }
}

module.exports = { criar, listar, buscarPorId, atualizar, remover };
