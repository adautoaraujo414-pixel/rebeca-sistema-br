'use strict';

const express   = require('express');
const router    = express.Router();
const axios     = require('axios');
const MetaWA    = require('../services/meta-whatsapp.service');
const Anthropic = require('@anthropic-ai/sdk');
const _claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN || 'rebeca-webhook-2026';

// ── VERIFICAÇÃO WEBHOOK META ─────────────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[MetaWA] Webhook verificado ✅');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ erro: 'Token inválido' });
});

// ── RECEBER MENSAGENS ────────────────────────────────────────────
router.post('/webhook', express.json(), async (req, res) => {
  res.sendStatus(200);
  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes?.messages?.length) return;
    for (const msg of changes.messages) {
      const telefone = msg.from;
      const tipo     = msg.type;
      const texto    = msg?.text?.body || msg?.forwarded?.text?.body || '';
      const msgId    = msg.id;
      console.log(`[MetaWA] msg de ${telefone}: "${texto}"`);
      await MetaWA.marcarLido(msgId);

      // ── INTERCEPTAR COZINHA ANTES DO ROTEAMENTO ───────────────
      try {
        const { ClienteCozinha, ImpressoraCozinha } = require('../models/cozinha.model');
        const { imprimirPedido } = require('../services/cozinha-impressora.service');
        const telNorm = telefone.replace(/\D/g, '');
        console.log('[Cozinha] Verificando telefone:', telefone, '| normalizado:', telNorm);
        const telSem55 = telNorm.replace(/^55/, '');
        // Busca pelo telefone do remetente OU pelo adminId do dono (quando dono encaminha)
        let clienteCoz = await ClienteCozinha.findOne({
          $or: [
            { telefone: telNorm },
            { telefone: telefone },
            { telefone: '55'+telSem55 },
            { telefone: telSem55 },
            { telefone: telSem55.replace(/^(\d{2})(\d)/, '$19$2') }
          ]
        });
        // Se não achou pelo telefone, verifica se o remetente é o dono de algum admin com cozinha
        if (!clienteCoz) {
          const { Admin } = require('../models');
          const _adminDono = await Admin.findOne({
            $or: [
              { telefone: telNorm }, { telefone: telefone },
              { telefone: '55'+telSem55 }, { telefone: telSem55 },
              { whatsappNumero: telNorm }, { whatsappNumero: telefone }
            ]
          }).lean();
          if (_adminDono) {
            clienteCoz = await ClienteCozinha.findOne({ adminId: String(_adminDono._id) });
            if (clienteCoz) console.log('[Cozinha] ClienteCoz encontrado via adminId do dono:', String(_adminDono._id));
          }
        }
        console.log('[Cozinha] clienteCoz encontrado:', clienteCoz ? clienteCoz.adminId : 'NÃO ENCONTRADO');
        if (clienteCoz && tipo === 'text' && texto) {
          const imp = await ImpressoraCozinha.findOne({ adminId: String(clienteCoz.adminId), ativo: true });
          console.log('[Cozinha] impressora:', imp ? 'ENCONTRADA ip:'+imp.ip : 'NÃO ENCONTRADA para adminId:'+String(clienteCoz.adminId));
          if (imp) {
            if (!global._bufCoz) global._bufCoz = {};
            const key = String(clienteCoz.adminId).replace(/^ObjectId(["']?|["']?)$/g, '').trim();
            if (!global._bufCoz[key]) global._bufCoz[key] = { linhas: [] };
            global._bufCoz[key].linhas.push(texto);
            clearTimeout(global._bufCoz[key].t);
            global._bufCoz[key].t = setTimeout(async () => {
              const buf = global._bufCoz[key];
              delete global._bufCoz[key];
              try {
                const { JobImpressao, ContadorPedido } = require('../models/cozinha.model');
                // Dropar índice antigo adminId_1 se existir (migração única)
                try {
                  const _col = ContadorPedido.collection;
                  const _idxs = await _col.indexes();
                  const _old = _idxs.find(i => i.name === 'adminId_1' && !i.key?.data);
                  if (_old) { await _col.dropIndex('adminId_1'); console.log('[Cozinha] Índice antigo adminId_1 dropado'); }
                } catch(_ei) { /* silencioso */ }
                const hoje = new Date().toISOString().slice(0,10);
                let cont = await ContadorPedido.findOneAndUpdate(
                  { adminId: key, data: hoje },
                  { $inc: { numero: 1 } },
                  { upsert: true, new: true }
                );
                const txtFinal = buf.linhas.join('\n');
                await JobImpressao.create({ adminId: String(key), texto: txtFinal, mesa: String(cont.numero), status: 'pendente', criadoEm: new Date() });
                console.log('[Cozinha] Job criado adminId:', String(key), '| pedido#', cont.numero);
                console.log('[Cozinha] Job #' + cont.numero + ':', txtFinal.substring(0,60));
              } catch(e) { console.error('[Cozinha] Erro buffer:', e.message); }
            }, 3000);
          }
          continue; // não responde ao cliente
        }
      } catch(eCoz) {
        console.error('[Cozinha] Erro interceptor:', eCoz.message);
      }
      // ──────────────────────────────────────────────────────────

      // Roteamento por módulo
      if (tipo === 'text' && texto) {
        await processarComando(telefone, texto, msgId);
      } else if (tipo === 'audio') {
        console.log(`[MetaWA] Áudio recebido de ${telefone} — transcrevendo...`);
        const audioId = msg?.audio?.id;
        if (audioId) {
          const transcricao = await transcreverAudio(audioId);
          if (transcricao) {
            await processarComando(telefone, transcricao, msgId);
          } else {
            await processarComando(telefone, 'não entendi o áudio enviado', msgId);
          }
        }
      } else if (tipo === 'image') {
        await processarComando(telefone, '[imagem enviada pelo dono]', msgId);
      } else if (tipo === 'interactive') {
        const resposta = msg?.interactive?.button_reply?.title
          || msg?.interactive?.list_reply?.title || '';
        if (resposta) await processarComando(telefone, resposta, msgId);
      }
    } // fim for messages
  } catch(e) {
    console.error('[MetaWA] webhook erro:', e.message);
  }
});

// ── PROCESSAR COMANDO ────────────────────────────────────────────

// ── TRANSCREVER ÁUDIO VIA CLAUDE ─────────────────────────────────────────────
async function transcreverAudio(audioId) {
  try {
    // 1 — Pegar URL do áudio na Meta
    const infoR = await axios.get(
      `https://graph.facebook.com/v20.0/${audioId}`,
      { headers: { Authorization: `Bearer ${process.env.META_WA_TOKEN}` } }
    );
    const audioUrl = infoR.data?.url;
    if (!audioUrl) { console.error('[MetaWA] URL do áudio não encontrada'); return null; }

    // 2 — Baixar o áudio como buffer
    const audioR = await axios.get(audioUrl, {
      headers: { Authorization: `Bearer ${process.env.META_WA_TOKEN}` },
      responseType: 'arraybuffer',
      timeout: 15000
    });
    const audioBuffer = Buffer.from(audioR.data);
    console.log(`[MetaWA] Áudio baixado: ${audioBuffer.length} bytes`);

    // 3 — Transcrever via Claude usando texto do áudio como prompt
    // Como Claude não processa áudio, vamos usar uma abordagem híbrida:
    // Converter para texto usando a API de Speech Recognition da Web Speech
    // Por enquanto, retornar null e pedir para o usuário digitar
    // TODO: integrar Whisper quando OPENAI_API_KEY estiver disponível

    // Verificar se tem OPENAI_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.log('[MetaWA] OPENAI_API_KEY não configurada — não é possível transcrever áudio');
      return null;
    }

    // 4 — Enviar para Whisper (OpenAI)
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-1');
    form.append('language', 'pt');
    form.append('prompt', 'Rebeca, agenda, agendamento, cliente, horário, serviço, entrada, saída, pix, real, reais, cabeleireiro, farmácia, mercado, academia, gastei, recebi, cancela, confirma, bloqueia, quanto fiz hoje, resumo do dia');

    const whisperR = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${openaiKey}`
        },
        timeout: 30000
      }
    );

    const transcricao = whisperR.data?.text?.trim();
    console.log(`[MetaWA] Whisper transcreveu: "${transcricao}"`);
    return transcricao || null;

  } catch(e) {
    console.error('[MetaWA] Erro transcrever áudio:', e.response?.data || e.message);
    return null;
  }
}

async function processarComando(telefone, texto, msgId) {
  try {
    const { AdminAgenda } = require('../models/AgendaServico');
    // Normalizar telefone — Meta manda 553484039955, banco tem 5534984039955
    const telLimpo  = telefone.replace(/^55/, '');          // 3484039955
    const telCom9   = telLimpo.replace(/^(\d{2})(\d{8})$/, '$19$2'); // 34984039955
    const telSem9   = telLimpo.replace(/^(\d{2})9(\d{8})$/, '$1$2'); // sem o 9
    const variantes = [
      telefone,           // 553484039955
      telLimpo,           // 3484039955
      '55'+telLimpo,      // 553484039955
      telCom9,            // 34984039955
      '55'+telCom9,       // 5534984039955
      telSem9,            // 3484039955
      '55'+telSem9,       // 553484039955
    ];
    console.log('[MetaWA] Buscando admin, variantes:', variantes.join(', '));
    const admin = await AdminAgenda.findOne({
      $or: [
        { whatsapp:        { $in: variantes } },
        { whatsappOficial: { $in: variantes } },
        { telefone:        { $in: variantes } },
      ],
      ativo: true
    });
    if (admin) console.log('[MetaWA] Admin encontrado:', admin.email);

    // ── COZINHA: tratado pelo interceptor principal (linhas 38-76) ──

    if (!admin) {
      // Verificar se é cliente de algum admin com bot ativo
      // O número Meta é único — todas as mensagens chegam aqui
      // Precisamos identificar de qual admin este cliente é pelo histórico ou por ser número desconhecido
      // Por enquanto: modo vendedora para prospects sem admin identificado
      try {
        const Vendas = require('../services/rebeca-vendas.service');
        const resposta = await Vendas.responderProspect(telefone, texto);
        if (resposta) await MetaWA.enviarTexto(telefone, resposta);
      } catch(e) {
        console.error('[MetaWA] Erro vendas:', e.message);
        await MetaWA.enviarTexto(telefone, 'Olá! Sou a Rebeca. Como posso te ajudar?');
      }
      return;
    }

    // ── Admin identificado — verificar configBot para atender clientes ──
    // Se o telefone remetente NÃO é o admin mas sim um cliente dele
    const AgendaModoCheck = require('../services/agenda-modo-dono.service');
    const _eDonoCheck = AgendaModoCheck.isDono(telefone, admin);
    if (!_eDonoCheck && admin?.configBot?.ativo && admin?.configBot?.atenderClientes) {
      // É um cliente mandando mensagem no número do admin
      try {
        const AtendCliente = require('../services/agenda-atendimento-cliente.service');
        const resultado = await AtendCliente.atenderCliente(telefone, texto, String(admin._id));
        if (resultado?.resposta) {
          await MetaWA.enviarTexto(telefone, resultado.resposta);
          // Notificar admin se cliente pediu atendente humano
          if (resultado.notificarAdmin) {
            const _nomeC = resultado.nomeCliente || telefone;
            await MetaWA.enviarTexto(admin.whatsapp || admin.telefone,
              `🔔 *Atenção!* O cliente *${_nomeC}* está pedindo atendimento humano no WhatsApp. Mensagem: "${texto.substring(0,100)}"`
            );
          }
        }
      } catch(e) {
        console.error('[MetaWA] Erro atendimento cliente:', e.message);
        await MetaWA.enviarTexto(telefone, 'Olá! Um momento, estou verificando aqui para você 😊');
      }
      return;
    }

    // Passa para IA da Agenda
    const AgendaModo = require('../services/agenda-modo-dono.service');

    // Instância fake para o modo dono usar o MetaWA para responder
    const instMeta = {
      nomeInstancia: 'meta_oficial',
      apiKey:        process.env.META_WA_TOKEN,
      apiUrl:        'meta',
      numero:        telefone,
      _enviarVia:    'meta'
    };

    // Verificar se admin está com trial expirado ou bloqueado
    if (admin.statusPagamento === 'trial_expirado' || admin.statusPagamento === 'bloqueado') {
      const _PIX = '00020101021226840014BR.GOV.BCB.PIX0136f09d7ae0-7754-4a98-94f5-134c007b56120222Pagamento francisca_da5204000053039865406147.005802BR5924FRANCISCA DAMACENA ROCHA6010COSTA RICA62290525QRCCTFj4aZBeZAHKCqLQQhBIc63044772';
      const _status = admin.statusPagamento === 'bloqueado' ? 'foi encerrado' : 'está em período de pagamento';
      const _msg = `⚠️ *Atenção!*

Olá! Seu acesso à *Rebeca Agenda* ${_status}.

Para continuar usando, faça o pagamento:

💰 *R$ 147,00*

📋 *PIX Copia e Cola:*
${_PIX}

Após o pagamento, envie o comprovante em:
🔗 https://rebecasistemas.com.br/agenda-cadastro

Reativamos seu acesso imediatamente! 💙`;
      await MetaWA.enviarTexto(telefone, _msg);
      return;
    }
    console.log('[STEP 5] chamando processarComandoDono, adminId:', String(admin._id));
    let tratado;
    try {
      tratado = await AgendaModo.processarComandoDono(telefone, texto, String(admin._id), instMeta);
    } catch(innerErr) {
      console.error('[STEP 5 ERRO]', { message: innerErr.message, stack: innerErr.stack });
      await MetaWA.enviarTexto(telefone, 'Ocorreu um erro interno. Tente novamente.');
      return;
    }
    console.log('[STEP 6] processarComandoDono retornou:', tratado);

  } catch(e) {
    console.error('[MetaWA] processarComando erro:', { message: e.message, stack: e.stack, data: e.response?.data });
    await MetaWA.enviarTexto(telefone, 'Ocorreu um erro. Tente novamente em instantes.');
  }
}

// ── TESTAR CONEXÃO ───────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const r = await MetaWA.testarConexao();
  res.json(r);
});

// ── ENVIAR TESTE ─────────────────────────────────────────────────
router.post('/enviar-teste', async (req, res) => {
  const { telefone, mensagem } = req.body;
  const r = await MetaWA.enviarTexto(telefone, mensagem || 'Teste Rebeca Plataforma ✅');
  res.json(r);
});

module.exports = router;

// ── AUTO RENOVAÇÃO DE TOKEN ──────────────────────────────────────
router.get('/renovar-token', async (req, res) => {
  try {
    const axios = require('axios');
    const token     = process.env.META_WA_TOKEN;
    const appId     = process.env.META_WA_APP_ID || '1277260361061515';
    const appSecret = process.env.META_WA_APP_SECRET;

    const r = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
      params: {
        grant_type:        'fb_exchange_token',
        client_id:         appId,
        client_secret:     appSecret,
        fb_exchange_token: token
      }
    });

    const novoToken  = r.data.access_token;
    const expiresEm  = r.data.expires_in;

    // Loga para copiar manualmente se precisar
    console.log('[MetaWA] Token renovado. Expira em:', expiresEm, 'segundos');
    console.log('[MetaWA] Novo token:', novoToken.substring(0, 40) + '...');

    res.json({
      sucesso:   true,
      expiresEm,
      tokenInicio: novoToken.substring(0, 40) + '...',
      aviso: 'Atualize META_WA_TOKEN no Render com o token completo abaixo',
      tokenCompleto: novoToken
    });

  } catch(e) {
    console.error('[MetaWA] renovar-token erro:', e.response?.data || e.message);
    res.status(500).json({ sucesso: false, erro: e.response?.data || e.message });
  }
});

// ── VERIFICAR EXPIRAÇÃO ──────────────────────────────────────────
router.get('/token-info', async (req, res) => {
  try {
    const axios  = require('axios');
    const token  = process.env.META_WA_TOKEN;
    const appId  = process.env.META_WA_APP_ID || '1277260361061515';
    const secret = process.env.META_WA_APP_SECRET;

    const r = await axios.get('https://graph.facebook.com/debug_token', {
      params: {
        input_token:  token,
        access_token: `${appId}|${secret}`
      }
    });

    const d          = r.data.data;
    const expiresAt  = d.expires_at ? new Date(d.expires_at * 1000) : null;
    const diasRestantes = expiresAt
      ? Math.floor((expiresAt - Date.now()) / 86400000)
      : null;

    res.json({
      valido:        d.is_valid,
      expiraEm:      expiresAt,
      diasRestantes,
      app:           d.application,
      scopes:        d.scopes,
      aviso:         diasRestantes < 10 ? '⚠️ RENOVAR TOKEN URGENTE' : '✅ Token OK'
    });

  } catch(e) {
    res.status(500).json({ sucesso: false, erro: e.response?.data || e.message });
  }
});
