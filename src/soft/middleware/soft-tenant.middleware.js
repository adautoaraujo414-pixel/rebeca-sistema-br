/**
 * soft-tenant.middleware.js
 * Guarda de isolamento multi-tenant.
 * Garante que nenhum admin acessa dados de outro admin.
 * Deve ser usado APÓS softAutenticar.
 */
const { softErroRes } = require('../utils/soft-response.util');
const { softLogger }  = require('../utils/soft-logger.util');

/**
 * tenantGuard — bloqueia requests onde adminId do body != adminId do token
 * Proteção dupla: middleware + verificação adicional no service.
 */
function tenantGuard(req, res, next) {
  // req.softAdminId foi injetado pelo softAutenticar — nunca do body
  if (!req.softAdminId) {
    softLogger.seguranca('TENANT_SEM_AUTH', req.ip, { path: req.path });
    return softErroRes(res, 'AUTH_003');
  }

  // Se o body tiver adminId explícito, deve bater com o do token
  if (req.body && req.body.adminId) {
    if (req.body.adminId.toString() !== req.softAdminId) {
      softLogger.seguranca('TENANT_MISMATCH', req.ip, {
        tokenAdminId: req.softAdminId,
        bodyAdminId:  req.body.adminId,
        path:         req.path,
      });
      return softErroRes(res, 'ACE_001');
    }
  }

  next();
}

/**
 * softInjetarAdminId — sobrescreve req.body.adminId com o do token (seguro)
 * Usar quando o controller precisa do adminId no body para criação de documentos.
 */
function softInjetarAdminId(req, res, next) {
  if (req.softAdminId) {
    req.body = req.body || {};
    req.body.adminId = req.softAdminId; // força o adminId do token
  }
  next();
}

module.exports = { tenantGuard, softInjetarAdminId };
