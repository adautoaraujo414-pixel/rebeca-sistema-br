/**
 * soft-caixa.service.js
 * Abertura e fechamento de caixa do Rebeca Soft.
 * REGRA: apenas 1 caixa aberto por admin (índice único parcial no model).
 * SEM: venda, financeiro, upload, websocket.
 */
const SoftCaixa       = require('../models/soft-caixa.model');
const SoftMovimentacao = require('../models/soft-movimentacao.model');
const { softLogger }   = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE = /^[a-f\d]{24}$/i;

/**
 * abrir — abre novo caixa para o admin
 * Falha atomicamente se já existir caixa aberto (índice único parcial)
 */
async function abrir({ adminId, operadorNome, saldoInicial }) {
  const saldo = parseFloat(saldoInicial);
  if (isNaN(saldo) || saldo < 0) {
    const err = new Error('VAL_003'); err.detalhe = 'saldoInicial deve ser >= 0'; throw err;
  }
  if (!operadorNome || !String(operadorNome).trim()) {
    const err = new Error('VAL_001'); err.detalhe = 'operadorNome'; throw err;
  }

  // Verificar se já existe caixa aberto (dupla verificação além do índice)
  const aberto = await SoftCaixa.findOne({ adminId, status: 'aberto' }).lean();
  if (aberto) {
    const err = new Error('NEG_003'); throw err;
  }

  let caixa;
  try {
    caixa = await SoftCaixa.create({
      adminId,
      operadorNome: String(operadorNome).trim(),
      status:       'aberto',
      saldoInicial: saldo,
      aberturaEm:   new Date(),
    });
  } catch (e) {
    // Código 11000 = violação de índice único (race condition — dois opens simultâneos)
    if (e.code === 11000) {
      const err = new Error('NEG_003'); throw err;
    }
    throw e;
  }

  // Registrar suprimento inicial como movimentação
  if (saldo > 0) {
    await SoftMovimentacao.create({
      adminId,
      caixaId:       caixa._id,
      tipo:          'suprimento',
      valor:         saldo,
      formaPagamento: 'dinheiro',
      descricao:     'Saldo inicial de abertura',
      operadorNome:  String(operadorNome).trim(),
    });
  }

  softLogger.financeiro('CAIXA_ABERTO', adminId, saldo, { caixaId: caixa._id, operadorNome });
  return caixa;
}

/**
 * fechar — fecha o caixa aberto do admin
 * Calcula saldo esperado com base nas movimentações.
 */
async function fechar({ adminId, saldoFinal, observacao }) {
  const saldoF = parseFloat(saldoFinal);
  if (isNaN(saldoF) || saldoF < 0) {
    const err = new Error('VAL_003'); err.detalhe = 'saldoFinal deve ser >= 0'; throw err;
  }

  const caixa = await SoftCaixa.findOne({ adminId, status: 'aberto' });
  if (!caixa) {
    const err = new Error('NEG_004'); throw err;
  }

  // Calcular saldo esperado somando todas as movimentações do caixa
  const movs = await SoftMovimentacao.find({ adminId, caixaId: caixa._id }).lean();

  let saldoEsperado = caixa.saldoInicial;
  let totalVendas   = 0;
  let qtdVendas     = 0;

  for (const m of movs) {
    if (['venda', 'suprimento', 'receita'].includes(m.tipo)) {
      saldoEsperado += m.valor;
      if (m.tipo === 'venda') { totalVendas += m.valor; qtdVendas++; }
    } else if (['sangria', 'despesa', 'estorno'].includes(m.tipo)) {
      saldoEsperado -= m.valor;
    }
  }

  const diferenca = saldoF - saldoEsperado;

  const caixaFechado = await SoftCaixa.findByIdAndUpdate(
    caixa._id,
    {
      $set: {
        status:       'fechado',
        saldoFinal:   saldoF,
        saldoEsperado,
        diferenca,
        totalVendas,
        qtdVendas,
        observacao:   String(observacao || '').trim(),
        fechamentoEm: new Date(),
      },
    },
    { new: true, lean: true }
  );

  softLogger.financeiro('CAIXA_FECHADO', adminId, saldoF, {
    caixaId: caixa._id, saldoEsperado, diferenca, totalVendas,
  });

  return caixaFechado;
}

/**
 * caixaAtual — retorna o caixa aberto do admin (ou null)
 */
async function caixaAtual({ adminId }) {
  const caixa = await SoftCaixa.findOne({ adminId, status: 'aberto' }).lean();
  return caixa || null;
}

/**
 * buscarPorId — retorna caixa por ID validando propriedade
 */
async function buscarPorId({ adminId, caixaId }) {
  if (!OBJECTID_RE.test(caixaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'caixaId'; throw err;
  }
  const caixa = await SoftCaixa.findOne({ _id: caixaId, adminId }).lean();
  if (!caixa) {
    const err = new Error('ACE_002'); throw err;
  }
  return caixa;
}

/**
 * historico — lista caixas fechados com paginação
 */
async function historico({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { de, ate, status } = query;

  const filtro = { adminId };
  if (status === 'aberto')  filtro.status = 'aberto';
  else if (status === 'todos') { /* sem filtro */ }
  else                      filtro.status = 'fechado';

  if (de || ate) {
    filtro.aberturaEm = {};
    if (de)  filtro.aberturaEm.$gte = new Date(de  + 'T00:00:00.000Z');
    if (ate) filtro.aberturaEm.$lte = new Date(ate + 'T23:59:59.999Z');
  }

  const [caixas, total] = await Promise.all([
    SoftCaixa.find(filtro)
      .sort({ aberturaEm: -1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftCaixa.countDocuments(filtro),
  ]);

  return { caixas, meta: softMetaPaginacao(total, pagina, limite) };
}

/**
 * suprimento — adiciona dinheiro ao caixa aberto (troco, reforço)
 */
async function suprimento({ adminId, valor, descricao, operadorNome }) {
  const val = parseFloat(valor);
  if (isNaN(val) || val <= 0) {
    const err = new Error('VAL_003'); err.detalhe = 'valor deve ser > 0'; throw err;
  }

  const caixa = await SoftCaixa.findOne({ adminId, status: 'aberto' }).lean();
  if (!caixa) {
    const err = new Error('NEG_004'); throw err;
  }

  await SoftMovimentacao.create({
    adminId,
    caixaId:        caixa._id,
    tipo:           'suprimento',
    valor:          val,
    formaPagamento: 'dinheiro',
    descricao:      String(descricao || 'Suprimento').trim(),
    operadorNome:   String(operadorNome || 'Admin').trim(),
  });

  softLogger.financeiro('SUPRIMENTO', adminId, val, { caixaId: caixa._id });
  return { registrado: true, tipo: 'suprimento', valor: val };
}

/**
 * sangria — retira dinheiro do caixa aberto (pagamento de contas, etc)
 */
async function sangria({ adminId, valor, descricao, operadorNome }) {
  const val = parseFloat(valor);
  if (isNaN(val) || val <= 0) {
    const err = new Error('VAL_003'); err.detalhe = 'valor deve ser > 0'; throw err;
  }
  if (!descricao || !String(descricao).trim()) {
    const err = new Error('VAL_001'); err.detalhe = 'descricao é obrigatória para sangria'; throw err;
  }

  const caixa = await SoftCaixa.findOne({ adminId, status: 'aberto' }).lean();
  if (!caixa) {
    const err = new Error('NEG_004'); throw err;
  }

  await SoftMovimentacao.create({
    adminId,
    caixaId:        caixa._id,
    tipo:           'sangria',
    valor:          val,
    formaPagamento: 'dinheiro',
    descricao:      String(descricao).trim(),
    operadorNome:   String(operadorNome || 'Admin').trim(),
  });

  softLogger.financeiro('SANGRIA', adminId, val, { caixaId: caixa._id });
  return { registrado: true, tipo: 'sangria', valor: val };
}

/**
 * movimentacoesDoCaixa — lista movimentações de um caixa específico
 */
async function movimentacoesDoCaixa({ adminId, caixaId, query = {} }) {
  if (!OBJECTID_RE.test(caixaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'caixaId'; throw err;
  }
  // Confirmar propriedade
  const caixa = await SoftCaixa.findOne({ _id: caixaId, adminId }).lean();
  if (!caixa) { const err = new Error('ACE_002'); throw err; }

  const { pagina, limite, skip } = softPaginar(query);

  const [movs, total] = await Promise.all([
    SoftMovimentacao.find({ adminId, caixaId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftMovimentacao.countDocuments({ adminId, caixaId }),
  ]);

  return { movimentacoes: movs, meta: softMetaPaginacao(total, pagina, limite) };
}

module.exports = {
  abrir, fechar, caixaAtual, buscarPorId,
  historico, suprimento, sangria, movimentacoesDoCaixa,
};
