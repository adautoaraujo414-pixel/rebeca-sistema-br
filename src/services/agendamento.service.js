const { Agendamento } = require('../models');

const AgendamentoService = {

    async salvar({ adminId, instanciaId, telefone, nomeCliente, origem, destino, dataHora }) {
        const ag = await Agendamento.create({
            adminId, instanciaId, telefone, nomeCliente,
            origem, destino: destino || null,
            dataHora: new Date(dataHora)
        });
        console.log('[AGENDAMENTO] Salvo:', ag._id, '| horario:', ag.dataHora);
        return ag;
    },

    // Iniciar cron — verifica agendamentos a cada minuto
    iniciarCron() {
        setInterval(async () => {
            try {
                const agora = new Date();
                const em30min = new Date(agora.getTime() + 30 * 60 * 1000);
                const em10min = new Date(agora.getTime() + 10 * 60 * 1000);
                const janela = 60 * 1000; // tolerância de 1 min

                // Buscar agendamentos pendentes
                const pendentes = await Agendamento.find({ status: 'pendente' });

                for (const ag of pendentes) {
                    const diff = ag.dataHora.getTime() - agora.getTime();

                    // 30 min antes — lembrete pro cliente
                    if (diff <= 30 * 60 * 1000 + janela && diff > 30 * 60 * 1000 - janela) {
                        try {
                            const EvoService = require('./evolution-multi.service');
                            await EvoService.enviarMensagem(ag.instanciaId, ag.telefone,
                                `Lembrete: sua corrida está agendada para daqui 30 minutos saindo de ${ag.origem}. Tudo certo por aí?`
                            );
                            await Agendamento.findByIdAndUpdate(ag._id, { status: 'lembrete_enviado' });
                            console.log('[AGENDAMENTO] Lembrete 30min enviado para', ag.telefone);
                        } catch(e) { console.log('[AGENDAMENTO] Erro lembrete:', e.message); }
                    }

                    // 10 min antes — despachar motorista
                    if (diff <= 10 * 60 * 1000 + janela && diff > 10 * 60 * 1000 - janela) {
                        try {
                            const RebecaService = require('./rebeca.service');
                            const contexto = { adminId: ag.adminId, instanciaId: ag.instanciaId, agendamento: true };
                            // Forçar solicitação de corrida com origem já definida
                            await RebecaService.processarMensagem(
                                ag.telefone,
                                `quero um carro agora em ${ag.origem}`,
                                ag.nomeCliente,
                                contexto
                            );
                            await Agendamento.findByIdAndUpdate(ag._id, { status: 'despachado' });
                            console.log('[AGENDAMENTO] Motorista despachado para', ag.telefone);
                        } catch(e) { console.log('[AGENDAMENTO] Erro despacho:', e.message); }
                    }

                    // Expirado sem despachar (passou do horário + 15min)
                    if (diff < -15 * 60 * 1000) {
                        await Agendamento.findByIdAndUpdate(ag._id, { status: 'cancelado' });
                    }
                }
            } catch(e) { console.log('[AGENDAMENTO CRON] Erro:', e.message); }
        }, 60 * 1000); // a cada 1 minuto

        console.log('✅ Cron agendamentos ativo');
    }
};

module.exports = AgendamentoService;
