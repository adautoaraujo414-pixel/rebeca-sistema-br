'use strict';
const http = require('http');
const net  = require('net');
const https = require('https');

const ADMIN_ID  = '6a15ecb5e2ad56df1ad2a301';
const TOKEN     = 'cozinha-rebeca-2026';
const API       = 'https://rebecasistemas.com.br';
const IP_IMP    = '192.168.100.115';
const PORTA_IMP = 9100;
const INTERVALO = 8000;

function montarEscPos(texto, numPedido) {
  const ESC = '\x1B', GS = '\x1D';
  const INIT    = ESC + '@';
  const CENTER  = ESC + 'a\x01';
  const LEFT    = ESC + 'a\x00';
  const BOLD_ON = ESC + 'E\x01';
  const BOLD_OFF= ESC + 'E\x00';
  const FONT_GDE= GS  + '!\x11';
  const FONT_NOR= GS  + '!\x00';
  const FEED    = '\n';
  const CUT     = GS  + 'V\x41\x03';
  const agora   = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const data    = new Date().toLocaleDateString('pt-BR');
  let cmd = INIT + CENTER + BOLD_ON + FONT_GDE;
  cmd += '*** PEDIDO #' + numPedido + ' ***' + FEED;
  cmd += FONT_NOR + BOLD_OFF;
  cmd += '========================' + FEED;
  cmd += LEFT + BOLD_ON + 'Hora: ' + BOLD_OFF + agora + ' - ' + data + FEED;
  cmd += '========================' + FEED + FEED;
  cmd += LEFT + texto + FEED + FEED + FEED + CUT;
  return cmd;
}

function imprimir(texto, numPedido) {
  return new Promise((resolve, reject) => {
    const cmd = montarEscPos(texto, numPedido);
    const client = new net.Socket();
    client.setTimeout(6000);
    client.connect(PORTA_IMP, IP_IMP, () => {
      client.write(cmd, 'binary', () => {
        client.destroy();
        console.log('[OK] Pedido #' + numPedido + ' impresso!');
        resolve(true);
      });
    });
    client.on('error', e => { console.error('[ERRO] Impressora:', e.message); reject(e); });
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout')); });
  });
}

function apiPost(path) {
  return new Promise(resolve => {
    const req = https.request(
      { hostname: 'rebecasistemas.com.br', path, method: 'POST', headers: { 'x-cozinha-token': TOKEN } },
      () => resolve()
    );
    req.on('error', () => resolve());
    req.end();
  });
}

function buscarJobs() {
  return new Promise(resolve => {
    const req = https.get(
      'https://rebecasistemas.com.br/api/cozinha/jobs/' + ADMIN_ID + '?token=' + TOKEN,
      res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data).jobs || []); }
          catch(e) { resolve([]); }
        });
      }
    );
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
        await apiPost('/api/cozinha/jobs/' + job._id + '/confirmar');
      } catch(e) {
        console.error('[ERRO] Job ' + job._id + ':', e.message);
      }
    }
  } catch(e) { console.error('[ERRO] Loop:', e.message); }
  processando = false;
}

setInterval(tick, INTERVALO);
tick();

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/testar') {
    imprimir('TESTE REBECA COZINHA\nImpressora OK!', 'TESTE')
      .then(() => res.end(JSON.stringify({ sucesso: true })))
      .catch(e => res.end(JSON.stringify({ erro: e.message })));
    return;
  }
  res.end(JSON.stringify({ status: 'rodando', impressora: IP_IMP, porta: PORTA_IMP }));
}).listen(3333, () => {
  console.log('');
  console.log('================================');
  console.log('  REBECA COZINHA - ATIVO');
  console.log('  Impressora: ' + IP_IMP + ':' + PORTA_IMP);
  console.log('  Polling: a cada 8 segundos');
  console.log('  Teste: http://localhost:3333/testar');
  console.log('================================');
  console.log('');
});
