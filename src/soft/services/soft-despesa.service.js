/**
 * soft-despesa.service.js
 * Despesas e receitas avulsas do Rebeca Soft.
 *
 * RECEITA AVULSA ≠ VENDA:
 * - Venda: passa por caixa, baixa estoque, vinculada a produto
 * - Receita avulsa: serviço, aluguel, entrada não operacional
 *
 * PREPARADO PARA DRE FUTURO:
 * - campo categoria (ex: 'aluguel', 'marketing', 'servico', 'outros')
 * - tipo: 'despesa' | 'receita'
 * - data customizável (competência vs caixa)
 * - comprovante (URL futura)
 *
 * IDEMPOTÊNCIA:
 * - Hash dos dados + janela de 5 minutos
 * - Previne duplo-clique em despesas de alto valor
 *
 * NUNCA APAGAR:
 * - Cancelamento marca campo canceladaEm + motivoCancelamento
 * - SoftMovimentacao correspondente nunca é deletada
 * - Estorno financeiro criado como nova SoftMovimentacao
 */
const crypto          = require('crypto');
const SoftDespesa     = require('../models/soft-despesa.model');
const SoftMovimentacao = require('../models/soft-movimentacao.model');
const { softLogger }  = require('../utils/soft-logger.util');
const { softPaginar, softMetaPaginacao } = require('../utils/soft-pagination.util');

const OBJECTID_RE = /^[a-f\d]{24}$/i;

const CATEGORIAS_VALIDAS = [
  'aluguel', 'energia', 'agua', 'telefone', 'internet',
  'folha', 'marketing', 'embalagem', 'transporte', 'manutencao',
  'imposto', 'servico', 'produto', 'equipamento', 'outros',
];

/**
 * _gerarIdempotencyKey — hash dos dados críticos (janela 5 min)
 */
function _gerarIdempotencyKey(adminId, tipo, valor, descricao) {
  const payload = JSON.stringify({ adminId, tipo, valor: parseFloat(valor).toFixed(2), descricao: String(descricao).trim() });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * registrar — registra despesa ou receita avulsa
 *
 * @param {{ adminId, tipo, descricao, valor, categoria, data, operadorNome, comprovante }} params
 */
async function registrar({ adminId, tipo, descricao, valor, categoria, data, operadorNome, comprovante }) {
  // Validações
  if (!['despesa', 'receita'].includes(tipo)) {
    const err = new Error('VAL_002'); err.detalhe = 'tipo deve ser despesa ou receita'; throw err;
  }

  const descricaoTrimmed = String(descricao || '').trim();
  if (!descricaoTrimmed) {
    const err = new Error('VAL_001'); err.detalhe = 'descricao'; throw err;
  }
  if (descricaoTrimmed.length > 300) {
    const err = new Error('VAL_005'); err.detalhe = 'descricao (máximo 300 caracteres)'; throw err;
  }

  const valorNum = parseFloat(valor);
  if (isNaN(valorNum) || valorNum <= 0) {
    const err = new Error('VAL_003'); err.detalhe = 'valor deve ser maior que zero'; throw err;
  }

  const categoriaFinal = CATEGORIAS_VALIDAS.includes(categoria) ? categoria : 'outros';

  // Data de competência (padrão: hoje)
  let dataCompetencia = new Date();
  if (data) {
    const parsedData = new Date(data);
    if (isNaN(parsedData.getTime())) {
      const err = new Error('VAL_002'); err.detalhe = 'data inválida (use YYYY-MM-DD)'; throw err;
    }
    dataCompetencia = parsedData;
  }

  // IDEMPOTÊNCIA — janela de 5 minutos
  const idemKey = _gerarIdempotencyKey(adminId, tipo, valorNum, descricaoTrimmed);
  const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000);

  const jaExiste = await SoftDespesa.findOne({
    adminId,
    idempotencyKey: idemKey,
    createdAt: { $gte: cincoMinAtras },
  }).lean();

  if (jaExiste) {
    softLogger.info('Despesa', 'Idempotency hit — retornando registro existente', {
      adminId, despesaId: jaExiste._id,
    });
    return jaExiste;
  }

  // Criar despesa/receita
  let despesa;
  try {
    despesa = await SoftDespesa.create({
      adminId,
      tipo:           tipo,
      descricao:      descricaoTrimmed,
      valor:          parseFloat(valorNum.toFixed(2)),
      categoria:      categoriaFinal,
      data:           dataCompetencia,
      operadorNome:   String(operadorNome || 'Admin').trim(),
      comprovante:    String(comprovante  || '').trim().slice(0, 500),
      idempotencyKey: idemKey,
    });
  } catch (e) {
    if (e.code === 11000) {
      const existente = await SoftDespesa.findOne({ adminId, idempotencyKey: idemKey }).lean();
      if (existente) return existente;
    }
    throw e;
  }

  // Criar movimentação financeira correspondente
  await SoftMovimentacao.create({
    adminId,
    caixaId:        null, // despesas avulsas não exigem caixa aberto
    tipo:           tipo === 'despesa' ? 'despesa' : 'receita',
    valor:          despesa.valor,
    formaPagamento: '',
    descricao:      `${tipo === 'despesa' ? 'Despesa' : 'Receita'}: ${descricaoTrimmed}`,
    operadorNome:   String(operadorNome || 'Admin').trim(),
  });

  softLogger.financeiro(
    tipo === 'despesa' ? 'DESPESA' : 'RECEITA_AVULSA',
    adminId,
    despesa.valor,
    { despesaId: despesa._id, categoria: categoriaFinal, descricao: descricaoTrimmed }
  );

  return despesa;
}

/**
 * listar — com filtros para DRE futuro
 */
async function listar({ adminId, query = {} }) {
  const { pagina, limite, skip } = softPaginar(query);
  const { tipo, categoria, de, ate, cancelada } = query;

  const filtro = { adminId };

  if (tipo === 'despesa' || tipo === 'receita') filtro.tipo = tipo;

  if (categoria && CATEGORIAS_VALIDAS.includes(categoria)) {
    filtro.categoria = categoria;
  }

  // Filtro de canceladas
  if (cancelada === 'true')  filtro.canceladaEm = { $ne: null };
  else if (cancelada === 'todas') { /* sem filtro */ }
  else filtro.canceladaEm = null; // padrão: só ativas

  // Filtro por data de competência (para DRE por período)
  if (de || ate) {
    filtro.data = {};
    if (de)  filtro.data.$gte = new Date(de  + 'T00:00:00.000Z');
    if (ate) filtro.data.$lte = new Date(ate + 'T23:59:59.999Z');
  }

  const [despesas, total] = await Promise.all([
    SoftDespesa.find(filtro)
      .sort({ data: -1, createdAt: -1 })
      .skip(skip)
      .limit(limite)
      .lean(),
    SoftDespesa.countDocuments(filtro),
  ]);

  // Totalizadores — preparação para DRE
  const [totais] = await SoftDespesa.aggregate([
    { $match: { ...filtro } },
    {
      $group: {
        _id:           '$tipo',
        totalValor:    { $sum: '$valor' },
        quantidade:    { $sum: 1 },
      },
    },
  ]);

  return {
    despesas,
    meta:    softMetaPaginacao(total, pagina, limite),
    totais:  totais || [],
  };
}

/**
 * buscarPorId
 */
async function buscarPorId({ adminId, despesaId }) {
  if (!OBJECTID_RE.test(despesaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'despesaId'; throw err;
  }
  const d = await SoftDespesa.findOne({ _id: despesaId, adminId }).lean();
  if (!d) { const err = new Error('ACE_002'); throw err; }
  return d;
}

/**
 * cancelar — cancelamento lógico (nunca apaga)
 * Cria estorno financeiro como nova SoftMovimentacao.
 */
async function cancelar({ adminId, despesaId, motivo, operadorNome }) {
  if (!OBJECTID_RE.test(despesaId)) {
    const err = new Error('VAL_004'); err.detalhe = 'despesaId'; throw err;
  }
  if (!motivo || !String(motivo).trim()) {
    const err = new Error('VAL_001'); err.detalhe = 'motivo é obrigatório'; throw err;
  }

  const despesa = await SoftDespesa.findOne({ _id: despesaId, adminId });
  if (!despesa) { const err = new Error('ACE_002'); throw err; }
  if (despesa.canceladaEm) {
    const err = new Error('NEG_005'); throw err;
  }

  // Marcar como cancelada (não deleta)
  await SoftDespesa.findByIdAndUpdate(despesaId, {
    $set: {
      canceladaEm:         new Date(),
      motivoCancelamento:  String(motivo).trim(),
    },
  });

  // Estorno financeiro: tipo inverso
  const tipoEstorno = despesa.tipo === 'despesa' ? 'receita' : 'despesa';
  await SoftMovimentacao.create({
    adminId,
    caixaId:        null,
    tipo:           tipoEstorno,
    valor:          despesa.valor,
    formaPagamento: '',
    descricao:      `Estorno ${despesa.tipo}: ${despesa.descricao} — ${String(motivo).trim()}`,
    operadorNome:   String(operadorNome || 'Admin').trim(),
  });

  softLogger.financeiro('DESPESA_CANCELADA', adminId, despesa.valor, { despesaId, motivo });
  return { cancelada: true, despesaId };
}

/**
 * categorias — retorna lista de categorias válidas (para frontend futuro)
 */
function categorias() {
  return CATEGORIAS_VALIDAS;
}

module.exports = { registrar, listar, buscarPorId, cancelar, categorias };
