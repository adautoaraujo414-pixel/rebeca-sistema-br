/**
 * soft-catalogo-public.controller.js
 * Rotas públicas — SEM AUTH.
 */
const svc = require('../services/soft-catalogo-public.service');
const { softOk, softErroRes, softErroInterno } = require('../utils/soft-response.util');

const ERROS = ['NEG_010','VAL_004','VAL_001'];
const _err  = (res, err) => ERROS.includes(err.message)
  ? softErroRes(res, err.message, err.detalhe)
  : softErroInterno(res, err);

// GET /catalogo/:slug
async function info(req, res) {
  try {
    return softOk(res, await svc.info({ slug: req.params.slug }));
  } catch (err) { return _err(res, err); }
}

// GET /catalogo/:slug/categorias
async function categorias(req, res) {
  try {
    return softOk(res, await svc.categorias({ slug: req.params.slug }));
  } catch (err) { return _err(res, err); }
}

// GET /catalogo/:slug/produtos
async function produtos(req, res) {
  try {
    return softOk(res, await svc.produtos({ slug: req.params.slug, query: req.query }));
  } catch (err) { return _err(res, err); }
}

// GET /catalogo/:slug/produto/:produtoId
async function produto(req, res) {
  try {
    return softOk(res, await svc.produto({
      slug: req.params.slug, produtoId: req.params.produtoId,
    }));
  } catch (err) { return _err(res, err); }
}

module.exports = { info, categorias, produtos, produto };
