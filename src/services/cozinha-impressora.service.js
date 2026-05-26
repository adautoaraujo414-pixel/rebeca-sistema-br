'use strict';
const net = require('net');

/**
 * Envia texto para impressora térmica via TCP/IP (porta 9100)
 */
async function imprimirPedido({ ip, porta = 9100, texto, mesa = '', telefone = '', hora = '' }) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = 5000;

    // Comandos ESC/POS básicos
    const ESC = '\x1B';
    const GS  = '\x1D';
    const INIT        = ESC + '@';           // inicializar
    const BOLD_ON     = ESC + 'E\x01';
    const BOLD_OFF    = ESC + 'E\x00';
    const CENTER      = ESC + 'a\x01';
    const LEFT        = ESC + 'a\x00';
    const FONT_LARGE  = GS  + '!\x11';      // dobro altura+largura
    const FONT_NORMAL = GS  + '!\x00';
    const FEED        = '\n';
    const CUT         = GS  + 'V\x41\x03'; // corte parcial

    const agora = hora || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const data  = new Date().toLocaleDateString('pt-BR');

    let cmd = '';
    cmd += INIT;
    cmd += CENTER + BOLD_ON + FONT_LARGE;
    cmd += '*** PEDIDO ***' + FEED;
    cmd += FONT_NORMAL + BOLD_OFF;
    cmd += '========================' + FEED;
    if (mesa)     cmd += LEFT + BOLD_ON + 'Mesa: ' + BOLD_OFF + mesa + FEED;
    if (telefone) cmd += LEFT + BOLD_ON + 'Tel:  ' + BOLD_OFF + telefone + FEED;
    cmd += LEFT + BOLD_ON + 'Hora: ' + BOLD_OFF + agora + ' ' + data + FEED;
    cmd += '========================' + FEED;
    cmd += LEFT + FEED;
    cmd += texto + FEED;
    cmd += FEED + FEED + FEED;
    cmd += CUT;

    client.setTimeout(timeout);
    client.connect(porta, ip, () => {
      client.write(cmd, 'binary', () => {
        client.destroy();
        resolve(true);
      });
    });
    client.on('error', (err) => {
      console.error('[Impressora] Erro TCP:', err.message);
      reject(err);
    });
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Timeout ao conectar na impressora'));
    });
  });
}

module.exports = { imprimirPedido };
