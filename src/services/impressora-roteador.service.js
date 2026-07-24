// ===================================================================
// Roteador isolado: recebe um telefone (quem mandou msg no WhatsApp),
// busca o adminId cadastrado, e manda pra impressora certa.
// Nao depende de nenhum outro modulo alem do model de cadastro
// e do servico de websocket da impressora.
// ===================================================================

const ImpressoraCadastro = require('../models/ImpressoraCadastro.model');
const { imprimir, impressoraConectada } = require('./impressora-websocket.service');

function normalizarTelefone(telefone) {
  if (!telefone) return '';
  return telefone.replace(/\D/g, ''); // so numeros
}

function gerarVariantesTelefone(tel) {
  // Gera variantes com e sem o 9o digito, para celulares BR no formato 55DDNNNNNNNNN
  const variantes = new Set([tel]);

  // Formato: 55 + DD (2 digitos) + numero (8 ou 9 digitos)
  const match = tel.match(/^55(\d{2})(\d{8,9})$/);
  if (match) {
    const ddd = match[1];
    const numero = match[2];
    if (numero.length === 9 && numero[0] === '9') {
      variantes.add('55' + ddd + numero.slice(1)); // remove o 9
    } else if (numero.length === 8) {
      variantes.add('55' + ddd + '9' + numero); // adiciona o 9
    }
  }

  return [...variantes];
}

async function buscarAdminIdPorTelefone(telefone) {
  const tel = normalizarTelefone(telefone);
  if (!tel) return null;

  const variantes = gerarVariantesTelefone(tel);
  const cadastro = await ImpressoraCadastro.findOne({ telefone: { $in: variantes }, ativo: true });

  if (cadastro) {
    console.log('[Impressora-Roteador] Telefone', tel, 'encontrado via variante:', cadastro.telefone);
  }

  return cadastro ? cadastro.adminId : null;
}

async function imprimirParaTelefone({ telefone, cliente, texto, dataHora }) {
  const adminId = await buscarAdminIdPorTelefone(telefone);

  if (!adminId) {
    console.log('[Impressora-Roteador] Telefone nao cadastrado para impressao:', telefone);
    return { ok: false, motivo: 'nao_cadastrado' };
  }

  const enviado = imprimir({ cliente, telefone, texto, dataHora, adminId });

  if (!enviado) {
    console.log('[Impressora-Roteador] Impressora nao conectada para adminId:', adminId);
    return { ok: false, motivo: 'impressora_offline', adminId };
  }

  return { ok: true, adminId };
}

async function cadastrarTelefone({ telefone, adminId, nomeCliente }) {
  const tel = normalizarTelefone(telefone);
  if (!tel || !adminId) {
    throw new Error('telefone e adminId sao obrigatorios');
  }

  const doc = await ImpressoraCadastro.findOneAndUpdate(
    { telefone: tel },
    { telefone: tel, adminId, nomeCliente: nomeCliente || '', ativo: true },
    { upsert: true, new: true }
  );

  return doc;
}

module.exports = { imprimirParaTelefone, cadastrarTelefone, buscarAdminIdPorTelefone };
