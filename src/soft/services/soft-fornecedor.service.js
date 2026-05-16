/**
 * soft-fornecedor.service.js
 * CRUD de fornecedores do Rebeca Soft.
 * Sem lógica financeira direta — fornecedor é apenas cadastro.
 */
const SoftFornecedor = require('../models/soft-fornecedor.model');
const { softLogger }   = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE = /^[a-f\d]{24}$/i;

function _verificarPropriedade(doc, adminId) {
  if (!doc || doc.adminId.toString() !== adminId) {
    const err = new Error('ACE_002'); throw err;
  }
}

/**
 * criar
 */
async function criar({ adminId, nome, telefone, email, cnpj }) {
  const nomeTrimmed = String(nome || '').trim();
  if (!nomeTrimmed) {
    const err = new Error('VAL_001'); err.detalhe = 'nome'; throw err;
  }
  if (nomeTrimmed.length > 150) {
    const err = new Error('VAL_005'); err.detalhe = 'nome (máximo 150 caracteres)'; throw err;
  }

  // Verificar duplicata de nome por admin (case-insensitive)
  const existente = await SoftFornecedor.findOne({
    adminId,
    nome: { $regex: new RegExp(`^${nomeTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }).lean();
  if (existente) {
    const err = new Error('NEG_006'); throw err;
  }

  const fornecedor = await SoftFornecedor.create({
    adminId,
    nome:     nomeTrimmed,
    telefone: String(telefone || '').trim().slice(0, 20),
    email:    String(email    || '').trim().toLowerCase().slice(0, 100),
    cnpj:     String(cnpj     || '').trim().replace(/\D/g, '').slice(0, 18),
    ativo:    true,
  });

  softLogger.info('Fornecedor', 'Criado', { adminId, fornecedorId: fornecedor._id, nome: nomeTrimmed });
  return fornecedor;
}

/**
 * listar
 */
async function listar({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { busca, ativo } = query;

  const filtro = { adminId };
  if (ativo === 'false')   filtro.ativo = false;
  else if (ativo === 'todos') { /* sem filtro */ }
  else                     filtro.ativo = true;

  if (busca && busca.trim()) {
    filtro.nome = { $regex: busca.trim(), $options: 'i' };
  }

  const [fornecedores, total] = await Promise.all([
    SoftFornecedor.find(filtro)
      .sort({ nome: 1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftFornecedor.countDocuments(filtro),
  ]);

  return { fornecedores, meta: softMetaPaginacao(total, pagina, limite) };
}

/**
 * buscarPorId
 */
async function buscarPorId({ adminId, fornecedorId }) {
  if (!OBJECTID_RE.test(fornecedorId)) {
    const err = new Error('VAL_004'); err.detalhe = 'fornecedorId'; throw err;
  }
  const f = await SoftFornecedor.findById(fornecedorId).lean();
  _verificarPropriedade(f, adminId);
  return f;
}

/**
 * atualizar
 */
async function atualizar({ adminId, fornecedorId, nome, telefone, email, cnpj }) {
  if (!OBJECTID_RE.test(fornecedorId)) {
    const err = new Error('VAL_004'); err.detalhe = 'fornecedorId'; throw err;
  }

  const f = await SoftFornecedor.findById(fornecedorId);
  _verificarPropriedade(f, adminId);
  if (!f.ativo) { const err = new Error('ACE_002'); throw err; }

  const upd = {};

  if (nome !== undefined) {
    const nomeTrimmed = String(nome).trim();
    if (!nomeTrimmed) { const err = new Error('VAL_001'); err.detalhe = 'nome'; throw err; }
    if (nomeTrimmed.length > 150) { const err = new Error('VAL_005'); err.detalhe = 'nome'; throw err; }

    // Verificar duplicata excluindo o próprio
    const dup = await SoftFornecedor.findOne({
      adminId,
      nome: { $regex: new RegExp(`^${nomeTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      _id: { $ne: fornecedorId },
    }).lean();
    if (dup) { const err = new Error('NEG_006'); throw err; }
    upd.nome = nomeTrimmed;
  }

  if (telefone !== undefined) upd.telefone = String(telefone).trim().slice(0, 20);
  if (email    !== undefined) upd.email    = String(email).trim().toLowerCase().slice(0, 100);
  if (cnpj     !== undefined) upd.cnpj     = String(cnpj).trim().replace(/\D/g, '').slice(0, 18);

  if (Object.keys(upd).length === 0) return f.toObject();

  const atualizado = await SoftFornecedor.findByIdAndUpdate(
    fornecedorId, { $set: upd }, { new: true, runValidators: true }
  ).lean();

  softLogger.info('Fornecedor', 'Atualizado', { adminId, fornecedorId, campos: Object.keys(upd) });
  return atualizado;
}

/**
 * remover — soft delete
 */
async function remover({ adminId, fornecedorId }) {
  if (!OBJECTID_RE.test(fornecedorId)) {
    const err = new Error('VAL_004'); err.detalhe = 'fornecedorId'; throw err;
  }
  const f = await SoftFornecedor.findById(fornecedorId);
  _verificarPropriedade(f, adminId);
  if (!f.ativo) { const err = new Error('ACE_002'); throw err; }

  await SoftFornecedor.findByIdAndUpdate(fornecedorId, { $set: { ativo: false } });
  softLogger.info('Fornecedor', 'Removido (soft delete)', { adminId, fornecedorId });
  return { removido: true };
}

module.exports = { criar, listar, buscarPorId, atualizar, remover };
