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
      // Numero nao e o dono — atender como cliente
      await processarModoCliente(telefone, texto, tipo, msg);
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

// ── MODO CLIENTE ─────────────────────────────────────────────────────────────
// Qualquer numero que nao seja o dono é atendido como cliente
async function processarModoCliente(telefone, texto, tipo, msgObj) {
  try {
    const { AdminAgenda, AgendamentoAgenda, ClienteAgenda } = require('../models/AgendaServico');
    const mongoose = require('mongoose');

    // Pegar o primeiro admin ativo (ajustar para multi-tenant futuramente)
    const admin = await AdminAgenda.findOne({ ativo: true }).lean();
    if (!admin) return;

    const adminId    = String(admin._id);
    const adminObjId = new mongoose.Types.ObjectId(adminId);
    const msgL       = (texto || '').toLowerCase().trim();

    // Buscar cliente pelo telefone
    const telVariantes = [telefone, telefone.replace(/^55/,''), '55'+telefone.replace(/^55/,'')];
    let cliente = await ClienteAgenda.findOne({
      adminId: adminObjId,
      telefone: { $in: telVariantes }
    }).lean();
    const primeiroNome = cliente?.nome?.split(' ')[0] || null;
    const saudacao     = primeiroNome ? `Oi, ${primeiroNome}!` : 'Oi!';

    const telDono = _normalizarTel(admin.whatsappOficial || admin.whatsapp || admin.telefone);

    // ── CLIENTE QUER CANCELAR ─────────────────────────────────────────────────
    if (/\bcancela\b|\bdesmarca\b|\bn[aã]o\s+(?:vou|consigo|posso)\b|\bdesistir\b/i.test(msgL)) {
      const ag = await AgendamentoAgenda.findOne({
        adminId: adminObjId,
        telefoneCliente: { $in: telVariantes },
        status: { $ne: 'cancelado' },
        dataHora: { $gte: new Date() }
      }).lean();
      if (ag) {
        await AgendamentoAgenda.findByIdAndUpdate(ag._id, { status: 'cancelado' });
        const d = new Date(ag.dataHora);
        const hStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        await MetaWA.enviarTexto(telefone,
          `${saudacao} Cancelei seu horário de ${d.toLocaleDateString('pt-BR')} às ${hStr}. Quando quiser reagendar é só falar! 😊`
        );
        // Avisar dono
        if (telDono) await MetaWA.enviarTexto(telDono,
          `⚠️ *Cancelamento!*\n\n👤 ${ag.nomeCliente}\n✂️ ${ag.nomeServico}\n📆 ${d.toLocaleDateString('pt-BR')} às ${hStr}\n📱 ${telefone}`
        );
      } else {
        await MetaWA.enviarTexto(telefone,
          `${saudacao} Não encontrei agendamento ativo pra você. Já foi cancelado ou o horário já passou. 😊`
        );
      }
      return;
    }

    // ── CLIENTE CONFIRMA ──────────────────────────────────────────────────────
    if (/\bconfirmo\b|\bvou\s+sim\b|\bestarei\b|\bpode\s+confirmar\b|\bconfirmado\b|\bconfirmar\b/i.test(msgL)) {
      const ag = await AgendamentoAgenda.findOneAndUpdate(
        { adminId: adminObjId, telefoneCliente: { $in: telVariantes }, status: 'pendente', dataHora: { $gte: new Date() } },
        { status: 'confirmado' },
        { new: true }
      ).lean();
      if (ag) {
        const d   = new Date(ag.dataHora);
        const hStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        await MetaWA.enviarTexto(telefone,
          `Confirmado, ${primeiroNome || 'tudo certo'}! ✅\n\nTe esperamos em ${d.toLocaleDateString('pt-BR')} às ${hStr}. 💙`
        );
        if (telDono) await MetaWA.enviarTexto(telDono,
          `✅ *Confirmação!*\n\n👤 ${ag.nomeCliente} confirmou o horário\n📆 ${d.toLocaleDateString('pt-BR')} às ${hStr}\n✂️ ${ag.nomeServico}`
        );
      }
      return;
    }

    // ── RESPOSTA GERAL + AGENDAMENTO VIA CLAUDE ───────────────────────────────
    // Buscar proximos horarios disponiveis do dia/amanha para contexto
    const hoje   = new Date(); hoje.setHours(0,0,0,0);
    const fimAmanha = new Date(); fimAmanha.setDate(fimAmanha.getDate()+2); fimAmanha.setHours(0,0,0,0);
    const agsProximos = await AgendamentoAgenda.find({
      adminId: adminObjId,
      dataHora: { $gte: hoje, $lt: fimAmanha },
      status: { $ne: 'cancelado' }
    }).lean();
    const ocupados = agsProximos.map(a => {
      const d = new Date(a.dataHora);
      return `${d.toLocaleDateString('pt-BR')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }).join(', ');

    const r = await _claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Você é a Rebeca, assistente de agendamento do negócio "${admin.nomeNegocio || admin.nome || 'salão'}".

PERSONALIDADE:
- Português brasileiro informal e caloroso
- NUNCA diga que é IA ou robô
- Respostas curtas, máximo 4 linhas
- 1-2 emojis por mensagem
- Se souber o nome do cliente, use: ${primeiroNome || 'não sei ainda'}

CONTEXTO:
- Horários já ocupados (hoje/amanhã): ${ocupados || 'nenhum ainda — agenda livre!'}
- Serviços disponíveis: corte, escova, barba, manicure, pedicure, sobrancelha, cílios, massagem, tintura, hidratação

CLIENTE DISSE: "${texto}"

INSTRUÇÕES:
- Se quer agendar: pergunte data, hora e serviço de forma natural (se já disser tudo, confirme)
- Se pergunta sobre horários: informe que a agenda está aberta e peça preferência
- Se já informou data+hora+serviço na mensagem: confirme o agendamento diretamente
- Se for saudação/conversa: responda naturalmente e ofereça ajuda para agendar
- NUNCA invente valores ou informações que não estão aqui`
      }]
    });

    const resposta = r.content.map(c => c.text || '').join('');
    await MetaWA.enviarTexto(telefone, resposta);

    // Tentar extrair agendamento da mensagem do cliente
    const horaM    = texto.match(/(\d{1,2})[h:](\d{0,2})|(\d{1,2})\s*horas?/i);
    const nomeCliM = texto.match(/(?:sou\s+a?\s*|me\s+chamo\s+|meu\s+nome\s+[eé]\s+)([A-Za-zÀ-ú]+(?:\s+[A-Za-zÀ-ú]+)?)/i);
    const servicoList = ['corte','escova','barba','sobrancelha','cílios','cilios','manicure','pedicure','massagem','tintura','hidratação','progressiva','botox','penteado','maquiagem','design'];
    const servicoAchado = servicoList.find(s => msgL.includes(s));
    const diaM = texto.match(/amanhã|amanha/i);

    if (horaM && servicoAchado) {
      const h   = parseInt(horaM[1] || horaM[3]);
      const min = parseInt(horaM[2] || '0') || 0;
      const dataHora = new Date();
      if (diaM) dataHora.setDate(dataHora.getDate() + 1);
      dataHora.setHours(h, min, 0, 0);
      if (dataHora < new Date()) dataHora.setDate(dataHora.getDate() + 1);

      const nomeCliente = nomeCliM ? nomeCliM[1] : (cliente?.nome || primeiroNome || 'Cliente');

      await AgendamentoAgenda.create({
        adminId:         adminObjId,
        nomeCliente,
        nomeServico:     servicoAchado.charAt(0).toUpperCase() + servicoAchado.slice(1),
        dataHora,
        telefoneCliente: telefone,
        status:          'pendente',
        origem:          'whatsapp_cliente'
      });

      // Notificar DONO com estilo animado
      if (telDono) {
        const frases = ['Mais um chegando! 🎉', 'Agenda enchendo! 💪', 'Tá bombando! 🚀', 'Novo na fila! 💙'];
        const frase  = frases[Math.floor(Math.random() * frases.length)];
        await MetaWA.enviarTexto(telDono,
          `📅 *Novo agendamento!* ${frase}\n\n` +
          `👤 *${nomeCliente}*\n` +
          `✂️ ${servicoAchado.charAt(0).toUpperCase() + servicoAchado.slice(1)}\n` +
          `📆 ${dataHora.toLocaleDateString('pt-BR')} às ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}\n` +
          `📱 ${telefone}`
        );
      }
    }

  } catch(e) {
    console.error('[ModoCliente] erro:', e.message);
    await MetaWA.enviarTexto(telefone, 'Oi! Tive um probleminha aqui. Tenta de novo em instantes! 😊').catch(()=>{});
  }
}

// Normalizar telefone (helper local)
function _normalizarTel(tel) {
  if (!tel) return null;
  return tel.replace(/\D/g,'');
}

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
