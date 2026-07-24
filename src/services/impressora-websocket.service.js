// ===================================================================
// Impressora via WebSocket - conecta a impressora WiFi (modo client)
// direto no nosso backend, sem precisar de port forward nem CGNAT.
// A impressora conecta PRA FORA (saida), entao funciona em qualquer
// rede, mesmo atras de CGNAT da operadora.
// ===================================================================

const WebSocket = require('ws');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

// Guarda as conexoes de impressoras conectadas, por adminId.
// Por enquanto so temos 1 cliente (34237000), entao mapeamos por
// adminId assim que a gente descobrir um jeito de identificar - por
// enquanto guarda tambem uma conexao "padrao" (ultima que conectou).
const impressorasConectadas = new Map();
let ultimaConexao = null;

let contadorPedido = 0;
let diaContadorAtual = null;

function diaDeNegocioAtual() {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  if (agora.getHours() < 6) {
    agora.setDate(agora.getDate() - 1);
  }
  return agora.toISOString().slice(0, 10);
}

function proximoNumeroPedido() {
  const diaAtual = diaDeNegocioAtual();
  if (diaAtual !== diaContadorAtual) {
    diaContadorAtual = diaAtual;
    contadorPedido = 0;
    console.log('[Impressora-WS] Contador de pedidos zerado. Novo dia de negocio:', diaAtual);
  }
  contadorPedido += 1;
  return contadorPedido;
}

function montarBufferEscPos({ numeroPedido, texto, dataHora }) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://127.0.0.1:9100',
    width: 32,
    removeSpecialCharacters: false,
  });

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(`PEDIDO #${numeroPedido}`);
  printer.setTextNormal();
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Data: ${dataHora || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  printer.drawLine();

  printer.setTextNormal();
  printer.println(texto || '[sem conteudo]');

  printer.drawLine();
  printer.cut();

  return printer.getBuffer();
}

function attachImpressoraWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws/impressora' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    const url = new URL(req.url, 'http://localhost');
    const adminId = url.searchParams.get('adminId');

    console.log('[Impressora-WS] Nova conexao de impressora:', ip, '| adminId:', adminId || '(nenhum - modo legado)');

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    if (adminId) {
      const anterior = impressorasConectadas.get(adminId);
      if (anterior && anterior !== ws) {
        console.log('[Impressora-WS] Substituindo conexao antiga. adminId:', adminId);
        try { anterior.terminate(); } catch (e) {}
      }
      impressorasConectadas.set(adminId, ws);
      console.log('[Impressora-WS] Bridges com adminId conectados:', [...impressorasConectadas.keys()]);
    } else {
      ultimaConexao = ws;
    }

    ws.on('message', (msg, isBinary) => {
      if (!isBinary) {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.tipo === 'resultado_impressao') {
            console.log('[Impressora-WS] Confirmacao do bridge. adminId:', adminId, parsed);
            return;
          }
        } catch (e) {}
      }
      console.log('[Impressora-WS] Mensagem recebida da impressora:', isBinary ? '[binario]' : msg.toString());
    });

    ws.on('close', () => {
      console.log('[Impressora-WS] Impressora desconectou:', ip, '| adminId:', adminId || '(nenhum)');
      if (ultimaConexao === ws) ultimaConexao = null;
      if (adminId) {
        const atual = impressorasConectadas.get(adminId);
        if (atual === ws) impressorasConectadas.delete(adminId);
      }
    });

    ws.on('error', (erro) => {
      console.error('[Impressora-WS] Erro na conexao:', erro.message);
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  wss.on('close', () => clearInterval(heartbeatInterval));

  console.log('[Impressora-WS] Servidor WebSocket pronto em /ws/impressora');
}

function imprimir({ cliente, telefone, texto, dataHora, adminId }) {
  const conexao = (adminId && impressorasConectadas.get(adminId)) || ultimaConexao;

  if (!conexao || conexao.readyState !== WebSocket.OPEN) {
    console.error('[Impressora-WS] ERRO: nenhuma impressora conectada no momento.');
    return false;
  }

  try {
    const numeroPedido = proximoNumeroPedido();
    const buffer = montarBufferEscPos({ numeroPedido, texto, dataHora });
    conexao.send(buffer, { binary: true });
    console.log('[Impressora-WS] Buffer enviado para a impressora. Pedido #' + numeroPedido);
    return true;
  } catch (erro) {
    console.error('[Impressora-WS] ERRO ao montar/enviar buffer:', erro.message);
    return false;
  }
}

function impressoraConectada() {
  return !!(ultimaConexao && ultimaConexao.readyState === WebSocket.OPEN);
}

module.exports = { attachImpressoraWebSocket, imprimir, impressoraConectada };
