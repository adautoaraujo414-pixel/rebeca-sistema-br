const MotoristaService = require('./motorista.service');
const CorridaService = require('./corrida.service');
const ClienteService = require('./cliente.service');
const GPSIntegradoService = require('./gps-integrado.service');
const LocalidadeService = require('./localidade.service');
const PrecoDinamicoService = require('./preco-dinamico.service');
const WhatsAppService = require('./whatsapp.service');

const CONFIG = { raioMaximoBuscaKm: 10, tempoMaximoEsperaMin: 15 };

const RebecaIntegradaService = {
    CONFIG,

    solicitarCorrida: async (dados) => {
        const { clienteTelefone, origem, destino } = dados;
        
        let cliente = ClienteService.buscarPorTelefone(clienteTelefone);
        if (!cliente) {
            cliente = ClienteService.criar({ nome: dados.clienteNome || 'Cliente', telefone: clienteTelefone });
            await WhatsAppService.enviarBoasVindas(clienteTelefone, cliente.nome);
        }
        
        if (cliente.bloqueado) {
            return { sucesso: false, erro: 'Cliente bloqueado' };
        }

        const distanciaKm = RebecaIntegradaService.calcularDistancia(
            origem.latitude, origem.longitude, destino.latitude, destino.longitude
        );
        
        const calculo = PrecoDinamicoService.calcularPreco(distanciaKm);
        
        const corrida = CorridaService.criar({
            clienteId: cliente.id, clienteNome: cliente.nome, clienteTelefone: cliente.telefone,
            origem, destino, distanciaKm, precoEstimado: calculo.precoFinal,
            formaPagamento: dados.formaPagamento || 'dinheiro'
        });

        const motoristaProximo = GPSIntegradoService.buscarMaisProximo(origem.latitude, origem.longitude, CONFIG.raioMaximoBuscaKm);

        if (motoristaProximo) {
            await WhatsAppService.notificarNovaCorrida(motoristaProximo.telefone, {
                clienteNome: cliente.nome, origem: origem.endereco, destino: destino.endereco,
                distanciaKm, valorEstimado: calculo.precoFinal
            });
        }

        return { sucesso: true, corrida, precoEstimado: calculo.precoFinal, temMotoristaProximo: !!motoristaProximo };
    },

    aceitarCorrida: async (corridaId, motoristaId) => {
        const corrida = CorridaService.buscarPorId(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };

        const motorista = MotoristaService.buscarPorId(motoristaId);
        if (!motorista) return { sucesso: false, erro: 'Motorista não encontrado' };

        const corridaAtualizada = CorridaService.atribuirMotorista(corridaId, motorista.id, motorista.nome);
        MotoristaService.atualizarStatus(motoristaId, 'a_caminho');
        GPSIntegradoService.atualizar(motoristaId, { status: 'a_caminho' });

        await WhatsAppService.notificarCorridaAceita(corrida.clienteTelefone, {
            motoristaNome: motorista.nome, veiculoModelo: motorista.veiculo.modelo,
            veiculoCor: motorista.veiculo.cor, veiculoPlaca: motorista.veiculo.placa, tempoEstimado: 5
        });

        return { sucesso: true, corrida: corridaAtualizada };
    },

    iniciarCorrida: async (corridaId) => {
        const corrida = CorridaService.buscarPorId(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };

        const corridaAtualizada = CorridaService.iniciar(corridaId);
        MotoristaService.atualizarStatus(corrida.motoristaId, 'em_corrida');
        GPSIntegradoService.atualizar(corrida.motoristaId, { status: 'em_corrida' });

        return { sucesso: true, corrida: corridaAtualizada };
    },

    finalizarCorrida: async (corridaId, precoFinal = null) => {
        const corrida = CorridaService.buscarPorId(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };

        const corridaFinalizada = CorridaService.finalizar(corridaId, precoFinal);
        MotoristaService.atualizarStatus(corrida.motoristaId, 'disponivel');
        GPSIntegradoService.atualizar(corrida.motoristaId, { status: 'disponivel' });
        ClienteService.registrarCorrida(corrida.clienteId, corridaFinalizada.precoFinal);

        await WhatsAppService.notificarCorridaFinalizada(corrida.clienteTelefone, {
            origem: corrida.origem.endereco, destino: corrida.destino.endereco,
            distanciaKm: corrida.distanciaKm, valorFinal: corridaFinalizada.precoFinal
        });

        return { sucesso: true, corrida: corridaFinalizada };
    },

    cancelarCorrida: async (corridaId, motivo = '') => {
        const corrida = CorridaService.buscarPorId(corridaId);
        if (!corrida) return { sucesso: false, erro: 'Corrida não encontrada' };

        const corridaCancelada = CorridaService.cancelar(corridaId, motivo);
        
        if (corrida.motoristaId) {
            MotoristaService.atualizarStatus(corrida.motoristaId, 'disponivel');
            GPSIntegradoService.atualizar(corrida.motoristaId, { status: 'disponivel' });
        }

        await WhatsAppService.notificarCorridaCancelada(corrida.clienteTelefone, { motivo });

        return { sucesso: true, corrida: corridaCancelada };
    },

    calcularDistancia: (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return Math.round(R * c * 10) / 10;
    },

    simularCotacao: (origem, destino) => {
        const distanciaKm = RebecaIntegradaService.calcularDistancia(
            origem.latitude, origem.longitude, destino.latitude, destino.longitude
        );
        const calculo = PrecoDinamicoService.calcularPreco(distanciaKm);
        return { distanciaKm, precoEstimado: calculo.precoFinal, tempoEstimadoMin: Math.max(5, Math.round(distanciaKm * 2)) };
    },

    obterDashboard: () => {
        const motoristas = GPSIntegradoService.listarTodos();
        const estatCorridas = CorridaService.obterEstatisticas();
        return {
            motoristasOnline: motoristas.filter(m => m.status !== 'offline').length,
            motoristasDisponiveis: motoristas.filter(m => m.status === 'disponivel').length,
            corridasHoje: estatCorridas.finalizadas,
            corridasPendentes: estatCorridas.pendentes,
            faturamentoHoje: estatCorridas.faturamento,
            motoristas: motoristas.map(m => ({ id: m.id, nome: m.nome, status: m.status, latitude: m.latitude, longitude: m.longitude }))
        };
    }
};

module.exports = RebecaIntegradaService;
