'use strict';
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../public/uploads/comprovantes');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext  = path.extname(file.originalname).toLowerCase();
        const nome = 'comp_' + Date.now() + '-' + Math.random().toString(36).slice(2) + ext;
        cb(null, nome);
    }
});

const fileFilter = function (req, file, cb) {
    const tipos = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (tipos.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens ou PDF são permitidos'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 8 * 1024 * 1024 } }); // 8MB

// ── POST /api/landing-upload/comprovante ──────────────────────────────
// Recebe a foto/pdf do comprovante de pagamento, sem necessidade de login
router.post('/comprovante', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
        const url = '/uploads/comprovantes/' + req.file.filename;
        res.json({ sucesso: true, url });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
});

module.exports = router;
