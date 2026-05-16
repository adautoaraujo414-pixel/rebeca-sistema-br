/**
 * _index.routes.js
 * Roteador raiz do módulo Rebeca Soft.
 * Registrado em src/index.js como: app.use('/api/soft', require('./soft/routes/_index.routes'))
 *
 * ADICIONAR NOVAS ROTAS AQUI — nunca em src/index.js diretamente.
 */
const router = require('express').Router();

// Carregar todos os models antes das rotas (garante schemas registrados)
require('../models/_index');

// --- Rotas do módulo Soft ---
router.use('/auth',       require('./soft-auth.routes'));
router.use('/categorias', require('./soft-categorias.routes'));
router.use('/produtos',   require('./soft-produtos.routes'));

// Rota de status/health do módulo (sem auth — útil para monitoramento)
router.get('/status', (req, res) => {
  res.json({
    modulo:  'rebeca-soft',
    status:  'online',
    versao:  '1.0.0',
    ts:      new Date().toISOString(),
  });
});

module.exports = router;
