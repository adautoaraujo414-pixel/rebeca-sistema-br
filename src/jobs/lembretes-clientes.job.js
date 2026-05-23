/**
 * Job de lembretes automáticos para clientes
 * Roda a cada 30 minutos via setInterval — zero IA
 */

let _rodando = false;

async function executar() {
  if (_rodando) return;
  _rodando = true;
  try {
    console.log('[LembretesJob] 🔔 Rodando lembretes...');
    const { rodarLembretesClientes } = require('../services/agenda-modo-dono.service');
    const { rodarLembretesPessoais  } = require('../services/agenda-modo-dono.service');
    await rodarLembretesClientes();
    await rodarLembretesPessoais();
    console.log('[LembretesJob] ✅ Concluído');
  } catch(e) {
    console.error('[LembretesJob] ❌ Erro:', e.message);
  } finally {
    _rodando = false;
  }
}

function iniciar() {
  console.log('[LembretesJob] 🚀 Iniciado — a cada 30 minutos');
  executar();
  setInterval(executar, 30 * 60 * 1000);
}

module.exports = { iniciar };
