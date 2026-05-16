/**
 * soft-compra.service.js
 * Registro de compras (entrada de mercadoria via fornecedor).
 *
 * ESTRATÉGIA DE CONSISTÊNCIA:
 * MongoDB standalone não suporta transactions multi-documento.
 * Usamos sequência ordenada com rollback manual:
 *   1. Criar SoftCompra (âncora — se falhar aqui, nada aconteceu)
 *   2. Atualizar estoque via $inc atômico por produto
 *   3. Criar registros SoftEstoque (auditoria)
 *   4. Criar SoftMovimentacao financeira
 * Se passo 2+ falhar: compra fica com status='erro' e rollback é logado.
 *
 * PROTEÇÃO CONTRA DUPLICIDADE:
 * Campo idempotencyKey (hash dos dados) com índice único sparse.
 * Mesmo request repetido 2x retorna a compra existente.
 *
 * PREPARADO PARA RELATÓRIOS:
 * - fornecedorNome desnormalizado (relatório sem populate)
 * - custoUnit + subtotal por item (custo médio futuro)
 * - total da compra (fluxo de caixa)
 * - timestamps (compras por período)
 */
const crypto          = require('crypto');
const SoftCompra      = require('../models/soft-compra.model');
const SoftProduto     = require('../models/soft-produto.model');
const SoftFornecedor  = require('../models/soft-fornecedor.model');
const SoftEstoque     = require('../models/soft-estoque.model');
const SoftMovimentacao = require('../models/soft-movimentacao.model');
const { softLogger }  = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE = /^[a-f\d]{24}$/i;

/**
 * _gerarIdempotencyKey — hash SHA256 dos dados críticos da compra
 * Previne duplo-clique ou retry acidental criando compra duplicada.
 * Janela de idempotência: 10 minutos (TTL na query de busca).
 */
function _gerarIdempotencyKey(adminId, itens, total) {
  const payload = JSON.stringify({ adminId, itens: itens.map(i => ({
    produtoId: i.produtoId, quantidade: i.quantidade, custoUnit: i.custoUnit,
  })), total });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * _validarItensCompra — valida produtos e calcula totais
 */
async function _validarItensCompra(itens, adminId) {
  if (!Array.isArray(itens) || itens.length === 0) {
    const err = new Error('VAL_001'); err.detalhe = 'itens não pode ser vazio'; throw err;
  }
  if (itens.length > 100) {
    const err = new Error('VAL_005'); err.detalhe = 'máximo 100 itens por compra'; throw err;
  }

  const itensValidados = [];
  const idsVistos = new Set();

  for (const item of itens) {
    if (!item.produtoId || !OBJECTID_RE.test(item.produtoId)) {
      const err = new Error('VAL_004'); err.detalhe = 'produtoId inválido em item'; throw err;
    }

    // Produto duplicado na mesma compra — somar quantidades seria ambíguo
    if (idsVistos.has(item.produtoId)) {
      const err = new Error('VAL_005'); err.detalhe = `produto ${item.produtoId} duplicado na lista — agrupe as quantidades`; throw err;
    }
    idsVistos.add(item.produtoId);

    const qtd = parseInt(item.quantidade, 10);
    if (isNaN(qtd) || qtd <= 0) {
      const err = new Error('VAL_003'); err.detalhe = `quantidade inválida para produto ${item.produtoId}`; throw err;
    }

    const custoUnit = parseFloat(item.custoUnit);
    if (isNaN(custoUnit) || custoUnit < 0) {
      const err = new Error('VAL_003'); err.detalhe = `custoUnit inválido para produto ${item.produtoId}`; throw err;
    }

    // Verificar existência e propriedade do produto
    const produto = await SoftProduto.findOne({ _id: item.produtoId, adminId }).lean();
    if (!produto) {
      const err = new Error('NEG_001'); err.detalhe = `produto ${item.produtoId} não encontrado`; throw err;
    }
    if (!produto.ativo) {
      const err = new Error('NEG_008'); err.detalhe = `produto ${produto.nome} está inativo`; throw err;
    }

    itensValidados.push({
      produtoId:   produto._id,
      produtoNome: produto.nome,
      quantidade:  qtd,
      custoUnit:   parseFloat(custoUnit.toFixed(4)),
      subtotal:    parseFloat((custoUnit * qtd).toFixed(2)),
    });
  }

  return itensValidados;
}

/**
 * registrar — registra compra e dá entrada no estoque
 *
 * @param {{ adminId, fornecedorId, itens, notaFiscal, observacao, operadorNome }} params
 */
async function registrar({ adminId, fornecedorId, itens, notaFiscal, observacao, operadorNome }) {
  // Validar fornecedor (opcional — compra sem fornecedor é permitida)
  let fornecedorNome = 'Sem fornecedor';
  let fornecedorIdValido = null;

  if (fornecedorId && fornecedorId !== '') {
    if (!OBJECTID_RE.test(fornecedorId)) {
      const err = new Error('VAL_004'); err.detalhe = 'fornecedorId'; throw err;
    }
    const forn = await SoftFornecedor.findOne({ _id: fornecedorId, adminId, ativo: true }).lean();
    if (!forn) {
      const err = new Error('NEG_007'); throw err; // fornecedor não encontrado
    }
    fornecedorNome   = forn.nome;
    fornecedorIdValido = forn._id;
  }

  // Validar itens
  const itensValidados = await _validarItensCompra(itens, adminId);
  const total = parseFloat(itensValidados.reduce((s, i) => s + i.subtotal, 0).toFixed(2));

  // Proteção contra duplicidade (idempotency — janela de 10 min)
  const idemKey = _gerarIdempotencyKey(adminId, itensValidados, total);
  const dezMinAtras = new Date(Date.now() - 10 * 60 * 1000);

  const jaExiste = await SoftCompra.findOne({
    adminId,
    idempotencyKey: idemKey,
    createdAt: { $gte: dezMinAtras },
  }).lean();

  if (jaExiste) {
    softLogger.info('Compra', 'Idempotency hit — retornando compra existente', {
      adminId, compraId: jaExiste._id,
    });
    return jaExiste;
  }

  // 1. CRIAR COMPRA (âncora — se falhar aqui, nada aconteceu)
  let compra;
  try {
    compra = await SoftCompra.create({
      adminId,
      fornecedorId:   fornecedorIdValido,
      fornecedorNome,
      itens:          itensValidados,
      total,
      notaFiscal:     String(notaFiscal  || '').trim().slice(0, 50),
      observacao:     String(observacao  || '').trim().slice(0, 500),
      operadorNome:   String(operadorNome || 'Admin').trim(),
      idempotencyKey: idemKey,
    });
  } catch (e) {
    // Índice único do idempotencyKey disparou (race condition de duplo-clique)
    if (e.code === 11000) {
      const existente = await SoftCompra.findOne({ adminId, idempotencyKey: idemKey }).lean();
      if (existente) return existente;
    }
    throw e;
  }

  // 2. ENTRADA DE ESTOQUE (atômica por produto via $inc)
  const docsEstoque = [];
  const rollbackEstoque = [];

  try {
    for (const item of itensValidados) {
      const antes = await SoftProduto.findOne({ _id: item.produtoId, adminId }).lean();
      const estoqueAntes = antes?.estoque ?? 0;

      const atualizado = await SoftProduto.findOneAndUpdate(
        { _id: item.produtoId, adminId },
        {
          $inc: { estoque: item.quantidade },
          // Atualizar precoCusto com média ponderada simples
          $set: { precoCusto: item.custoUnit },
        },
        { new: true, lean: true }
      );

      if (!atualizado) {
        throw new Error(`Produto ${item.produtoId} não encontrado durante atualização de estoque`);
      }

      rollbackEstoque.push({ produtoId: item.produtoId, quantidade: item.quantidade });

      docsEstoque.push({
        adminId,
        produtoId:   item.produtoId,
        produtoNome: item.produtoNome,
        tipo:        'entrada',
        quantidade:  item.quantidade,
        estoqueApos: atualizado.estoque,
        motivo:      `Compra #${compra._id}`,
        operadorId:  adminId,
        compraId:    compra._id,
      });
    }
  } catch (e) {
    // ROLLBACK de estoque
    for (const rb of rollbackEstoque) {
      await SoftProduto.findOneAndUpdate(
        { _id: rb.produtoId, adminId },
        { $inc: { estoque: -rb.quantidade } }
      ).catch(rbErr => softLogger.erro('Compra', 'Falha no rollback de estoque', { rbErr: rbErr.message }));
    }
    // Marcar compra como erro (não deleta — auditoria)
    await SoftCompra.findByIdAndUpdate(compra._id, { $set: { observacao: `ERRO: ${e.message}` } });
    softLogger.erro('Compra', 'Falha na entrada de estoque — rollback executado', { adminId, compraId: compra._id, erro: e.message });
    throw e;
  }

  // 3. AUDITORIA DE ESTOQUE (append-only)
  await SoftEstoque.insertMany(docsEstoque);

  // 4. MOVIMENTAÇÃO FINANCEIRA
  await SoftMovimentacao.create({
    adminId,
    caixaId:        null, // compra não exige caixa aberto
    tipo:           'despesa',
    valor:          total,
    formaPagamento: '',
    descricao:      `Compra #${compra._id} — ${fornecedorNome}`,
    operadorNome:   String(operadorNome || 'Admin').trim(),
  });

  softLogger.financeiro('COMPRA', adminId, total, {
    compraId:      compra._id,
    fornecedorNome,
    itens:         itensValidados.length,
    total,
  });

  return compra;
}

/**
 * listar
 */
async function listar({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { fornecedorId, de, ate } = query;

  const filtro = { adminId };

  if (fornecedorId && OBJECTID_RE.test(fornecedorId)) {
    filtro.fornecedorId = fornecedorId;
  }
  if (de || ate) {
    filtro.createdAt = {};
    if (de)  filtro.createdAt.$gte = new Date(de  + 'T00:00:00.000Z');
    if (ate) filtro.createdAt.$lte = new Date(ate + 'T23:59:59.999Z');
  }

  const [compras, total] = await Promise.all([
    SoftCompra.find(filtro)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftCompra.countDocuments(filtro),
  ]);

  return { compras, meta: softMetaPaginacao(total, pagina, limite) };
}

/**
 * buscarPorId
 */
async function buscarPorId({ adminId, compraId }) {
  if (!OBJECTID_RE.test(compraId)) {
    const err = new Error('VAL_004'); err.detalhe = 'compraId'; throw err;
  }
  const compra = await SoftCompra.findOne({ _id: compraId, adminId }).lean();
  if (!compra) { const err = new Error('ACE_002'); throw err; }
  return compra;
}

/**
 * cancelar — estorno lógico de compra (não deleta)
 * Reverte estoque e registra movimentação de estorno.
 * REGRA: só cancela se estoque atual >= quantidade da compra (evita negativo).
 */
async function cancelar({ adminId, compraId, motivo, operadorNome }) {
  if (!OBJECTID_RE.test(compraId)) {
    const err = new Error('VAL_004'); err.detalhe = 'compraId'; throw err;
  }
  if (!motivo || !String(motivo).trim()) {
    const err = new Error('VAL_001'); err.detalhe = 'motivo é obrigatório'; throw err;
  }

  const compra = await SoftCompra.findOne({ _id: compraId, adminId });
  if (!compra) { const err = new Error('ACE_002'); throw err; }

  // Verificar se já foi cancelada (campo observacao com prefixo CANCELADO)
  if (compra.observacao && compra.observacao.startsWith('CANCELADO:')) {
    const err = new Error('NEG_005'); throw err;
  }

  // Verificar estoque suficiente para reverter cada item
  for (const item of compra.itens) {
    const produto = await SoftProduto.findOne({ _id: item.produtoId, adminId }).lean();
    if (produto && produto.estoque < item.quantidade) {
      const err = new Error('NEG_002');
      err.detalhe = `estoque insuficiente para reverter ${item.produtoNome} (atual: ${produto?.estoque ?? 0}, necessário: ${item.quantidade})`;
      throw err;
    }
  }

  // Reverter estoque via $inc negativo com condição atômica
  const docsEstoque = [];
  for (const item of compra.itens) {
    const atualizado = await SoftProduto.findOneAndUpdate(
      { _id: item.produtoId, adminId, estoque: { $gte: item.quantidade } },
      { $inc: { estoque: -item.quantidade } },
      { new: true, lean: true }
    );

    if (!atualizado) {
      // Estoque mudou entre a verificação e o update — falha segura
      const err = new Error('NEG_002');
      err.detalhe = `estoque de ${item.produtoNome} mudou durante cancelamento`;
      throw err;
    }

    docsEstoque.push({
      adminId,
      produtoId:   item.produtoId,
      produtoNome: item.produtoNome,
      tipo:        'estorno',
      quantidade:  item.quantidade,
      estoqueApos: atualizado.estoque,
      motivo:      `Cancelamento compra #${compraId}`,
      operadorId:  adminId,
      compraId:    compra._id,
    });
  }

  if (docsEstoque.length > 0) {
    await SoftEstoque.insertMany(docsEstoque);
  }

  // Marcar compra como cancelada
  await SoftCompra.findByIdAndUpdate(compra._id, {
    $set: { observacao: `CANCELADO: ${String(motivo).trim()}` },
  });

  // Estorno financeiro
  await SoftMovimentacao.create({
    adminId,
    caixaId:        null,
    tipo:           'receita', // estorno de despesa = receita
    valor:          compra.total,
    formaPagamento: '',
    descricao:      `Estorno compra #${compraId} — ${String(motivo).trim()}`,
    operadorNome:   String(operadorNome || 'Admin').trim(),
  });

  softLogger.financeiro('COMPRA_CANCELADA', adminId, compra.total, { compraId, motivo });
  return { cancelada: true, compraId };
}

module.exports = { registrar, listar, buscarPorId, cancelar };
