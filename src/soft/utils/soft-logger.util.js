/**
 * soft-logger.util.js
 * Logger estruturado para o módulo Rebeca Soft.
 * Garante: mascaramento de dados sensíveis, prefixo padrão, níveis.
 */

const NIVEL = { debug: 0, info: 1, aviso: 2, erro: 3 };
const NIVEL_ATUAL = process.env.SOFT_LOG_NIVEL || 'info';

function _mascarar(texto) {
  if (!texto) return texto;
  return String(texto).slice(0, 4) + '****';
}

function _formatar(nivel, modulo, mensagem, contexto) {
  const ts  = new Date().toISOString();
  const ctx = contexto ? JSON.stringify(_sanitizarContexto(contexto)) : '';
  return `[${ts}][SOFT][${nivel.toUpperCase()}][${modulo}] ${mensagem} ${ctx}`.trim();
}

/**
 * Remove campos sensíveis do contexto antes de logar.
 * Adicionar campos conforme necessário.
 */
function _sanitizarContexto(ctx) {
  const CAMPOS_SENSIVEIS = ['senha', 'password', 'token', 'refreshToken', 'secret', 'cpf', 'cartao'];
  const resultado = { ...ctx };
  for (const campo of CAMPOS_SENSIVEIS) {
    if (resultado[campo] !== undefined) {
      resultado[campo] = _mascarar(String(resultado[campo]));
    }
  }
  return resultado;
}

function _deveLogar(nivel) {
  return (NIVEL[nivel] ?? 0) >= (NIVEL[NIVEL_ATUAL] ?? 1);
}

const softLogger = {
  /**
   * @param {string} modulo - ex: 'Auth', 'Venda', 'Caixa'
   * @param {string} mensagem
   * @param {object} [contexto]
   */
  info(modulo, mensagem, contexto) {
    if (_deveLogar('info')) console.log(_formatar('info', modulo, mensagem, contexto));
  },
  aviso(modulo, mensagem, contexto) {
    if (_deveLogar('aviso')) console.warn(_formatar('aviso', modulo, mensagem, contexto));
  },
  erro(modulo, mensagem, contexto) {
    if (_deveLogar('erro')) console.error(_formatar('erro', modulo, mensagem, contexto));
  },
  debug(modulo, mensagem, contexto) {
    if (_deveLogar('debug')) console.log(_formatar('debug', modulo, mensagem, contexto));
  },

  // Atalhos para operações financeiras — sempre logadas independente do nível
  financeiro(operacao, adminId, valor, extra) {
    console.log(_formatar('info', 'FINANCEIRO',
      `op=${operacao} adminId=${adminId} valor=${valor}`,
      extra
    ));
  },
  seguranca(evento, ip, extra) {
    console.warn(_formatar('aviso', 'SEGURANCA',
      `evento=${evento} ip=${ip}`,
      extra
    ));
  },
};

module.exports = { softLogger };
