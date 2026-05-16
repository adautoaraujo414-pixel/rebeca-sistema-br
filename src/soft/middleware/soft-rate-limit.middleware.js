/**
 * soft-rate-limit.middleware.js
 * Rate limiting em memória para o módulo Rebeca Soft.
 * Proteção contra brute force e abuso de IA.
 * Em produção com múltiplas instâncias: migrar para Redis.
 */
const { softErroRes } = require('../utils/soft-response.util');
const { softLogger }  = require('../utils/soft-logger.util');

// Map: chave → { contagem, resetEm }
const _contadores = new Map();

// Limpeza periódica de entradas expiradas (evita leak de memória)
setInterval(() => {
  const agora = Date.now();
  for (const [chave, dado] of _contadores.entries()) {
    if (dado.resetEm <= agora) _contadores.delete(chave);
  }
}, 60_000); // a cada 1 minuto

/**
 * _verificarLimite — função interna de contagem
 * @param {string} chave - identificador único (ip, email, adminId)
 * @param {number} max   - máximo de requests no período
 * @param {number} janela - período em ms
 * @returns {{ permitido: boolean, restante: number, resetEm: number }}
 */
function _verificarLimite(chave, max, janela) {
  const agora = Date.now();
  const dado  = _contadores.get(chave);

  if (!dado || dado.resetEm <= agora) {
    _contadores.set(chave, { contagem: 1, resetEm: agora + janela });
    return { permitido: true, restante: max - 1, resetEm: agora + janela };
  }

  dado.contagem += 1;
  const permitido = dado.contagem <= max;
  return { permitido, restante: Math.max(0, max - dado.contagem), resetEm: dado.resetEm };
}

/**
 * softRateLimit — middleware genérico configurável
 * @param {{ max: number, janela: number, chave?: (req) => string }} opcoes
 */
function softRateLimit({ max, janela, chave }) {
  return (req, res, next) => {
    const id = chave ? chave(req) : (req.ip || 'global');
    const { permitido, restante, resetEm } = _verificarLimite(id, max, janela);

    res.set('X-RateLimit-Limit',     String(max));
    res.set('X-RateLimit-Remaining', String(restante));
    res.set('X-RateLimit-Reset',     String(Math.ceil(resetEm / 1000)));

    if (!permitido) {
      const minutosRestantes = Math.ceil((resetEm - Date.now()) / 60_000);
      softLogger.seguranca('RATE_LIMIT', req.ip, { id, max, janela });
      return softErroRes(res, 'AUTH_006', String(minutosRestantes));
    }
    next();
  };
}

// Limites pré-configurados prontos para uso
const softLimites = {
  /** Login: 10 tentativas por IP por 15 minutos */
  login: softRateLimit({
    max: 10,
    janela: 15 * 60 * 1000,
    chave: req => `login:${req.ip}`,
  }),

  /** Login por email: 10 tentativas por email por 15 minutos (independente de IP) */
  loginEmail: (email) => {
    const { permitido, restante, resetEm } = _verificarLimite(
      `login:email:${email}`, 10, 15 * 60 * 1000
    );
    return { permitido, restante, resetEm };
  },

  /** IA: 10 requests por admin por minuto */
  ia: softRateLimit({
    max: 10,
    janela: 60 * 1000,
    chave: req => `ia:${req.softAdminId || req.ip}`,
  }),

  /** API geral: 300 requests por IP por minuto */
  geral: softRateLimit({
    max: 300,
    janela: 60 * 1000,
    chave: req => `api:${req.ip}`,
  }),
};

module.exports = { softRateLimit, softLimites };
