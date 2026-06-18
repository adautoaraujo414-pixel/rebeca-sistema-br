const express = require('express');
const router = express.Router();
const multer = require('multer');
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

// ── Cloudinary ou memória ─────────────────────────────
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUD_KEY  = process.env.CLOUDINARY_API_KEY;
const CLOUD_SEC  = process.env.CLOUDINARY_API_SECRET;
const USA_CLOUD  = !!(CLOUD_NAME && CLOUD_KEY && CLOUD_SEC);

let cloudinary;
if (USA_CLOUD) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({ cloud_name: CLOUD_NAME, api_key: CLOUD_KEY, api_secret: CLOUD_SEC });
  console.log('[Upload] Cloudinary configurado:', CLOUD_NAME);
} else {
  console.warn('[Upload] ⚠️  Cloudinary não configurado — usando memória temporária');
}

// Multer: memória (buffer) — funciona com Cloudinary e evita disco
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Apenas imagens permitidas'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ── Upload universal ──────────────────────────────────
async function uploadImagem(buffer, mimetype, pasta = 'agenda') {
  if (USA_CLOUD) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `rebeca/${pasta}`, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
        (err, result) => err ? reject(err) : resolve(result.secure_url)
      );
      const { Readable } = require('stream');
      const r = new Readable(); r.push(buffer); r.push(null); r.pipe(stream);
    });
  } else {
    // Fallback: base64 data URL (temporário, funciona mas não persiste restart)
    const b64 = buffer.toString('base64');
    return `data:${mimetype};base64,${b64}`;
  }
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
    // Deletar no Cloudinary se for URL do Cloudinary
    if (USA_CLOUD && foto.url && foto.url.includes('cloudinary.com')) {
      const publicId = foto.url.split('/').slice(-1)[0].split('.')[0];
      await cloudinary.uploader.destroy(`rebeca/galeria/${publicId}`).catch(() => {});
    }
    await FotoAgenda.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
