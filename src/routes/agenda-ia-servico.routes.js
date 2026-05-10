const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { AdminAgenda, ServicoAgenda, InstanciaWhatsapp } = require('../models/AgendaServico');
const EvolutionMultiService = require('../services/evolution-multi.service');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// Upload temporário para análise de foto
const uploadTemp = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens'), false);
  }
});

// ===== IA: GERAR DESCRIÇÃO DO SERVIÇO =====
router.post('/gerar-descricao', authAgenda, async (req, res) => {
  try {
    const { nome, categoria, duracao, preco } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });

    const negocio = req.adminAgenda.nomeNegocio || 'salão';
    const seg = req.adminAgenda.segmento || 'beleza';

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Você é especialista em marketing para ${seg}.
Crie uma descrição atrativa e profissional para o serviço abaixo.
Máximo 2 frases curtas. Sem usar aspas. Linguagem feminina e calorosa.

Serviço: ${nome}
${categoria ? 'Categoria: ' + categoria : ''}
${duracao ? 'Duração: ' + duracao + ' minutos' : ''}
${preco ? 'Preço: R$ ' + preco : ''}
Negócio: ${negocio}

Responda APENAS com a descrição, sem explicações.`
      }]
    });

    res.json({ sucesso: true, descricao: response.content[0].text.trim() });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== IA: ANALISAR FOTO E MELHORAR SERVIÇO =====
router.post('/analisar-foto-servico', authAgenda, uploadTemp.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Foto obrigatória' });

    const { nome, categoria } = req.body;
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;
    const seg = req.adminAgenda.segmento || 'beleza';

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `Você é especialista em marketing para ${seg}.
Analise esta foto de um serviço/resultado e retorne um JSON com:
- "descricao": descrição atrativa em 2 frases (máximo 120 chars)
- "nome_sugerido": nome comercial atrativo se puder melhorar "${nome || 'o serviço'}"
- "categoria": categoria sugerida (ex: Cabelo, Barba, Unhas, Pele, etc)
- "tags": array com 3 palavras-chave

Responda APENAS com o JSON válido, sem explicações.`
          }
        ]
      }]
    });

    const texto = response.content[0].text.trim();
    try {
      const clean = texto.replace(/```json|```/g, '').trim();
      const json = JSON.parse(clean);
      res.json({ sucesso: true, ...json });
    } catch(e) {
      res.json({ sucesso: true, descricao: texto.substring(0, 200) });
    }
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== WHATSAPP: CRIAR/BUSCAR INSTÂNCIA =====
router.post('/whatsapp/conectar', authAgenda, async (req, res) => {
  try {
    const admin = req.adminAgenda;

    // Verificar plano (só plano IA tem WhatsApp)
    if (admin.plano !== 'espaco_digital_ia' && admin.plano !== 'trial_ia') {
      return res.status(403).json({ erro: 'Recurso disponível apenas no plano com IA WhatsApp', upgrade: true });
    }

    // Buscar instância existente
    let inst = null;
    if (admin.instanciaWhatsappId) {
      inst = await InstanciaWhatsapp.findById(admin.instanciaWhatsappId).lean();
    }
    if (!inst) {
      inst = await InstanciaWhatsapp.findOne({ adminId: req.adminAgendaId }).lean();
    }

    if (inst) {
      // Verificar status atual
      const status = await EvolutionMultiService.verificarStatus(inst._id);
      return res.json({ sucesso: true, instancia: inst, status: status?.status || inst.status, existente: true });
    }

    // Criar nova instância
    const nomeInst = 'agenda_' + req.adminAgendaId.slice(-8);
    const resultado = await EvolutionMultiService.criarInstancia(req.adminAgendaId, admin.nomeNegocio || 'Agenda', nomeInst);
    if (!resultado.sucesso) return res.status(500).json({ erro: resultado.erro || 'Erro ao criar instância' });

    // Salvar instanciaWhatsappId no admin
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, { instanciaWhatsappId: resultado._id });

    res.json({ sucesso: true, instancia: resultado.instancia || resultado, status: 'desconectado', existente: false });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== WHATSAPP: GERAR QR CODE =====
router.get('/whatsapp/qrcode', authAgenda, async (req, res) => {
  try {
    const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminAgendaId });
    if (!inst) return res.status(404).json({ erro: 'Instância não encontrada. Conecte primeiro.' });
    const resultado = await EvolutionMultiService.gerarQRCode(inst._id);
    res.json(resultado);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== WHATSAPP: STATUS =====
router.get('/whatsapp/status', authAgenda, async (req, res) => {
  try {
    const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminAgendaId });
    if (!inst) return res.json({ conectado: false, status: 'sem_instancia' });
    const resultado = await EvolutionMultiService.verificarStatus(inst._id);
    const conectado = ['conectado','open','connected'].includes(resultado?.status || inst.status);
    res.json({ sucesso: true, conectado, status: resultado?.status || inst.status, telefone: inst.telefoneConectado || null });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== WHATSAPP: DESCONECTAR =====
router.post('/whatsapp/desconectar', authAgenda, async (req, res) => {
  try {
    const inst = await InstanciaWhatsapp.findOne({ adminId: req.adminAgendaId });
    if (!inst) return res.status(404).json({ erro: 'Instância não encontrada' });
    await EvolutionMultiService.desconectar(inst._id);
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ===== ANTI-BLOQUEIO: Ping periódico =====
router.post('/whatsapp/anti-bloqueio', authAgenda, async (req, res) => {
  try {
    const { ativo } = req.body;
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, { 'config.antiBloqueioAtivo': ativo });
    res.json({ sucesso: true, ativo });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
