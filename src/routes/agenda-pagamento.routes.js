'use strict';
const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const mongoose = require('mongoose');
const { AdminAgenda } = require('../models/AgendaServico');
const { InstanciaWhatsapp } = require('../models/AgendaServico');

const PIX_COPIA_COLA = '00020101021226840014BR.GOV.BCB.PIX0136f09d7ae0-7754-4a98-94f5-134c007b56120222Pagamento francisca_da5204000053039865406147.005802BR5924FRANCISCA DAMACENA ROCHA6010COSTA RICA62290525QRCCTFj4aZBeZAHKCqLQQhBIc63044772';
const VALOR_PLANO    = 147.00;
const WHATSAPP_SUPORTE = '5534999535060'; // número oficial Rebeca

// ── GET /api/agenda/pix-info — retorna chave pix e valor
router.get('/pix-info', (req, res) => {
  res.json({ sucesso: true, pixCopiaECola: PIX_COPIA_COLA, valor: VALOR_PLANO });
});

// ── POST /api/agenda/comprovante — recebe imagem base64, analisa, libera acesso
router.post('/comprovante', async (req, res) => {
  try {
    const { adminId, imagemBase64, mediaType } = req.body;
    if (!adminId || !imagemBase64) return res.status(400).json({ erro: 'adminId e imagemBase64 obrigatórios' });
    if (!mongoose.isValidObjectId(adminId)) return res.status(400).json({ erro: 'adminId inválido' });
    // Limite de tamanho: ~8MB em base64 (cobre comprovantes normais, evita payloads abusivos)
    if (imagemBase64.length > 8 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem muito grande. Envie um comprovante com até 8MB.' });

    const admin = await AdminAgenda.findById(adminId);
    if (!admin) return res.status(404).json({ erro: 'Conta não encontrada' });
    if (admin.statusPagamento === 'pago') return res.json({ sucesso: true, msg: 'Pagamento já confirmado' });

    // Analisar comprovante via Claude Vision
    const tipo = mediaType || 'image/jpeg';
    const respIA = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: tipo, data: imagemBase64 } },
            { type: 'text', text: `Analise esta imagem de comprovante de pagamento. Responda APENAS com JSON: {"aprovado": true/false, "valor": número_ou_null, "motivo": "texto curto"}. Regras: 1) REJEITE imediatamente se encontrar qualquer palavra como "agendado", "agendamento", "será debitado", "débito agendado" ou similar. 2) VERIFIQUE o valor: aprove SOMENTE se o valor for exatamente R$147,00. Qualquer outro valor rejeite. 3) Se não houver palavra "agendado" e o valor for exatamente R$147,00, APROVE. 4) Rejeite se a imagem for ilegível ou não for um comprovante financeiro.` }
          ]
        }]
      })
    });

    const iaData = await respIA.json();

    // Verificar erro da API
    if (iaData.error || !iaData.content || !iaData.content[0]) {
      console.error('[comprovante] Erro API Claude:', JSON.stringify(iaData));
      return res.json({ sucesso: false, msg: 'Erro técnico ao analisar o comprovante. Tente novamente em alguns instantes ou entre em contato com o suporte.' });
    }

    const iaText = iaData.content[0].text || '{}';
    let analise = { aprovado: false, motivo: 'Não foi possível analisar' };
    try { analise = JSON.parse(iaText.replace(/```json|```/g, '').trim()); } catch(e) {
      console.error('[comprovante] JSON inválido da IA:', iaText);
      return res.json({ sucesso: false, msg: 'Erro técnico ao processar resposta da IA. Tente novamente.' });
    }

    if (!analise.aprovado) {
      return res.json({ sucesso: false, msg: analise.motivo || 'Comprovante não reconhecido. Certifique-se de enviar o comprovante do PIX já pago (não agendado) com valor de R$147,00.' });
    }

    // Gerar senha aleatória e liberar acesso por 30 dias
    const senhaGerada = crypto.randomBytes(4).toString('hex'); // ex: a3f9b2c1
    const senhaHash   = await bcrypt.hash(senhaGerada, 10);
    const planoExpira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const novoToken   = crypto.randomBytes(32).toString('hex');

    await AdminAgenda.findByIdAndUpdate(adminId, {
      senha: senhaHash,
      token: novoToken,
      ativo: true,
      statusPagamento: 'pago',
      comprovantePagamento: imagemBase64.substring(0, 100), // salva só início p/ referência
      planoExpira,
      avisadoVencimento: false,
      trialExpira: null
    });

    // Enviar senha via WhatsApp da Rebeca
    try {
      const instancia = await InstanciaWhatsapp.findOne({ isOficial: true, status: 'conectado' }).lean()
                     || await InstanciaWhatsapp.findOne({ adminTipo: 'agenda', status: 'conectado' }).lean();

      if (instancia) {
        const wppCliente = (admin.whatsapp || '').replace(/\D/g, '');
        const wppFull = wppCliente.startsWith('55') ? wppCliente : '55' + wppCliente;
        const msg = `✅ *Pagamento confirmado!*\n\nOlá, ${admin.nome}! 🎉\n\nSeu acesso à *Rebeca Agenda* foi liberado!\n\n*Seus dados de acesso:*\n📧 E-mail: ${admin.email}\n🔑 Senha: ${senhaGerada}\n\n🔗 Acesse: https://rebecasistemas.com.br/agenda-adm\n\n*Plano válido até:* ${planoExpira.toLocaleDateString('pt-BR')}\n\nQualquer dúvida, estou aqui! 💙`;

        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instancia.instancia}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
          body: JSON.stringify({ number: wppFull, text: msg })
        });
      }
    } catch(wppErr) { console.warn('[pagamento] Erro ao enviar WPP:', wppErr.message); }

    res.json({ sucesso: true, msg: 'Pagamento confirmado! Você receberá seus dados de acesso pelo WhatsApp em instantes. 🎉', email: admin.email, planoExpira });

  } catch(e) {
    console.error('[comprovante]', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// ── GET /api/agenda/verificar-vencimentos — cron diário
router.get('/verificar-vencimentos', async (req, res) => {
  try {
    const em2dias = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const em2diasFim = new Date(em2dias.getTime() + 24 * 60 * 60 * 1000);
    const vencendo = await AdminAgenda.find({
      statusPagamento: 'pago',
      planoExpira: { $gte: em2dias, $lt: em2diasFim },
      avisadoVencimento: false,
      ativo: true
    });

    let avisados = 0;
    for (const admin of vencendo) {
      try {
        const instancia = await InstanciaWhatsapp.findOne({ isOficial: true, status: 'conectado' }).lean()
                       || await InstanciaWhatsapp.findOne({ adminTipo: 'agenda', status: 'conectado' }).lean();
        if (!instancia) continue;

        const wppFull = (admin.whatsapp || '').replace(/\D/g,'').replace(/^(?!55)/, '55');
        const dataExp = admin.planoExpira.toLocaleDateString('pt-BR');
        const msg = `⚠️ *Aviso de vencimento*\n\nOlá, ${admin.nome}!\n\nSeu plano da *Rebeca Agenda* vence em *2 dias* (${dataExp}).\n\nPara renovar e continuar usando sem interrupção, faça o PIX:\n\n💰 *R$ ${VALOR_PLANO.toFixed(2)}*\n\n📋 *PIX Copia e Cola:*\n${PIX_COPIA_COLA}\n\nApós o pagamento, envie o comprovante em:\n🔗 rebecasistemas.com.br/agenda-cadastro\n\nQualquer dúvida estou aqui! 💙`;

        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instancia.instancia}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
          body: JSON.stringify({ number: wppFull, text: msg })
        });

        await AdminAgenda.findByIdAndUpdate(admin._id, { avisadoVencimento: true });
        avisados++;
      } catch(e) { console.warn('[vencimento]', admin.email, e.message); }
    }

    // Desativar expirados
    await AdminAgenda.updateMany({
      statusPagamento: 'pago',
      planoExpira: { $lt: new Date() },
      ativo: true
    }, { ativo: false, statusPagamento: 'expirado' });

    res.json({ sucesso: true, avisados });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
