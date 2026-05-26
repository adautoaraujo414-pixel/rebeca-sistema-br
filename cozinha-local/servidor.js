'use strict';
const http = require('http');
const net  = require('net');

const PORTA_SERVIDOR = 3333;      // porta que a Rebeca vai chamar
const TOKEN          = 'cozinha-rebeca-2026';

// ── IMPRIMIR via ESC/POS ──────────────────────────────────────────
function imprimirNaImpressora(ip, porta, texto, mesa, nomeCliente) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const ESC = '\x1B', GS = '\x1D';
    const INIT      = ESC + '@';
    const BOLD_ON   = ESC + 'E\x01';
    const BOLD_OFF  = ESC + 'E\x00';
    const CENTER    = ESC + 'a\x01';
    const LEFT      = ESC + 'a\x00';
    const FONT_GDE  = GS  + '!\x11';
    const FONT_NOR  = GS  + '!\x00';
    const FEED      = '\n';
    const CUT       = GS  + 'V\x41\x03';

    const hora = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const data = new Date().toLocaleDateString('pt-BR');

    let cmd = INIT;
    cmd += CENTER + BOLD_ON + FONT_GDE + '*** PEDIDO ***' + FEED + FONT_NOR + BOLD_OFF;
    cmd += '========================' + FEED;
    if (mesa)        cmd += LEFT + BOLD_ON + 'Mesa:   ' + BOLD_OFF + mesa + FEED;
    if (nomeCliente) cmd += LEFT + BOLD_ON + 'Cliente:' + BOLD_OFF + ' ' + nomeCliente + FEED;
    cmd += LEFT + BOLD_ON + 'Hora:   ' + BOLD_OFF + hora + ' ' + data + FEED;
    cmd += '========================' + FEED + LEFT + FEED;
    cmd += texto + FEED + FEED + FEED;
    cmd += CUT;

    client.setTimeout(5000);
    client.connect(porta, ip, () => {
      client.write(cmd, 'binary', () => { client.destroy(); resolve(true); });
    });
    client.on('error', (e) => { console.error('[Impressora] Erro:', e.message); reject(e); });
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout')); });
  });
}

// ── SERVIDOR HTTP ─────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-cozinha-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Health check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ ok: true, mensagem: 'Servidor Cozinha rodando ✅' }));
    return;
  }

  // Auth
  const token = req.headers['x-cozinha-token'];
  if (token !== TOKEN) {
    res.writeHead(401, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ erro: 'Token inválido' }));
    return;
  }

  // POST /imprimir
  if (req.method === 'POST' && req.url === '/imprimir') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        // ip/porta da impressora pode vir no body OU usar os campos diretos
        const { texto, mesa, nomeCliente } = parsed;
        const ip    = parsed.ipImpressora || parsed.ip || '127.0.0.1';
        const porta = parsed.portaImpressora || parsed.porta || 9100;
        if (!ip || !texto) {
          res.writeHead(400, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ erro: 'ip e texto obrigatórios' }));
          return;
        }
        console.log(`[Cozinha] Imprimindo pedido de ${nomeCliente||'?'} mesa ${mesa||'?'} na ${ip}:${porta||9100}`);
        await imprimirNaImpressora(ip, porta||9100, texto, mesa||'', nomeCliente||'');
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ sucesso: true }));
        console.log('[Cozinha] ✅ Impresso!');
      } catch(e) {
        console.error('[Cozinha] Erro ao imprimir:', e.message);
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ erro: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORTA_SERVIDOR, '0.0.0.0', () => {
  console.log('');
  console.log('🍽️  REBECA COZINHA — Servidor Local');
  console.log('====================================');
  console.log(`✅ Rodando na porta ${PORTA_SERVIDOR}`);
  console.log('');
  console.log('📋 Próximos passos:');
  console.log('   1. Anote o IP deste computador na rede');
  console.log('   2. Cole no painel: IP_DO_COMPUTADOR:3333');
  console.log('   3. O sistema vai chamar este servidor para imprimir');
  console.log('');
  // Mostrar IPs disponíveis
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  console.log('📡 IPs deste computador:');
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   ${name}: ${net.address}`);
      }
    }
  }
  console.log('');
  console.log('⚠️  Mantenha este terminal aberto!');
  console.log('');
});
