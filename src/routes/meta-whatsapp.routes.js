'use strict';
const express = require('express');
const router  = express.Router();
const MetaWA  = require('../services/meta-whatsapp.service');
const { InstanciaWhatsapp } = require('../models');
const authMiddleware = require('../middlewares/auth.middleware');

// Middleware auth admin
const auth = authMiddleware.validarToken || authMiddleware.validarAdmin;

// ── POST /api/meta-whatsapp/configurar ────────────────────────────────
// Admin digita número e credenciais Meta → salva + envia boas-vindas
router.post('/configurar', auth, async (req, res) => {
    try {
        const { numeroWhatsapp, metaToken, metaPhoneId, metaVerifyToken } = req.body;
        const adminId = req.usuario?._id || req.usuario?.id || req.body.adminId;

        if (!numeroWhatsapp) return res.json({ sucesso: false, erro: 'Número WhatsApp obrigatório' });

        // Normalizar número
        let numero = numeroWhatsapp.replace(/\D/g, '');
        if (numero.length === 11 && !numero.startsWith('55')) numero = '55' + numero;
        if (numero.length === 10 && !numero.startsWith('55')) numero = '55' + numero;

        // Salvar/atualizar instância Meta no banco
        const dadosInst = {
            adminId,
            provider: 'meta',
            status: 'conectado',
            apiUrl: 'https://graph.facebook.com/v20.0',
            nomeInstancia: 'meta_' + adminId,
            numeroWhatsapp: numero,
        };
        if (metaToken)       dadosInst.apiKey       = metaToken;
        if (metaPhoneId)     dadosInst.metaPhoneId  = metaPhoneId;
        if (metaVerifyToken) dadosInst.verifyToken   = metaVerifyToken;

        // Usar token/phoneId do .env se não informado
        if (!dadosInst.apiKey)      dadosInst.apiKey     = process.env.META_WA_TOKEN || '';
        if (!dadosInst.metaPhoneId) dadosInst.metaPhoneId = process.env.META_WA_PHONE_ID || '';

        const instancia = await InstanciaWhatsapp.findOneAndUpdate(
            { adminId, provider: 'meta' },
            { $set: dadosInst },
            { upsert: true, new: true }
        );

        // Enviar mensagem de boas-vindas ao número configurado
        const msgBoasVindas =
            `🚗 *Bem-vindo à BecaMob!*\n\n` +
            `✅ Seu WhatsApp Business está conectado e configurado com sucesso!\n\n` +
            `📱 A partir de agora, seus clientes poderão solicitar corridas diretamente por aqui.\n\n` +
            `_BecaMob — Tecnologia para sua frota_ 🚀`;

        let boasVindasEnviado = false;
        try {
            const r = await MetaWA.enviarTexto(numero, msgBoasVindas, instancia);
            boasVindasEnviado = r.sucesso;
            console.log('[MetaConfig] Boas-vindas enviado:', r);
        } catch(e) {
            console.log('[MetaConfig] Boas-vindas falhou (não crítico):', e.message);
        }

        res.json({
            sucesso: true,
            instancia: { _id: instancia._id, status: 'conectado', provider: 'meta', numero },
            boasVindasEnviado,
            mensagem: boasVindasEnviado
                ? '✅ WhatsApp conectado! Mensagem de boas-vindas enviada.'
                : '✅ WhatsApp configurado! (boas-vindas não enviado — verifique token)'
        });

    } catch(e) {
        console.error('[MetaConfig] Erro:', e.message);
        res.json({ sucesso: false, erro: e.message });
    }
});

// ── GET /api/meta-whatsapp/status ─────────────────────────────────────
router.get('/status', auth, async (req, res) => {
    try {
        const adminId = req.usuario?._id || req.usuario?.id;
        const inst = await InstanciaWhatsapp.findOne({ adminId, provider: 'meta' });
        if (!inst) return res.json({ sucesso: true, configurado: false });

        const conexao = await MetaWA.testarConexao(inst);
        res.json({
            sucesso: true,
            configurado: true,
            status: conexao.sucesso ? 'conectado' : 'erro_token',
            numero: inst.numeroWhatsapp,
            provider: 'meta',
            dados: conexao.dados
        });
    } catch(e) {
        res.json({ sucesso: false, erro: e.message });
    }
});

// ── POST /api/meta-whatsapp/testar ────────────────────────────────────
router.post('/testar', auth, async (req, res) => {
    try {
        const adminId = req.usuario?._id || req.usuario?.id;
        const inst = await InstanciaWhatsapp.findOne({ adminId, provider: 'meta' });
        if (!inst) return res.json({ sucesso: false, erro: 'WhatsApp Meta não configurado' });

        const r = await MetaWA.enviarTexto(inst.numeroWhatsapp,
            '🔔 Teste BecaMob — conexão Meta WhatsApp funcionando! ✅', inst);
        res.json(r);
    } catch(e) {
        res.json({ sucesso: false, erro: e.message });
    }
});

// ── GET /api/meta-whatsapp/webhook ────────────────────────────────────
// Verificação do webhook pelo Meta
router.get('/webhook', (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expected  = process.env.META_WA_VERIFY_TOKEN || 'becamob-webhook-2026';

    console.log('[MetaWebhook] Verificação:', { mode, token });
    if (mode === 'subscribe' && token === expected) {
        console.log('[MetaWebhook] ✅ Verificado!');
        return res.status(200).send(challenge);
    }
    res.status(403).json({ erro: 'Token inválido' });
});

// ── POST /api/meta-whatsapp/webhook ───────────────────────────────────
// Receber mensagens do Meta
router.post('/webhook', async (req, res) => {
    res.status(200).json({ ok: true }); // responde imediato ao Meta

    try {
        const body = req.body;
        if (body.object !== 'whatsapp_business_account') return;

        const entry    = body.entry?.[0];
        const changes  = entry?.changes?.[0];
        const value    = changes?.value;
        const messages = value?.messages;

        if (!messages?.length) return;

        const msg     = messages[0];
        const telefone = msg.from; // número do remetente
        const tipo    = msg.type;  // text, image, audio, etc.

        let textoMensagem = '';
        if (tipo === 'text')   textoMensagem = msg.text?.body || '';
        if (tipo === 'image')  textoMensagem = msg.image?.caption || '[imagem]';
        if (tipo === 'audio')  textoMensagem = '[áudio]';
        if (tipo === 'document') textoMensagem = '[documento]';

        console.log(`[MetaWebhook] 📥 De: ${telefone} | Tipo: ${tipo} | Texto: ${textoMensagem.slice(0,50)}`);
        // ── INTERCEPTOR COZINHA (Meta WhatsApp) ──────────────────────────
        if (textoMensagem && tipo === 'text') {
            try {
                const { ClienteCozinha, ImpressoraCozinha, JobImpressao, ContadorPedido } = require('../models/cozinha.model');
                const telNorm = telefone.replace(/\D/g, '');
                console.log('[Cozinha-Meta] Verificando telefone:', telefone, '| norm:', telNorm);
                const clienteCoz = await ClienteCozinha.findOne({
                    $or: [
                        { telefone: telNorm },
                        { telefone: telefone },
                        { telefone: '55'+telNorm },
                        { telefone: telNorm.replace(/^55/,'') }
                    ]
                });
                console.log('[Cozinha-Meta] cliente:', clienteCoz ? 'ENCONTRADO adminId:'+clienteCoz.adminId : 'NAO ENCONTRADO');
                if (clienteCoz) {
                    const imp = await ImpressoraCozinha.findOne({ adminId: String(clienteCoz.adminId), ativo: true });
                    if (imp) {
                        if (!global._bufCozMeta) global._bufCozMeta = {};
                        const _keyCoz = String(clienteCoz.adminId);
                        if (!global._bufCozMeta[_keyCoz]) global._bufCozMeta[_keyCoz] = { linhas: [] };
                        global._bufCozMeta[_keyCoz].linhas.push(textoMensagem);

                        // Disparo antecipado: se atingiu 5 mensagens, imprime já
                        const _dispararAgora = async () => {
                            clearTimeout(global._bufCozMeta[_keyCoz]?.t);
                            const buf = global._bufCozMeta[_keyCoz];
                            if (!buf) return;
                            delete global._bufCozMeta[_keyCoz];
                            try {
                                const hoje = new Date().toISOString().slice(0,10);
                                let cont = await ContadorPedido.findOne({ adminId: _keyCoz, data: hoje });
                                if (!cont) cont = await ContadorPedido.create({ adminId: _keyCoz, data: hoje, numero: 0 });
                                cont.numero += 1;
                                await cont.save();
                                const txtFinal = buf.linhas.join('\n')
                            .replace(/[áàãâä]/gi, a => /[A-Z]/.test(a) ? 'A' : 'a')
                            .replace(/[éèêë]/gi, a => /[A-Z]/.test(a) ? 'E' : 'e')
                            .replace(/[íìîï]/gi, a => /[A-Z]/.test(a) ? 'I' : 'i')
                            .replace(/[óòõôö]/gi, a => /[A-Z]/.test(a) ? 'O' : 'o')
                            .replace(/[úùûü]/gi, a => /[A-Z]/.test(a) ? 'U' : 'u')
                            .replace(/[ç]/gi, a => /[A-Z]/.test(a) ? 'C' : 'c')
                            .replace(/[ñ]/gi, a => /[A-Z]/.test(a) ? 'N' : 'n');
                                await JobImpressao.create({ adminId: _keyCoz, texto: txtFinal, mesa: String(cont.numero), status: 'pendente', instancia: 'cozinha', criadoEm: new Date() });
                                console.log('[Cozinha-Meta] Job #'+cont.numero+' criado para adminId:', _keyCoz, '| texto:', txtFinal.substring(0,60));
                            } catch(eCozBuf) { console.error('[Cozinha-Meta] Erro buffer:', eCozBuf.message); }
                        };
                        // Aguarda 10s para agrupar todas as mensagens numa folha so
                        clearTimeout(global._bufCozMeta[_keyCoz]?.t);
                        global._bufCozMeta[_keyCoz].t = setTimeout(_dispararAgora,10000);
                        return; // não processar via Rebeca
                    } else {
                        console.log('[Cozinha-Meta] impressora nao encontrada para adminId:', String(clienteCoz.adminId));
                    }
                }
            } catch(eCozMeta) { console.error('[Cozinha-Meta] Erro interceptor:', eCozMeta.message); }
        }
        // ─────────────────────────────────────────────────────────────────


        // Buscar instância do admin pelo phoneNumberId (roteamento multi-admin)
        const phoneNumberId = value?.metadata?.phone_number_id;
        const displayPhone  = value?.metadata?.display_phone_number || '';

        // Busca 1: pelo Phone Number ID (mais preciso)
        let inst = await InstanciaWhatsapp.findOne({ provider: 'meta', metaPhoneId: phoneNumberId });

        // Busca 2: pelo número exibido (fallback)
        if (!inst && displayPhone) {
            const telNorm = displayPhone.replace(/\D/g, '');
            inst = await InstanciaWhatsapp.findOne({ provider: 'meta', numeroWhatsapp: { $in: [telNorm, '55'+telNorm] } });
        }

        // Busca 3: última instância Meta ativa (fallback para admin único)
        if (!inst) {
            inst = await InstanciaWhatsapp.findOne({ provider: 'meta', status: 'conectado' }).sort({ updatedAt: -1 });
        }

        // ── NUMERO OFICIAL (Modo Dono) — ANTES de qualquer busca de instancia ──
        // Quando e o numero oficial (META_WA_PHONE_ID), nao precisa de instancia no banco:
        // roteia direto para processarMensagemOficial que usa credenciais do .env
        if (process.env.META_WA_PHONE_ID && phoneNumberId === process.env.META_WA_PHONE_ID) {
            try {
                const { processarMensagemOficial } = require('../services/agenda-rebeca-oficial.service');
                await processarMensagemOficial({
                    data: {
                        message: {
                            key: { remoteJid: telefone + '@s.whatsapp.net', fromMe: false },
                            message: { conversation: textoMensagem }
                        }
                    }
                });
            } catch(eOficial) {
                console.error('[MetaWebhook] Erro Modo Dono:', eOficial.message);
            }
            return; // nao processa como cliente comum
        }

        if (!inst) {
            console.log('[MetaWebhook] Instância Meta não encontrada para phoneId:', phoneNumberId);
            return;
        }

        // Marcar como lido (inst já validado aqui)
        try { await MetaWA.marcarLido(msg.id, inst); } catch(e) {}

        // Montar payload no formato que o rebeca.service.js já entende
        const payloadRebeca = {
            instanciaId: inst._id,
            adminId:     inst.adminId,
            telefone,
            mensagem:    textoMensagem,
            tipo,
            msgId:       msg.id,
            timestamp:   msg.timestamp,
            _metaRaw:    msg,
        };

// Processar via RebecaService — mesmo fluxo da Evolution
        try {
            const RebecaService = require('../services/rebeca.service');
            if (RebecaService.processarMensagem) {
                // Assinatura: processarMensagem(telefone, mensagem, nome, contexto)
                await RebecaService.processarMensagem(
                    telefone,
                    textoMensagem,
                    'Cliente',
                    {
                        instanciaId: inst._id,
                        adminId:     inst.adminId,
                        provider:    'meta',
                        tipo,
                        msgId:       msg.id,
                        phoneNumberId,
                    }
                );
            }
        } catch(e) {
            console.error('[MetaWebhook] Erro ao processar:', e.message);
        }

    } catch(e) {
        console.error('[MetaWebhook] Erro geral:', e.message);
    }
});

module.exports = router;
