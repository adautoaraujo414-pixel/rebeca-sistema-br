const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { AdminAgenda, FotoAgenda, ServicoAgenda, ProfissionalAgenda } = require('../models/AgendaServico');

// Auth middleware
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

// Storage config
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = path.join(__dirname, '../public/uploads/agenda');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const nome = Date.now() + '-' + Math.random().toString(36).slice(2) + ext;
    cb(null, nome);
  }
});

const fileFilter = function(req, file, cb) {
  const tipos = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'];
  if (tipos.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Apenas imagens são permitidas'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ===== UPLOAD FOTO GALERIA =====
router.post('/fotos', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = '/uploads/agenda/' + req.file.filename;
    const { tipo, legenda, ordem } = req.body;
    const foto = await FotoAgenda.create({
      adminId: req.adminAgendaId,
      url, tipo: tipo || 'resultado',
      legenda: legenda || '',
      ordem: parseInt(ordem) || 0
    });
    res.json({ sucesso: true, foto, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== UPLOAD FOTO SERVIÇO =====
router.post('/servico/:id/foto', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = '/uploads/agenda/' + req.file.filename;
    const s = await ServicoAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId },
      { foto: url }, { new: true }
    );
    if (!s) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== UPLOAD FOTO PROFISSIONAL =====
router.post('/profissional/:id/foto', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = '/uploads/agenda/' + req.file.filename;
    const p = await ProfissionalAgenda.findOneAndUpdate(
      { _id: req.params.id, adminId: req.adminAgendaId },
      { foto: url }, { new: true }
    );
    if (!p) return res.status(404).json({ erro: 'Profissional não encontrado' });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== UPLOAD LOGO DO NEGÓCIO =====
router.post('/logo', authAgenda, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });
    const url = '/uploads/agenda/' + req.file.filename;
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, { logo: url });
    res.json({ sucesso: true, url });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== DELETAR FOTO =====
router.delete('/fotos/:id', authAgenda, async (req, res) => {
  try {
    const foto = await FotoAgenda.findOne({ _id: req.params.id, adminId: req.adminAgendaId });
    if (!foto) return res.status(404).json({ erro: 'Foto não encontrada' });
    // Deletar arquivo físico se for local
    if (foto.url && foto.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../public', foto.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await FotoAgenda.findByIdAndDelete(req.params.id);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
