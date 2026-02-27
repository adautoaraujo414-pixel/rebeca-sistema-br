const webpush = require('web-push');

const VAPID_PUBLIC = 'BIGzUBYI6sKKNG-KjeTMjPBri2j8Qc2qnLScEAn8vWIktNgM7_SRk-nE8U7KK7SuMORMOAkN0QSGXma62mCZUhc';
const VAPID_PRIVATE = 'lYrx40nlvnfJQP5cIKy98a9olwe_TuMiWRlAhnJvBSY';

webpush.setVapidDetails('mailto:contato@rebeca.app', VAPID_PUBLIC, VAPID_PRIVATE);

// Armazenar subscriptions em memória (idealmente salvar no banco)
const subscriptions = new Map(); // motoristaId -> subscription

const PushService = {
    VAPID_PUBLIC,

    salvarSubscription(motoristaId, subscription) {
        subscriptions.set(motoristaId.toString(), subscription);
        console.log('[PUSH] Subscription salva para motorista:', motoristaId);
    },

    removerSubscription(motoristaId) {
        subscriptions.delete(motoristaId.toString());
    },

    async enviarParaMotorista(motoristaId, dados) {
        const sub = subscriptions.get(motoristaId.toString());
        if (!sub) {
            console.log('[PUSH] Sem subscription para motorista:', motoristaId);
            return false;
        }

        try {
            await webpush.sendNotification(sub, JSON.stringify(dados));
            console.log('[PUSH] Enviado para motorista:', motoristaId);
            return true;
        } catch (e) {
            console.log('[PUSH] Erro:', e.statusCode || e.message);
            if (e.statusCode === 410 || e.statusCode === 404) {
                subscriptions.delete(motoristaId.toString());
                console.log('[PUSH] Subscription expirada, removida');
            }
            return false;
        }
    },

    // Enviar para TODOS os motoristas disponíveis de um admin
    async enviarParaDisponiveis(adminId, dados) {
        try {
            const { Motorista } = require('../models');
            const motoristas = await Motorista.find({ adminId, status: 'disponivel' });
            let enviados = 0;
            for (const m of motoristas) {
                const ok = await PushService.enviarParaMotorista(m._id, dados);
                if (ok) enviados++;
            }
            console.log('[PUSH] Enviado para', enviados, 'de', motoristas.length, 'motoristas');
            return enviados;
        } catch (e) {
            console.log('[PUSH] Erro ao enviar para disponíveis:', e.message);
            return 0;
        }
    },

    // Push de nova corrida
    async notificarNovaCorrida(adminId, corrida) {
        const tipo = corrida.tipo === 'encomenda' ? '📦 NOVA ENCOMENDA!' : '🚗 NOVA CORRIDA!';
        const valor = 'R$ ' + (corrida.precoEstimado || 0).toFixed(2);
        return await PushService.enviarParaDisponiveis(adminId, {
            titulo: tipo,
            corpo: valor + ' - ' + (corrida.clienteNome || 'Cliente'),
            corridaId: corrida._id,
            tipo: 'nova_corrida'
        });
    },

    // Push de cancelamento
    async notificarCancelamento(motoristaId, corrida) {
        return await PushService.enviarParaMotorista(motoristaId, {
            titulo: '❌ Corrida Cancelada',
            corpo: 'O cliente cancelou a corrida',
            corridaId: corrida._id,
            tipo: 'cancelamento'
        });
    }
};

module.exports = PushService;
