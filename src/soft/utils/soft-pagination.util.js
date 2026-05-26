/**
 * soft-pagination.util.js
 * Helper de paginação padronizado para o módulo Rebeca Soft.
 * Todos os controllers de listagem usam estas funções.
 */

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 100;

/**
 * Extrai e valida parâmetros de paginação do query string.
 * @param {object} query - req.query
 * @returns {{ pagina: number, limite: number, skip: number }}
 */
function softPaginar(query = {}) {
  let pagina = parseInt(query.pagina, 10);
  let limite = parseInt(query.limite, 10);

  if (!pagina || pagina < 1)   pagina = 1;
  if (!limite || limite < 1)   limite = LIMITE_PADRAO;
  if (limite > LIMITE_MAXIMO)  limite = LIMITE_MAXIMO;  // proteção anti-abuse

  const skip = (pagina - 1) * limite;
  return { pagina, limite, skip };
}

/**
 * Monta o objeto meta de paginação para incluir no response.
 * @param {number} total - Total de documentos (resultado do .countDocuments())
 * @param {number} pagina
 * @param {number} limite
 * @returns {{ total, pagina, limite, totalPaginas }}
 */
function softMetaPaginacao(total, pagina, limite) {
  return {
    total,
    pagina,
    limite,
    totalPaginas: Math.ceil(total / limite) || 1,
  };
}

/**
 * Extrai filtros de data do query string.
 * @param {object} query - req.query (espera: mes, ano, de, ate)
 * @returns {{ inicio: Date, fim: Date, mes: number, ano: number }}
 */
function softFiltroPeriodo(query = {}) {
  const hoje = new Date();
  const mes  = parseInt(query.mes, 10)  || hoje.getMonth() + 1;
  const ano  = parseInt(query.ano, 10)  || hoje.getFullYear();

  // Se datas explícitas foram passadas, usá-las
  if (query.de && query.ate) {
    const inicio = new Date(query.de + 'T00:00:00.000Z');
    const fim    = new Date(query.ate + 'T23:59:59.999Z');
    if (!isNaN(inicio) && !isNaN(fim) && inicio <= fim) {
      return { inicio, fim, mes, ano };
    }
  }

  // Fallback: mês/ano
  const inicio = new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0));
  const fim    = new Date(Date.UTC(ano, mes, 0, 26, 59, 59, 999));
  return { inicio, fim, mes, ano };
}

module.exports = { softPaginar, softMetaPaginacao, softFiltroPeriodo };
