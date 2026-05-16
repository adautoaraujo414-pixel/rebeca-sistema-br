/**
 * soft-financeiro.service.js
 * Relatórios financeiros do Rebeca Soft — SOMENTE LEITURA.
 *
 * ESTRATÉGIA DE AGGREGATION:
 * - Todos os aggregates filtram adminId como primeiro $match (usa índice)
 * - maxTimeMS(10000) em queries longas (evita timeout silencioso)
 * - Intervalos limitados a 366 dias (evita varredura total)
 * - Campos desnormalizados evitam $lookup (sem populate)
 *
 * CONSISTÊNCIA:
 * - Vendas canceladas: status='cancelada' → excluídas de receita
 * - Despesas canceladas: canceladaEm != null → excluídas de custo
 * - Compras canceladas: observacao CANCELADO: → excluídas de custo
 * - Estornos em SoftMovimentacao são tipo 'estorno' → não somam em receita
 *
 * PREPARADO PARA DRE:
 * - Separação clara: receita_venda / receita_avulsa / despesa / custo_compra
 * - Agrupamento por categoria de despesa
 * - Agrupamento por forma de pagamento
 * - Agrupamento por período (dia/semana/mês)
 */
const mongoose     = require('mongoose');
const SoftVenda    = require('../models/soft-venda.model');
const SoftCaixa    = require('../models/soft-caixa.model');
const SoftDespesa  = require('../models/soft-despesa.model');
const SoftCompra   = require('../models/soft-compra.model');
const SoftMovimentacao = require('../models/soft-movimentacao.model');
const SoftProduto  = require('../models/soft-produto.model');
const { softLogger } = require('../utils/soft-logger.util');

const MAX_INTERVALO_DIAS = 366;
const MAX_TIME_MS        = 10000;

/**
 * _parsePeriodo — valida e converte datas de/ate
 * Limita intervalo a MAX_INTERVALO_DIAS para proteger performance
 */
function _parsePeriodo(de, ate) {
  if (!de || !ate) {
    const err = new Error('VAL_001');
    err.detalhe = 'de e ate são obrigatórios (YYYY-MM-DD)';
    throw err;
  }

  const dataInicio = new Date(de  + 'T00:00:00.000Z');
  const dataFim    = new Date(ate + 'T23:59:59.999Z');

  if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
    const err = new Error('VAL_002');
    err.detalhe = 'datas inválidas — use formato YYYY-MM-DD';
    throw err;
  }

  if (dataFim < dataInicio) {
    const err = new Error('VAL_002');
    err.detalhe = 'ate não pode ser anterior a de';
    throw err;
  }

  const diasIntervalo = (dataFim - dataInicio) / (1000 * 60 * 60 * 24);
  if (diasIntervalo > MAX_INTERVALO_DIAS) {
    const err = new Error('VAL_005');
    err.detalhe = `intervalo máximo é ${MAX_INTERVALO_DIAS} dias`;
    throw err;
  }

  return { dataInicio, dataFim, diasIntervalo: Math.ceil(diasIntervalo) };
}

/**
 * resumoCaixa — dados completos de um caixa específico
 * Combina SoftCaixa + SoftVenda + SoftMovimentacao
 */
async function resumoCaixa({ adminId, caixaId }) {
  const OBJECTID_RE = /^[a-f\d]{24}$/i;
  if (!OBJECTID_RE.test(caixaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'caixaId'; throw err;
  }

  const adminObjId = new mongoose.Types.ObjectId(adminId);
  const caixaObjId = new mongoose.Types.ObjectId(caixaId);

  // Verificar propriedade
  const caixa = await SoftCaixa.findOne({ _id: caixaObjId, adminId: adminObjId }).lean();
  if (!caixa) {
    const err = new Error('ACE_002'); throw err;
  }

  // Vendas do caixa por forma de pagamento
  const [vendasPorForma, totalMovs] = await Promise.all([
    SoftVenda.aggregate([
      { $match: { adminId: adminObjId, caixaId: caixaObjId, status: 'concluida' } },
      {
        $group: {
          _id:        '$formaPagamento',
          total:      { $sum: '$total' },
          quantidade: { $sum: 1 },
          desconto:   { $sum: '$desconto' },
        },
      },
      { $sort: { total: -1 } },
    ]).maxTimeMS(MAX_TIME_MS),

    SoftMovimentacao.aggregate([
      { $match: { adminId: adminObjId, caixaId: caixaObjId } },
      {
        $group: {
          _id:   '$tipo',
          total: { $sum: '$valor' },
          qtd:   { $sum: 1 },
        },
      },
    ]).maxTimeMS(MAX_TIME_MS),
  ]);

  // Calcular totais
  const totalVendas    = vendasPorForma.reduce((s, v) => s + v.total, 0);
  const totalDescontos = vendasPorForma.reduce((s, v) => s + v.desconto, 0);
  const qtdVendas      = vendasPorForma.reduce((s, v) => s + v.quantidade, 0);

  const movsPorTipo = {};
  for (const m of totalMovs) movsPorTipo[m._id] = m.total;

  const suprimentos = movsPorTipo['suprimento'] || 0;
  const sangrias    = movsPorTipo['sangria']    || 0;
  const estornos    = movsPorTipo['estorno']    || 0;

  // Saldo esperado no caixa
  const saldoEsperado = (caixa.saldoInicial || 0) + totalVendas + suprimentos - sangrias - estornos;

  softLogger.info('Financeiro', 'resumoCaixa consultado', { adminId, caixaId });

  return {
    caixa: {
      id:            caixa._id,
      status:        caixa.status,
      operadorNome:  caixa.operadorNome,
      aberturaEm:    caixa.aberturaEm,
      fechamentoEm:  caixa.fechamentoEm,
      saldoInicial:  caixa.saldoInicial,
      saldoFinal:    caixa.saldoFinal,
      saldoEsperado: parseFloat(saldoEsperado.toFixed(2)),
      diferenca:     caixa.diferenca,
    },
    vendas: {
      total:      parseFloat(totalVendas.toFixed(2)),
      quantidade: qtdVendas,
      descontos:  parseFloat(totalDescontos.toFixed(2)),
      porForma:   vendasPorForma,
    },
    movimentacoes: {
      suprimentos: parseFloat(suprimentos.toFixed(2)),
      sangrias:    parseFloat(sangrias.toFixed(2)),
      estornos:    parseFloat(estornos.toFixed(2)),
    },
  };
}

/**
 * fluxoPeriodo — fluxo financeiro dia a dia no período
 * Agrega vendas + despesas + receitas avulsas + compras por dia
 * Preparado para gráfico futuro (retorna array ordenado por data)
 */
async function fluxoPeriodo({ adminId, de, ate }) {
  const { dataInicio, dataFim } = _parsePeriodo(de, ate);
  const adminObjId = new mongoose.Types.ObjectId(adminId);

  const [vendasDia, despesasDia, comprasDia] = await Promise.all([
    // Vendas concluídas por dia
    SoftVenda.aggregate([
      {
        $match: {
          adminId:    adminObjId,
          status:     'concluida',
          createdAt:  { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'America/Sao_Paulo' } },
          receita:    { $sum: '$total' },
          quantidade: { $sum: 1 },
          desconto:   { $sum: '$desconto' },
        },
      },
      { $sort: { _id: 1 } },
    ]).maxTimeMS(MAX_TIME_MS),

    // Despesas e receitas avulsas por dia (excluindo canceladas)
    SoftDespesa.aggregate([
      {
        $match: {
          adminId:    adminObjId,
          canceladaEm: null,
          data:       { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:     { $dateToString: { format: '%Y-%m-%d', date: '$data', timezone: 'America/Sao_Paulo' } },
          tipo:    '$tipo',
          despesa: { $sum: { $cond: [{ $eq: ['$tipo', 'despesa'] }, '$valor', 0] } },
          receitaAvulsa: { $sum: { $cond: [{ $eq: ['$tipo', 'receita'] }, '$valor', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]).maxTimeMS(MAX_TIME_MS),

    // Compras por dia (excluindo canceladas)
    SoftCompra.aggregate([
      {
        $match: {
          adminId:    adminObjId,
          observacao: { $not: /^CANCELADO:/ },
          createdAt:  { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:         { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'America/Sao_Paulo' } },
          custoCompra: { $sum: '$total' },
          quantidade:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).maxTimeMS(MAX_TIME_MS),
  ]);

  // Consolidar por dia em um mapa
  const mapaFluxo = {};

  const _getDia = (data) => {
    if (!mapaFluxo[data]) {
      mapaFluxo[data] = {
        data,
        receita:       0,
        receitaAvulsa: 0,
        despesa:       0,
        custoCompra:   0,
        qtdVendas:     0,
        desconto:      0,
        lucro:         0,
      };
    }
    return mapaFluxo[data];
  };

  for (const v of vendasDia) {
    const d = _getDia(v._id);
    d.receita    += v.receita;
    d.qtdVendas  += v.quantidade;
    d.desconto   += v.desconto;
  }
  for (const d of despesasDia) {
    const dia = _getDia(d._id);
    dia.despesa       += d.despesa || 0;
    dia.receitaAvulsa += d.receitaAvulsa || 0;
  }
  for (const c of comprasDia) {
    const d = _getDia(c._id);
    d.custoCompra += c.custoCompra;
  }

  // Calcular lucro bruto por dia
  const fluxo = Object.values(mapaFluxo)
    .map(d => ({
      ...d,
      receita:       parseFloat(d.receita.toFixed(2)),
      receitaAvulsa: parseFloat(d.receitaAvulsa.toFixed(2)),
      despesa:       parseFloat(d.despesa.toFixed(2)),
      custoCompra:   parseFloat(d.custoCompra.toFixed(2)),
      desconto:      parseFloat(d.desconto.toFixed(2)),
      lucro:         parseFloat((d.receita + d.receitaAvulsa - d.despesa - d.custoCompra).toFixed(2)),
    }))
    .sort((a, b) => a.data.localeCompare(b.data));

  // Totais do período
  const totais = fluxo.reduce((acc, d) => ({
    receita:       acc.receita       + d.receita,
    receitaAvulsa: acc.receitaAvulsa + d.receitaAvulsa,
    despesa:       acc.despesa       + d.despesa,
    custoCompra:   acc.custoCompra   + d.custoCompra,
    desconto:      acc.desconto      + d.desconto,
    lucro:         acc.lucro         + d.lucro,
    qtdVendas:     acc.qtdVendas     + d.qtdVendas,
  }), { receita: 0, receitaAvulsa: 0, despesa: 0, custoCompra: 0, desconto: 0, lucro: 0, qtdVendas: 0 });

  softLogger.info('Financeiro', 'fluxoPeriodo consultado', { adminId, de, ate, dias: fluxo.length });

  return {
    periodo: { de, ate, dias: fluxo.length },
    fluxo,
    totais: {
      receita:        parseFloat(totais.receita.toFixed(2)),
      receitaAvulsa:  parseFloat(totais.receitaAvulsa.toFixed(2)),
      despesa:        parseFloat(totais.despesa.toFixed(2)),
      custoCompra:    parseFloat(totais.custoCompra.toFixed(2)),
      desconto:       parseFloat(totais.desconto.toFixed(2)),
      lucro:          parseFloat(totais.lucro.toFixed(2)),
      qtdVendas:      totais.qtdVendas,
      receitaTotal:   parseFloat((totais.receita + totais.receitaAvulsa).toFixed(2)),
    },
  };
}

/**
 * vendasPorFormaPagamento — totais por forma de pagamento no período
 */
async function vendasPorFormaPagamento({ adminId, de, ate }) {
  const { dataInicio, dataFim } = _parsePeriodo(de, ate);
  const adminObjId = new mongoose.Types.ObjectId(adminId);

  const resultado = await SoftVenda.aggregate([
    {
      $match: {
        adminId:   adminObjId,
        status:    'concluida',
        createdAt: { $gte: dataInicio, $lte: dataFim },
      },
    },
    {
      $group: {
        _id:        '$formaPagamento',
        total:      { $sum: '$total' },
        quantidade: { $sum: 1 },
        ticketMedio: { $avg: '$total' },
        desconto:    { $sum: '$desconto' },
      },
    },
    { $sort: { total: -1 } },
  ]).maxTimeMS(MAX_TIME_MS);

  const totalGeral  = resultado.reduce((s, r) => s + r.total, 0);
  const qtdTotal    = resultado.reduce((s, r) => s + r.quantidade, 0);

  return {
    periodo: { de, ate },
    formas:  resultado.map(r => ({
      forma:       r._id,
      total:       parseFloat(r.total.toFixed(2)),
      quantidade:  r.quantidade,
      ticketMedio: parseFloat(r.ticketMedio.toFixed(2)),
      desconto:    parseFloat(r.desconto.toFixed(2)),
      percentual:  totalGeral > 0 ? parseFloat(((r.total / totalGeral) * 100).toFixed(1)) : 0,
    })),
    totalGeral:  parseFloat(totalGeral.toFixed(2)),
    qtdTotal,
  };
}

/**
 * despesasPorCategoria — totais de despesas agrupados por categoria no período
 */
async function despesasPorCategoria({ adminId, de, ate }) {
  const { dataInicio, dataFim } = _parsePeriodo(de, ate);
  const adminObjId = new mongoose.Types.ObjectId(adminId);

  const resultado = await SoftDespesa.aggregate([
    {
      $match: {
        adminId:     adminObjId,
        tipo:        'despesa',
        canceladaEm: null,
        data:        { $gte: dataInicio, $lte: dataFim },
      },
    },
    {
      $group: {
        _id:        '$categoria',
        total:      { $sum: '$valor' },
        quantidade: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]).maxTimeMS(MAX_TIME_MS);

  const totalGeral = resultado.reduce((s, r) => s + r.total, 0);

  return {
    periodo:     { de, ate },
    categorias:  resultado.map(r => ({
      categoria:  r._id,
      total:      parseFloat(r.total.toFixed(2)),
      quantidade: r.quantidade,
      percentual: totalGeral > 0 ? parseFloat(((r.total / totalGeral) * 100).toFixed(1)) : 0,
    })),
    totalGeral: parseFloat(totalGeral.toFixed(2)),
  };
}

/**
 * comprasPorPeriodo — resumo de compras no período
 */
async function comprasPorPeriodo({ adminId, de, ate }) {
  const { dataInicio, dataFim } = _parsePeriodo(de, ate);
  const adminObjId = new mongoose.Types.ObjectId(adminId);

  const [porFornecedor, totalGeral] = await Promise.all([
    SoftCompra.aggregate([
      {
        $match: {
          adminId:    adminObjId,
          observacao: { $not: /^CANCELADO:/ },
          createdAt:  { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:           '$fornecedorNome',
          total:         { $sum: '$total' },
          quantidade:    { $sum: 1 },
          fornecedorId:  { $first: '$fornecedorId' },
        },
      },
      { $sort: { total: -1 } },
    ]).maxTimeMS(MAX_TIME_MS),

    SoftCompra.aggregate([
      {
        $match: {
          adminId:    adminObjId,
          observacao: { $not: /^CANCELADO:/ },
          createdAt:  { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:        null,
          total:      { $sum: '$total' },
          quantidade: { $sum: 1 },
        },
      },
    ]).maxTimeMS(MAX_TIME_MS),
  ]);

  return {
    periodo:        { de, ate },
    porFornecedor,
    totalGeral:     parseFloat((totalGeral[0]?.total || 0).toFixed(2)),
    qtdCompras:     totalGeral[0]?.quantidade || 0,
  };
}

/**
 * lucroBruto — DRE simplificado para o período
 *
 * Fórmula:
 *   Receita Bruta    = soma vendas concluídas
 *   (-) Descontos    = soma descontos concedidos
 *   Receita Líquida  = Receita Bruta - Descontos
 *   (-) Custo Compra = soma compras não canceladas
 *   Lucro Bruto      = Receita Líquida - Custo Compra
 *   (-) Despesas Op. = soma despesas não canceladas
 *   (+) Receitas Av. = soma receitas avulsas não canceladas
 *   Resultado Líq.   = Lucro Bruto - Despesas + Receitas Avulsas
 *
 * PREPARADO PARA DRE: estrutura já segue padrão DRE simplificado
 */
async function lucroBruto({ adminId, de, ate }) {
  const { dataInicio, dataFim, diasIntervalo } = _parsePeriodo(de, ate);
  const adminObjId = new mongoose.Types.ObjectId(adminId);

  const [vendas, despesasReceitas, compras] = await Promise.all([
    SoftVenda.aggregate([
      {
        $match: {
          adminId:   adminObjId,
          status:    'concluida',
          createdAt: { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:       null,
          receita:   { $sum: '$total' },
          desconto:  { $sum: '$desconto' },
          subtotal:  { $sum: '$subtotal' },
          qtd:       { $sum: 1 },
        },
      },
    ]).maxTimeMS(MAX_TIME_MS),

    SoftDespesa.aggregate([
      {
        $match: {
          adminId:     adminObjId,
          canceladaEm: null,
          data:        { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:           '$tipo',
          total:         { $sum: '$valor' },
          quantidade:    { $sum: 1 },
        },
      },
    ]).maxTimeMS(MAX_TIME_MS),

    SoftCompra.aggregate([
      {
        $match: {
          adminId:    adminObjId,
          observacao: { $not: /^CANCELADO:/ },
          createdAt:  { $gte: dataInicio, $lte: dataFim },
        },
      },
      {
        $group: {
          _id:   null,
          total: { $sum: '$total' },
          qtd:   { $sum: 1 },
        },
      },
    ]).maxTimeMS(MAX_TIME_MS),
  ]);

  // Extrair valores
  const receitaBruta   = vendas[0]?.receita   || 0;
  const descontos      = vendas[0]?.desconto   || 0;
  const qtdVendas      = vendas[0]?.qtd        || 0;
  const receitaLiquida = receitaBruta - descontos;

  const custoCompras   = compras[0]?.total     || 0;
  const lucroBrutoVal  = receitaLiquida - custoCompras;

  const despOp = despesasReceitas.find(d => d._id === 'despesa');
  const recAv  = despesasReceitas.find(d => d._id === 'receita');
  const despesasOp  = despOp?.total || 0;
  const receitasAv  = recAv?.total  || 0;

  const resultadoLiquido = lucroBrutoVal - despesasOp + receitasAv;
  const margemBruta      = receitaBruta > 0
    ? parseFloat(((lucroBrutoVal / receitaBruta) * 100).toFixed(1))
    : 0;
  const margemLiquida    = receitaBruta > 0
    ? parseFloat(((resultadoLiquido / receitaBruta) * 100).toFixed(1))
    : 0;

  softLogger.info('Financeiro', 'lucroBruto consultado', {
    adminId, de, ate, diasIntervalo, resultadoLiquido,
  });

  return {
    periodo:          { de, ate, dias: diasIntervalo },
    // DRE simplificado
    dre: {
      receitaBruta:     parseFloat(receitaBruta.toFixed(2)),
      descontos:        parseFloat(descontos.toFixed(2)),
      receitaLiquida:   parseFloat(receitaLiquida.toFixed(2)),
      custoCompras:     parseFloat(custoCompras.toFixed(2)),
      lucroBruto:       parseFloat(lucroBrutoVal.toFixed(2)),
      despesasOp:       parseFloat(despesasOp.toFixed(2)),
      receitasAvulsas:  parseFloat(receitasAv.toFixed(2)),
      resultadoLiquido: parseFloat(resultadoLiquido.toFixed(2)),
    },
    indicadores: {
      qtdVendas,
      ticketMedio:   qtdVendas > 0 ? parseFloat((receitaBruta / qtdVendas).toFixed(2)) : 0,
      margemBruta,
      margemLiquida,
      qtdCompras:    compras[0]?.qtd || 0,
    },
  };
}

/**
 * resumoOperacional — visão geral do negócio (sem período obrigatório)
 * Retorna dados de hoje + últimos 30 dias + totais históricos
 */
async function resumoOperacional({ adminId }) {
  const adminObjId  = new mongoose.Types.ObjectId(adminId);
  const hoje        = new Date();
  const inicioHoje  = new Date(hoje.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const fim30dias   = new Date();
  const inicio30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [vendasHoje, vendas30, estoqueAlerta, caixaAberto] = await Promise.all([
    SoftVenda.aggregate([
      { $match: { adminId: adminObjId, status: 'concluida', createdAt: { $gte: inicioHoje } } },
      { $group: { _id: null, total: { $sum: '$total' }, qtd: { $sum: 1 } } },
    ]).maxTimeMS(MAX_TIME_MS),

    SoftVenda.aggregate([
      { $match: { adminId: adminObjId, status: 'concluida', createdAt: { $gte: inicio30dias, $lte: fim30dias } } },
      { $group: { _id: null, total: { $sum: '$total' }, qtd: { $sum: 1 } } },
    ]).maxTimeMS(MAX_TIME_MS),

    SoftProduto.countDocuments({
      adminId:  adminObjId,
      ativo:    true,
      $expr:    { $lte: ['$estoque', '$estoqueMin'] },
    }),

    SoftCaixa.findOne({ adminId: adminObjId, status: 'aberto' })
      .select('operadorNome aberturaEm saldoInicial totalVendas qtdVendas')
      .lean(),
  ]);

  softLogger.info('Financeiro', 'resumoOperacional consultado', { adminId });

  return {
    hoje: {
      vendas:     parseFloat((vendasHoje[0]?.total || 0).toFixed(2)),
      qtdVendas:  vendasHoje[0]?.qtd || 0,
    },
    ultimos30dias: {
      vendas:    parseFloat((vendas30[0]?.total || 0).toFixed(2)),
      qtdVendas: vendas30[0]?.qtd || 0,
      mediaDia:  parseFloat(((vendas30[0]?.total || 0) / 30).toFixed(2)),
    },
    estoque: {
      produtosAbaixoMinimo: estoqueAlerta,
      alertaCritico:        estoqueAlerta > 0,
    },
    caixa: caixaAberto
      ? {
          aberto:       true,
          operador:     caixaAberto.operadorNome,
          aberturaEm:   caixaAberto.aberturaEm,
          totalVendas:  caixaAberto.totalVendas,
          qtdVendas:    caixaAberto.qtdVendas,
        }
      : { aberto: false },
  };
}

module.exports = {
  resumoCaixa,
  fluxoPeriodo,
  vendasPorFormaPagamento,
  despesasPorCategoria,
  comprasPorPeriodo,
  lucroBruto,
  resumoOperacional,
};
