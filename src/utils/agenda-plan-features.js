// agenda-plan-features.js
// Plano único: espaco_digital_ia — WhatsApp + IA incluídos
function getAgendaPlanFeatures(plano) {
  const p = plano || 'espaco_digital_ia';
  return {
    plano: p,
    planoNome: 'R$147',
    canUseWhatsappRedirect: true,
    canUseWhatsappAutomation: true,
    canInstallPWA: true,
    canUseBrowserPush: true,
    canReceiveAdminNotifications: true,
    canReceiveClientNotifications: true,
    canUseIA: true,
  };
}
module.exports = { getAgendaPlanFeatures };
