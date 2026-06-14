'use strict';
const express = require('express');
const router  = express.Router();
const { ClienteCozinha, ImpressoraCozinha, AdminCozinha, ContadorPedido } = require('../models/cozinha.model');
const { imprimirPedido } = require('../services/cozinha-impressora.service');
const { AdminAgenda } = require('../models/AgendaServico');

// ── AUTH simples por token ────────────────────────────────────────
const COZINHA_TOKEN = process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026';
function auth(req, res, next) {
  const token = req.headers['x-cozinha-token'] || req.query.token;
  if (token !== COZINHA_TOKEN) return res.status(401).json({ erro: 'Token inválido' });
  next();
}

// ── CONFIG IMPRESSORA ────────────────────────────────────────────
// ── DOWNLOAD SERVIDOR LOCAL ─────────────────────────────────────────────────
router.get('/download-local', async (req, res) => {
  const path2 = require('path');
  const fs = require('fs');
  const zipPath = path2.resolve(__dirname, '../downloads/rebeca-cozinha-local.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ erro: 'Arquivo não encontrado' });
  }
  res.setHeader('Content-Disposition', 'attachment; filename="rebeca-cozinha-local.zip"');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', fs.statSync(zipPath).size);
  const stream = fs.createReadStream(zipPath);
  stream.pipe(res);
  stream.on('error', (e) => {
    console.error('[Download] Erro:', e.message);
    res.status(500).end();
  });
});

router.get('/impressora/:adminId', auth, async (req, res) => {
  const imp = await ImpressoraCozinha.findOne({ adminId: req.params.adminId });
  res.json({ sucesso: true, impressora: imp || null });
});

router.post('/impressora/:adminId', auth, async (req, res) => {
  const { ip, porta, nome, ipImpressora, portaImpressora, modoLocal } = req.body;
  if (!ip) return res.status(400).json({ erro: 'IP obrigatório' });
  const imp = await ImpressoraCozinha.findOneAndUpdate(
    { adminId: req.params.adminId },
    { ip, porta: porta || 9100, nome: nome || 'Cozinha', ativo: true,
      ipImpressora: ipImpressora || '', portaImpressora: portaImpressora || 9100,
      modoLocal: !!modoLocal },
    { upsert: true, new: true }
  );
  res.json({ sucesso: true, impressora: imp });
});

// ── JOBS DE IMPRESSÃO (polling do servidor local) ───────────────────────────
router.get('/jobs/:adminId', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  try {
    const { JobImpressao } = require('../models/cozinha.model');
    const _adminIdStr = String(req.params.adminId);
    // instancia = 'cozinha' (default) ou 'caixa' — cada PC só pega seus jobs
    const _instancia = req.query.instancia || 'cozinha';
    const jobs = await JobImpressao.find({ adminId: _adminIdStr, status: 'pendente', instancia: _instancia })
      .sort({ criadoEm: 1 }).limit(5).lean();
    console.log('[Cozinha] /jobs', _adminIdStr, 'instancia:', _instancia, '→', jobs.length, 'pendentes');
    res.json({ sucesso: true, jobs });
  } catch(e) { res.json({ sucesso: true, jobs: [] }); }
});

router.post('/jobs/:jobId/confirmar', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  try {
    const { JobImpressao } = require('../models/cozinha.model');
    await JobImpressao.findByIdAndUpdate(req.params.jobId, { status: 'impresso', impresso_em: new Date() });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Testar impressora
router.post('/impressora/:adminId/testar', auth, async (req, res) => {
  const imp = await ImpressoraCozinha.findOne({ adminId: req.params.adminId });
  if (!imp) return res.status(404).json({ erro: 'Impressora não configurada' });
  try {
    const { JobImpressao } = require('../models/cozinha.model');
    await JobImpressao.create({
      adminId: String(req.params.adminId),
      texto: 'TESTE DE IMPRESSAO\nRebeca Cozinha OK\n' + new Date().toLocaleTimeString('pt-BR'),
      mesa: 'TESTE',
      status: 'pendente', instancia: 'cozinha',
      criadoEm: new Date()
    });
    console.log('[Cozinha] Job TESTE criado para adminId:', req.params.adminId);
    res.json({ sucesso: true, mensagem: 'Job criado! O servidor local vai imprimir em instantes.' });
  } catch(e) {
    res.status(500).json({ erro: 'Falha ao criar job: ' + e.message });
  }
});

// ── CLIENTES COZINHA ─────────────────────────────────────────────
router.get('/clientes/:adminId', auth, async (req, res) => {
  const clientes = await ClienteCozinha.find({ adminId: req.params.adminId }).sort({ criadoEm: -1 });
  res.json({ sucesso: true, clientes });
});

router.post('/clientes/:adminId', auth, async (req, res) => {
  const { telefone, nome, mesa } = req.body;
  if (!telefone) return res.status(400).json({ erro: 'Telefone obrigatório' });
  const tel = telefone.replace(/\D/g, '');
  const existe = await ClienteCozinha.findOne({ adminId: req.params.adminId, telefone: tel });
  if (existe) return res.status(409).json({ erro: 'Telefone já cadastrado' });
  const c = await ClienteCozinha.create({ adminId: req.params.adminId, telefone: tel, nome, mesa });

  // Enviar boas-vindas via WhatsApp oficial da Rebeca
  try {
    const MetaWA = require('../services/meta-whatsapp.service');
    const nomeCliente = nome || 'cliente';
    await MetaWA.enviarTexto(tel, `Olá, ${nomeCliente}! 👋 Sou sua assistente Rebeca. 🍽️\n\nA partir de agora, tudo que você me mandar vai direto para a sua cozinha! 🚀`);
  } catch(e) {
    console.error('[Cozinha] Erro ao enviar boas-vindas:', e.message);
  }

  res.json({ sucesso: true, cliente: c });
});

router.delete('/clientes/:adminId/:id', auth, async (req, res) => {
  await ClienteCozinha.findOneAndDelete({ _id: req.params.id, adminId: req.params.adminId });
  res.json({ sucesso: true });
});

// ── LISTAR ADMINS (para o painel saber o adminId) ────────────────
// ── ADMINS — acesso por token do servidor local ──────────────────────────────
router.get('/admins-local', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  try {
    // Se passou adminId específico, retorna só ele — evita confusão entre clientes
    const adminIdFiltro = req.query.adminId || req.headers['x-admin-id'];
    let admins;
    if (adminIdFiltro) {
      admins = await ImpressoraCozinha.find({ adminId: adminIdFiltro, ativo: true })
        .select('adminId ip porta ipImpressora portaImpressora nomeImpressora nome').lean();
      console.log('[Cozinha] admins-local filtrado por adminId:', adminIdFiltro, '→', admins.length, 'resultado(s)');
    } else {
      admins = await ImpressoraCozinha.find({ ativo: true })
        .select('adminId ip porta ipImpressora portaImpressora nomeImpressora nome').lean();
    }
    res.json({ sucesso: true, admins });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Rota específica para servidor local buscar só sua config — sem ambiguidade
router.get('/admins-local/:adminId', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  try {
    const imp = await ImpressoraCozinha.findOne({ adminId: req.params.adminId, ativo: true })
      .select('adminId ip porta ipImpressora portaImpressora nomeImpressora nome').lean();
    if (!imp) return res.status(404).json({ erro: 'Impressora não encontrada para este admin' });
    res.json({ sucesso: true, admins: [imp] });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/admins', auth, async (req, res) => {
  const admins = await AdminCozinha.find({ ativo: true }).select('_id nomeNegocio usuario').lean();
  res.json({ sucesso: true, admins });
});

// Cadastrar novo admin da cozinha
router.post('/admins', auth, async (req, res) => {
  try {
    const { nomeNegocio, usuario, senha } = req.body;
    if (!nomeNegocio || !usuario || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
    const existe = await AdminCozinha.findOne({ usuario });
    if (existe) return res.status(409).json({ erro: 'Usuário já existe' });
    const admin = await AdminCozinha.create({ nomeNegocio, usuario, senha });
    res.json({ sucesso: true, admin: { _id: admin._id, nomeNegocio: admin.nomeNegocio, usuario: admin.usuario } });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// Servir arquivos do painel
const path = require('path');
router.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/cozinha-painel.html'));
});


// Landing page Rebeca Cozinha
router.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/rebeca-cozinha-landing.html'));
});


// Histórico de jobs (todos os status) — para painel master
router.get('/jobs-historico/:adminId', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  try {
    const { JobImpressao } = require('../models/cozinha.model');
    const adminIdStr = String(req.params.adminId);
    const limite = parseInt(req.query.limite) || 50;
    const jobs = await JobImpressao.find({ adminId: adminIdStr })
      .sort({ criadoEm: -1 }).limit(limite).lean();
    res.json({ sucesso: true, jobs, total: jobs.length });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});


// Painel master da cozinha
router.get('/master', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/cozinha-master.html'));
});


// PWA de configuração local — link único por restaurante
router.get('/setup/:adminId', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  try {
    const { ImpressoraCozinha, ClienteCozinha } = require('../models/cozinha.model');
    const adminId = req.params.adminId;
    const imp = await ImpressoraCozinha.findOne({ adminId }).lean();
    const clientes = await ClienteCozinha.find({ adminId, ativo: true }).lean();
    // Retorna HTML inline com os dados do restaurante
    const nomeImp = imp ? (imp.nomeImpressora || imp.nome || 'Impressora') : 'Não configurada';
    const modoImp = imp ? (imp.modoLocal ? 'Servidor Local (Windows)' : 'WiFi / TCP direto') : '-';
    const ipImp   = imp ? imp.ip : '-';
    const portaImp = imp ? imp.porta : '-';
    const ipReal  = imp && imp.modoLocal ? imp.ipImpressora : '-';
    const portaReal = imp && imp.modoLocal ? imp.portaImpressora : '-';
    const ativo   = imp ? imp.ativo : false;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#FF6B00">
<link rel="manifest" href="/api/cozinha/setup-manifest/${adminId}?token=${token}">
<title>Rebeca Cozinha — Configuração</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f4f4f4;font-family:'Inter',system-ui,sans-serif;min-height:100vh;padding:20px}
.topo{display:flex;align-items:center;gap:12px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.07)}
.logo{font-size:1.1rem;font-weight:900;letter-spacing:-.5px}
.logo span{color:#FF6B00}
.status-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-size:.78rem;font-weight:600;margin-left:auto}
.pill-ok{background:rgba(0,200,100,.1);border:1px solid rgba(0,200,100,.2);color:#00c864}
.pill-off{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#666}
.dot{width:7px;height:7px;border-radius:50%}
.dot-ok{background:#00c864;animation:pulse 2s infinite}
.dot-off{background:#444}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.card{background:#1a1a1a;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:20px;margin-bottom:14px}
.card-titulo{font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;color:#FF6B00;font-weight:600;margin-bottom:14px}
.linha{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.linha:last-child{border-bottom:none}
.linha-label{font-size:.8rem;color:#666}
.linha-val{font-size:.85rem;color:#f4f4f4;font-weight:500;text-align:right;max-width:60%}
.linha-val code{font-family:monospace;background:#222;padding:3px 8px;border-radius:6px;font-size:.8rem;color:#FF6B00}
.clientes-lista{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.cli{display:flex;align-items:center;gap:10px;background:#222;border-radius:8px;padding:10px 12px}
.cli-icon{font-size:1rem}
.cli-info{flex:1}
.cli-tel{font-size:.8rem;color:#f4f4f4;font-weight:500}
.cli-nome{font-size:.72rem;color:#666}
.btn-baixar{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#FF6B00;color:#fff;border:none;border-radius:10px;padding:14px;font-size:.95rem;font-weight:700;cursor:pointer;margin-top:8px;text-decoration:none;font-family:inherit}
.btn-baixar:active{background:#E55A00}
.aviso{background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.15);border-radius:10px;padding:14px;font-size:.82rem;color:#aaa;line-height:1.6;margin-bottom:14px}
.aviso strong{color:#FF6B00}
</style>
</head>
<body>
<div class="topo">
  <div class="logo">Rebeca<span>Cozinha</span></div>
  <div class="status-pill ${ativo ? 'pill-ok' : 'pill-off'}">
    <div class="dot ${ativo ? 'dot-ok' : 'dot-off'}"></div>
    ${ativo ? 'Sistema ativo' : 'Inativo'}
  </div>
</div>

<div class="card">
  <div class="card-titulo">🖨️ Impressora configurada</div>
  <div class="linha"><span class="linha-label">Nome</span><span class="linha-val">${nomeImp}</span></div>
  <div class="linha"><span class="linha-label">Modo de conexão</span><span class="linha-val">${modoImp}</span></div>
  <div class="linha"><span class="linha-label">IP / Servidor</span><span class="linha-val"><code>${ipImp}:${portaImp}</code></span></div>
  ${imp && imp.modoLocal ? `<div class="linha"><span class="linha-label">IP impressora</span><span class="linha-val"><code>${ipReal}:${portaReal}</code></span></div>` : ''}
  <div class="linha"><span class="linha-label">Conexão ativa</span><span class="linha-val">${ativo ? '✅ Sim' : '❌ Não'}</span></div>
</div>

<div class="card">
  <div class="card-titulo">👤 Clientes vinculados (${clientes.length})</div>
  ${clientes.length ? `<div class="clientes-lista">${clientes.map(c => `
    <div class="cli">
      <div class="cli-icon">📱</div>
      <div class="cli-info">
        <div class="cli-tel">+${c.telefone}</div>
        <div class="cli-nome">${c.nome || 'Sem nome'}</div>
      </div>
    </div>`).join('')}</div>` : '<p style="color:#555;font-size:.85rem">Nenhum cliente cadastrado.</p>'}
</div>

${imp && imp.modoLocal ? `
<div class="aviso">
  <strong>Modo Servidor Local (Windows)</strong><br>
  Baixe e instale o servidor no PC da cozinha. Ele faz polling automático e imprime via USB ou rede local.
</div>
<a href="/api/cozinha/download-local" class="btn-baixar">⬇ Baixar Rebeca Cozinha Local (.zip)</a>
` : `
<div class="aviso">
  <strong>Modo WiFi / TCP direto</strong><br>
  A impressora recebe jobs diretamente via TCP na porta <strong>${portaImp}</strong>. Certifique-se que o IP <strong>${ipImp}</strong> está acessível externamente.
</div>
`}

<script>
// PWA install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.createElement('button');
  btn.className = 'btn-baixar';
  btn.style.marginTop = '10px';
  btn.style.background = '#222';
  btn.style.border = '1px solid rgba(255,107,0,.3)';
  btn.textContent = '📲 Adicionar à tela inicial';
  btn.onclick = () => { deferredPrompt.prompt(); deferredPrompt = null; btn.remove(); };
  document.body.appendChild(btn);
});
// Auto-refresh status a cada 30s
setInterval(() => location.reload(), 30000);
</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// Manifest PWA para o setup
router.get('/setup-manifest/:adminId', (req, res) => {
  const adminId = req.params.adminId;
  const token = req.query.token || '';
  res.json({
    name: 'Rebeca Cozinha',
    short_name: 'RebecaCoz',
    start_url: `/api/cozinha/setup/${adminId}?token=${token}`,
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#FF6B00',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
  });
});

module.exports = router;
