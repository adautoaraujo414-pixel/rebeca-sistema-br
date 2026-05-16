/**
 * soft-validate.middleware.js
 * Validação de body/params/query para rotas do Rebeca Soft.
 * Retorna erros padronizados antes de chegar no controller.
 */
const { softErroRes } = require('../utils/soft-response.util');

/**
 * softRequerCampos — verifica campos obrigatórios no body
 * Uso: router.post('/rota', softRequerCampos(['nome','preco']), handler)
 *
 * @param {string[]} campos - Lista de campos obrigatórios
 * @param {string} [origem='body'] - 'body' | 'query' | 'params'
 */
function softRequerCampos(campos, origem = 'body') {
  return (req, res, next) => {
    const fonte = req[origem] || {};
    const ausentes = campos.filter(c => {
      const val = fonte[c];
      return val === undefined || val === null || val === '';
    });
    if (ausentes.length > 0) {
      return softErroRes(res, 'VAL_001', ausentes.join(', '));
    }
    next();
  };
}

/**
 * softValidarNumero — verifica que campos são números >= 0
 * @param {string[]} campos
 */
function softValidarNumero(campos) {
  return (req, res, next) => {
    for (const campo of campos) {
      const val = parseFloat(req.body[campo]);
      if (isNaN(val) || val < 0) {
        return softErroRes(res, 'VAL_003', campo);
      }
      req.body[campo] = val; // normalizar para número
    }
    next();
  };
}

/**
 * softValidarObjectId — verifica que params são ObjectId válidos
 * @param {string[]} params - Nomes dos params (req.params)
 */
function softValidarObjectId(params) {
  const OBJECTID_RE = /^[a-f\d]{24}$/i;
  return (req, res, next) => {
    for (const param of params) {
      const val = req.params[param];
      if (!val || !OBJECTID_RE.test(val)) {
        return softErroRes(res, 'VAL_004', param);
      }
    }
    next();
  };
}

/**
 * softSanitizarString — trim e limite de tamanho em campos string do body
 * @param {{ campo: string, max?: number }[]} regras
 */
function softSanitizarString(regras) {
  return (req, res, next) => {
    for (const { campo, max = 500 } of regras) {
      if (req.body[campo] !== undefined) {
        req.body[campo] = String(req.body[campo]).trim().slice(0, max);
      }
    }
    next();
  };
}

module.exports = {
  softRequerCampos,
  softValidarNumero,
  softValidarObjectId,
  softSanitizarString,
};
