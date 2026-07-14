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

function montarBufferEscPos({ cliente, telefone, texto, dataHora }) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://127.0.0.1:9100', // nao é usado, so pra instanciar
    width: 32,
    removeSpecialCharacters: false,
  });

  printer.alignCenter();
  printer.bold(true);
  printer.println('NOVO PEDIDO - WHATSAPP');
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  if (cliente) printer.println(`Cliente: ${cliente}`);
  if (telefone) printer.println(`Telefone: ${telefone}`);
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
    console.log('[Impressora-WS] Nova conexao de impressora:', ip);

    ultimaConexao = ws;
    // TODO: quando tivermos mais de um cliente, a impressora precisa
    // mandar um identificador (adminId) na conexao. Por enquanto
    // guardamos so a ultima conexao (funciona pra 1 cliente).

    ws.on('message', (msg) => {
      console.log('[Impressora-WS] Mensagem recebida da impressora:', msg.toString());
    });

    ws.on('close', () => {
      console.log('[Impressora-WS] Impressora desconectou:', ip);
      if (ultimaConexao === ws) ultimaConexao = null;
    });

    ws.on('error', (erro) => {
      console.error('[Impressora-WS] Erro na conexao:', erro.message);
    });
  });

  console.log('[Impressora-WS] Servidor WebSocket pronto em /ws/impressora');
}

function imprimir({ cliente, telefone, texto, dataHora, adminId }) {
  const conexao = (adminId && impressorasConectadas.get(adminId)) || ultimaConexao;

  if (!conexao || conexao.readyState !== WebSocket.OPEN) {
    console.error('[Impressora-WS] ERRO: nenhuma impressora conectada no momento.');
    return false;
  }

  try {
    const buffer = montarBufferEscPos({ cliente, telefone, texto, dataHora });
    conexao.send(buffer, { binary: true });
    console.log('[Impressora-WS] Buffer enviado para a impressora.');
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
