// agenda-plan-features.js
// Helper central de features por plano - SOMENTE Rebeca Agenda
// espaco_digital = R$97 | espaco_digital_ia = R$149
function getAgendaPlanFeatures(plano) {
  const p = plano || 'espaco_digital';
  const isIA = p === 'espaco_digital_ia';
  return {
    plano: p,
    canUseWhatsappRedirect: true,
    canUseWhatsappAutomation: isIA,
    canInstallPWA: true,
    canUseBrowserPush: true,
    canReceiveAdminNotifications: true,
    canReceiveClientNotifications: true,
    canUseIA: isIA,
  };
}
module.exports = { getAgendaPlanFeatures };
