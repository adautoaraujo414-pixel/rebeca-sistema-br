/**
 * soft-response.util.js
 * Padrão único de resposta HTTP para o módulo Rebeca Soft.
 * Todos os controllers usam estas funções — nunca res.json() direto.
 */

const { softErro } = require('./soft-errors.util');

/**
 * Resposta de sucesso
 * @param {object} res - Express response
 * @param {*} dados - Payload principal
 * @param {object} [meta] - Paginação ou metadados extras
 * @param {number} [httpStatus=200]
 */
function softOk(res, dados, meta, httpStatus = 200) {
  const body = { sucesso: true, dados };
  if (meta) body.meta = meta;
  return res.status(httpStatus).json(body);
}

/**
 * Resposta de criação bem-sucedida
 */
function softCriado(res, dados) {
  return softOk(res, dados, undefined, 201);
}

/**
 * Resposta de erro padronizada
 * @param {object} res - Express response
 * @param {string} codigoErro - Chave do catálogo SOFT_ERRORS
 * @param {string} [detalhe] - Contexto adicional
 * @param {string} [requestId] - ID de rastreabilidade
 */
function softErroRes(res, codigoErro, detalhe, requestId) {
  const erro = softErro(codigoErro, detalhe);
  const body = {
    sucesso:   false,
    erro:      erro.message,
    codigo:    erro.code,
    timestamp: new Date().toISOString(),
  };
  if (requestId) body.requestId = requestId;
  return res.status(erro.http).json(body);
}

/**
 * Resposta de erro inesperado (500) — nunca vaza detalhes técnicos
 * @param {object} res
 * @param {Error} err - Erro interno para log (não enviado ao cliente)
 * @param {string} [requestId]
 */
function softErroInterno(res, err, requestId) {
  // Log interno com contexto completo — nunca no response
  console.error('[SOFT][ERRO_INTERNO]', {
    message: err?.message,
    stack:   err?.stack?.split('\n').slice(0, 4).join(' | '),
    requestId,
  });
  return softErroRes(res, 'SIS_001', undefined, requestId);
}

module.exports = { softOk, softCriado, softErroRes, softErroInterno };
