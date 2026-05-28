'use strict';
const net  = require('net');
const axios = require('axios');

const TOKEN = process.env.COZINHA_TOKEN || 'cozinha-rebeca-2026';

/**
 * Envia pedido para impressora.
 * Se o IP contiver ":" com porta 3333 ou começar com http → servidor local Node
 * Caso contrário → conexão TCP direta (impressora na mesma rede do servidor)
 */
async function proximoNumeroPedido(adminId) {
  try {
    const doc = await ContadorPedido.findOneAndUpdate(
      { adminId },
      { $inc: { ultimo: 1 } },
      { upsert: true, new: true }
    );
    return doc.ultimo;
  } catch(e) {
    return 0;
  }
}

async function imprimirPedido({ ip, porta = 9100, texto, mesa = '', telefone = '', hora = '', adminId = '' }) {
  // Numerar o pedido
  let numPedido = 0;
  if (adminId) numPedido = await proximoNumeroPedido(adminId);
  const cabecalho = numPedido > 0 ? `*** PEDIDO #${numPedido} ***\n` : '';
  texto = cabecalho + texto;
  // Modo servidor local (PC da cozinha)
  const isServidorLocal = String(porta) === '3333' || ip.startsWith('http');
  if (isServidorLocal) {
    const url = ip.startsWith('http') ? ip : `http://${ip}:3333`;
    // Buscar config da impressora do banco para passar ao servidor local
    let ipImp = '127.0.0.1', portaImp = 9100;
    try {
      const { ImpressoraCozinha } = require('../models/cozinha.model');
      // Encontrar impressora pelo IP do servidor local (adminId vem em _adminId)
      if (adminId) {
        const imp = await ImpressoraCozinha.findOne({ adminId: adminId });
        if (imp) { ipImp = imp.ipImpressora || imp.ip; portaImp = imp.portaImpressora || imp.porta || 9100; }
      }
    } catch(_) {}
    const res = await axios.post(url + '/imprimir', {
      ipImpressora: ipImp,
      portaImpressora: portaImp,
      texto, mesa, nomeCliente: telefone
    }, {
      headers: { 'x-cozinha-token': TOKEN },
      timeout: 8000
    });
    return res.data?.sucesso;
  }

  // Modo TCP direto
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const ESC = '\x1B', GS = '\x1D';
    const INIT     = ESC + '@';
    const BOLD_ON  = ESC + 'E\x01';
    const BOLD_OFF = ESC + 'E\x00';
    const CENTER   = ESC + 'a\x01';
    const LEFT     = ESC + 'a\x00';
    const FONT_GDE = GS  + '!\x11';
    const FONT_NOR = GS  + '!\x00';
    const FEED     = '\n';
    const CUT      = GS  + 'V\x41\x03';

    const agora = hora || new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const data  = new Date().toLocaleDateString('pt-BR');

    let cmd = INIT + LEFT;
    // Se texto já vem formatado (teste, pedido completo), usar direto
    // Caso contrário montar cabeçalho padrão
    const _textoSimples = texto && texto.includes('TESTE');
    if (_textoSimples) {
      cmd += CENTER + BOLD_ON + texto + BOLD_OFF + FEED + FEED + FEED + CUT;
    } else {
      cmd += CENTER + BOLD_ON + FONT_GDE + '*** PEDIDO ***' + FEED + FONT_NOR + BOLD_OFF;
      cmd += '========================' + FEED;
      if (mesa)     cmd += LEFT + BOLD_ON + 'Mesa:   ' + BOLD_OFF + mesa + FEED;
      if (telefone) cmd += LEFT + BOLD_ON + 'Cliente:' + BOLD_OFF + ' ' + telefone + FEED;
      cmd += LEFT + BOLD_ON + 'Hora:   ' + BOLD_OFF + agora + ' ' + data + FEED;
      cmd += '========================' + FEED + LEFT + FEED;
      cmd += texto + FEED + FEED + FEED + CUT;
    }

    client.setTimeout(5000);
    client.connect(porta, ip, () => {
      client.write(cmd, 'binary', () => { client.destroy(); resolve(true); });
    });
    client.on('error', (e) => { console.error('[Impressora] TCP erro:', e.message); reject(e); });
    client.on('timeout', () => { client.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = { imprimirPedido };
