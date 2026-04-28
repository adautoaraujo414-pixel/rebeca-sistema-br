/**
 * CARDÁPIO DO DIA — DELIVERY
 * Rebeca pergunta o cardápio ao adm às 7h e envia para assinantes às 8h
 * 100% ISOLADO do sistema de corridas
 */

const { CardapioDia, MensalidadeClienteDelivery, ConfigDelivery } = require('../models/delivery.models');
const { InstanciaWhatsapp } = require('../models');
const EvolutionMultiService = require('./evolution-multi.service');

// Estado em memória: aguardando resposta do adm
const _aguardandoCardapio = new Map(); // adminId -> { ts, instanciaId }

const CardapioDiaService = {

    // ============================================================
    // CRON 7h — Perguntar cardápio ao adm delivery
    // ============================================================
    async perguntarCardapioAdms() {
        console.log('[CARDAPIO-DIA] Iniciando pergunta do cardápio...');
        try {
            const { AdminDelivery } = require('../models/delivery.models');
            // Só pergunta para admins que ativaram o cardápio do dia
            const admins = await AdminDelivery.find({ cardapioAtivoAssinantes: true, status: { $in: ['ativo','trial'] } }).lean();
            console.log('[CARDAPIO-DIA]', admins.length, 'admins com cardápio ativo');
            for (const admin of admins) {
                try {
                    await this.perguntarCardapioAdmin(admin._id.toString());
                } catch(e) {
                    console.error('[CARDAPIO-DIA] Erro admin', admin._id, e.message);
                }
            }
        } catch(e) {
            console.error('[CARDAPIO-DIA] Erro geral:', e.message);
        }
    },

    async perguntarCardapioAdmin(adminId) {
        // Buscar instância whatsapp do admin delivery
        const { AdminDelivery } = require('../models/delivery.models');
        const admin = await AdminDelivery.findById(adminId).lean();
        if (!admin?.cardapioAtivoAssinantes) return;
        const telDono = admin?.telefoneDono || admin?.telefone;
        if (!telDono) return;
        const instancia = await InstanciaWhatsapp.findOne({ adminId }).lean();
        if (!instancia) return;

        const nomeRest = (await ConfigDelivery.findOne({ adminId }).lean())?.nomeRestaurante || 'seu restaurante';
        const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

        const msg = `🌅 *Bom dia!* Eu sou a Rebeca, sua assistente do ${nomeRest}! 🍽️\n\n`
            + `Hoje é ${hoje} e eu já tô aqui na posição, animada pra trabalhar! 🎉\n\n`
            + `Me conta: *qual é o cardápio do dia de hoje?* 📝\n\n`
            + `Pode mandar assim:\n_Arroz, feijão, frango grelhado, salada e suco_\n\n`
            + `Que eu cuido do resto com muito carinho! 💪`;

        await EvolutionMultiService.enviarMensagem(instancia._id.toString(), telDono, msg);
        _aguardandoCardapio.set(adminId, { ts: Date.now(), instanciaId: instancia._id.toString() });
        console.log('[CARDAPIO-DIA] Pergunta enviada para admin', adminId);
    },

    // ============================================================
    // Verificar se mensagem do adm é resposta do cardápio
    // ============================================================
    isRespostaCardapio(adminId) {
        const estado = _aguardandoCardapio.get(adminId);
        if (!estado) return false;
        // Janela de 2 horas para responder
        if (Date.now() - estado.ts > 2 * 60 * 60 * 1000) {
            _aguardandoCardapio.delete(adminId);
            return false;
        }
        return true;
    },

    async salvarEEnviarCardapio(adminId, descricao, instanciaId) {
        const hoje = new Date().toISOString().split('T')[0];
        
        // Salvar cardápio do dia
        await CardapioDia.findOneAndUpdate(
            { adminId, data: hoje },
            { adminId, data: hoje, descricao, enviado: false },
            { upsert: true, new: true }
        );
        _aguardandoCardapio.delete(adminId);

        // Confirmar para o adm
        const { AdminDelivery } = require('../models/delivery.models');
        const admin = await AdminDelivery.findById(adminId).lean();
        const telDono = admin?.telefoneDono || admin?.telefone;
        const instancia = await InstanciaWhatsapp.findOne({ adminId }).lean();
        if (telDono && instancia) {
            await EvolutionMultiService.enviarMensagem(
                instancia._id.toString(), telDono,
                `✅ *Anotado!* Cardápio de hoje registrado:\n\n_${descricao}_\n\n`
                + `Vou mandar para todos os assinantes agora mesmo! 🚀💚`
            );
        }

        // Enviar imediatamente para assinantes
        await this.enviarCardapioAssinantes(adminId, descricao);
        return true;
    },

    // ============================================================
    // Enviar cardápio para todos os assinantes ativos
    // ============================================================
    async enviarCardapioAssinantes(adminId, descricao) {
        try {
            const assinantes = await MensalidadeClienteDelivery.find({ 
                adminId, status: 'ativo' 
            }).lean();

            if (!assinantes.length) return 0;

            const instancia = await InstanciaWhatsapp.findOne({ adminId, ativa: true }).lean();
            if (!instancia) return 0;

            const config = await ConfigDelivery.findOne({ adminId }).lean();
            const nomeRest = config?.nomeRestaurante || 'Restaurante';
            const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

            let enviados = 0;
            for (const assinante of assinantes) {
                try {
                    const saudacao = this._saudacao();
                    let msg = `${saudacao} *${assinante.nome}*! 🌟\n\n`
                        + `Aqui é a Rebeca do *${nomeRest}*! 😊\n\n`
                        + `🍽️ *Cardápio de hoje* — ${hoje}:\n\n`
                        + `_${descricao}_\n\n`;

                    if (assinante.restricoes) {
                        msg += `⚠️ Lembrei das suas preferências: _${assinante.restricoes}_\n\n`;
                    }

                    msg += `🕐 Entrega prevista: *${assinante.horarioEntrega || '12:00'}*\n\n`
                        + `Quer fazer alguma alteração? Me fala que eu anoto! ✍️\n`
                        + `_(Responda até 30 min antes do horário de entrega)_`;

                    await EvolutionMultiService.enviarMensagem(instancia._id.toString(), assinante.telefone, msg);
                    enviados++;
                    // Aguardar 1s entre envios para não sobrecarregar
                    await new Promise(r => setTimeout(r, 1000));
                } catch(e) {
                    console.error('[CARDAPIO-DIA] Erro ao enviar para', assinante.telefone, e.message);
                }
            }

            // Marcar como enviado
            const hoje2 = new Date().toISOString().split('T')[0];
            await CardapioDia.findOneAndUpdate(
                { adminId, data: hoje2 },
                { enviado: true, enviadoEm: new Date(), totalEnviados: enviados }
            );

            console.log('[CARDAPIO-DIA] Enviado para', enviados, 'assinantes do admin', adminId);
            return enviados;
        } catch(e) {
            console.error('[CARDAPIO-DIA] Erro envio assinantes:', e.message);
            return 0;
        }
    },

    _saudacao() {
        const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
        if (h < 12) return '🌅 Bom dia';
        if (h < 18) return '☀️ Boa tarde';
        return '🌙 Boa noite';
    },

    // ============================================================
    // CRUD Mensalidades Cliente
    // ============================================================
    async listarAssinantes(adminId) {
        return MensalidadeClienteDelivery.find({ adminId }).sort({ nome: 1 }).lean();
    },

    async criarAssinante(adminId, dados) {
        const doc = await MensalidadeClienteDelivery.create({ adminId, ...dados });
        return doc;
    },

    async atualizarAssinante(id, adminId, dados) {
        return MensalidadeClienteDelivery.findOneAndUpdate({ _id: id, adminId }, dados, { new: true });
    },

    async excluirAssinante(id, adminId) {
        return MensalidadeClienteDelivery.findOneAndDelete({ _id: id, adminId });
    },

    async confirmarPagamentoAssinante(id, adminId) {
        const proximoVencimento = new Date();
        proximoVencimento.setMonth(proximoVencimento.getMonth() + 1);
        return MensalidadeClienteDelivery.findOneAndUpdate(
            { _id: id, adminId },
            { ultimoPagamento: new Date(), proximoVencimento, status: 'ativo' },
            { new: true }
        );
    },

    // Cardápio do dia atual
    async cardapioHoje(adminId) {
        const hoje = new Date().toISOString().split('T')[0];
        return CardapioDia.findOne({ adminId, data: hoje }).lean();
    },
};

module.exports = CardapioDiaService;
