/**
 * soft-auth.middleware.js
 * Autenticação JWT exclusiva do módulo Rebeca Soft.
 * NÃO importa nem depende do auth.middleware.js do delivery/corrida.
 */
const jwt    = require('jsonwebtoken');
const SoftAdmin = require('../models/soft-admin.model');
const { softErroRes } = require('../utils/soft-response.util');
const { softLogger }  = require('../utils/soft-logger.util');

const JWT_SECRET = process.env.SOFT_JWT_SECRET || process.env.JWT_SECRET;

/**
 * softAutenticar — verifica Bearer token e injeta req.softAdmin + req.softAdminId
 */
async function softAutenticar(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return softErroRes(res, 'AUTH_003');
    }

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      const codigo = e.name === 'TokenExpiredError' ? 'AUTH_002' : 'AUTH_003';
      return softErroRes(res, codigo);
    }

    // Verificar que o admin ainda existe e está ativo
    const admin = await SoftAdmin.findById(payload.adminId).select('-senhaHash -refreshTokens').lean();
    if (!admin) return softErroRes(res, 'AUTH_003');
    if (!admin.ativo) return softErroRes(res, 'AUTH_005');

    // Injetar no request — imutável, não pode ser sobrescrito pelo body
    req.softAdminId = admin._id.toString();
    req.softAdmin   = admin;

    next();
  } catch (err) {
    softLogger.erro('Middleware', 'Erro em softAutenticar', { err: err.message });
    return softErroRes(res, 'SIS_001');
  }
}

/**
 * softVerificarPlano — verifica se o admin tem plano suficiente
 * Uso: router.get('/rota', softAutenticar, softVerificarPlano(['pro','premium']), handler)
 */
function softVerificarPlano(planosPermitidos = []) {
  return (req, res, next) => {
    if (!req.softAdmin) return softErroRes(res, 'AUTH_003');
    if (!planosPermitidos.includes(req.softAdmin.plano)) {
      return softErroRes(res, 'ACE_001');
    }
    next();
  };
}

module.exports = { softAutenticar, softVerificarPlano };
