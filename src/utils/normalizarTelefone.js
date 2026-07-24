function normalizarTelefone(raw) {
  if (!raw) return null;
  let tel = String(raw);
  console.log('[Normalizacao] Telefone original recebido:', tel);
  tel = tel.split('@')[0];
  tel = tel.replace(/\D/g, '');
  tel = tel.replace(/^0+/, '');
  console.log('[Normalizacao] Telefone normalizado:', tel);
  return tel;
}
module.exports = { normalizarTelefone };
