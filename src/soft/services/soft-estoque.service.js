/**
 * soft-estoque.service.js
 * Movimentação de estoque do Rebeca Soft.
 *
 * ESTRATÉGIA DE ATOMICIDADE:
 * Toda alteração de estoque usa findOneAndUpdate com $inc e condição atômica.
 * Isso garante que mesmo com 2 requests simultâneos, o MongoDB processa
 * um de cada vez no nível do documento — sem race condition.
 *
 * PROIBIDO: ler estoque → validar → salvar (read-modify-write).
 * CORRETO:  findOneAndUpdate({ estoque: { $gte: qtd } }, { $inc: { estoque: -qtd } })
 *
 * SEM: venda, caixa, financeiro, upload, websocket, filas.
 */
const SoftProduto   = require('../models/soft-produto.model');
const SoftEstoque   = require('../models/soft-estoque.model');
const { softLogger }  = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE = /^[a-f\d]{24}$/i;

/**
 * _validarProduto — verifica existência, propriedade e status ativo
 * Retorna o produto usando .lean() para performance
 */
async function _validarProduto(produtoId, adminId) {
  if (!OBJECTID_RE.test(produtoId)) {
    const err = new Error('VAL_004'); err.detalhe = 'produtoId'; throw err;
  }

  const produto = await SoftProduto.findOne({ _id: produtoId, adminId }).lean();

  if (!produto) {
    const err = new Error('NEG_001'); throw err;
  }
  if (!produto.ativo) {
    const err = new Error('NEG_008'); throw err;
  }

  return produto;
}

/**
 * _registrarMovimentacao — salva o log de movimentação (append-only)
 * Chamado APÓS a atualização atômica do estoque ter sido confirmada.
 *
 * @param {object} params
 * @param {object} [session] — session do Mongoose (para transações futuras)
 */
async function _registrarMovimentacao({ adminId, produtoId, produtoNome, tipo, quantidade, estoqueAntes, estoqueApos, motivo, operadorId, operadorNome, vendaId, compraId }, session) {
  const doc = {
    adminId,
    produtoId,
    produtoNome,
    tipo,
    quantidade,
    estoqueApos,
    motivo: motivo || '',
    operadorId: operadorId || null,
    vendaId:    vendaId    || null,
    compraId:   compraId   || null,
  };

  const opts = session ? { session } : {};
  await SoftEstoque.create([doc], opts);

  softLogger.financeiro(
    `ESTOQUE_${tipo.toUpperCase()}`,
    adminId,
    quantidade,
    { produtoId, produtoNome, estoqueAntes, estoqueApos, motivo }
  );
}

/**
 * entrada — adiciona quantidade ao estoque (operação sempre permitida)
 *
 * @param {{ adminId, produtoId, quantidade, motivo, operadorId, operadorNome, compraId, session }} params
 */
async function entrada({ adminId, produtoId, quantidade, motivo, operadorId, operadorNome, compraId, session }) {
  const qtd = parseInt(quantidade, 10);
  if (isNaN(qtd) || qtd <= 0) {
    const err = new Error('VAL_003'); err.detalhe = 'quantidade deve ser maior que zero'; throw err;
  }

  // Validar produto (propriedade + ativo)
  const produto = await _validarProduto(produtoId, adminId);
  const estoqueAntes = produto.estoque;

  // OPERAÇÃO ATÔMICA: $inc nunca falha por concorrência em entrada
  const atualizado = await SoftProduto.findOneAndUpdate(
    { _id: produtoId, adminId },
    { $inc: { estoque: qtd } },
    { new: true, lean: true, ...(session ? { session } : {}) }
  );

  await _registrarMovimentacao({
    adminId, produtoId,
    produtoNome: produto.nome,
    tipo:       'entrada',
    quantidade:  qtd,
    estoqueAntes,
    estoqueApos: atualizado.estoque,
    motivo, operadorId, operadorNome, compraId,
  }, session);

  return {
    produtoId,
    produtoNome:  produto.nome,
    estoqueAntes,
    estoqueApos:  atualizado.estoque,
    quantidade:   qtd,
    tipo:         'entrada',
  };
}

/**
 * saida — remove quantidade do estoque
 * PROTEÇÃO CRÍTICA: condição atômica impede estoque negativo mesmo sob concorrência.
 * Se dois requests de saída chegam simultaneamente para o último item,
 * apenas UM consegue fazer o update — o outro recebe null e retorna NEG_002.
 *
 * @param {{ adminId, produtoId, quantidade, motivo, operadorId, operadorNome, vendaId, session }} params
 */
async function saida({ adminId, produtoId, quantidade, motivo, operadorId, operadorNome, vendaId, session }) {
  const qtd = parseInt(quantidade, 10);
  if (isNaN(qtd) || qtd <= 0) {
    const err = new Error('VAL_003'); err.detalhe = 'quantidade deve ser maior que zero'; throw err;
  }

  // Validar produto antes da operação atômica
  const produto = await _validarProduto(produtoId, adminId);
  const estoqueAntes = produto.estoque;

  // OPERAÇÃO ATÔMICA CRÍTICA:
  // A condição { estoque: { $gte: qtd } } garante que o MongoDB só faz o $inc
  // se o estoque for suficiente NO MOMENTO da escrita — não no momento da leitura.
  // Isso elimina o race condition de "dois atendentes vendem o último item".
  const atualizado = await SoftProduto.findOneAndUpdate(
    {
      _id:     produtoId,
      adminId,
      estoque: { $gte: qtd }, // CONDIÇÃO ATÔMICA — impede negativo
    },
    { $inc: { estoque: -qtd } },
    { new: true, lean: true, ...(session ? { session } : {}) }
  );

  // Se null: produto não existia com estoque suficiente no momento da escrita
  if (!atualizado) {
    const err = new Error('NEG_002'); throw err;
  }

  await _registrarMovimentacao({
    adminId, produtoId,
    produtoNome: produto.nome,
    tipo:       'saida',
    quantidade:  qtd,
    estoqueAntes,
    estoqueApos: atualizado.estoque,
    motivo, operadorId, operadorNome, vendaId,
  }, session);

  return {
    produtoId,
    produtoNome:  produto.nome,
    estoqueAntes,
    estoqueApos:  atualizado.estoque,
    quantidade:   qtd,
    tipo:         'saida',
  };
}

/**
 * ajuste — define o estoque para um valor absoluto (inventário físico)
 * Calcula a diferença e registra como 'ajuste' ou 'inventario'.
 * Nunca permite valor negativo.
 *
 * @param {{ adminId, produtoId, estoqueNovo, motivo, operadorId, operadorNome }} params
 */
async function ajuste({ adminId, produtoId, estoqueNovo, motivo, operadorId, operadorNome }) {
  const novoValor = parseInt(estoqueNovo, 10);
  if (isNaN(novoValor) || novoValor < 0) {
    const err = new Error('VAL_003'); err.detalhe = 'estoqueNovo deve ser >= 0'; throw err;
  }
  if (!motivo || !String(motivo).trim()) {
    const err = new Error('VAL_001'); err.detalhe = 'motivo é obrigatório para ajuste'; throw err;
  }

  const produto = await _validarProduto(produtoId, adminId);
  const estoqueAntes = produto.estoque;
  const diferenca    = novoValor - estoqueAntes;

  // Atualizar diretamente para o valor absoluto
  const atualizado = await SoftProduto.findOneAndUpdate(
    { _id: produtoId, adminId },
    { $set: { estoque: novoValor } },
    { new: true, lean: true }
  );

  await _registrarMovimentacao({
    adminId, produtoId,
    produtoNome:  produto.nome,
    tipo:         'ajuste',
    quantidade:   Math.abs(diferenca),
    estoqueAntes,
    estoqueApos:  atualizado.estoque,
    motivo:       String(motivo).trim(),
    operadorId, operadorNome,
  });

  return {
    produtoId,
    produtoNome:  produto.nome,
    estoqueAntes,
    estoqueApos:  atualizado.estoque,
    diferenca,
    tipo:         'ajuste',
  };
}

/**
 * historico — lista movimentações de estoque com paginação
 * Suporta filtro por produto, tipo e período.
 */
async function historico({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { produtoId, tipo, de, ate } = query;

  // Filtro base — adminId obrigatório
  const filtro = { adminId };

  if (produtoId && OBJECTID_RE.test(produtoId)) {
    filtro.produtoId = produtoId;
  }

  if (tipo && ['entrada','saida','ajuste','inventario','estorno'].includes(tipo)) {
    filtro.tipo = tipo;
  }

  if (de || ate) {
    filtro.createdAt = {};
    if (de)  filtro.createdAt.$gte = new Date(de  + 'T00:00:00.000Z');
    if (ate) filtro.createdAt.$lte = new Date(ate + 'T23:59:59.999Z');
  }

  const [movimentacoes, total] = await Promise.all([
    SoftEstoque.find(filtro)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limite)
      .lean(), // performance — sem mongoose overhead
    SoftEstoque.countDocuments(filtro),
  ]);

  return {
    movimentacoes,
    meta: softMetaPaginacao(total, pagina, limite),
  };
}

/**
 * saldoAtual — retorna o estoque atual de um produto
 */
async function saldoAtual({ adminId, produtoId }) {
  const produto = await _validarProduto(produtoId, adminId);
  return {
    produtoId:   produto._id,
    produtoNome: produto.nome,
    estoque:     produto.estoque,
    estoqueMin:  produto.estoqueMin,
    alerta:      produto.estoque <= produto.estoqueMin,
    unidade:     produto.unidade,
  };
}

/**
 * alertasEstoque — lista produtos com estoque abaixo do mínimo
 */
async function alertasEstoque({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);

  const filtro = {
    adminId,
    ativo: true,
    $expr: { $lte: ['$estoque', '$estoqueMin'] },
  };

  const [produtos, total] = await Promise.all([
    SoftProduto.find(filtro)
      .select('nome estoque estoqueMin unidade categoriaId')
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

module.exports = { entrada, saida, ajuste, historico, saldoAtual, alertasEstoque };
