'use strict';
const http  = require('http');
const net   = require('net');
const https = require('https');

// ═══════════════════════════════════════════════════════
//  REBECA COZINHA — Servidor Local v8
//  IP DA IMPRESSORA FIXO — não depende do banco/Windows
// ═══════════════════════════════════════════════════════
const ADMIN_ID  = '6a15ecb5e2ad56df1ad2a301';
const TOKEN     = 'cozinha-rebeca-2026';
const IP_IMP    = '192.168.100.223';  // IP FIXO da impressora térmica
const PORTA_IMP = 9100;
const INTERVALO = 5000; // polling a cada 5 segundos

function montarEscPos(texto, numPedido) {
  const ESC = '\x1B', GS = '\x1D';
  const INIT     = ESC + '@';
  const CENTER   = ESC + 'a\x01';
  const LEFT     = ESC + 'a\x00';
  const BOLD_ON  = ESC + 'E\x01';
  const BOLD_OFF = ESC + 'E\x00';
  const FONT_GDE = GS  + '!\x11';
  const FONT_NOR = GS  + '!\x00';
  const FEED = '\n';
  const CUT  = GS + 'V\x41\x03';

  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const data  = new Date().toLocaleDateString('pt-BR');

  let cmd = INIT + CENTER + BOLD_ON + FONT_GDE;
  cmd += '*** PEDIDO #' + numPedido + ' ***' + FEED;
  cmd += FONT_NOR + BOLD_OFF;
  cmd += '================================' + FEED;
  cmd += LEFT + BOLD_ON + 'Hora: ' + BOLD_OFF + agora + '  ' + data + FEED;
  cmd += '================================' + FEED + FEED;
  cmd += LEFT + texto.trim() + FEED + FEED + FEED;
  cmd += CUT;
  return cmd;
}

function imprimir(texto, numPedido) {
  return new Promise((resolve, reject) => {
    const cmd    = montarEscPos(texto, numPedido);
    const client = new net.Socket();
    client.setTimeout(6000);
    client.connect(PORTA_IMP, IP_IMP, () => {
      client.write(cmd, 'binary', () => {
        client.destroy();
        console.log('[OK] Pedido #' + numPedido + ' impresso em ' + IP_IMP + ':' + PORTA_IMP);
        resolve(true);
      });
    });
    client.on('error', e => {
      console.error('[ERRO] Impressora ' + IP_IMP + ':' + PORTA_IMP + ' — ' + e.message);
      reject(e);
    });
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout')); });
  });
}

function confirmarJob(jobId) {
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'rebecasistemas.com.br',
      path: '/api/cozinha/jobs/' + jobId + '/confirmar',
      method: 'POST',
      headers: { 'x-cozinha-token': TOKEN }
    }, () => resolve());
    req.on('error', () => resolve());
    req.end();
  });
}

function buscarJobs() {
  return new Promise(resolve => {
    // instancia=cozinha — garante que só pega jobs da cozinha, nunca do caixa
    const url = 'https://rebecasistemas.com.br/api/cozinha/jobs/' + ADMIN_ID
              + '?token=' + TOKEN + '&instancia=cozinha';
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

let processando = false;
async function tick() {
  if (processando) return;
  processando = true;
  try {
    const jobs = await buscarJobs();
    for (const job of jobs) {
      try {
        await imprimir(job.texto, job.mesa || '?');
        await confirmarJob(job._id);
      } catch(e) {
        console.error('[ERRO] Job ' + job._id + ':', e.message);
      }
    }
  } catch(e) {
    console.error('[ERRO] Loop:', e.message);
  }
  processando = false;
}

setInterval(tick, INTERVALO);
tick(); // rodar imediatamente ao iniciar

// ── Servidor HTTP local (status e teste) ─────────────────────────
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/testar') {
    imprimir('=== TESTE REBECA COZINHA ===\nImpressora conectada e funcionando!', 'TESTE')
      .then(() => res.end(JSON.stringify({ sucesso: true, ip: IP_IMP, porta: PORTA_IMP })))
      .catch(e => res.end(JSON.stringify({ sucesso: false, erro: e.message })));
    return;
  }
  res.end(JSON.stringify({
    status: 'rodando',
    versao: 'v8',
    impressora: IP_IMP,
    porta: PORTA_IMP,
    instancia: 'cozinha',
    adminId: ADMIN_ID
  }));
}).listen(3333, () => {
  console.log('\n================================');
  console.log('  REBECA COZINHA v8');
  console.log('  Impressora: ' + IP_IMP + ':' + PORTA_IMP + ' (FIXO)');
  console.log('  Instancia:  cozinha');
  console.log('  Polling:    a cada 5 segundos');
  console.log('================================');
  console.log('  Aguardando pedidos...\n');
});
