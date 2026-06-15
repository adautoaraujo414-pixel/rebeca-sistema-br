'use strict';
const http  = require('http');
const net   = require('net');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ═══════════════════════════════════════════════════════════════
//  REBECA COZINHA — Servidor Local v10
//  Multi-restaurante: cada instalação tem seu config.json
//  Fluxo: WhatsApp → Rebeca → Job banco → este exe → impressora
//  Isolado por adminId — nunca cruza dados entre restaurantes
// ═══════════════════════════════════════════════════════════════

const CONFIG_PATH = path.join(__dirname, 'config.json');

// ── Carregar config local ─────────────────────────────────────
function carregarConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('\n[ERRO] config.json não encontrado!');
    console.error('  Execute CONFIGURAR.bat primeiro.\n');
    process.exit(1);
  }
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!c.adminId || !c.token || !c.servidor) {
      console.error('[ERRO] config.json inválido — faltam campos obrigatórios.');
      process.exit(1);
    }
    return c;
  } catch(e) {
    console.error('[ERRO] config.json corrompido:', e.message);
    process.exit(1);
  }
}

const CFG = carregarConfig();

// Campos obrigatórios vindos do config.json:
// { adminId, token, servidor, nomeRestaurante, intervalo? }
// Campos opcionais (buscados do servidor se ausentes):
// { ipImpressora, portaImpressora, modoLocal }

const ADMIN_ID     = CFG.adminId;
const TOKEN        = CFG.token;
const SERVIDOR     = CFG.servidor.replace(/\/$/, ''); // ex: https://rebecasistemas.com.br
const NOME_REST    = CFG.nomeRestaurante || 'Restaurante';
const INTERVALO    = CFG.intervalo || 5000;

// Config da impressora — pode vir do config.json ou ser buscada do servidor
let IP_IMP    = CFG.ipImpressora   || null;
let PORTA_IMP = CFG.portaImpressora || 9100;

// ── Buscar config da impressora no servidor ───────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('JSON inválido: ' + d.substring(0,80))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function httpsPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(urlStr);
    const data = JSON.stringify(body || {});
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':    'application/json',
        'Content-Length':  Buffer.byteLength(data),
        'x-cozinha-token': TOKEN
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve({}); }
      });
    });
    req.on('error', () => resolve({}));
    req.setTimeout(8000, () => { req.destroy(); resolve({}); });
    req.write(data);
    req.end();
  });
}

async function buscarConfigImpressora() {
  try {
    const url = `${SERVIDOR}/api/cozinha/admins-local/${ADMIN_ID}?token=${TOKEN}`;
    const d   = await httpsGet(url);
    if (d.sucesso && d.admins && d.admins[0]) {
      const imp = d.admins[0];
      IP_IMP    = imp.ipImpressora || imp.ip;
      PORTA_IMP = imp.portaImpressora || imp.porta || 9100;
      console.log(`[Config] Impressora atualizada: ${IP_IMP}:${PORTA_IMP}`);
      // Salvar no config.json para próxima inicialização (offline resiliente)
      const novo = { ...CFG, ipImpressora: IP_IMP, portaImpressora: PORTA_IMP };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(novo, null, 2));
    }
  } catch(e) {
    console.warn('[Config] Não foi possível buscar config do servidor:', e.message);
    if (!IP_IMP) {
      console.error('[ERRO] IP da impressora não configurado e servidor inacessível.');
      console.error('  Configure ipImpressora no config.json ou verifique a conexão.');
      process.exit(1);
    }
    console.warn('[Config] Usando IP salvo localmente:', IP_IMP + ':' + PORTA_IMP);
  }
}

// ── ESC/POS — montar ticket ───────────────────────────────────
function montarTicket(texto, numPedido) {
  const ESC = '\x1B', GS = '\x1D';
  const INIT     = ESC + '@';
  const CENTER   = ESC + 'a\x01';
  const LEFT     = ESC + 'a\x00';
  const BOLD_ON  = ESC + 'E\x01';
  const BOLD_OFF = ESC + 'E\x00';
  const FONT_GDE = GS  + '!\x11';
  const FONT_NOR = GS  + '!\x00';
  const CUT      = GS  + 'V\x41\x03';
  const LF       = '\n';

  const agora = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
  });
  const data = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });

  // Normalizar acentos para ESC/POS
  const textoNorm = String(texto).trim()
    .replace(/[áàãâä]/gi, 'a').replace(/[éèêë]/gi, 'e')
    .replace(/[íìîï]/gi, 'i').replace(/[óòõôö]/gi, 'o')
    .replace(/[úùûü]/gi, 'u').replace(/[ç]/gi, 'c')
    .replace(/[ñ]/gi, 'n');

  return (
    INIT +
    CENTER + BOLD_ON + FONT_GDE +
    'PEDIDO #' + numPedido + LF +
    FONT_NOR + BOLD_OFF +
    '================================' + LF +
    LEFT + 'Hora: ' + agora + '   ' + data + LF +
    '================================' + LF + LF +
    LEFT + textoNorm + LF + LF + LF +
    CUT
  );
}

// ── Imprimir via TCP ──────────────────────────────────────────
function imprimirTCP(texto, numPedido) {
  return new Promise((resolve, reject) => {
    if (!IP_IMP) return reject(new Error('IP da impressora não configurado'));
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout TCP (' + IP_IMP + ':' + PORTA_IMP + ')'));
    }, 7000);
    client.connect(PORTA_IMP, IP_IMP, () => {
      const buf = Buffer.from(montarTicket(texto, numPedido), 'binary');
      client.write(buf, () => {
        setTimeout(() => {
          clearTimeout(timeout);
          client.destroy();
          resolve(true);
        }, 400);
      });
    });
    client.on('error', e => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

// ── Confirmar job no servidor ─────────────────────────────────
async function confirmar(jobId) {
  try {
    await httpsPost(`${SERVIDOR}/api/cozinha/jobs/${jobId}/confirmar?token=${TOKEN}`);
  } catch(e) {
    console.warn('[Confirmar] Falha ao confirmar job', jobId, ':', e.message);
  }
}

// ── Buscar jobs pendentes — isolado por adminId ───────────────
async function buscarJobs() {
  try {
    const url = `${SERVIDOR}/api/cozinha/jobs/${ADMIN_ID}?token=${TOKEN}&instancia=cozinha`;
    const d   = await httpsGet(url);
    return d.jobs || [];
  } catch(e) {
    console.warn('[Polling] Erro ao buscar jobs:', e.message);
    return [];
  }
}

// ── Loop de polling ───────────────────────────────────────────
let processando = false;
let totalImpressos = 0;
let totalErros     = 0;

async function tick() {
  if (processando) return;
  processando = true;
  try {
    const jobs = await buscarJobs();
    for (const job of jobs) {
      const num = job.mesa || job.numeroPedido || '?';
      try {
        await imprimirTCP(job.texto, num);
        await confirmar(job._id);
        totalImpressos++;
        console.log(`[OK] #${num} impresso (total: ${totalImpressos})`);
      } catch(e) {
        totalErros++;
        console.error(`[ERRO] Job ${job._id} (#${num}):`, e.message);
      }
    }
  } catch(e) {
    console.error('[ERRO] Loop principal:', e.message);
  }
  processando = false;
}

// ── Servidor HTTP local (status / teste / config) ─────────────
function iniciarHTTP() {
  http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/status') {
      return res.end(JSON.stringify({
        status:       'rodando',
        versao:       'v10',
        restaurante:  NOME_REST,
        adminId:      ADMIN_ID,
        impressora:   (IP_IMP || 'não configurada') + ':' + PORTA_IMP,
        instancia:    'cozinha',
        polling:      INTERVALO + 'ms',
        impressos:    totalImpressos,
        erros:        totalErros,
        uptime:       Math.floor(process.uptime()) + 's'
      }));
    }

    if (req.url === '/testar') {
      imprimirTCP('=== TESTE ===\nRebeca Cozinha v10\n' + NOME_REST, 'TESTE')
        .then(() => res.end(JSON.stringify({ sucesso: true, ip: IP_IMP, porta: PORTA_IMP })))
        .catch(e => res.end(JSON.stringify({ sucesso: false, erro: e.message })));
      return;
    }

    // Redirecionar para status por padrão
    res.end(JSON.stringify({ ok: true, endpoints: ['/status', '/testar'] }));

  }).listen(3333, '127.0.0.1', () => {
    console.log('  HTTP local: http://127.0.0.1:3333/status\n');
  });
}

// ── Boot ──────────────────────────────────────────────────────
async function boot() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   REBECA COZINHA  —  v10 (multi-tenant) ║');
  console.log(`║   Restaurante : ${NOME_REST.padEnd(24)}║`);
  console.log(`║   AdminId     : ${ADMIN_ID.substring(0,24).padEnd(24)}║`);
  console.log(`║   Servidor    : ${SERVIDOR.replace('https://','').substring(0,24).padEnd(24)}║`);
  console.log('╚══════════════════════════════════════════╝\n');

  console.log('[Boot] Buscando config da impressora no servidor...');
  await buscarConfigImpressora();

  console.log(`[Boot] Impressora: ${IP_IMP}:${PORTA_IMP}`);
  console.log(`[Boot] Polling a cada ${INTERVALO/1000}s — instancia: cozinha\n`);
  console.log('  Aguardando pedidos do WhatsApp...\n');

  iniciarHTTP();
  tick(); // imediato
  setInterval(tick, INTERVALO);

  // Atualizar config da impressora a cada 30min (IP pode mudar)
  setInterval(buscarConfigImpressora, 30 * 60 * 1000);
}

boot().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
