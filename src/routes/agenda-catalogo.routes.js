'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { AdminAgenda, ServicoAgenda } = require('../models/AgendaServico');
const {
  ProdutoAgenda, CatalogoAgenda, CarrinhoAgenda,
  ConhecimentoAgenda, LeadProdutoAgenda
} = require('../models/AgendaServico');

// ── Auth middleware (exclusivo agenda) ────────────────────────────
const authAgenda = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ erro: 'Token obrigatório' });
    const admin = await AdminAgenda.findOne({ token }).lean();
    if (!admin) return res.status(401).json({ erro: 'Token inválido' });
    req.adminAgendaId = String(admin._id);
    req.admin = admin;
    next();
  } catch(e) { res.status(500).json({ erro: e.message }); }
};

// ══════════════════════════════════════════════════════════════════
// PRODUTOS — CRUD (admin autenticado)
// ══════════════════════════════════════════════════════════════════

router.get('/produtos', authAgenda, async (req, res) => {
  try {
    const { categoria, ativo, busca } = req.query;
    const filtro = { adminId: req.adminAgendaId };
    if (ativo !== undefined) filtro.ativo = ativo === 'true';
    if (categoria) filtro.categoria = categoria;
    if (busca) filtro.$or = [
      { nome: { $regex: busca, $options: 'i' } },
      { tags: { $regex: busca, $options: 'i' } },
      { palavrasChave: { $regex: busca, $options: 'i' } },
      { descricao: { $regex: busca, $options: 'i' } }
    ];
    const produtos = await ProdutoAgenda.find(filtro).sort({ ordem: 1, nome: 1 }).lean();
    res.json({ sucesso: true, produtos });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/produtos', authAgenda, async (req, res) => {
  try {
    const p = await ProdutoAgenda.create({ ...req.body, adminId: req.adminAgendaId });
    res.json({ sucesso: true, produto: p });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/produtos/:id', authAgenda, async (req, res) => {
  try {
    const p = await ProdutoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId },
      req.body, { new: true }
    );
    if (!p) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json({ sucesso: true, produto: p });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/produtos/:id', authAgenda, async (req, res) => {
  try {
    const _del = await ProdutoAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!_del) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// CATÁLOGOS — CRUD (admin autenticado)
// ══════════════════════════════════════════════════════════════════

router.get('/catalogos', authAgenda, async (req, res) => {
  try {
    const cats = await CatalogoAgenda.find({ adminId: req.adminAgendaId }).sort({ ordem: 1 }).lean();
    res.json({ sucesso: true, catalogos: cats });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/catalogos', authAgenda, async (req, res) => {
  try {
    const c = await CatalogoAgenda.create({ ...req.body, adminId: req.adminAgendaId });
    res.json({ sucesso: true, catalogo: c });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/catalogos/:id', authAgenda, async (req, res) => {
  try {
    const c = await CatalogoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId },
      req.body, { new: true }
    );
    if (!c) return res.status(404).json({ erro: 'Catálogo não encontrado' });
    res.json({ sucesso: true, catalogo: c });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/catalogos/:id', authAgenda, async (req, res) => {
  try {
    const _del = await CatalogoAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!_del) return res.status(404).json({ erro: 'Catálogo não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// CONHECIMENTO — CRUD (admin autenticado)
// ══════════════════════════════════════════════════════════════════

router.get('/conhecimento', authAgenda, async (req, res) => {
  try {
    const itens = await ConhecimentoAgenda.find({ adminId: req.adminAgendaId }).sort({ tipo: 1, ordem: 1 }).lean();
    res.json({ sucesso: true, conhecimento: itens });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/conhecimento', authAgenda, async (req, res) => {
  try {
    const k = await ConhecimentoAgenda.create({ ...req.body, adminId: req.adminAgendaId });
    res.json({ sucesso: true, item: k });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/conhecimento/:id', authAgenda, async (req, res) => {
  try {
    const k = await ConhecimentoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId },
      req.body, { new: true }
    );
    if (!k) return res.status(404).json({ erro: 'Item não encontrado' });
    res.json({ sucesso: true, item: k });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/conhecimento/:id', authAgenda, async (req, res) => {
  try {
    const _del = await ConhecimentoAgenda.findOneAndDelete({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!_del) return res.status(404).json({ erro: 'Item de conhecimento não encontrado' });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// LEADS — listagem (admin autenticado)
// ══════════════════════════════════════════════════════════════════

router.get('/leads', authAgenda, async (req, res) => {
  try {
    const leads = await LeadProdutoAgenda.find({ adminId: req.adminAgendaId })
      .sort({ data: -1 }).limit(100).lean();
    res.json({ sucesso: true, leads });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// VITRINE PÚBLICA — espaco/:adminId
// ══════════════════════════════════════════════════════════════════

router.get('/espaco/:adminId/vitrine', async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await AdminAgenda.findById(adminId).lean();
    if (!admin) return res.status(404).json({ erro: 'Espaço não encontrado' });

    const [servicos, todos, catalogos] = await Promise.all([
      ServicoAgenda.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean(),
      ProdutoAgenda.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean(),
      CatalogoAgenda.find({ adminId, ativo: true }).sort({ ordem: 1 }).lean()
    ]);

    // Separar em seções
    const promocoes   = todos.filter(p => p.precoPromocional && p.precoPromocional < p.preco);
    const destaques   = todos.filter(p => p.destaque);
    const combos      = todos.filter(p => p.combo);
    const maisPedidos = [...todos].sort((a,b) => (b.totalVendas||0) - (a.totalVendas||0)).filter(p => (p.totalVendas||0) > 0).slice(0, 8);

    res.json({
      sucesso: true,
      nomeNegocio: admin.nomeNegocio,
      servicos,
      produtos: todos,
      catalogos,
      secoes: { promocoes, destaques, combos, maisPedidos }
    });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Busca unificada pública
router.get('/espaco/:adminId/buscar', async (req, res) => {
  try {
    const { adminId } = req.params;
    const { q } = req.query;
    if (!q) return res.json({ sucesso: true, produtos: [], servicos: [], conhecimento: [] });

    const regex = { $regex: q, $options: 'i' };
    const [produtos, servicos, conhecimento] = await Promise.all([
      ProdutoAgenda.find({
        adminId, ativo: true,
        $or: [{ nome: regex }, { tags: regex }, { palavrasChave: regex }, { descricao: regex }, { categoria: regex }]
      }).limit(10).lean(),
      ServicoAgenda.find({ adminId, ativo: true, $or: [{ nome: regex }, { descricao: regex }] }).limit(5).lean(),
      ConhecimentoAgenda.find({ adminId, ativo: true, $or: [{ pergunta: regex }, { resposta: regex }, { tags: regex }] }).limit(5).lean()
    ]);

    res.json({ sucesso: true, produtos, servicos, conhecimento });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// CARRINHO PÚBLICO
// ══════════════════════════════════════════════════════════════════

router.get('/espaco/:adminId/carrinho/:sessionId', async (req, res) => {
  try {
    const { adminId, sessionId } = req.params;
    const carrinho = await CarrinhoAgenda.findOne({ adminId, sessionId, status: 'ativo' }).lean();
    res.json({ sucesso: true, carrinho: carrinho || { itens: [], total: 0 } });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/espaco/:adminId/carrinho', async (req, res) => {
  try {
    const { adminId } = req.params;
    const { sessionId, produtoId, quantidade = 1, variacaoSelecionada = '', clienteTelefone = '', clienteNome = '' } = req.body;

    const produto = await ProdutoAgenda.findOne({ _id: produtoId, adminId, ativo: true }).lean();
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    // Verificar estoque
    if (produto.estoque !== null && produto.estoque === 0) {
      return res.status(400).json({ erro: 'Produto sem estoque', indisponivel: true });
    }

    const preco = produto.precoPromocional || produto.preco;
    const subtotal = preco * quantidade;

    let carrinho = await CarrinhoAgenda.findOne({ adminId, sessionId, status: 'ativo' });
    if (!carrinho) {
      carrinho = await CarrinhoAgenda.create({ adminId, sessionId, clienteTelefone, clienteNome, itens: [], total: 0 });
    }

    const idx = carrinho.itens.findIndex(i => String(i.produtoId) === String(produtoId) && i.variacaoSelecionada === variacaoSelecionada);
    if (idx >= 0) {
      carrinho.itens[idx].quantidade += quantidade;
      carrinho.itens[idx].subtotal = carrinho.itens[idx].preco * carrinho.itens[idx].quantidade;
    } else {
      carrinho.itens.push({ produtoId, nome: produto.nome, foto: produto.fotoPrincipal, preco, quantidade, variacaoSelecionada, subtotal });
    }

    carrinho.total = carrinho.itens.reduce((s, i) => s + i.subtotal, 0);
    carrinho.atualizadoEm = new Date();
    await carrinho.save();

    // Registrar lead
    await LeadProdutoAgenda.create({ adminId, telefone: clienteTelefone, produtoId, produtoNome: produto.nome, origem: 'vitrine', acao: 'adicionou_carrinho' });

    res.json({ sucesso: true, carrinho });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/espaco/:adminId/carrinho/:sessionId/item/:itemId', async (req, res) => {
  try {
    const { adminId, sessionId, itemId } = req.params;
    const carrinho = await CarrinhoAgenda.findOne({ adminId, sessionId, status: 'ativo' });
    if (!carrinho) return res.status(404).json({ erro: 'Carrinho não encontrado' });
    carrinho.itens = carrinho.itens.filter(i => String(i._id) !== itemId);
    carrinho.total = carrinho.itens.reduce((s, i) => s + i.subtotal, 0);
    carrinho.atualizadoEm = new Date();
    await carrinho.save();
    res.json({ sucesso: true, carrinho });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Finalizar carrinho — envia resumo para WhatsApp do admin
router.post('/espaco/:adminId/carrinho/:sessionId/finalizar', async (req, res) => {
  try {
    const { adminId, sessionId } = req.params;
    const carrinho = await CarrinhoAgenda.findOne({ adminId, sessionId, status: 'ativo' });
    if (!carrinho || !carrinho.itens.length) return res.status(400).json({ erro: 'Carrinho vazio' });

    carrinho.status = 'finalizado';
    carrinho.atualizadoEm = new Date();
    await carrinho.save();

    // Registrar leads de finalização
    for (const item of carrinho.itens) {
      await LeadProdutoAgenda.create({ adminId, telefone: carrinho.clienteTelefone, produtoId: item.produtoId, produtoNome: item.nome, origem: 'vitrine', acao: 'finalizou_compra' });
    }

    const linhas = carrinho.itens.map(i => `- ${i.nome} x${i.quantidade} = R$ ${i.subtotal.toFixed(2)}`).join('\n');
    const resumo = `🛒 *Novo pedido da vitrine!*\n\nCliente: ${carrinho.clienteNome || 'Não informado'}\nTelefone: ${carrinho.clienteTelefone || 'Não informado'}\n\n${linhas}\n\n*Total: R$ ${carrinho.total.toFixed(2)}*`;

    res.json({ sucesso: true, resumo, carrinho });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
