const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { AdminAgenda, FotoAgenda, ServicoAgenda, ProfissionalAgenda, ProdutoAgenda, CatalogoAgenda } = require('../models/AgendaServico');

// ── Auth ─────────────────────────────────────────────
async function authAgenda(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ','') || '';
    const admin = await AdminAgenda.findOne({ token, ativo: true });
    if (!admin) return res.status(401).json({ erro: 'Token inválido' });
    req.adminAgenda = admin;
    req.adminAgendaId = admin._id.toString();
    next();
  } catch(e) { res.status(500).json({ erro: e.message }); }
}

// ── Backblaze B2 (S3-compatível) ──────────────────────
const B2_KEY_ID     = process.env.B2_KEY_ID;
const B2_APP_KEY    = process.env.B2_APPLICATION_KEY;
const B2_BUCKET     = process.env.B2_BUCKET_NAME;
const B2_ENDPOINT   = process.env.B2_ENDPOINT; // ex: s3.us-east-005.backblazeb2.com
const USA_B2 = !!(B2_KEY_ID && B2_APP_KEY && B2_BUCKET && B2_ENDPOINT);

let s3;
if (USA_B2) {
  // Região vem embutida no endpoint (ex: us-east-005)
  const regiaoMatch = B2_ENDPOINT.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/);
  const regiao = regiaoMatch ? regiaoMatch[1] : 'us-east-005';
  s3 = new S3Client({
    endpoint: `https://${B2_ENDPOINT}`,
    region: regiao,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
    forcePathStyle: false
  });
  console.log('[Upload] Backblaze B2 configurado:', B2_BUCKET, '@', B2_ENDPOINT);
} else {
  console.warn('[Upload] ⚠️  Backblaze B2 não configurado — usando fallback base64 (não recomendado em produção)');
}

// Multer: memória (buffer) — nunca grava no disco do servidor
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Apenas imagens permitidas'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ── Upload universal ──────────────────────────────────
async function comprimirImagem(buffer, mimetype) {
  try {
    // GIFs nao sao reprocessados (perderiam animacao); demais formatos sao
    // redimensionados e convertidos para JPEG para reduzir uso de memoria/armazenamento.
    if (mimetype === 'image/gif') return { buffer, mimetype };
    const sharp = require('sharp');
    const saida = await sharp(buffer, { failOn: 'none' })
      .rotate() // aplica orientacao EXIF antes de remove-la
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { buffer: saida, mimetype: 'image/jpeg' };
  } catch (e) {
    console.warn('[Upload] Falha ao comprimir imagem, usando original:', e.message);
    return { buffer, mimetype };
  }
}

async function uploadImagem(buffer, mimetype, pasta = 'agenda') {
  const comprimida = await comprimirImagem(buffer, mimetype);
  buffer = comprimida.buffer;
  mimetype = comprimida.mimetype;
  if (USA_B2) {
    const ext = (mimetype.split('/')[1] || 'jpg').replace('jpeg','jpg');
    const nomeArquivo = `rebeca/${pasta}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: nomeArquivo,
      Body: buffer,
      ContentType: mimetype,
      ACL: 'public-read'
    }));
    return `https://${B2_BUCKET}.${B2_ENDPOINT}/${nomeArquivo}`;
  } else {
    const b64 = buffer.toString('base64');
    return `data:${mimetype};base64,${b64}`;
  }
}

function extrairKeyDaUrl(url) {
  // https://bucket.endpoint/rebeca/pasta/arquivo.jpg -> rebeca/pasta/arquivo.jpg
  const idx = url.indexOf('/rebeca/');
  return idx >= 0 ? url.slice(idx + 1) : null;
}

// ── Rotas ─────────────────────────────────────────────

// Galeria
router.post('/fotos', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'galeria');
    const { tipo, legenda, ordem } = req.body;
    const foto = await FotoAgenda.create({
      adminId: req.adminAgendaId, url,
      tipo: tipo || 'resultado', legenda: legenda || '', ordem: parseInt(ordem) || 0
    });
    res.json({ sucesso: true, foto, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Serviço
router.post('/servico/:id/foto', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'servicos');
    const s = await ServicoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId }, { foto: url }, { new: true }
    );
    if (!s) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Profissional
router.post('/profissional/:id/foto', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'profissionais');
    const p = await ProfissionalAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId }, { foto: url }, { new: true }
    );
    if (!p) return res.status(404).json({ erro: 'Profissional não encontrado' });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Logo
router.post('/logo', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'logos');
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, { logo: url });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Produto
router.post('/produto/:id/foto', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'produtos');
    const p = await ProdutoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId }, { fotoPrincipal: url }, { new: true }
    );
    if (!p) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Produto - galeria (multiplas fotos, adiciona uma por chamada)
router.post('/produto/:id/galeria', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'produtos');
    const prodAtual = await ProdutoAgenda.findOne({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!prodAtual) return res.status(404).json({ erro: 'Produto não encontrado' });
    const update = { $push: { fotos: url } };
    if (!prodAtual.fotoPrincipal) update.$set = { fotoPrincipal: url };
    const p = await ProdutoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId }, update, { new: true }
    );
    res.json({ sucesso: true, url, fotos: p.fotos, fotoPrincipal: p.fotoPrincipal });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Produto - remover foto da galeria
router.delete('/produto/:id/galeria', authAgenda, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ erro: 'URL obrigatória' });
    const p = await ProdutoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId }, { $pull: { fotos: url } }, { new: true }
    );
    if (!p) return res.status(404).json({ erro: 'Produto não encontrado' });
    if (p.fotoPrincipal === url) {
      const novaPrincipal = (p.fotos && p.fotos[0]) || '';
      p.fotoPrincipal = novaPrincipal;
      await p.save();
    }
    res.json({ sucesso: true, fotos: p.fotos, fotoPrincipal: p.fotoPrincipal });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Produto - definir foto principal
router.put('/produto/:id/galeria/principal', authAgenda, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ erro: 'URL obrigatória' });
    const p = await ProdutoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId, fotos: url }, { fotoPrincipal: url }, { new: true }
    );
    if (!p) return res.status(404).json({ erro: 'Produto ou foto não encontrado' });
    res.json({ sucesso: true, fotoPrincipal: p.fotoPrincipal });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Catálogo
router.post('/catalogo/:id/foto', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'catalogos');
    const c = await CatalogoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId }, { fotoCapa: url }, { new: true }
    );
    if (!c) return res.status(404).json({ erro: 'Catálogo não encontrado' });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Foto avulsa
router.post('/foto-avulsa', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = await uploadImagem(req.file.buffer, req.file.mimetype, 'avulsas');
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Deletar foto
router.delete('/fotos/:id', authAgenda, async (req, res) => {
  try {
    const foto = await FotoAgenda.findOne({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!foto) return res.status(404).json({ erro: 'Foto não encontrada' });
    if (USA_B2 && foto.url) {
      const key = extrairKeyDaUrl(foto.url);
      if (key) await s3.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: key })).catch(() => {});
    }
    await FotoAgenda.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
