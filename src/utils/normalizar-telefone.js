// normalizar-telefone.js
// Função única centralizada para normalização de telefones no sistema.
// Usar em: agenda-rebeca-oficial.service.js, agenda-modo-dono.service.js,
//          qualquer serviço que compare telefones via WhatsApp.
//
// REGRA: toda comparação de telefone deve usar normalizarTelefone().
// adminId continua sendo a chave interna — telefone é identificador externo.

'use strict';

/**
 * Normaliza telefone para comparação.
 * Remove tudo que não é dígito, strip zero inicial.
 * @param {string} tel
 * @returns {string}
 */
function normalizarTelefone(tel) {
  if (!tel) return '';
  return String(tel)
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
}

/**
 * Mascara telefone para log seguro — exibe só últimos 4 dígitos.
 * @param {string} tel
 * @returns {string}
 */
function mascararTelefone(tel) {
  const n = normalizarTelefone(tel);
  if (!n || n.length < 4) return '****';
  return '*'.repeat(n.length - 4) + n.slice(-4);
}

/**
 * Compara dois telefones normalizados.
 * Aceita match parcial (sufixo) para cobrir variações de DDI.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function telefonesIguais(a, b) {
  const na = normalizarTelefone(a);
  const nb = normalizarTelefone(b);
  if (!na || !nb) return false;
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
}

/**
 * Verifica se telefone normalizado está na lista de autorizados.
 * @param {string} tel
 * @param {string[]} lista
 * @returns {boolean}
 */
function telefoneAutorizado(tel, lista = []) {
  const n = normalizarTelefone(tel);
  if (!n) return false;
  return lista.map(normalizarTelefone).some(c => c && telefonesIguais(n, c));
}

/**
 * Atualiza telefonePrincipalNormalizado no AdminAgenda se necessário.
 * Deve ser chamado após identificar o admin pelo telefone.
 * @param {object} AdminAgendaModel — mongoose model
 * @param {string} adminId
 * @param {string} telNorm — telefone já normalizado
 */
async function atualizarTelefonePrincipal(AdminAgendaModel, adminId, telNorm) {
  if (!adminId || !telNorm) return;
  try {
    const admin = await AdminAgendaModel.findById(adminId)
      .select('modoWhatsappDono')
      .lean();
    const atual = admin?.modoWhatsappDono?.telefonePrincipalNormalizado || '';
    if (atual !== telNorm) {
      await AdminAgendaModel.findByIdAndUpdate(adminId, {
        'modoWhatsappDono.telefonePrincipalNormalizado': telNorm
      });
    }
  } catch (e) {
    // Não crítico — logar sem expor dados
    console.warn('[normalizarTelefone] Falha ao atualizar telefonePrincipal:', e.message);
  }
}

module.exports = {
  normalizarTelefone,
  mascararTelefone,
  telefonesIguais,
  telefoneAutorizado,
  atualizarTelefonePrincipal
};
