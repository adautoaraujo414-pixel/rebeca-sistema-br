// agenda-whatsapp.routes.js
// Rotas WhatsApp SOMENTE para Rebeca Agenda — nao afeta Corrida nem Delivery
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { InstanciaWhatsapp } = require('../models');
const { AdminAgenda } = require('../models/AgendaServico');
const { getAgendaPlanFeatures } = require('../utils/agenda-plan-features');

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
// Mesmo padrao de authAgenda em agenda.routes.js:
// token de sessao hex salvo no campo AdminAgenda.token (nao JWT)
async function authAgendaWpp(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ erro: 'Token obrigatorio' });
    const admin = await AdminAgenda.findOne({ token, ativo: true });
    if (!admin) return res.status(401).json({ erro: 'Token invalido' });
    req.adminAgendaId = String(admin._id);
    req.adminAgenda = admin;
    next();
  } catch(e) {
    return res.status(500).json({ erro: e.message });
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
    const raw = AgendaIAService.getConversas(req.adminAgendaId);
    const conversas = raw.map(c => ({
      telefone: c.telefone,
      etapa: c.etapa,
      handoff: !!c.humanHandoff,
      humanHandoff: !!c.humanHandoff,
      handoffAt: c.handoffAt || null,
      ultimaMensagem: c.ultimaMensagem || '',
      dados: c.dados || {},
      tentativas: c.tentativas || 0,
      ultimaMsg: c.ultimaMsg || null,
    }));
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


// ── MODO DONO: gerenciar telefones autorizados ───────────────────────────────
const ModoDono = require('../services/agenda-modo-dono.service');

// GET /modo-dono — ver config atual
router.get('/modo-dono', authAgendaWpp, async (req, res) => {
  const admin = req.adminAgenda;
  res.json({
    sucesso: true,
    modoAtivo: admin.modoWhatsappDono?.ativo || false,
    telefonesAutorizados: admin.modoWhatsappDono?.telefonesAutorizados || [],
    boasVindasEnviado: admin.modoWhatsappDono?.boasVindasEnviado || false,
    telefonePrincipal: admin.telefone || '',
    whatsappPrincipal: admin.whatsapp || '',
    dica: 'A Rebeca responde pelo WhatsApp conectado. Para comandar a Rebeca, envie mensagens para esse numero usando um telefone autorizado.'
  });
});

// POST /modo-dono/telefones — adicionar telefone autorizado
router.post('/modo-dono/telefones', authAgendaWpp, async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ erro: 'Telefone obrigatorio' });
    const tel = telefone.replace(/\D/g,'');
    const { AdminAgenda } = require('../models/AgendaServico');
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, {
      $addToSet: { 'modoWhatsappDono.telefonesAutorizados': tel },
      'modoWhatsappDono.ativo': true
    });
    res.json({ sucesso: true, mensagem: 'Telefone autorizado adicionado' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// DELETE /modo-dono/telefones/:tel — remover telefone
router.delete('/modo-dono/telefones/:tel', authAgendaWpp, async (req, res) => {
  try {
    const { AdminAgenda } = require('../models/AgendaServico');
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, {
      $pull: { 'modoWhatsappDono.telefonesAutorizados': req.params.tel }
    });
    res.json({ sucesso: true });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// POST /modo-dono/boas-vindas — disparar boas-vindas manualmente
router.post('/modo-dono/boas-vindas', authAgendaWpp, async (req, res) => {
  try {
    const { AdminAgenda } = require('../models/AgendaServico');
    // Resetar flag para permitir reenvio manual
    await AdminAgenda.findByIdAndUpdate(req.adminAgendaId, {
      'modoWhatsappDono.boasVindasEnviado': false
    });
    await ModoDono.enviarBoasVindas(req.adminAgendaId);
    res.json({ sucesso: true, mensagem: 'Boas-vindas enviadas' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;

// ── POST /conectar-numero — conecta número via Meta API (sem QR code) ─────────
router.post('/conectar-numero', authAgendaWpp, async (req, res) => {
  try {
    const features = getAgendaPlanFeatures(req.adminAgenda.plano);
    if (!features.canUseWhatsappAutomation) {
      return res.status(403).json({ sucesso: false, mensagem: 'Disponível no plano R$147.' });
    }

    const { telefone } = req.body;
    if (!telefone || telefone.replace(/\D/g,'').length < 12) {
      return res.status(400).json({ sucesso: false, mensagem: 'Número inválido.' });
    }

    const telLimpo = telefone.replace(/\D/g,'');

    // Salvar número na instância (cria ou atualiza)
    let inst = await InstanciaWhatsapp.findOne({ adminId: req.adminAgendaId, adminTipo: 'agenda' });
    if (!inst) {
      inst = new InstanciaWhatsapp({
        adminId:       req.adminAgendaId,
        adminTipo:     'agenda',
        nomeInstancia: 'agenda_' + req.adminAgendaId,
        status:        'conectado',
        canal:         'meta',
        telefoneConectado: telLimpo
      });
    } else {
      inst.telefoneConectado = telLimpo;
      inst.status = 'conectado';
      inst.canal  = 'meta';
    }
    await inst.save();

    // Salvar também no AdminAgenda
    await require('../models/AgendaServico').AdminAgenda.findByIdAndUpdate(
      req.adminAgendaId,
      { whatsapp: telLimpo, whatsappOficial: telLimpo }
    );

    // Enviar boas-vindas pelo número oficial da Rebeca
    const MetaWA = require('../services/meta-whatsapp.service');
    const admin  = req.adminAgenda;
    await MetaWA.enviarTexto(telLimpo,
      `Olá! Sou a Rebeca, sua assistente digital. 💙\n\nSeu número foi conectado com sucesso ao painel *${admin.nomeNegocio || 'Rebeca Agenda'}*.\n\nAgora seus clientes podem agendar por aqui, e você pode me enviar comandos como:\n- *Rebeca, minha agenda de hoje*\n- *Rebeca, fecha amanhã*\n- *Rebeca, quanto faturei hoje?*\n\nEstou pronta para trabalhar! 🚀`
    );

    res.json({ sucesso: true, mensagem: 'Número conectado! A Rebeca enviou uma mensagem de boas-vindas.' });

  } catch(e) {
    console.error('[AgendaWPP] conectar-numero erro:', e.message);
    res.status(500).json({ sucesso: false, mensagem: e.message });
  }
});
