python3 << 'PYEOF'
import subprocess

path = '/workspaces/rebeca-sistema-br/src/services/agenda-modo-dono.service.js'
with open(path) as f:
    content = f.read()

# ══════════════════════════════════════════════════════
# 3. LEMBRETE 30min — usar Meta API quando não tem Evolution
# ══════════════════════════════════════════════════════
old_lembrete = """        const inst = await InstanciaWhatsapp.findOne({ adminId: String(ag.adminId), adminTipo: 'agenda', status: 'conectado' }).lean();
        if (!inst) continue;

        const hora = _fmtHora(new Date(ag.dataHora));
        await _enviarMsg(inst, telDono,"""

new_lembrete = """        const inst = await InstanciaWhatsapp.findOne({ adminId: String(ag.adminId), adminTipo: 'agenda', status: 'conectado' }).lean();

        // Fallback Meta API se não tiver Evolution conectado
        const instParaEnvio = inst || {
          _enviarVia: 'meta',
          apiUrl: 'meta',
          nomeInstancia: 'meta_oficial'
        };

        const hora = _fmtHora(new Date(ag.dataHora));
        await _enviarMsg(instParaEnvio, telDono,"""

if old_lembrete in content:
    content = content.replace(old_lembrete, new_lembrete)
    print('✅ Lembrete 30min — fallback Meta API adicionado')
else:
    print('⚠️ Lembrete 30min não encontrado exato')

# ══════════════════════════════════════════════════════
# 4. RELATÓRIO DIÁRIO — usar Meta API quando não tem Evolution
# ══════════════════════════════════════════════════════
old_relatorio = """        const inst = await InstanciaWhatsapp.findOne({ adminId: String(admin._id), adminTipo: 'agenda', status: 'conectado' }).lean();
        if (!inst) continue;

        const lancamentos = await FinanceiroAgenda.find"""

new_relatorio = """        const inst = await InstanciaWhatsapp.findOne({ adminId: String(admin._id), adminTipo: 'agenda', status: 'conectado' }).lean();

        // Fallback Meta API se não tiver Evolution conectado
        const instParaEnvio = inst || {
          _enviarVia: 'meta',
          apiUrl: 'meta',
          nomeInstancia: 'meta_oficial'
        };
        if (!inst && !process.env.META_WA_TOKEN) continue;

        const lancamentos = await FinanceiroAgenda.find"""

if old_relatorio in content:
    content = content.replace(old_relatorio, new_relatorio)
    print('✅ Relatório diário — fallback Meta API adicionado')
else:
    print('⚠️ Relatório diário não encontrado exato — verificando...')
    idx = content.find('rodarRelatorioDiario')
    print(repr(content[idx:idx+400]))

# Corrigir também o _enviarMsg no relatório para usar instParaEnvio
old_envio_rel = """        await _enviarMsg(inst, telDono,
          `🌅 *Bom dia, ${_chefe()}!*"""
new_envio_rel = """        await _enviarMsg(instParaEnvio, telDono,
          `🌅 *Bom dia, ${_chefe()}!*"""
if old_envio_rel in content:
    content = content.replace(old_envio_rel, new_envio_rel)
    print('✅ _enviarMsg relatório usa instParaEnvio')

with open(path, 'w') as f:
    f.write(content)

subprocess.run(['git','-C','/workspaces/rebeca-sistema-br','add','-A'])
r = subprocess.run(['git','-C','/workspaces/rebeca-sistema-br','commit','-m',
    'fix: lembretes e relatorio diario com fallback Meta API — dispara mesmo sem Evolution'],
    capture_output=True, text=True)
print(r.stdout.strip())
r2 = subprocess.run(['git','-C','/workspaces/rebeca-sistema-br','push','origin','main'],
    capture_output=True, text=True)
print(r2.stdout or r2.stderr)
PYEOF
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

    const msg      = changes.messages[0];
    const telefone = msg.from;
    const tipo     = msg.type;
    const texto    = msg?.text?.body || '';
    const msgId    = msg.id;

    console.log(`[MetaWA] msg de ${telefone}: "${texto}"`);

    await MetaWA.marcarLido(msgId);

    // Roteamento por módulo
    if (tipo === 'text' && texto) {
      await processarComando(telefone, texto, msgId);
    } else if (tipo === 'audio') {
      console.log(`[MetaWA] Áudio recebido de ${telefone} — transcrevendo...`);
      await MetaWA.marcarLido(msgId);
      const audioId = msg?.audio?.id;
      if (audioId) {
        const transcricao = await transcreverAudio(audioId);
        if (transcricao) {
          console.log(`[MetaWA] Processando áudio transcrito: "${transcricao}"`);
          await processarComando(telefone, transcricao, msgId);
        } else {
          // Tenta processar via Claude mesmo sem transcrição
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

    if (!admin) {
      await MetaWA.enviarTexto(telefone,
        'Olá! Não encontrei sua conta na Rebeca. Acesse rebeca-sistema-br.onrender.com para se cadastrar.'
      );
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

    const tratado = await AgendaModo.processarComandoDono(telefone, texto, String(admin._id), instMeta);

    // Se não tratado, o Claude Haiku já respondeu no fallback do service
    // Não enviar mensagem genérica robótica aqui

  } catch(e) {
    console.error('[MetaWA] processarComando erro:', e.message);
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
