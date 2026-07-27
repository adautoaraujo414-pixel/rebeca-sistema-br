// ===================================================================
// Rotas para gerenciar cadastro de impressoras (telefone -> adminId).
// Protegido por chave secreta simples (header x-impressora-secret).
// ===================================================================

const express = require('express');
const router = express.Router();
const { cadastrarTelefone, buscarAdminIdPorTelefone } = require('../services/impressora-roteador.service');

function verificarSecret(req, res, next) {
  const secretRecebido = req.headers['x-impressora-secret'];
  const secretEsperado = process.env.IMPRESSORA_CADASTRO_SECRET;

  if (!secretEsperado) {
    console.error('[Impressora-Routes] IMPRESSORA_CADASTRO_SECRET nao configurado no ambiente.');
    return res.status(500).json({ ok: false, erro: 'servidor nao configurado' });
  }

  if (!secretRecebido || secretRecebido !== secretEsperado) {
    return res.status(401).json({ ok: false, erro: 'nao autorizado' });
  }

  next();
}

// POST /api/impressora/cadastrar
// body: { telefone, adminId, nomeCliente }
router.post('/cadastrar', verificarSecret, async (req, res) => {
  try {
    const { telefone, adminId, nomeCliente } = req.body;

    if (!telefone || !adminId) {
      return res.status(400).json({ ok: false, erro: 'telefone e adminId sao obrigatorios' });
    }

    const doc = await cadastrarTelefone({ telefone, adminId, nomeCliente });
    console.log('[Impressora-Routes] Telefone cadastrado:', doc.telefone, '-> adminId:', doc.adminId);

    return res.json({ ok: true, cadastro: doc });
  } catch (erro) {
    console.error('[Impressora-Routes] Erro ao cadastrar:', erro.message);
    return res.status(500).json({ ok: false, erro: erro.message });
  }
});

// GET /api/impressora/verificar/:telefone
router.get('/verificar/:telefone', verificarSecret, async (req, res) => {
  try {
    const adminId = await buscarAdminIdPorTelefone(req.params.telefone);
    return res.json({ ok: true, telefone: req.params.telefone, adminId: adminId || null });
  } catch (erro) {
    console.error('[Impressora-Routes] Erro ao verificar:', erro.message);
    return res.status(500).json({ ok: false, erro: erro.message });
  }
});

module.exports = router;
