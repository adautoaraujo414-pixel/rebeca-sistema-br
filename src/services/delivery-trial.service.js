const { AdminDelivery } = require('../models/delivery.models');

const DeliveryTrialService = {
    // Roda todo dia — bloqueia trials vencidos
    async verificarTrialsVencidos() {
        try {
            const agora = new Date();
            const vencidos = await AdminDelivery.find({
                status: 'trial',
                trialFim: { $lt: agora }
            });

            if (vencidos.length === 0) return;

            for (const admin of vencidos) {
                await AdminDelivery.findByIdAndUpdate(admin._id, {
                    status: 'bloqueado',
                    motivoBloqueio: 'Trial de 7 dias encerrado sem pagamento'
                });
                console.log('[DELIVERY TRIAL] Bloqueado:', admin.nomeComercio, '|', admin.email);
            }

            console.log('[DELIVERY TRIAL]', vencidos.length, 'conta(s) bloqueada(s) por trial vencido');
        } catch(e) {
            console.error('[DELIVERY TRIAL] Erro no cron:', e.message);
        }
    }
};

module.exports = DeliveryTrialService;
