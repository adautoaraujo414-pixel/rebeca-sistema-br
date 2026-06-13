const webpush = require('web-push');

const VAPID_PUBLIC = 'BIGzUBYI6sKKNG-KjeTMjPBri2j8Qc2qnLScEAn8vWIktNgM7_SRk-nE8U7KK7SuMORMOAkN0QSGXma62mCZUhc';
const VAPID_PRIVATE = 'lYrx40nlvnfJQP5cIKy98a9olwe_TuMiWRlAhnJvBSY';

webpush.setVapidDetails('mailto:contato@rebeca.app', VAPID_PUBLIC, VAPID_PRIVATE);

// Subscriptions em memória + persistência no banco
const subscriptions = new Map();

// Restaurar subscriptions do banco ao iniciar (evita perda no restart do servidor)
async function restaurarSubscriptions() {
    try {
        const { Motorista } = require('../models');
        const motoristas = await Motorista.find(
            { pushSubscription: { $exists: true, $ne: null } },
            { _id: 1, pushSubscription: 1, nomeCompleto: 1 }
        ).lean();
        let restaurados = 0;
        for (const m of motoristas) {
            try {
                const sub = JSON.parse(m.pushSubscription);
                if (sub && sub.endpoint) {
                    subscriptions.set(m._id.toString(), sub);
                    restaurados++;
                }
            } catch(_e) {}
        }
        console.log(`[PUSH] ${restaurados} subscriptions restauradas do banco`);
    } catch(e) {
        console.log('[PUSH] Erro restaurar subscriptions:', e.message);
    }
}
// Executar após 5s para garantir que o banco já conectou
setTimeout(restaurarSubscriptions, 5000);

const PushService = {
    VAPID_PUBLIC,

    async salvarSubscription(motoristaId, subscription) {
        subscriptions.set(motoristaId.toString(), subscription);
        // Persistir no banco
        try {
            const { Motorista } = require('../models');
            await Motorista.findByIdAndUpdate(motoristaId, { pushSubscription: JSON.stringify(subscription) });
        } catch(e) { console.log('[PUSH] Erro ao persistir:', e.message); }
        console.log('[PUSH] Subscription salva para motorista:', motoristaId);
    },

    removerSubscription(motoristaId) {
        subscriptions.delete(motoristaId.toString());
    },

    async getSubscription(motoristaId) {
        const id = motoristaId.toString();
        if (subscriptions.has(id)) return subscriptions.get(id);
        // Buscar do banco
        try {
            const { Motorista } = require('../models');
            const m = await Motorista.findById(motoristaId);
            if (m && m.pushSubscription) {
                const sub = JSON.parse(m.pushSubscription);
                subscriptions.set(id, sub);
                return sub;
            }
        } catch(e) {}
        return null;
    },

    async enviarParaMotorista(motoristaId, dados) {
        const sub = await PushService.getSubscription(motoristaId);
        if (!sub) return false;

        try {
            await webpush.sendNotification(sub, JSON.stringify(dados));
            console.log('[PUSH] Enviado para motorista:', motoristaId);
            return true;
        } catch (e) {
            console.log('[PUSH] Erro:', e.statusCode || e.message);
            if (e.statusCode === 410 || e.statusCode === 404) {
                subscriptions.delete(motoristaId.toString());
                try { const { Motorista } = require('../models'); await Motorista.findByIdAndUpdate(motoristaId, { $unset: { pushSubscription: 1 } }); } catch(e2) {}
            }
            return false;
        }
    },

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
            console.log('[PUSH] Erro:', e.message);
            return 0;
        }
    },

    async notificarNovaCorrida(adminId, corrida) {
        const tipo = corrida.tipo === 'encomenda' ? '📦 NOVA ENCOMENDA!' : '🚗 NOVA CORRIDA!';
        const valor = 'R$ ' + (corrida.precoEstimado || 0).toFixed(2);
        const _camisa = corrida.aparenciaCliente || '';
        const _corpoTexto = valor + ' — ' + (corrida.clienteNome || 'Cliente') + (_camisa ? ' | 👕 ' + _camisa : '');
        return await PushService.enviarParaDisponiveis(adminId, {
            titulo: tipo, corpo: _corpoTexto,
            corridaId: corrida._id, tipo: 'nova_corrida',
            clienteFoto: corrida.clienteFoto || null,
            clienteNome: corrida.clienteNome || 'Cliente',
            clienteTelefone: corrida.clienteTelefone || '',
            aparenciaCliente: _camisa,
            origem: corrida.enderecoOrigemTexto || corrida.origem?.endereco || '',
            destino: corrida.enderecoDestinoTexto || corrida.destino?.endereco || '',
            observacao: corrida.observacao || corrida.referencia || '',
            precoEstimado: corrida.precoEstimado || 0
        });
    },

    async notificarUrgenciaMotorista(motoristaId, corrida, nomeCliente) {
        return await PushService.enviarParaMotorista(motoristaId, {
            titulo: '🚨 CLIENTE URGENTE!',
            corpo: (nomeCliente || 'Cliente') + ' está esperando — responda agora!',
            corridaId: corrida._id,
            tipo: 'urgencia_cliente',
            urgente: true,
            prioridade: 'urgente'
        });
    },

    async notificarCancelamento(motoristaId, corrida) {
        return await PushService.enviarParaMotorista(motoristaId, {
            titulo: '❌ Corrida Cancelada', corpo: 'O cliente cancelou a corrida',
            corridaId: corrida._id, tipo: 'cancelamento'
        });
    },
    // Notificar motorista específico (chat, status, etc.)
    async notificarMotorista(motoristaId, { titulo, corpo, tipo, corridaId }) {
        try {
            const { Motorista } = require('../models');
            const mot = await Motorista.findById(motoristaId).select('pushToken fcmToken');
            if (!mot?.pushToken && !mot?.fcmToken) return { sucesso: false };
            const token = mot.pushToken || mot.fcmToken;
            return await PushService._enviar(token, titulo, corpo, { tipo, corridaId: corridaId?.toString() });
        } catch(e) {
            console.log('[PUSH] notificarMotorista erro:', e.message);
            return { sucesso: false };
        }
    }

};

module.exports = PushService;
