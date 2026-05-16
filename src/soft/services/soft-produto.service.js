/**
 * soft-produto.service.js
 * CRUD de produtos do Rebeca Soft.
 * SEM: movimentação de estoque, upload real, financeiro, realtime.
 * Estoque é apenas um campo numérico aqui — movimentação vem na Fase 3.
 */
const SoftProduto  = require('../models/soft-produto.model');
const SoftCategoria = require('../models/soft-categoria.model');
const { softLogger }  = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE = /^[a-f\d]{24}$/i;

function _verificarPropriedade(doc, adminId) {
  if (!doc || doc.adminId.toString() !== adminId) {
    const err = new Error('ACE_002');
    throw err;
  }
}

/**
 * criar — cria novo produto
 * @param {{ adminId, nome, descricao, categoriaId, preco, precoCusto, estoque, estoqueMin, unidade, vendaOnline }} dados
 */
async function criar({ adminId, nome, descricao, categoriaId, preco, precoCusto, estoque, estoqueMin, unidade, vendaOnline }) {
  const nomeTrimmed = String(nome || '').trim();
  if (!nomeTrimmed) {
    const err = new Error('VAL_001'); err.detalhe = 'nome'; throw err;
  }
  if (nomeTrimmed.length > 200) {
    const err = new Error('VAL_005'); err.detalhe = 'nome (máximo 200 caracteres)'; throw err;
  }

  const precoNum = parseFloat(preco);
  if (isNaN(precoNum) || precoNum < 0) {
    const err = new Error('VAL_003'); err.detalhe = 'preco'; throw err;
  }

  // Validar categoriaId se fornecido
  if (categoriaId) {
    if (!OBJECTID_RE.test(categoriaId)) {
      const err = new Error('VAL_004'); err.detalhe = 'categoriaId'; throw err;
    }
    const categoria = await SoftCategoria.findOne({ _id: categoriaId, adminId, ativa: true }).lean();
    if (!categoria) {
      const err = new Error('ACE_002'); err.detalhe = 'categoria não encontrada ou inativa'; throw err;
    }
  }

  const produto = await SoftProduto.create({
    adminId,
    nome:        nomeTrimmed,
    descricao:   String(descricao || '').trim().slice(0, 1000),
    categoriaId: categoriaId || null,
    preco:       precoNum,
    precoCusto:  parseFloat(precoCusto) >= 0 ? parseFloat(precoCusto) : 0,
    estoque:     parseInt(estoque, 10) >= 0  ? parseInt(estoque, 10)  : 0,
    estoqueMin:  parseInt(estoqueMin, 10) >= 0 ? parseInt(estoqueMin, 10) : 0,
    unidade:     unidade || 'un',
    vendaOnline: vendaOnline !== false,
    ativo:       true,
  });

  softLogger.info('Produto', 'Criado', { adminId, produtoId: produto._id, nome: nomeTrimmed });
  return produto;
}

/**
 * listar — lista produtos com paginação, busca e filtros
 */
async function listar({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { busca, categoriaId, ativo, estoqueMin, vendaOnline } = query;

  const filtro = { adminId };

  // Status (padrão: apenas ativos)
  if (ativo === 'false')   filtro.ativo = false;
  else if (ativo === 'todos') { /* sem filtro */ }
  else                     filtro.ativo = true;

  if (categoriaId && OBJECTID_RE.test(categoriaId)) {
    filtro.categoriaId = categoriaId;
  }

  if (vendaOnline === 'true')  filtro.vendaOnline = true;
  if (vendaOnline === 'false') filtro.vendaOnline = false;

  // Alerta de estoque baixo
  if (estoqueMin === 'true') {
    filtro.$expr = { $lte: ['$estoque', '$estoqueMin'] };
  }

  // Busca por nome (text index) ou regex como fallback
  if (busca && busca.trim()) {
    filtro.nome = { $regex: busca.trim(), $options: 'i' };
  }

  const [produtos, total] = await Promise.all([
    SoftProduto.find(filtro)
      .sort({ nome: 1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftProduto.countDocuments(filtro),
  ]);

  return {
    produtos,
    meta: softMetaPaginacao(total, pagina, limite),
  };
}

/**
 * buscarPorId
 */
async function buscarPorId({ adminId, produtoId }) {
  if (!OBJECTID_RE.test(produtoId)) {
    const err = new Error('VAL_004'); err.detalhe = 'produtoId'; throw err;
  }
  const produto = await SoftProduto.findById(produtoId).lean();
  _verificarPropriedade(produto, adminId);
  return produto;
}

/**
 * atualizar — atualiza campos do produto (exceto estoque — isso é via movimentação)
 */
async function atualizar({ adminId, produtoId, nome, descricao, categoriaId, preco, precoCusto, estoqueMin, unidade, vendaOnline }) {
  if (!OBJECTID_RE.test(produtoId)) {
    const err = new Error('VAL_004'); err.detalhe = 'produtoId'; throw err;
  }

  const produto = await SoftProduto.findById(produtoId);
  _verificarPropriedade(produto, adminId);

  if (!produto.ativo) {
    const err = new Error('NEG_008'); throw err;
  }

  const atualizacao = {};

  if (nome !== undefined) {
    const nomeTrimmed = String(nome).trim();
    if (!nomeTrimmed) { const err = new Error('VAL_001'); err.detalhe = 'nome'; throw err; }
    if (nomeTrimmed.length > 200) { const err = new Error('VAL_005'); err.detalhe = 'nome'; throw err; }
    atualizacao.nome = nomeTrimmed;
  }

  if (descricao !== undefined) {
    atualizacao.descricao = String(descricao).trim().slice(0, 1000);
  }

  if (preco !== undefined) {
    const precoNum = parseFloat(preco);
    if (isNaN(precoNum) || precoNum < 0) { const err = new Error('VAL_003'); err.detalhe = 'preco'; throw err; }
    atualizacao.preco = precoNum;
  }

  if (precoCusto !== undefined) {
    const v = parseFloat(precoCusto);
    atualizacao.precoCusto = isNaN(v) || v < 0 ? 0 : v;
  }

  if (estoqueMin !== undefined) {
    const v = parseInt(estoqueMin, 10);
    atualizacao.estoqueMin = isNaN(v) || v < 0 ? 0 : v;
  }

  if (categoriaId !== undefined) {
    if (categoriaId === null || categoriaId === '') {
      atualizacao.categoriaId = null;
    } else {
      if (!OBJECTID_RE.test(categoriaId)) { const err = new Error('VAL_004'); err.detalhe = 'categoriaId'; throw err; }
      const cat = await SoftCategoria.findOne({ _id: categoriaId, adminId, ativa: true }).lean();
      if (!cat) { const err = new Error('ACE_002'); err.detalhe = 'categoria'; throw err; }
      atualizacao.categoriaId = categoriaId;
    }
  }

  if (unidade !== undefined)    atualizacao.unidade    = unidade;
  if (vendaOnline !== undefined) atualizacao.vendaOnline = vendaOnline !== false && vendaOnline !== 'false';

  if (Object.keys(atualizacao).length === 0) return produto.toObject();

  const atualizado = await SoftProduto.findByIdAndUpdate(
    produtoId,
    { $set: atualizacao },
    { new: true, runValidators: true }
  ).lean();

  softLogger.info('Produto', 'Atualizado', { adminId, produtoId, campos: Object.keys(atualizacao) });
  return atualizado;
}

/**
 * remover — soft delete (ativo=false)
 */
async function remover({ adminId, produtoId }) {
  if (!OBJECTID_RE.test(produtoId)) {
    const err = new Error('VAL_004'); err.detalhe = 'produtoId'; throw err;
  }

  const produto = await SoftProduto.findById(produtoId);
  _verificarPropriedade(produto, adminId);

  if (!produto.ativo) {
    const err = new Error('NEG_008'); throw err;
  }

  await SoftProduto.findByIdAndUpdate(produtoId, { $set: { ativo: false } });

  softLogger.info('Produto', 'Removido (soft delete)', { adminId, produtoId });
  return { removido: true };
}

/**
 * reativar — restaura produto desativado
 */
async function reativar({ adminId, produtoId }) {
  if (!OBJECTID_RE.test(produtoId)) {
    const err = new Error('VAL_004'); err.detalhe = 'produtoId'; throw err;
  }

  const produto = await SoftProduto.findById(produtoId);
  _verificarPropriedade(produto, adminId);

  await SoftProduto.findByIdAndUpdate(produtoId, { $set: { ativo: true } });

  softLogger.info('Produto', 'Reativado', { adminId, produtoId });
  return { reativado: true };
}

module.exports = { criar, listar, buscarPorId, atualizar, remover, reativar };
