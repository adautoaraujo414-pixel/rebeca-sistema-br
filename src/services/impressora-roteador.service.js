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

async function buscarAdminIdPorTelefone(telefone) {
  const tel = normalizarTelefone(telefone);
  if (!tel) return null;

  const cadastro = await ImpressoraCadastro.findOne({ telefone: tel, ativo: true });
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
