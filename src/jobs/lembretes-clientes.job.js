/**
 * Job de lembretes automáticos para clientes
 * Roda a cada 30 minutos via setInterval — zero IA
 */

let _rodando = false;
let _ultimaExecucao = 0;
const _INTERVALO_MIN = 25 * 60 * 1000; // mínimo 25min entre execuções

async function executar() {
  if (_rodando) return;
  const agora = Date.now();
  if (agora - _ultimaExecucao < _INTERVALO_MIN) return; // debounce
  _rodando = true;
  _ultimaExecucao = agora;
  try {
    console.log('[LembretesJob] 🔔 Rodando lembretes...');
    const { rodarLembretesClientes, rodarLembretesPessoais } = require('../services/agenda-modo-dono.service');
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
