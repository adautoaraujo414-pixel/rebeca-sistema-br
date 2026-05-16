/**
 * soft-venda.service.js
 * Registro de venda do Rebeca Soft.
 *
 * GARANTIAS CRÍTICAS:
 * 1. Venda só ocorre com caixa aberto
 * 2. Estoque baixado atomicamente (mesma lógica do soft-estoque.service)
 * 3. SoftVenda + SoftEstoque + SoftMovimentacao criados na mesma operação
 * 4. Cancelamento reverte estoque e registra estorno financeiro
 * 5. NUNCA deleta registros — append-only
 *
 * NOTA SOBRE TRANSAÇÕES:
 * MongoDB transactions exigem replica set. Em standalone (dev/free tier),
 * usamos operações sequenciais com rollback manual em caso de falha.
 * A ordem é: estoque → venda → movimentação.
 * Se venda falhar após estoque: rollback via entrada de estorno.
 * Se movimentação falhar: venda existe mas sem movimentação — corrigido no fechamento do caixa.
 */
const SoftCaixa        = require('../models/soft-caixa.model');
const SoftVenda        = require('../models/soft-venda.model');
const SoftProduto      = require('../models/soft-produto.model');
const SoftEstoque      = require('../models/soft-estoque.model');
const SoftMovimentacao = require('../models/soft-movimentacao.model');
const { softLogger }   = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE = /^[a-f\d]{24}$/i;
const FORMAS_PAGAMENTO = ['dinheiro','pix','cartao_debito','cartao_credito','fiado','outro'];

/**
 * _validarItens — valida e enriquece os itens da venda com dados do banco
 * Retorna itens prontos para salvar com nome desnormalizado
 */
async function _validarItens(itens, adminId) {
  if (!Array.isArray(itens) || itens.length === 0) {
    const err = new Error('VAL_001'); err.detalhe = 'itens não pode ser vazio'; throw err;
  }
  if (itens.length > 50) {
    const err = new Error('VAL_005'); err.detalhe = 'máximo 50 itens por venda'; throw err;
  }

  const itensValidados = [];

  for (const item of itens) {
    if (!item.produtoId || !OBJECTID_RE.test(item.produtoId)) {
      const err = new Error('VAL_004'); err.detalhe = 'produtoId inválido em item'; throw err;
    }

    const qtd = parseInt(item.quantidade, 10);
    if (isNaN(qtd) || qtd <= 0) {
      const err = new Error('VAL_003'); err.detalhe = `quantidade inválida para produto ${item.produtoId}`; throw err;
    }

    // Buscar produto — garante existência e propriedade
    const produto = await SoftProduto.findOne({
      _id:    item.produtoId,
      adminId,
      ativo:  true,
    }).lean();

    if (!produto) {
      const err = new Error('NEG_001'); err.detalhe = `produto ${item.produtoId} não encontrado ou inativo`; throw err;
    }

    // Preço unitário: usar o do request se fornecido (desconto/negociação), senão o cadastrado
    const precoUnit = item.precoUnit !== undefined
      ? parseFloat(item.precoUnit)
      : produto.preco;

    if (isNaN(precoUnit) || precoUnit < 0) {
      const err = new Error('VAL_003'); err.detalhe = `precoUnit inválido para ${produto.nome}`; throw err;
    }

    itensValidados.push({
      produtoId:   produto._id,
      produtoNome: produto.nome,
      quantidade:  qtd,
      precoUnit,
      subtotal:    parseFloat((precoUnit * qtd).toFixed(2)),
      // Guardar estoque atual para rollback
      _estoqueAtual: produto.estoque,
    });
  }

  return itensValidados;
}

/**
 * _baixarEstoqueItens — baixa estoque de todos os itens atomicamente
 * Retorna lista de { produtoId, qtd, estoqueAntes, estoqueApos } para auditoria
 * Em caso de falha parcial, faz rollback dos itens já baixados.
 */
async function _baixarEstoqueItens(itens, adminId) {
  const baixados = [];

  for (const item of itens) {
    const atualizado = await SoftProduto.findOneAndUpdate(
      {
        _id:     item.produtoId,
        adminId,
        ativo:   true,
        estoque: { $gte: item.quantidade }, // CONDIÇÃO ATÔMICA
      },
      { $inc: { estoque: -item.quantidade } },
      { new: true, lean: true }
    );

    if (!atualizado) {
      // ROLLBACK: devolver estoque dos itens já baixados
      for (const b of baixados) {
        await SoftProduto.findOneAndUpdate(
          { _id: b.produtoId, adminId },
          { $inc: { estoque: b.quantidade } }
        );
        softLogger.erro('Venda', 'Rollback estoque', {
          produtoId: b.produtoId, quantidade: b.quantidade,
        });
      }

      const err = new Error('NEG_002');
      err.detalhe = `estoque insuficiente: ${item.produtoNome}`;
      throw err;
    }

    baixados.push({
      produtoId:   item.produtoId,
      produtoNome: item.produtoNome,
      quantidade:  item.quantidade,
      estoqueAntes: item._estoqueAtual,
      estoqueApos:  atualizado.estoque,
    });
  }

  return baixados;
}

/**
 * registrar — registra uma venda completa
 *
 * Sequência:
 * 1. Validar caixa aberto
 * 2. Validar e enriquecer itens
 * 3. Baixar estoque atomicamente (com rollback em falha)
 * 4. Criar SoftVenda
 * 5. Criar registros de SoftEstoque (auditoria)
 * 6. Criar SoftMovimentacao financeira
 * 7. Atualizar contadores do caixa
 *
 * @param {{ adminId, operadorNome, clienteNome, itens, desconto, formaPagamento, session }} params
 */
async function registrar({
  adminId, operadorNome, clienteNome,
  itens, desconto, formaPagamento,
}) {
  // 1. Verificar caixa aberto
  const caixa = await SoftCaixa.findOne({ adminId, status: 'aberto' }).lean();
  if (!caixa) {
    const err = new Error('NEG_004'); throw err;
  }

  // 2. Validar forma de pagamento
  if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
    const err = new Error('VAL_002');
    err.detalhe = `formaPagamento deve ser: ${FORMAS_PAGAMENTO.join(', ')}`;
    throw err;
  }

  // 3. Validar itens
  const itensValidados = await _validarItens(itens, adminId);

  // 4. Calcular totais
  const subtotal    = parseFloat(itensValidados.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
  const descontoVal = Math.min(parseFloat(desconto) || 0, subtotal);
  const total       = parseFloat((subtotal - descontoVal).toFixed(2));

  if (total < 0) {
    const err = new Error('VAL_003'); err.detalhe = 'total não pode ser negativo'; throw err;
  }

  // 5. Baixar estoque (com rollback automático em falha)
  const baixados = await _baixarEstoqueItens(itensValidados, adminId);

  // 6. Criar venda
  let venda;
  try {
    venda = await SoftVenda.create({
      adminId,
      caixaId:        caixa._id,
      operadorNome:   String(operadorNome || 'Admin').trim(),
      clienteNome:    String(clienteNome  || 'Consumidor').trim(),
      itens:          itensValidados.map(({ _estoqueAtual, ...i }) => i), // remover campo interno
      subtotal,
      desconto:       descontoVal,
      total,
      formaPagamento,
      status:         'concluida',
    });
  } catch (e) {
    // ROLLBACK de estoque se criar venda falhou
    for (const b of baixados) {
      await SoftProduto.findOneAndUpdate(
        { _id: b.produtoId, adminId },
        { $inc: { estoque: b.quantidade } }
      );
    }
    softLogger.erro('Venda', 'Falha ao criar SoftVenda — estoque revertido', { adminId, erro: e.message });
    throw e;
  }

  // 7. Registrar movimentações de estoque (auditoria — append-only)
  const docsEstoque = baixados.map(b => ({
    adminId,
    produtoId:   b.produtoId,
    produtoNome: b.produtoNome,
    tipo:        'saida',
    quantidade:  b.quantidade,
    estoqueApos: b.estoqueApos,
    motivo:      `Venda #${venda._id}`,
    operadorId:  adminId,
    vendaId:     venda._id,
  }));
  await SoftEstoque.insertMany(docsEstoque);

  // 8. Registrar movimentação financeira
  await SoftMovimentacao.create({
    adminId,
    caixaId:        caixa._id,
    tipo:           'venda',
    valor:          total,
    formaPagamento,
    descricao:      `Venda #${venda._id} — ${itensValidados.length} item(s)`,
    operadorNome:   String(operadorNome || 'Admin').trim(),
    vendaId:        venda._id,
  });

  // 9. Atualizar contadores do caixa
  await SoftCaixa.findByIdAndUpdate(caixa._id, {
    $inc: { totalVendas: total, qtdVendas: 1 },
  });

  softLogger.financeiro('VENDA', adminId, total, {
    vendaId:        venda._id,
    caixaId:        caixa._id,
    formaPagamento,
    itens:          itensValidados.length,
  });

  return venda;
}

/**
 * cancelar — cancela venda concluída e reverte estoque
 *
 * Sequência:
 * 1. Buscar venda e verificar propriedade
 * 2. Verificar que está concluída (não cancelada)
 * 3. Reverter estoque ($inc positivo — entrada de estorno)
 * 4. Marcar venda como cancelada
 * 5. Criar movimentação de estorno financeiro
 * 6. Atualizar contadores do caixa
 */
async function cancelar({ adminId, vendaId, motivo, operadorNome }) {
  if (!OBJECTID_RE.test(vendaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'vendaId'; throw err;
  }
  if (!motivo || !String(motivo).trim()) {
    const err = new Error('VAL_001'); err.detalhe = 'motivo é obrigatório para cancelamento'; throw err;
  }

  const venda = await SoftVenda.findOne({ _id: vendaId, adminId });
  if (!venda) {
    const err = new Error('ACE_002'); throw err;
  }
  if (venda.status === 'cancelada') {
    const err = new Error('NEG_005'); throw err;
  }

  // Marcar como cancelada
  venda.status              = 'cancelada';
  venda.canceladaEm         = new Date();
  venda.motivoCancelamento  = String(motivo).trim();
  await venda.save();

  // Reverter estoque de cada item ($inc positivo = entrada)
  const docsEstoque = [];
  for (const item of venda.itens) {
    const atualizado = await SoftProduto.findOneAndUpdate(
      { _id: item.produtoId, adminId },
      { $inc: { estoque: item.quantidade } },
      { new: true, lean: true }
    );

    if (atualizado) {
      docsEstoque.push({
        adminId,
        produtoId:   item.produtoId,
        produtoNome: item.produtoNome,
        tipo:        'estorno',
        quantidade:  item.quantidade,
        estoqueApos: atualizado.estoque,
        motivo:      `Cancelamento venda #${vendaId}`,
        operadorId:  adminId,
        vendaId:     venda._id,
      });
    }
  }

  if (docsEstoque.length > 0) {
    await SoftEstoque.insertMany(docsEstoque);
  }

  // Registrar estorno financeiro
  const caixa = await SoftCaixa.findOne({ adminId, status: 'aberto' }).lean();
  if (caixa) {
    await SoftMovimentacao.create({
      adminId,
      caixaId:        caixa._id,
      tipo:           'estorno',
      valor:          venda.total,
      formaPagamento: venda.formaPagamento,
      descricao:      `Estorno venda #${vendaId} — ${String(motivo).trim()}`,
      operadorNome:   String(operadorNome || 'Admin').trim(),
      vendaId:        venda._id,
    });

    await SoftCaixa.findByIdAndUpdate(caixa._id, {
      $inc: { totalVendas: -venda.total, qtdVendas: -1 },
    });
  }

  softLogger.financeiro('VENDA_CANCELADA', adminId, venda.total, { vendaId, motivo });
  return venda.toObject();
}

/**
 * listar — lista vendas com paginação e filtros
 */
async function listar({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { status, formaPagamento, de, ate, caixaId } = query;

  const filtro = { adminId };

  if (status === 'cancelada') filtro.status = 'cancelada';
  else if (status === 'todas') { /* sem filtro */ }
  else filtro.status = 'concluida';

  if (formaPagamento && FORMAS_PAGAMENTO.includes(formaPagamento)) {
    filtro.formaPagamento = formaPagamento;
  }
  if (caixaId && OBJECTID_RE.test(caixaId)) {
    filtro.caixaId = caixaId;
  }
  if (de || ate) {
    filtro.createdAt = {};
    if (de)  filtro.createdAt.$gte = new Date(de  + 'T00:00:00.000Z');
    if (ate) filtro.createdAt.$lte = new Date(ate + 'T23:59:59.999Z');
  }

  const [vendas, total] = await Promise.all([
    SoftVenda.find(filtro)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftVenda.countDocuments(filtro),
  ]);

  return { vendas, meta: softMetaPaginacao(total, pagina, limite) };
}

/**
 * buscarPorId — retorna venda por ID com verificação de propriedade
 */
async function buscarPorId({ adminId, vendaId }) {
  if (!OBJECTID_RE.test(vendaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'vendaId'; throw err;
  }
  const venda = await SoftVenda.findOne({ _id: vendaId, adminId }).lean();
  if (!venda) {
    const err = new Error('ACE_002'); throw err;
  }
  return venda;
}

/**
 * resumoDoCaixa — totais agrupados por forma de pagamento para o caixa atual
 */
async function resumoDoCaixa({ adminId, caixaId }) {
  if (!OBJECTID_RE.test(caixaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'caixaId'; throw err;
  }

  const caixa = await SoftCaixa.findOne({ _id: caixaId, adminId }).lean();
  if (!caixa) { const err = new Error('ACE_002'); throw err; }

  const [agrupado] = await SoftVenda.aggregate([
    { $match: { adminId: caixa.adminId, caixaId: caixa._id, status: 'concluida' } },
    {
      $group: {
        _id:        '$formaPagamento',
        total:      { $sum: '$total' },
        quantidade: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]).exec().then(r => [r]);

  const totalGeral = (agrupado || []).reduce((s, g) => s + g.total, 0);

  return {
    caixaId,
    formasPagamento: agrupado || [],
    totalGeral:      parseFloat(totalGeral.toFixed(2)),
    qtdVendas:       (agrupado || []).reduce((s, g) => s + g.quantidade, 0),
  };
}

module.exports = { registrar, cancelar, listar, buscarPorId, resumoDoCaixa };
