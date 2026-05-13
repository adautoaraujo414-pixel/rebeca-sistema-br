// agenda-whatsapp.routes.js
// Rotas WhatsApp SOMENTE para Rebeca Agenda — nao afeta Corrida nem Delivery
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { InstanciaWhatsapp } = require('../models');
const { AdminAgenda } = require('../models/AgendaServico');
const { getAgendaPlanFeatures } = require('../utils/agenda-plan-features');

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'rebeca-agenda-secret';

async function authAgendaWpp(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ erro: 'Token obrigatorio' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await AdminAgenda.findById(decoded.id || decoded._id).lean();
    if (!admin) return res.status(401).json({ erro: 'Admin nao encontrado' });
    req.adminAgendaId = String(admin._id);
    req.adminAgenda = admin;
    next();
  } catch(e) {
    return res.status(401).json({ erro: 'Token invalido' });
  }
}

// ── HELPER: verificar API key ────────────────────────────────────────────────
function getEvolutionKey() {
  const key = process.env.EVOLUTION_API_KEY;
  if (!key || key === 'minha-chave-super-secreta-123') return null;
  return key;
}

function getEvolutionUrl() {
  return process.env.EVOLUTION_API_URL || 'https://evolution-api-production-794f.up.railway.app';
}

// ── HELPER: buscar instancia da Agenda ──────────────────────────────────────
async function _buscarInstanciaAgenda(adminId) {
  return InstanciaWhatsapp.findOne({ adminId, adminTipo: 'agenda' }).lean();
}

// ── GET /status ──────────────────────────────────────────────────────────────
router.get('/status', authAgendaWpp, async (req, res) => {
  try {
    const features = getAgendaPlanFeatures(req.adminAgenda.plano);
    if (!features.canUseWhatsappAutomation) {
      return res.json({
        sucesso: true, conectado: false,
        status: 'plano_insuficiente',
        mensagem: 'Atendimento automatico pelo WhatsApp esta disponivel no plano R$147.',
        plano: req.adminAgenda.plano
      });
    }

    const inst = await _buscarInstanciaAgenda(req.adminAgendaId);
    if (!inst) {
      return res.json({ sucesso: true, conectado: false, status: 'sem_instancia', instancia: null });
    }

    // Consultar status real na Evolution se API key configurada
    const apiKey = getEvolutionKey();
    if (apiKey && inst.nomeInstancia) {
      try {
        const r = await axios.get(
          getEvolutionUrl() + '/instance/connectionState/' + inst.nomeInstancia,
          { headers: { 'apikey': apiKey }, timeout: 5000 }
        );
        const state = r.data?.instance?.state || r.data?.state;
        const conectado = state === 'open';
        if (conectado !== (inst.status === 'conectado')) {
          await InstanciaWhatsapp.findByIdAndUpdate(inst._id, {
            status: conectado ? 'conectado' : 'desconectado'
          });
        }
        return res.json({
          sucesso: true, conectado,
          status: state || inst.status,
          telefone: inst.telefoneConectado || null,
          instanciaId: inst._id,
          nomeInstancia: inst.nomeInstancia
        });
      } catch(e) {
        console.warn('[AgendaWPP] Falha ao consultar Evolution:', e.message);
      }
    }

    return res.json({
      sucesso: true,
      conectado: inst.status === 'conectado',
      status: inst.status,
      telefone: inst.telefoneConectado || null,
      instanciaId: inst._id,
      nomeInstancia: inst.nomeInstancia
    });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── POST /instancia — criar instancia da Agenda ──────────────────────────────
router.post('/instancia', authAgendaWpp, async (req, res) => {
  try {
    const features = getAgendaPlanFeatures(req.adminAgenda.plano);
    if (!features.canUseWhatsappAutomation) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Atendimento automatico pelo WhatsApp esta disponivel no plano R$147.'
      });
    }

    const apiKey = getEvolutionKey();
    if (!apiKey) {
      console.warn('[AgendaWPP] EVOLUTION_API_KEY nao configurada');
      return res.status(503).json({
        sucesso: false,
        mensagem: 'Integracao WhatsApp nao configurada no servidor.'
      });
    }

    // Verificar se ja existe
    let inst = await InstanciaWhatsapp.findOne({
      adminId: req.adminAgendaId, adminTipo: 'agenda'
    });

    const nomeInstancia = 'agenda-' + req.adminAgendaId.slice(-8);
    const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com')
      + '/api/evolution/webhook/' + nomeInstancia;

    if (!inst) {
      // Criar na Evolution
      try {
        await axios.post(getEvolutionUrl() + '/instance/create', {
          instanceName: nomeInstancia,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: { url: webhookUrl, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] }
        }, { headers: { 'apikey': apiKey }, timeout: 10000 });
      } catch(evErr) {
        // Se ja existe na Evolution, tudo bem
        if (!evErr.response || evErr.response.status !== 409) {
          console.error('[AgendaWPP] Erro criar instancia Evolution:', evErr.message);
          return res.status(502).json({ sucesso: false, mensagem: 'Erro ao criar instancia no servidor WhatsApp.' });
        }
      }

      inst = await InstanciaWhatsapp.create({
        adminId: req.adminAgendaId,
        adminTipo: 'agenda',
        nomeInstancia,
        apiUrl: getEvolutionUrl(),
        apiKey: null, // nunca salvar key no banco
        status: 'conectando',
        webhookUrl,
        configuracoes: { receberMensagens: true, respostaAutomatica: true }
      });
    }

    res.json({ sucesso: true, instanciaId: inst._id, nomeInstancia: inst.nomeInstancia });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── GET /qrcode ──────────────────────────────────────────────────────────────
router.get('/qrcode', authAgendaWpp, async (req, res) => {
  try {
    const features = getAgendaPlanFeatures(req.adminAgenda.plano);
    if (!features.canUseWhatsappAutomation) {
      return res.status(403).json({ sucesso: false, mensagem: 'Disponivel no plano R$147.' });
    }

    const inst = await _buscarInstanciaAgenda(req.adminAgendaId);
    if (!inst) return res.status(404).json({ sucesso: false, mensagem: 'Instancia nao encontrada. Crie primeiro.' });

    const apiKey = getEvolutionKey();
    if (!apiKey) return res.status(503).json({ sucesso: false, mensagem: 'Integracao WhatsApp nao configurada.' });

    const r = await axios.get(
      getEvolutionUrl() + '/instance/connect/' + inst.nomeInstancia,
      { headers: { 'apikey': apiKey }, timeout: 10000 }
    );

    const qr = r.data?.base64 || r.data?.qrcode?.base64 || r.data?.qr || null;
    const status = r.data?.instance?.state || r.data?.state || 'conectando';

    if (status === 'open') {
      await InstanciaWhatsapp.findByIdAndUpdate(inst._id, { status: 'conectado' });
      return res.json({ sucesso: true, status: 'conectado', qrcode: null });
    }

    res.json({ sucesso: true, status, qrcode: qr ? 'data:image/png;base64,' + qr : null });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── POST /desconectar ─────────────────────────────────────────────────────────
router.post('/desconectar', authAgendaWpp, async (req, res) => {
  try {
    const inst = await _buscarInstanciaAgenda(req.adminAgendaId);
    if (!inst) return res.status(404).json({ sucesso: false, mensagem: 'Instancia nao encontrada.' });

    const apiKey = getEvolutionKey();
    if (apiKey) {
      try {
        await axios.delete(
          getEvolutionUrl() + '/instance/logout/' + inst.nomeInstancia,
          { headers: { 'apikey': apiKey }, timeout: 8000 }
        );
      } catch(e) { console.warn('[AgendaWPP] Logout Evolution:', e.message); }
    }

    await InstanciaWhatsapp.findByIdAndUpdate(inst._id, {
      status: 'desconectado', telefoneConectado: null
    });

    res.json({ sucesso: true });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── GET /logs ─────────────────────────────────────────────────────────────────
router.get('/logs', authAgendaWpp, async (req, res) => {
  try {
    const AgendaIAService = require('../services/agenda-ia.service');
    const logs = AgendaIAService.getLogs(req.adminAgendaId);
    res.json({ sucesso: true, logs });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── GET /conversas ────────────────────────────────────────────────────────────
router.get('/conversas', authAgendaWpp, async (req, res) => {
  try {
    const AgendaIAService = require('../services/agenda-ia.service');
    const conversas = AgendaIAService.getConversas(req.adminAgendaId);
    res.json({ sucesso: true, conversas });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── POST /handoff/reset ───────────────────────────────────────────────────────
router.post('/handoff/reset', authAgendaWpp, async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ erro: 'Telefone obrigatorio' });
    const AgendaIAService = require('../services/agenda-ia.service');
    AgendaIAService.resetHandoff(req.adminAgendaId, telefone);
    res.json({ sucesso: true });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── POST /testar ──────────────────────────────────────────────────────────────
router.post('/testar', authAgendaWpp, async (req, res) => {
  try {
    const features = getAgendaPlanFeatures(req.adminAgenda.plano);
    if (!features.canUseWhatsappAutomation) {
      return res.status(403).json({ sucesso: false, mensagem: 'Disponivel no plano R$147.' });
    }
    const inst = await _buscarInstanciaAgenda(req.adminAgendaId);
    const apiKey = getEvolutionKey();
    res.json({
      sucesso: true,
      instanciaExiste: !!inst,
      evolutionConfigurado: !!apiKey,
      status: inst ? inst.status : 'sem_instancia',
      plano: req.adminAgenda.plano
    });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
