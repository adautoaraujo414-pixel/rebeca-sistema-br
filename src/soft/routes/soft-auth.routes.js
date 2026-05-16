/**
 * soft-auth.routes.js
 * Rotas de autenticação do módulo Rebeca Soft.
 * Prefixo registrado em _index.routes.js: /api/soft/auth
 */
const router = require('express').Router();

const authController = require('../controllers/soft-auth.controller');
const { softAutenticar } = require('../middleware/soft-auth.middleware');
const { softLimites }    = require('../middleware/soft-rate-limit.middleware');
const { softRequerCampos } = require('../middleware/soft-validate.middleware');

// POST /api/soft/auth/login
// Pública — rate limit por IP aplicado
router.post('/login',
  softLimites.login,
  softRequerCampos(['email', 'senha']),
  authController.login
);

// POST /api/soft/auth/refresh
// Pública — gera novo accessToken via refreshToken válido
router.post('/refresh',
  softRequerCampos(['refreshToken']),
  authController.refresh
);

// POST /api/soft/auth/logout
// Protegida — invalida refreshToken específico
router.post('/logout',
  softAutenticar,
  authController.logout
);

// GET /api/soft/auth/perfil
// Protegida — retorna dados do admin autenticado
router.get('/perfil',
  softAutenticar,
  authController.perfil
);

module.exports = router;
