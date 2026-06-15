'use strict';
const express = require('express');
const router  = express.Router();
const { ClienteCozinha, ImpressoraCozinha, AdminCozinha, ContadorPedido } = require('../models/cozinha.model');

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
  console.log('[Download] .zip baixado de IP:', req.ip || req.headers['x-forwarded-for']);
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

// Reimpressão manual de job (erro ou já impresso) — master reseta para pendente
router.post('/jobs/:jobId/reimprimir', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  try {
    const { JobImpressao } = require('../models/cozinha.model');
    const job = await JobImpressao.findById(req.params.jobId);
    if (!job) return res.status(404).json({ erro: 'Job não encontrado' });
    const statusAnterior = job.status;
    job.status = 'pendente';
    job.impresso_em = null;
    job.erro = null;
    job.reimpressoes = (job.reimpressoes || 0) + 1;
    job.reimpresso_em = new Date();
    await job.save();
    console.log(`[Cozinha] Job ${job._id} reiniciado para pendente (era: ${statusAnterior}, reimpressão #${job.reimpressoes})`);
    res.json({ sucesso: true, jobId: job._id, statusAnterior, reimpressoes: job.reimpressoes });
  } catch(e) {
    console.error('[Cozinha] Erro ao reimprimir job:', e.message);
    res.status(500).json({ erro: e.message });
  }
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
  // Segurança: adminId OBRIGATÓRIO — impede listagem de todos os restaurantes
  const adminIdFiltro = req.query.adminId || req.headers['x-admin-id'];
  if (!adminIdFiltro)
    return res.status(400).json({ erro: 'adminId obrigatório — use /admins-local/:adminId ou ?adminId=xxx' });
  try {
    const admins = await ImpressoraCozinha.find({ adminId: String(adminIdFiltro), ativo: true })
      .select('adminId ip porta ipImpressora portaImpressora nomeImpressora nome').lean();
    console.log('[Cozinha] admins-local adminId:', adminIdFiltro, '→', admins.length, 'resultado(s)');
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


// Painel master da cozinha — protegido por senha master
router.get('/master', (req, res) => {
  const s = req.query.s || '';
  const SENHA_MASTER = process.env.COZINHA_MASTER_SENHA || '95181919';
  if (!s) {
    // Tela de login master
    return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#FF6B00">
<title>Rebeca Cozinha — Master</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f4f4f4;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1a1a1a;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:32px;width:100%;max-width:340px}
.logo{font-size:1.1rem;font-weight:900;margin-bottom:4px}.logo span{color:#FF6B00}
.sub{font-size:.82rem;color:#666;margin-bottom:24px}
.input{width:100%;padding:12px 14px;background:#222;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#f4f4f4;font-size:1rem;outline:none;margin-bottom:12px;font-family:inherit}
.input:focus{border-color:#FF6B00}
.btn{width:100%;background:#FF6B00;color:#fff;border:none;border-radius:8px;padding:13px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit}
.btn:active{background:#E55A00}
.erro{color:#ff5555;font-size:.82rem;margin-top:8px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Rebeca<span>Cozinha</span></div>
  <div class="sub">Painel Master</div>
  <input type="password" id="s" class="input" placeholder="Senha master" onkeydown="if(event.key==='Enter')entrar()">
  <button class="btn" onclick="entrar()">Entrar</button>
</div>
<script>
function entrar(){
  const s=document.getElementById('s').value;
  if(!s)return;
  window.location.href='/api/cozinha/master?s='+encodeURIComponent(s);
}
</script>
</body></html>`);
  }
  if (s !== SENHA_MASTER) {
    return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rebeca Cozinha — Master</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f4f4f4;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1a1a1a;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:32px;width:100%;max-width:340px}
.logo{font-size:1.1rem;font-weight:900;margin-bottom:4px}.logo span{color:#FF6B00}
.sub{font-size:.82rem;color:#666;margin-bottom:24px}
.input{width:100%;padding:12px 14px;background:#222;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#f4f4f4;font-size:1rem;outline:none;margin-bottom:12px;font-family:inherit}
.input:focus{border-color:#FF6B00}
.btn{width:100%;background:#FF6B00;color:#fff;border:none;border-radius:8px;padding:13px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit}
.btn:active{background:#E55A00}
.erro{color:#ff5555;font-size:.82rem;margin-top:8px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Rebeca<span>Cozinha</span></div>
  <div class="sub">Painel Master</div>
  <input type="password" id="s" class="input" placeholder="Senha master" onkeydown="if(event.key==='Enter')entrar()">
  <button class="btn" onclick="entrar()">Entrar</button>
  <div class="erro">❌ Senha incorreta.</div>
</div>
<script>
function entrar(){
  const s=document.getElementById('s').value;
  if(!s)return;
  window.location.href='/api/cozinha/master?s='+encodeURIComponent(s);
}
</script>
</body></html>`);
  }
  res.sendFile(path.join(__dirname, '../public/cozinha-master.html'));
});


// PWA de configuração local — link único por restaurante (senha 121212)
router.get('/setup/:adminId', async (req, res) => {
  // Senha de acesso ao setup do cliente — diferente do token master
  const senhaSetup = req.query.s || '';
  if (!senhaSetup) {
    // Sem senha: mostrar tela de login simples
    const adminId = req.params.adminId;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#FF6B00">
<title>Rebeca Cozinha — Acesso</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f4f4f4;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1a1a1a;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:32px;width:100%;max-width:340px}
.logo{font-size:1.1rem;font-weight:900;margin-bottom:4px}
.logo span{color:#FF6B00}
.sub{font-size:.82rem;color:#666;margin-bottom:24px}
.input{width:100%;padding:12px 14px;background:#222;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#f4f4f4;font-size:1rem;outline:none;margin-bottom:12px;font-family:inherit}
.input:focus{border-color:#FF6B00}
.btn{width:100%;background:#FF6B00;color:#fff;border:none;border-radius:8px;padding:13px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit}
.btn:active{background:#E55A00}
.erro{color:#ff5555;font-size:.82rem;margin-top:8px;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Rebeca<span>Cozinha</span></div>
  <div class="sub">Configuração do sistema</div>
  <input type="password" id="senha" class="input" placeholder="Senha de acesso" onkeydown="if(event.key==='Enter')entrar()">
  <button class="btn" onclick="entrar()">Entrar</button>
  <div class="erro" id="erro">Senha incorreta.</div>
</div>
<script>
function entrar() {
  const s = document.getElementById('senha').value;
  if (!s) return;
  window.location.href = '/api/cozinha/setup/${adminId}?s=' + encodeURIComponent(s);
}
</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
  // Verificar senha do cliente
  const SENHA_SETUP = process.env.COZINHA_SETUP_SENHA || '121212';
  if (senhaSetup !== SENHA_SETUP) {
    const adminId = req.params.adminId;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#FF6B00">
<title>Rebeca Cozinha — Acesso</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f4f4f4;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1a1a1a;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:32px;width:100%;max-width:340px}
.logo{font-size:1.1rem;font-weight:900;margin-bottom:4px}
.logo span{color:#FF6B00}
.sub{font-size:.82rem;color:#666;margin-bottom:24px}
.input{width:100%;padding:12px 14px;background:#222;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#f4f4f4;font-size:1rem;outline:none;margin-bottom:12px;font-family:inherit}
.input:focus{border-color:#FF6B00}
.btn{width:100%;background:#FF6B00;color:#fff;border:none;border-radius:8px;padding:13px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit}
.btn:active{background:#E55A00}
.erro{color:#ff5555;font-size:.82rem;margin-top:8px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Rebeca<span>Cozinha</span></div>
  <div class="sub">Configuração do sistema</div>
  <input type="password" id="senha" class="input" placeholder="Senha de acesso" onkeydown="if(event.key==='Enter')entrar()">
  <button class="btn" onclick="entrar()">Entrar</button>
  <div class="erro">❌ Senha incorreta. Tente novamente.</div>
</div>
<script>
function entrar() {
  const s = document.getElementById('senha').value;
  if (!s) return;
  window.location.href = '/api/cozinha/setup/${adminId}?s=' + encodeURIComponent(s);
}
</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
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
<link rel="manifest" href="/api/cozinha/setup-manifest/${adminId}">
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
  ${imp && imp.modoLocal ? `
  <div class="linha"><span class="linha-label">IP PC servidor (Windows)</span><span class="linha-val"><code>${imp.ip}:${imp.porta}</code></span></div>
  <div class="linha"><span class="linha-label">IP impressora (rede local)</span><span class="linha-val"><code>${imp.ipImpressora}:${imp.portaImpressora}</code></span></div>
  ` : `
  <div class="linha"><span class="linha-label">IP impressora WiFi</span><span class="linha-val"><code>${imp.ip}:${imp.porta}</code></span></div>
  `}
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
  <strong>🖥️ Modo Servidor Local (Windows)</strong><br>
  Um PC Windows fica ligado na cozinha rodando o servidor Rebeca.<br><br>
  <strong>Fluxo:</strong> WhatsApp → Rebeca → Job no banco → PC da cozinha busca → imprime via ${imp.ipImpressora ? 'rede local ('+imp.ipImpressora+':'+imp.portaImpressora+')' : 'USB'}.<br><br>
  O PC servidor fica em <strong>${imp.ip}:${imp.porta}</strong> na sua rede local.
</div>
<a href="/api/cozinha/download-local" class="btn-baixar">⬇ Baixar Rebeca Cozinha Local (.zip)</a>
<div style="margin-top:10px;background:#1a1a1a;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:14px;font-size:.8rem;color:#666;line-height:1.8">
  <strong style="color:#f4f4f4;display:block;margin-bottom:6px">Passos para instalar:</strong>
  1. Baixe e extraia o .zip no PC da cozinha<br>
  2. Execute <strong style="color:#FF6B00">INICIAR-WINDOWS.bat</strong><br>
  3. O programa inicia sozinho com o Windows<br>
  4. IP do PC na rede: <code style="color:#FF6B00">${imp.ip}:${imp.porta}</code><br>
  5. Impressora configurada: <code style="color:#FF6B00">${imp.ipImpressora || 'USB/local'}:${imp.portaImpressora || 9100}</code>
</div>
` : `
<div class="aviso">
  <strong>📶 Modo WiFi / TCP direto</strong><br>
  A impressora recebe jobs diretamente via TCP.<br><br>
  <strong>Fluxo:</strong> WhatsApp → Rebeca → Job no banco → servidor envia ESC/POS → impressora WiFi imprime.<br><br>
  IP da impressora: <strong>${imp.ip}:${imp.porta}</strong>
</div>
<div style="margin-top:10px;background:#1a1a1a;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:14px;font-size:.8rem;color:#666;line-height:1.8">
  <strong style="color:#f4f4f4;display:block;margin-bottom:6px">Requisitos WiFi:</strong>
  • Impressora com IP fixo na rede<br>
  • Porta <strong style="color:#FF6B00">${imp.porta}</strong> acessível (TCP raw)<br>
  • Nenhum PC intermediário necessário<br>
  • Compatível: Epson, Bematech, Elgin, Daruma com WiFi
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


// Imprimir via TCP direto na impressora WiFi — chamado pelo PWA local
router.post('/imprimir-tcp/:adminId', async (req, res) => {
  const token = req.query.token || req.headers['x-cozinha-token'];
  if (token !== (process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026'))
    return res.status(401).json({ erro: 'Token inválido' });
  const net = require('net');
  try {
    const { ImpressoraCozinha, JobImpressao } = require('../models/cozinha.model');
    const adminId = String(req.params.adminId);
    const imp = await ImpressoraCozinha.findOne({ adminId, ativo: true });
    if (!imp) return res.status(404).json({ erro: 'Impressora não configurada' });
    // Para modo WiFi usa ip:porta da impressora direto
    // Para modo local usa ipImpressora:portaImpressora
    const host = imp.modoLocal ? imp.ipImpressora : imp.ip;
    const porta = imp.modoLocal ? imp.portaImpressora : imp.porta;
    if (!host) return res.status(400).json({ erro: 'IP da impressora não configurado' });

    const jobId = req.body.jobId;
    const textoCustom = req.body.texto;
    let texto = textoCustom;

    // Se veio jobId, busca o texto do banco e marca como impresso
    if (jobId) {
      const job = await JobImpressao.findById(jobId);
      if (!job) return res.status(404).json({ erro: 'Job não encontrado' });
      texto = job.texto;
    }

    if (!texto) return res.status(400).json({ erro: 'Texto vazio' });

    // Montar ESC/POS básico
    const ESC = Buffer.from([0x1B]);
    const INIT  = Buffer.concat([ESC, Buffer.from([0x40])]);           // ESC @ — init
    const BOLD  = Buffer.concat([ESC, Buffer.from([0x45, 0x01])]);    // ESC E 1 — bold on
    const NOBOLD= Buffer.concat([ESC, Buffer.from([0x45, 0x00])]);    // ESC E 0 — bold off
    const CENTER= Buffer.concat([ESC, Buffer.from([0x61, 0x01])]);    // ESC a 1 — center
    const LEFT  = Buffer.concat([ESC, Buffer.from([0x61, 0x00])]);    // ESC a 0 — left
    const CUT   = Buffer.from([0x1D, 0x56, 0x42, 0x00]);             // GS V B 0 — cut
    const LF    = Buffer.from([0x0A]);
    const SEP   = Buffer.from('================================\n');

    const now = new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'});
    const linhas = texto.split('\n');
    const primeiraLinha = linhas[0] || '';
    const resto = linhas.slice(1).join('\n');

    // Extrair número do pedido e conteúdo
    const numPedido = job ? (job.mesa || job.numeroPedido || '') : '';
    const horaBR = new Date().toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit'});
    const dataBR = new Date().toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'});

    const payload = Buffer.concat([
      INIT,
      CENTER,
      SEP,
      BOLD,
      Buffer.from((numPedido ? 'PEDIDO #' + numPedido : primeiraLinha) + '\n'),
      NOBOLD,
      Buffer.from('Hora: ' + horaBR + '   ' + dataBR + '\n'),
      SEP,
      LEFT,
      numPedido && resto ? Buffer.from(resto + '\n') :
        (!numPedido ? Buffer.alloc(0) : Buffer.from(primeiraLinha + '\n')),
      LF, LF, LF,
      CUT
    ]);

    // Conectar via TCP e enviar
    await new Promise((resolve, reject) => {
      const client = new net.Socket();
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Timeout ao conectar na impressora (' + host + ':' + porta + ')'));
      }, 5000);
      client.connect(porta, host, () => {
        client.write(payload, () => {
          clearTimeout(timeout);
          client.end();
          resolve();
        });
      });
      client.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });

    // Marcar job como impresso se veio jobId
    if (jobId) {
      await JobImpressao.findByIdAndUpdate(jobId, { status: 'impresso', impresso_em: new Date() });
    }

    console.log('[TCP-Print] Impresso em', host + ':' + porta, '| bytes:', payload.length);
    res.json({ sucesso: true, mensagem: 'Impresso com sucesso em ' + host + ':' + porta, bytes: payload.length });
  } catch(e) {
    console.error('[TCP-Print] Erro:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
