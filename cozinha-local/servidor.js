'use strict';
const http  = require('http');
const net   = require('net');
const https = require('https');

// ═══════════════════════════════════════════════════════════════
//  REBECA COZINHA — Servidor Local v9
//  Fluxo: WhatsApp → Render → JobImpressao (banco) → este exe
//         → TCP direto na impressora da cozinha
//  NÃO interfere no fluxo do caixa nem no roteamento do bot
// ═══════════════════════════════════════════════════════════════
const ADMIN_ID  = '6a15ecb5e2ad56df1ad2a301';
const TOKEN     = 'cozinha-rebeca-2026';
const IP_IMP    = '192.168.100.223';   // impressora ELGIN i9 COZINHA — fixo
const PORTA_IMP = 9100;
const INTERVALO = 5000;

// ── Formatar ticket ESC/POS ───────────────────────────────────────────────
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

  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const data  = new Date().toLocaleDateString('pt-BR');

  return (
    INIT +
    CENTER + BOLD_ON + FONT_GDE +
    'PEDIDO #' + numPedido + LF +
    FONT_NOR + BOLD_OFF +
    '================================' + LF +
    LEFT + 'Hora: ' + agora + '   ' + data + LF +
    '================================' + LF + LF +
    LEFT + String(texto).trim() + LF + LF + LF +
    CUT
  );
}

// ── Imprimir via TCP direto na ELGIN i9 ──────────────────────────────────
function imprimirTCP(texto, numPedido) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(7000);
    client.connect(PORTA_IMP, IP_IMP, () => {
      const buf = Buffer.from(montarTicket(texto, numPedido), 'binary');
      client.write(buf, () => {
        setTimeout(() => { client.destroy(); resolve(true); }, 400);
      });
    });
    client.on('error',   e => { console.error('[ERRO impressora]', e.message); reject(e); });
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout TCP')); });
  });
}

// ── Confirmar job no Render (marca como impresso) ─────────────────────────
function confirmar(jobId) {
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'rebecasistemas.com.br',
      path: '/api/cozinha/jobs/' + jobId + '/confirmar',
      method: 'POST',
      headers: { 'x-cozinha-token': TOKEN }
    }, () => resolve());
    req.on('error', () => resolve());
    req.setTimeout(8000, () => { req.destroy(); resolve(); });
    req.end();
  });
}

// ── Buscar jobs pendentes da cozinha ──────────────────────────────────────
// instancia=cozinha garante que jobs do caixa nunca são pegos aqui
function buscarJobs() {
  return new Promise(resolve => {
    const url = 'https://rebecasistemas.com.br/api/cozinha/jobs/'
              + ADMIN_ID + '?token=' + TOKEN + '&instancia=cozinha';
    const req = https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).jobs || []); }
        catch(e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
  });
}

// ── Loop de polling ───────────────────────────────────────────────────────
let processando = false;
async function tick() {
  if (processando) return;
  processando = true;
  try {
    const jobs = await buscarJobs();
    for (const job of jobs) {
      try {
        await imprimirTCP(job.texto, job.mesa || '?');
        await confirmar(job._id);
        console.log('[OK] Pedido #' + (job.mesa || '?') + ' impresso');
      } catch(e) {
        console.error('[ERRO] Job', job._id, ':', e.message);
      }
    }
  } catch(e) {
    console.error('[ERRO] Loop:', e.message);
  }
  processando = false;
}

setInterval(tick, INTERVALO);
tick(); // rodar imediatamente ao abrir

// ── Servidor HTTP local (status / teste) ──────────────────────────────────
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.url === '/testar') {
    imprimirTCP('=== TESTE ===\nImpressora cozinha OK!', 'TESTE')
      .then(() => res.end(JSON.stringify({ sucesso: true, ip: IP_IMP, porta: PORTA_IMP })))
      .catch(e => res.end(JSON.stringify({ sucesso: false, erro: e.message })));
    return;
  }

  res.end(JSON.stringify({
    status: 'rodando',
    versao: 'v9',
    impressora: IP_IMP + ':' + PORTA_IMP,
    instancia: 'cozinha',
    adminId: ADMIN_ID,
    polling: INTERVALO + 'ms'
  }));

}).listen(3333, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   REBECA COZINHA  —  v9              ║');
  console.log('║   Impressora : ' + IP_IMP + ':' + PORTA_IMP + '   ║');
  console.log('║   Instancia  : cozinha (fixo)        ║');
  console.log('║   Polling    : a cada 5 segundos     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('  Aguardando pedidos do WhatsApp...\n');
});
