const { Mensalidade, ConfigFinanceiro, Motorista } = require('../models');

const MensalidadeService = {
    // Criar mensalidade
    async criar(dados) {
        const mensalidade = new Mensalidade(dados);
        return await mensalidade.save();
    },

    // Listar todas (filtrado por adminId)
    async listar(filtros = {}) {
        const query = {};
        if (filtros.status) query.status = filtros.status;
        if (filtros.motoristaId) query.motoristaId = filtros.motoristaId;

        // Filtrar por adminId — busca IDs dos motoristas deste admin
        if (filtros.adminId) {
            const motoristas = await Motorista.find({ adminId: filtros.adminId }).select('_id');
            const ids = motoristas.map(m => m._id);
            query.motoristaId = filtros.motoristaId
                ? (ids.map(String).includes(String(filtros.motoristaId)) ? filtros.motoristaId : null)
                : { $in: ids };
        }

        return await Mensalidade.find(query).sort({ dataVencimento: -1 });
    },

    // Estatísticas filtradas por admin
    async estatisticas(adminId = null) {
        const query = {};
        if (adminId) {
            const motoristas = await Motorista.find({ adminId }).select('_id');
            query.motoristaId = { $in: motoristas.map(m => m._id) };
        }
        const total = await Mensalidade.countDocuments(query);
        const pagas = await Mensalidade.countDocuments({ ...query, status: 'pago' });
        const pendentes = await Mensalidade.countDocuments({ ...query, status: 'pendente' });
        const atrasadas = await Mensalidade.countDocuments({ ...query, status: 'atrasado' });
        return { total, pagas, pendentes, atrasadas };
    },

    // Buscar por ID
    async buscarPorId(id) {
        return await Mensalidade.findById(id);
    },

    // Buscar por motorista
    async buscarPorMotorista(motoristaId) {
        return await Mensalidade.find({ motoristaId }).sort({ dataVencimento: -1 });
    },

    // Confirmar pagamento
    async confirmarPagamento(id, observacao = '') {
        const mensalidade = await Mensalidade.findByIdAndUpdate(id, {
            status: 'pago',
            dataPagamento: new Date(),
            observacao
        }, { new: true });

        // Desbloquear motorista se estava bloqueado
        if (mensalidade) {
            await Motorista.findByIdAndUpdate(mensalidade.motoristaId, {
                ativo: true,
                bloqueadoPorMensalidade: false
            });
        }

        return mensalidade;
    },

    // Bloquear por inadimplência
    async bloquearMotorista(motoristaId) {
        await Motorista.findByIdAndUpdate(motoristaId, {
            ativo: false,
            bloqueadoPorMensalidade: true,
            status: 'offline'
        });

        // Atualizar mensalidades pendentes para bloqueado
        await Mensalidade.updateMany(
            { motoristaId, status: 'atrasado' },
            { status: 'bloqueado' }
        );
    },

    // Desbloquear motorista
    async desbloquearMotorista(motoristaId) {
        await Motorista.findByIdAndUpdate(motoristaId, {
            ativo: true,
            bloqueadoPorMensalidade: false
        });
    },

    // Gerar próxima mensalidade
    async gerarProximaMensalidade(motoristaId, plano, valor) {
        const motorista = await Motorista.findById(motoristaId);
        if (!motorista) return null;

        const dataVencimento = new Date();
        if (plano === 'semanal') {
            dataVencimento.setDate(dataVencimento.getDate() + 7);
        } else {
            dataVencimento.setMonth(dataVencimento.getMonth() + 1);
        }

        return await this.criar({
            motoristaId,
            motoristaNome: motorista.nomeCompleto,
            motoristaWhatsapp: motorista.whatsapp,
            plano,
            valor,
            dataVencimento,
            status: 'pendente'
        });
    },

    // Verificar vencimentos (chamado pelo cron/scheduler)
    async verificarVencimentos() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const config = await this.getConfigFinanceiro();
        const diasTolerancia = config?.diasTolerancia || 2;

        // Buscar mensalidades pendentes
        const pendentes = await Mensalidade.find({
            status: 'pendente',
            dataVencimento: { $lte: hoje }
        });

        const notificacoes = [];

        for (const mens of pendentes) {
            const diasAtraso = Math.floor((hoje - mens.dataVencimento) / (1000 * 60 * 60 * 24));

            if (diasAtraso === 0 && !mens.notificacaoEnviada) {
                // Vence hoje - notificar
                notificacoes.push({
                    tipo: 'vencimento',
                    mensalidade: mens,
                    mensagem: `⚠️ Olá ${mens.motoristaNome}! Sua mensalidade de R$ ${mens.valor.toFixed(2)} vence HOJE. Chave Pix: ${config?.chavePix || 'Consulte admin'}`
                });
                await Mensalidade.findByIdAndUpdate(mens._id, { notificacaoEnviada: true });
            } else if (diasAtraso > 0 && diasAtraso <= diasTolerancia) {
                // Atrasado mas dentro da tolerância
                await Mensalidade.findByIdAndUpdate(mens._id, { status: 'atrasado' });
                
                if (!mens.notificacaoAtrasoEnviada) {
                    notificacoes.push({
                        tipo: 'atraso',
                        mensalidade: mens,
                        mensagem: `🚨 ${mens.motoristaNome}, sua mensalidade está ATRASADA há ${diasAtraso} dia(s). Valor: R$ ${mens.valor.toFixed(2)}. Regularize para evitar bloqueio!`
                    });
                    await Mensalidade.findByIdAndUpdate(mens._id, { notificacaoAtrasoEnviada: true });
                }
            } else if (diasAtraso > diasTolerancia) {
                // Passou tolerância - BLOQUEAR
                await this.bloquearMotorista(mens.motoristaId);
                notificacoes.push({
                    tipo: 'bloqueio',
                    mensalidade: mens,
                    mensagem: `🔒 ${mens.motoristaNome}, seu acesso foi BLOQUEADO por inadimplência. Regularize o pagamento de R$ ${mens.valor.toFixed(2)} para voltar a trabalhar.`
                });
            }
        }

        return notificacoes;
    },


    // Config Financeiro
    async getConfigFinanceiro() {
        let config = await ConfigFinanceiro.findOne();
        if (!config) {
            config = await ConfigFinanceiro.create({
                chavePix: '',
                valorMensalidade: 100,
                valorSemanal: 30,
                diasTolerancia: 2
            });
        }
        return config;
    },

    async salvarConfigFinanceiro(dados) {
        let config = await ConfigFinanceiro.findOne();
        if (config) {
            return await ConfigFinanceiro.findByIdAndUpdate(config._id, dados, { new: true });
        }
        return await ConfigFinanceiro.create(dados);
    }
};

module.exports = MensalidadeService;
