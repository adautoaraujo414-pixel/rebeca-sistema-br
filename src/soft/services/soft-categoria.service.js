/**
 * soft-categoria.service.js
 * CRUD de categorias do Rebeca Soft.
 * Sem lógica financeira, sem upload, sem cache, sem realtime.
 */
const SoftCategoria = require('../models/soft-categoria.model');
const { softLogger }  = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

// Regex para ObjectId válido
const OBJECTID_RE = /^[a-f\d]{24}$/i;

/**
 * _verificarPropriedade — garante que o documento pertence ao admin
 * Segunda linha de defesa (além do tenantGuard no middleware)
 */
function _verificarPropriedade(doc, adminId) {
  if (!doc || doc.adminId.toString() !== adminId) {
    const err = new Error('ACE_002');
    throw err;
  }
}

/**
 * criar — cria nova categoria para o admin
 * @param {{ adminId, nome, ordem }} dados
 */
async function criar({ adminId, nome, ordem = 0 }) {
  // Trim e validação básica
  const nomeTrimmed = String(nome || '').trim();
  if (!nomeTrimmed) {
    const err = new Error('VAL_001');
    err.detalhe = 'nome';
    throw err;
  }
  if (nomeTrimmed.length > 100) {
    const err = new Error('VAL_005');
    err.detalhe = 'nome (máximo 100 caracteres)';
    throw err;
  }

  // Verificar duplicata de nome para este admin
  const existente = await SoftCategoria.findOne({
    adminId,
    nome: { $regex: new RegExp(`^${nomeTrimmed}$`, 'i') },
  }).lean();

  if (existente) {
    const err = new Error('NEG_006');
    throw err;
  }

  const categoria = await SoftCategoria.create({
    adminId,
    nome:  nomeTrimmed,
    ordem: Number(ordem) || 0,
    ativa: true,
  });

  softLogger.info('Categoria', 'Criada', { adminId, categoriaId: categoria._id, nome: nomeTrimmed });
  return categoria;
}

/**
 * listar — lista categorias do admin com paginação e filtro
 * @param {{ adminId, query }} params
 */
async function listar({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { busca, ativa } = query;

  // Filtro base — adminId obrigatório
  const filtro = { adminId };

  // Filtro de status (padrão: apenas ativas)
  if (ativa === 'false') {
    filtro.ativa = false;
  } else if (ativa === 'todas') {
    // sem filtro de ativa
  } else {
    filtro.ativa = true;
  }

  // Busca por nome
  if (busca && busca.trim()) {
    filtro.nome = { $regex: busca.trim(), $options: 'i' };
  }

  const [categorias, total] = await Promise.all([
    SoftCategoria.find(filtro)
      .sort({ ordem: 1, nome: 1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftCategoria.countDocuments(filtro),
  ]);

  return {
    categorias,
    meta: softMetaPaginacao(total, pagina, limite),
  };
}

/**
 * buscarPorId — retorna categoria por ID validando propriedade
 * @param {{ adminId, categoriaId }} params
 */
async function buscarPorId({ adminId, categoriaId }) {
  if (!OBJECTID_RE.test(categoriaId)) {
    const err = new Error('VAL_004');
    err.detalhe = 'categoriaId';
    throw err;
  }

  const categoria = await SoftCategoria.findById(categoriaId).lean();
  _verificarPropriedade(categoria, adminId);

  return categoria;
}

/**
 * atualizar — atualiza nome e/ou ordem da categoria
 * @param {{ adminId, categoriaId, nome, ordem }} params
 */
async function atualizar({ adminId, categoriaId, nome, ordem }) {
  if (!OBJECTID_RE.test(categoriaId)) {
    const err = new Error('VAL_004');
    err.detalhe = 'categoriaId';
    throw err;
  }

  const categoria = await SoftCategoria.findById(categoriaId);
  _verificarPropriedade(categoria, adminId);

  if (!categoria.ativa) {
    const err = new Error('ACE_002');
    throw err;
  }

  const atualizacao = {};

  if (nome !== undefined) {
    const nomeTrimmed = String(nome).trim();
    if (!nomeTrimmed) {
      const err = new Error('VAL_001');
      err.detalhe = 'nome';
      throw err;
    }
    if (nomeTrimmed.length > 100) {
      const err = new Error('VAL_005');
      err.detalhe = 'nome';
      throw err;
    }

    // Verificar duplicata (excluindo o próprio documento)
    const duplicata = await SoftCategoria.findOne({
      adminId,
      nome: { $regex: new RegExp(`^${nomeTrimmed}$`, 'i') },
      _id: { $ne: categoriaId },
    }).lean();

    if (duplicata) {
      const err = new Error('NEG_006');
      throw err;
    }

    atualizacao.nome = nomeTrimmed;
  }

  if (ordem !== undefined) {
    atualizacao.ordem = Number(ordem) || 0;
  }

  if (Object.keys(atualizacao).length === 0) {
    return categoria.toObject();
  }

  const atualizada = await SoftCategoria.findByIdAndUpdate(
    categoriaId,
    { $set: atualizacao },
    { new: true, runValidators: true }
  ).lean();

  softLogger.info('Categoria', 'Atualizada', { adminId, categoriaId, atualizacao });
  return atualizada;
}

/**
 * remover — soft delete (ativa=false)
 * Não deleta fisicamente — preserva integridade referencial com produtos
 * @param {{ adminId, categoriaId }} params
 */
async function remover({ adminId, categoriaId }) {
  if (!OBJECTID_RE.test(categoriaId)) {
    const err = new Error('VAL_004');
    err.detalhe = 'categoriaId';
    throw err;
  }

  const categoria = await SoftCategoria.findById(categoriaId);
  _verificarPropriedade(categoria, adminId);

  if (!categoria.ativa) {
    const err = new Error('ACE_002'); // já removida
    throw err;
  }

  await SoftCategoria.findByIdAndUpdate(categoriaId, { $set: { ativa: false } });

  softLogger.info('Categoria', 'Removida (soft delete)', { adminId, categoriaId });
  return { removida: true };
}

module.exports = { criar, listar, buscarPorId, atualizar, remover };
