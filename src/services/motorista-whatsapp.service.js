/**
 * Motorista WhatsApp Service
 * Processa comandos do motorista recebidos via WhatsApp
 * CHEGUEI / INICIAR / FINALIZAR / STATUS
 */

const NLPService = require('./nlp.service');

const MotoristaWhatsappService = {

    // ==================== VERIFICAR SE É MOTORISTA ====================
    async ehMotorista(telefone, adminId) {
        try {
            const { Motorista } = require('../models');
            const tels = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
            const query = { whatsapp: { $in: tels }, ativo: true };
            if (adminId) query.adminId = adminId;
            const mot = await Motorista.findOne(query);
            return mot || null;
        } catch(e) { return null; }
    },

    // ==================== PROCESSAR COMANDO ====================
    async processarComando(telefone, mensagem, adminId, instanciaId) {
        try {
            const motorista = await this.ehMotorista(telefone, adminId);
            if (!motorista) return null; // Não é motorista

            const NLPService = require('./nlp.service');
            const comando = NLPService.comandoMotorista(mensagem);
            const msg = mensagem.toLowerCase().trim();

            // STATUS — motorista pergunta sobre corrida ativa
            if (msg === 'status' || msg === 'corrida' || msg === 'minha corrida') {
                return await this.statusCorrida(motorista, adminId);
            }

            // Buscar corrida ativa do motorista
            const { Corrida } = require('../models');
            const corrida = await Corrida.findOne({
                motoristaId: motorista._id,
                status: { $in: ['aceita', 'motorista_a_caminho', 'aguardando_cliente', 'em_andamento'] }
            });

            if (comando === 'CHEGUEI') {
                return await this.processarCheguei(motorista, corrida, adminId, instanciaId);
            }
            if (comando === 'INICIAR') {
                return await this.processarIniciar(motorista, corrida, adminId, instanciaId);
            }
            if (comando === 'FINALIZAR') {
                return await this.processarFinalizar(motorista, corrida, adminId, instanciaId);
            }
            if (comando === 'RECUSAR') {
                return await this.processarRecusar(motorista, corrida, adminId);
            }

            // Mensagem não é comando — pode ser chat com cliente
            if (corrida && mensagem.length > 2) {
                return await this.repassarParaCliente(motorista, corrida, mensagem, adminId, instanciaId);
            }

            // Motorista mandou algo sem corrida ativa
            if (!corrida) {
                return `Olá, ${motorista.nomeCompleto?.split(' ')[0] || 'motorista'}! 😊\n\nVocê não tem corrida ativa no momento.\n\nFique disponível no app para receber corridas! 🚗`;
            }

            return null; // Não soube o que fazer — não responder
        } catch(e) {
            console.error('[MOTORISTA-WPP] Erro:', e.message);
            return null;
        }
    },

    // ==================== CHEGUEI ====================
    async processarCheguei(motorista, corrida, adminId, instanciaId) {
        if (!corrida) {
            return `${motorista.nomeCompleto?.split(' ')[0]}, você não tem corrida ativa no momento 😊`;
        }

        // Anti-spam: verificar se já notificou
        if (corrida.notificacoes?.motoristaChegouEnviada) {
            return `✅ Já avisamos o cliente que você chegou!`;
        }

        const { Corrida } = require('../models');
        await Corrida.findByIdAndUpdate(corrida._id, {
            motoristaChegouEm: new Date(),
            status: 'aguardando_cliente',
            'notificacoes.motoristaChegouEnviada': true
        });

        // Notificar cliente via WhatsApp
        await this.notificarCliente(corrida, adminId, instanciaId,
            `🚗 *Seu motorista chegou!*\n\n` +
            `*${motorista.nomeCompleto}* está te aguardando.\n` +
            `Veículo: *${motorista.veiculo?.modelo || 'Veículo'} ${motorista.veiculo?.cor || ''}* - Placa *${motorista.veiculo?.placa || ''}*\n\n` +
            `Por favor, dirija-se ao veículo! 🙏`
        );

        return `✅ Perfeito! Avisamos o cliente que você chegou.\n\nQuando a corrida iniciar, manda *INICIAR* pra mim! 🚗`;
    },

    // ==================== INICIAR ====================
    async processarIniciar(motorista, corrida, adminId, instanciaId) {
        if (!corrida) {
            return `${motorista.nomeCompleto?.split(' ')[0]}, você não tem corrida ativa para iniciar 😊`;
        }

        const { Corrida } = require('../models');
        await Corrida.findByIdAndUpdate(corrida._id, {
            iniciadaEm: new Date(),
            status: 'em_andamento',
            'notificacoes.corridaIniciadaEnviada': true
        });

        // Notificar cliente
        const destino = corrida.destino?.endereco || corrida.enderecoDestinoTexto || 'seu destino';
        await this.notificarCliente(corrida, adminId, instanciaId,
            `🛣️ *Corrida iniciada!*\n\n` +
            `Você está a caminho de *${destino.substring(0, 60)}*.\n\n` +
            `Boa viagem! 😊`
        );

        return `🚀 Corrida iniciada! Boa viagem!\n\nQuando chegar ao destino, manda *FINALIZAR* pra mim 🏁`;
    },

    // ==================== FINALIZAR ====================
    async processarFinalizar(motorista, corrida, adminId, instanciaId) {
        if (!corrida) {
            return `${motorista.nomeCompleto?.split(' ')[0]}, nenhuma corrida ativa para finalizar 😊`;
        }

        const { Corrida } = require('../models');
        const corridaAtual = await Corrida.findById(corrida._id);

        await Corrida.findByIdAndUpdate(corrida._id, {
            finalizadaEm: new Date(),
            status: 'finalizada',
            precoFinal: corridaAtual?.precoEstimado || 0,
            'notificacoes.avaliacaoEnviada': true
        });

        // Atualizar status do motorista para disponível
        const { Motorista } = require('../models');
        await Motorista.findByIdAndUpdate(motorista._id, {
            status: 'disponivel',
            $inc: { corridasRealizadas: 1 }
        });

        // Salvar destino no histórico do cliente
        try {
            const ClienteService = require('./cliente.service');
            if (corridaAtual?.clienteTelefone && corridaAtual?.destino?.endereco) {
                await ClienteService.salvarDestino(
                    corridaAtual.clienteTelefone, adminId, corridaAtual.destino
                );
            }
        } catch(e) {}

        // Notificar cliente + pedir avaliação
        const preco = corridaAtual?.precoEstimado ? `R$ ${(corridaAtual.precoEstimado).toFixed(2).replace('.', ',')}` : '';
        await this.notificarCliente(corrida, adminId, instanciaId,
            `✅ *Corrida finalizada!*\n\n` +
            `${preco ? `Valor: *${preco}*\n\n` : ''}` +
            `Como foi sua experiência?\n\n` +
            `⭐ *1* - Péssimo\n` +
            `⭐⭐ *2* - Ruim\n` +
            `⭐⭐⭐ *3* - Ok\n` +
            `⭐⭐⭐⭐ *4* - Bom\n` +
            `⭐⭐⭐⭐⭐ *5* - Excelente\n\n` +
            `Manda o número da sua avaliação! 😊`
        );

        // Registrar etapa de avaliação na conversa do cliente
        try {
            const RebecaService = require('./rebeca.service');
            const conversas = RebecaService.conversas;
            if (conversas && corridaAtual?.clienteTelefone) {
                const telCli = corridaAtual.clienteTelefone;
                const conv = conversas.get(telCli) || {};
                conv.etapa = 'avaliar';
                conv.dados = { ...conv.dados, corridaId: corrida._id.toString() };
                conversas.set(telCli, conv);
            }
        } catch(e) {}

        return `🏁 *Corrida finalizada!*\n\nAvisamos o cliente.\nVocê está disponível para novas corridas! 🚗\n\nBom trabalho! 💪`;
    },

    // ==================== RECUSAR ====================
    async processarRecusar(motorista, corrida, adminId) {
        if (!corrida) return null;
        // Apenas avisar — o redespacho é tratado pelo DespachoService
        const { Corrida } = require('../models');
        await Corrida.findByIdAndUpdate(corrida._id, {
            motoristaId: null, motoristaNome: null, status: 'pendente'
        });
        const { Motorista } = require('../models');
        await Motorista.findByIdAndUpdate(motorista._id, { status: 'disponivel' });
        return `Ok, entendido! Vou redespachar para outro motorista.\n\nVocê está disponível para outras corridas! 🚗`;
    },

    // ==================== REPASSAR MENSAGEM PARA CLIENTE ====================
    async repassarParaCliente(motorista, corrida, mensagem, adminId, instanciaId) {
        try {
            // Salvar no chat da corrida
            const { Corrida } = require('../models');
            await Corrida.findByIdAndUpdate(corrida._id, {
                $push: { chatMensagens: {
                    texto: mensagem, remetente: 'motorista',
                    nomeRemetente: motorista.nomeCompleto || 'Motorista',
                    data: new Date(), tipo: 'motorista'
                }}
            });

            // Enviar para o cliente
            const nomeMotorista = motorista.nomeCompleto?.split(' ')[0] || 'Motorista';
            await this.notificarCliente(corrida, adminId, instanciaId,
                `💬 *Mensagem do motorista ${nomeMotorista}:*\n\n${mensagem}`
            );
            return `✅ Mensagem enviada ao cliente!`;
        } catch(e) {
            return null;
        }
    },

    // ==================== STATUS ====================
    async statusCorrida(motorista, adminId) {
        const { Corrida } = require('../models');
        const corrida = await Corrida.findOne({
            motoristaId: motorista._id,
            status: { $in: ['aceita', 'motorista_a_caminho', 'aguardando_cliente', 'em_andamento'] }
        });

        if (!corrida) {
            return `Olá ${motorista.nomeCompleto?.split(' ')[0]}! 😊\n\nVocê não tem corrida ativa.\nStatus: *disponível* para corridas 🚗`;
        }

        const statusTexto = {
            'aceita': 'Aceita — vá até o cliente',
            'motorista_a_caminho': 'A caminho do cliente',
            'aguardando_cliente': 'Aguardando o cliente embarcar',
            'em_andamento': 'Em andamento'
        }[corrida.status] || corrida.status;

        return `📋 *Sua corrida ativa:*\n\n` +
            `Status: *${statusTexto}*\n` +
            `Cliente: *${corrida.clienteNome}*\n` +
            `Origem: ${corrida.origem?.endereco || corrida.enderecoOrigemTexto || '-'}\n` +
            `Destino: ${corrida.destino?.endereco || corrida.enderecoDestinoTexto || '-'}\n\n` +
            `Comandos:\n` +
            `• *CHEGUEI* — cheguei no cliente\n` +
            `• *INICIAR* — iniciei a corrida\n` +
            `• *FINALIZAR* — finalizei a corrida`;
    },

    // ==================== NOTIFICAR CLIENTE ====================
    async notificarCliente(corrida, adminId, instanciaId, mensagem) {
        try {
            const EvolutionMultiService = require('./evolution-multi.service');
            const { InstanciaWhatsapp } = require('../models');

            let inst = null;
            if (instanciaId) {
                inst = await InstanciaWhatsapp.findById(instanciaId);
            }
            if (!inst && adminId) {
                inst = await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } });
            }
            if (!inst) return false;

            await EvolutionMultiService.enviarMensagem(
                inst._id, corrida.clienteTelefone, mensagem
            );
            return true;
        } catch(e) {
            console.error('[MOTORISTA-WPP] Erro notificar cliente:', e.message);
            return false;
        }
    }
};

module.exports = MotoristaWhatsappService;
