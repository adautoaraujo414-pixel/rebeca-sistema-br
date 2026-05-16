/**
 * soft-cliente.service.js
 * CRUD de clientes do Rebeca Soft.
 *
 * PREPARADO PARA:
 * - fiado (saldoFiado já existe no model)
 * - CRM futuro (histórico de compras)
 * - contas a receber (saldoFiado > 0)
 * NÃO IMPLEMENTADO AINDA: cobrança, limite de crédito, notificações.
 */
const SoftCliente = require('../models/soft-cliente.model');
const { softLogger }  = require('../utils/soft-logger.util');
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
async function criar({ adminId, nome, telefone, email, cpf, endereco }) {
  const nomeTrimmed = String(nome || '').trim();
  if (!nomeTrimmed) {
    const err = new Error('VAL_001'); err.detalhe = 'nome'; throw err;
  }
  if (nomeTrimmed.length > 150) {
    const err = new Error('VAL_005'); err.detalhe = 'nome (máximo 150 caracteres)'; throw err;
  }

  // Verificar duplicata por telefone (se fornecido) — evitar cliente duplicado acidental
  const telefoneTrimmed = String(telefone || '').trim().replace(/\D/g, '').slice(0, 15);
  if (telefoneTrimmed) {
    const existente = await SoftCliente.findOne({
      adminId,
      telefone: telefoneTrimmed,
      ativo: true,
    }).lean();
    if (existente) {
      const err = new Error('NEG_006');
      err.detalhe = `telefone ${telefoneTrimmed} já cadastrado para ${existente.nome}`;
      throw err;
    }
  }

  const cliente = await SoftCliente.create({
    adminId,
    nome:      nomeTrimmed,
    telefone:  telefoneTrimmed,
    email:     String(email   || '').trim().toLowerCase().slice(0, 100),
    cpf:       String(cpf     || '').trim().replace(/\D/g, '').slice(0, 11),
    endereco:  String(endereco || '').trim().slice(0, 300),
    saldoFiado: 0, // começa zerado — fiado será gerenciado futuramente
    ativo:     true,
  });

  softLogger.info('Cliente', 'Criado', { adminId, clienteId: cliente._id, nome: nomeTrimmed });
  return cliente;
}

/**
 * listar
 */
async function listar({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { busca, ativo, comFiado } = query;

  const filtro = { adminId };

  if (ativo === 'false')   filtro.ativo = false;
  else if (ativo === 'todos') { /* sem filtro */ }
  else                     filtro.ativo = true;

  // Filtro de clientes com saldo em aberto (fiado > 0)
  if (comFiado === 'true') {
    filtro.saldoFiado = { $gt: 0 };
  }

  if (busca && busca.trim()) {
    filtro.$or = [
      { nome:     { $regex: busca.trim(), $options: 'i' } },
      { telefone: { $regex: busca.trim(), $options: 'i' } },
    ];
  }

  const [clientes, total] = await Promise.all([
    SoftCliente.find(filtro)
      .sort({ nome: 1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftCliente.countDocuments(filtro),
  ]);

  return { clientes, meta: softMetaPaginacao(total, pagina, limite) };
}

/**
 * buscarPorId
 */
async function buscarPorId({ adminId, clienteId }) {
  if (!OBJECTID_RE.test(clienteId)) {
    const err = new Error('VAL_004'); err.detalhe = 'clienteId'; throw err;
  }
  const c = await SoftCliente.findById(clienteId).lean();
  _verificarPropriedade(c, adminId);
  return c;
}

/**
 * atualizar
 */
async function atualizar({ adminId, clienteId, nome, telefone, email, cpf, endereco }) {
  if (!OBJECTID_RE.test(clienteId)) {
    const err = new Error('VAL_004'); err.detalhe = 'clienteId'; throw err;
  }

  const cliente = await SoftCliente.findById(clienteId);
  _verificarPropriedade(cliente, adminId);
  if (!cliente.ativo) { const err = new Error('ACE_002'); throw err; }

  const upd = {};

  if (nome !== undefined) {
    const nomeTrimmed = String(nome).trim();
    if (!nomeTrimmed) { const err = new Error('VAL_001'); err.detalhe = 'nome'; throw err; }
    if (nomeTrimmed.length > 150) { const err = new Error('VAL_005'); err.detalhe = 'nome'; throw err; }
    upd.nome = nomeTrimmed;
  }

  if (telefone !== undefined) {
    const tel = String(telefone).trim().replace(/\D/g, '').slice(0, 15);
    // Verificar duplicata excluindo o próprio
    if (tel) {
      const dup = await SoftCliente.findOne({
        adminId, telefone: tel, ativo: true, _id: { $ne: clienteId },
      }).lean();
      if (dup) {
        const err = new Error('NEG_006');
        err.detalhe = `telefone já cadastrado para ${dup.nome}`;
        throw err;
      }
    }
    upd.telefone = tel;
  }

  if (email    !== undefined) upd.email    = String(email).trim().toLowerCase().slice(0, 100);
  if (cpf      !== undefined) upd.cpf      = String(cpf).trim().replace(/\D/g, '').slice(0, 11);
  if (endereco !== undefined) upd.endereco = String(endereco).trim().slice(0, 300);

  if (Object.keys(upd).length === 0) return cliente.toObject();

  const atualizado = await SoftCliente.findByIdAndUpdate(
    clienteId, { $set: upd }, { new: true, runValidators: true }
  ).lean();

  softLogger.info('Cliente', 'Atualizado', { adminId, clienteId, campos: Object.keys(upd) });
  return atualizado;
}

/**
 * remover — soft delete
 * REGRA: não permite remover cliente com saldo de fiado em aberto
 */
async function remover({ adminId, clienteId }) {
  if (!OBJECTID_RE.test(clienteId)) {
    const err = new Error('VAL_004'); err.detalhe = 'clienteId'; throw err;
  }

  const cliente = await SoftCliente.findById(clienteId);
  _verificarPropriedade(cliente, adminId);
  if (!cliente.ativo) { const err = new Error('ACE_002'); throw err; }

  // Proteção: não remover cliente com fiado pendente
  if (cliente.saldoFiado > 0) {
    const err = new Error('NEG_009');
    err.detalhe = `cliente possui R$ ${cliente.saldoFiado.toFixed(2)} em fiado pendente`;
    throw err;
  }

  await SoftCliente.findByIdAndUpdate(clienteId, { $set: { ativo: false } });
  softLogger.info('Cliente', 'Removido (soft delete)', { adminId, clienteId });
  return { removido: true };
}

/**
 * resumo — retorna dados resumidos do cliente (preparado para CRM futuro)
 */
async function resumo({ adminId, clienteId }) {
  if (!OBJECTID_RE.test(clienteId)) {
    const err = new Error('VAL_004'); err.detalhe = 'clienteId'; throw err;
  }

  const cliente = await SoftCliente.findById(clienteId).lean();
  _verificarPropriedade(cliente, adminId);

  return {
    clienteId:   cliente._id,
    nome:        cliente.nome,
    telefone:    cliente.telefone,
    saldoFiado:  cliente.saldoFiado,
    temFiado:    cliente.saldoFiado > 0,
    ativo:       cliente.ativo,
    cadastradoEm: cliente.createdAt,
    // CRM futuro: total de compras, última compra, ticket médio
  };
}

module.exports = { criar, listar, buscarPorId, atualizar, remover, resumo };
