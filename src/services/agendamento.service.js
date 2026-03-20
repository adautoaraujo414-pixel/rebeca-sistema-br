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
                const pendentes = await Agendamento.find({ status: { $in: ['pendente', 'lembrete_enviado'] } });

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

                    // 5 min antes — lembrete urgente (separado do 30min)
                    if (diff <= 5 * 60 * 1000 + janela && diff > 5 * 60 * 1000 - janela &&
                        ag.status !== 'despachado') {
                        try {
                            const EvoService = require('./evolution-multi.service');
                            await EvoService.enviarMensagem(ag.instanciaId, ag.telefone,
                                'Sua corrida esta quase na hora! Faltam 5 minutinhos.\n\nJa estou chamando seu motorista!'
                            );
                        } catch(e) { console.log('[AGENDAMENTO] Erro lembrete 5min:', e.message); }
                    }

                    // 10 min antes — criar corrida e despachar diretamente (sem passar pela Rebeca)
                    if (diff <= 10 * 60 * 1000 + janela && diff > 10 * 60 * 1000 - janela &&
                        ag.status !== 'despachado') {
                        try {
                            const { Corrida, InstanciaWhatsapp } = require('../models');
                            const PrecoAdminService = require('./preco-admin.service');
                            const DespachoService = require('./despacho.service');
                            const MotoristaService = require('./motorista.service');
                            const EvoService = require('./evolution-multi.service');

                            // Calcular preço real
                            const calc = await PrecoAdminService.calcularPreco(ag.adminId, 1, 0);
                            const precoEstimado = calc?.preco || calc?.precoFinal || 15;

                            // Criar corrida diretamente no banco
                            const corrida = await Corrida.create({
                                adminId: ag.adminId,
                                clienteNome: ag.nomeCliente,
                                clienteTelefone: ag.telefone,
                                origem: { endereco: ag.origem },
                                destino: ag.destino ? { endereco: ag.destino } : null,
                                status: 'pendente',
                                precoEstimado,
                                agendamentoId: ag._id,
                                origem_tipo: 'agendamento'
                            });

                            // Buscar motoristas disponíveis e despachar
                            const motoristas = await MotoristaService.listarDisponiveis(ag.adminId);
                            if (motoristas.length > 0) {
                                await DespachoService.despacharCorrida(corrida, motoristas, ag.adminId);
                            }

                            // Notificar cliente
                            const inst = await InstanciaWhatsapp.findOne({
                                adminId: ag.adminId,
                                status: { $in: ['conectado','open','connected'] }
                            }).sort({ ultimaConexao: -1 }).lean();
                            if (inst) {
                                await EvoService.enviarMensagem(inst._id, ag.telefone,
                                    `🚗 Sua corrida agendada está chegando! Estou chamando um motorista para buscar você em *${ag.origem}*. Um momento!`
                                );
                            }

                            await Agendamento.findByIdAndUpdate(ag._id, { status: 'despachado', corridaId: corrida._id });
                            console.log('[AGENDAMENTO] Corrida criada e despachada:', corrida._id, '| cliente:', ag.telefone);
                        } catch(e) { console.log('[AGENDAMENTO] Erro despacho direto:', e.message); }
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
