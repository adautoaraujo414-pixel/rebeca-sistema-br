const PrecoDinamicoService = require('./preco-dinamico.service');
const MapsService = require('./maps.service');
const CorridaService = require('./corrida.service');
const ClienteService = require('./cliente.service');
const MotoristaService = require('./motorista.service');

const conversas = new Map();
const rastreamentos = new Map();

// Configurações da Rebeca (editáveis no painel)
const configRebeca = {
    enviarLinkRastreamento: true,
    notificarTempoMotorista: true,
    temposNotificacao: [3, 1, 0], // minutos
    autoDetectarEndereco: true,
    mensagemBoaViagem: true
};

const RebecaService = {
    // ==================== CONFIG ====================
    getConfig: () => ({ ...configRebeca }),
    
    setConfig: (novaConfig) => {
        Object.assign(configRebeca, novaConfig);
        return configRebeca;
    },

    // ==================== DETECTAR ENDEREÇO ====================
    pareceEndereco: (texto) => {
        const padroes = [
            /\d+\s*,?\s*(rua|av|avenida|alameda|travessa|estrada|rod|rodovia|praca|praça)/i,
            /(rua|av|avenida|alameda|travessa|estrada|rod|rodovia|praca|praça)\s+.+\d+/i,
            /\d{5}-?\d{3}/, // CEP
            /.+,\s*\d+\s*[-–]\s*.+/i, // Nome, numero - bairro
            /.+\s+\d+\s*,\s*.+/i, // Nome numero, cidade
        ];
        return padroes.some(p => p.test(texto)) && texto.length > 10;
    },

    // ==================== PROCESSAR MENSAGEM ====================
    async processarMensagem(telefone, mensagem, nome = 'Cliente') {
        const msg = mensagem.toLowerCase().trim();
        const conversa = conversas.get(telefone) || { etapa: 'inicio', dados: {} };
        
        let resposta = '';

        // Comandos rápidos
        if (msg === 'menu' || msg === 'oi' || msg === 'olá' || msg === 'ola' || msg === 'inicio') {
            conversa.etapa = 'inicio';
            resposta = RebecaService.menuPrincipal(nome);
        }
        else if (msg === '1' || msg.includes('pedir') || msg.includes('corrida') || msg.includes('solicitar') || msg.includes('carro') || msg.includes('taxi') || msg.includes('uber')) {
            conversa.etapa = 'pedir_origem';
            resposta = `📍 *SOLICITAR CORRIDA*\n\nPor favor, envie o *endereço de origem* (onde você está).\n\nExemplo: _Rua das Flores, 123 - Osasco_`;
        }
        else if (msg === '2' || msg.includes('preço') || msg.includes('preco') || msg.includes('valor') || msg.includes('quanto custa') || msg.includes('tabela')) {
            resposta = await RebecaService.enviarTabelaPrecos();
        }
        else if (msg === '3' || msg.includes('cotação') || msg.includes('cotacao') || msg.includes('simular')) {
            conversa.etapa = 'cotacao_origem';
            resposta = `💰 *COTAÇÃO DE CORRIDA*\n\nEnvie o *endereço de origem*:`;
        }
        else if (msg === '4' || msg.includes('minhas corridas') || msg.includes('historico') || msg.includes('histórico')) {
            resposta = await RebecaService.historicoCliente(telefone);
        }
        else if (msg === '5' || msg.includes('falar') || msg.includes('atendente') || msg.includes('humano')) {
            resposta = `👤 *ATENDIMENTO HUMANO*\n\nUm atendente irá falar com você em breve.\n\n⏰ Horário de atendimento:\nSeg-Sex: 06h às 22h\nSáb-Dom: 07h às 20h\n\nOu ligue: (11) 99999-9999`;
        }
        else if (msg === '6' || msg.includes('exemplo') || msg.includes('exemplos')) {
            resposta = await RebecaService.enviarExemplosPreco();
        }
        else if (msg.includes('cancelar')) {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            resposta = `❌ Operação cancelada.\n\n${RebecaService.menuPrincipal(nome)}`;
        }
        else if (msg.includes('rastrear') || msg.includes('onde está') || msg.includes('cadê')) {
            resposta = await RebecaService.enviarRastreamento(telefone);
        }
        // ========== AUTO-DETECTAR ENDEREÇO ==========
        else if (configRebeca.autoDetectarEndereco && conversa.etapa === 'inicio' && RebecaService.pareceEndereco(mensagem)) {
            // Cliente mandou endereço direto - perguntar se é origem
            conversa.etapa = 'confirmar_origem_auto';
            conversa.dados.origemAuto = mensagem;
            resposta = `📍 Você está em:\n*${mensagem}*?\n\n*1* - ✅ Sim, chamar carro aqui\n*2* - 📝 Não, quero digitar outro endereço\n*3* - 💰 Só quero fazer cotação`;
        }
        else if (conversa.etapa === 'confirmar_origem_auto') {
            if (msg === '1' || msg.includes('sim')) {
                conversa.dados.origem = conversa.dados.origemAuto;
                conversa.etapa = 'pedir_destino_rapido';
                resposta = `✅ Origem: *${conversa.dados.origem}*\n\n🏁 Agora envie o *destino*:`;
            } else if (msg === '2') {
                conversa.etapa = 'pedir_origem';
                resposta = `📍 Envie o *endereço de origem*:`;
            } else if (msg === '3') {
                conversa.etapa = 'cotacao_destino';
                conversa.dados.origem = conversa.dados.origemAuto;
                resposta = `✅ Origem: *${conversa.dados.origem}*\n\n🏁 Envie o *destino* para cotação:`;
            } else {
                resposta = `Digite *1* para confirmar ou *2* para outro endereço.`;
            }
        }
        else if (conversa.etapa === 'pedir_destino_rapido') {
            conversa.dados.destino = mensagem;
            
            // Calcular e criar corrida automaticamente
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            // Criar corrida direto
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
            conversa.etapa = 'inicio';
            conversa.dados = {};
            
            // Gerar link de rastreamento
            const linkRastreio = RebecaService.gerarLinkRastreamento(corrida.id);
            
            resposta = `🚗 *CARRO SOLICITADO!*\n\n📍 *De:* ${corrida.origem}\n🏁 *Para:* ${corrida.destino}\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *Valor: R$ ${corrida.preco.toFixed(2)}*\n\n⏳ Buscando motorista próximo...\n\n🔢 Código: #${corrida.id.slice(-6)}`;
            
            if (configRebeca.enviarLinkRastreamento) {
                resposta += `\n\n📲 *Acompanhe seu motorista:*\n${linkRastreio}`;
            }
            
            resposta += `\n\n_Você será notificado quando o motorista aceitar!_`;
        }
        // Fluxo de solicitação de corrida normal
        else if (conversa.etapa === 'pedir_origem') {
            conversa.dados.origem = mensagem;
            conversa.etapa = 'pedir_destino';
            resposta = `✅ Origem: *${mensagem}*\n\nAgora envie o *endereço de destino*:`;
        }
        else if (conversa.etapa === 'pedir_destino') {
            conversa.dados.destino = mensagem;
            conversa.etapa = 'confirmar_corrida';
            
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            resposta = `🚗 *RESUMO DA CORRIDA*\n\n📍 *Origem:* ${conversa.dados.origem}\n🏁 *Destino:* ${conversa.dados.destino}\n\n📏 *Distância:* ${calculo.distancia}\n⏱️ *Tempo estimado:* ${calculo.tempo}\n\n💰 *VALOR: R$ ${calculo.preco.toFixed(2)}*\n\n${calculo.faixa.multiplicador > 1 ? `⚡ _Tarifa ${calculo.faixa.nome} (${calculo.faixa.multiplicador}x)_\n\n` : ''}Confirma a corrida?\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar`;
        }
        else if (conversa.etapa === 'confirmar_corrida') {
            if (msg === '1' || msg.includes('sim') || msg.includes('confirmar') || msg.includes('confirma')) {
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
                conversa.etapa = 'inicio';
                conversa.dados = {};
                
                const linkRastreio = RebecaService.gerarLinkRastreamento(corrida.id);
                
                resposta = `🎉 *CORRIDA CONFIRMADA!*\n\n🔢 *Código:* #${corrida.id.slice(-6)}\n\n📍 ${corrida.origem}\n🏁 ${corrida.destino}\n💰 R$ ${corrida.preco.toFixed(2)}\n\n⏳ Buscando motorista...`;
                
                if (configRebeca.enviarLinkRastreamento) {
                    resposta += `\n\n📲 *Acompanhe:*\n${linkRastreio}`;
                }
            } else {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                resposta = `❌ Corrida cancelada.\n\n${RebecaService.menuPrincipal(nome)}`;
            }
        }
        // Fluxo de cotação
        else if (conversa.etapa === 'cotacao_origem') {
            conversa.dados.origem = mensagem;
            conversa.etapa = 'cotacao_destino';
            resposta = `✅ Origem: *${mensagem}*\n\nAgora envie o *endereço de destino*:`;
        }
        else if (conversa.etapa === 'cotacao_destino') {
            conversa.dados.destino = mensagem;
            conversa.etapa = 'inicio';
            
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            
            resposta = `💰 *COTAÇÃO*\n\n📍 *Origem:* ${conversa.dados.origem}\n🏁 *Destino:* ${conversa.dados.destino}\n\n📏 *Distância:* ${calculo.distancia}\n⏱️ *Tempo:* ${calculo.tempo}\n\n💵 *VALOR: R$ ${calculo.preco.toFixed(2)}*`;
            
            if (calculo.faixa.tipo === 'fixo' && calculo.faixa.valorFixo > 0) {
                resposta += `\n\n📊 _Tarifa fixa: ${calculo.faixa.nome}_`;
            } else if (calculo.faixa.multiplicador > 1) {
                resposta += `\n\n📊 _Tarifa ${calculo.faixa.nome} (${calculo.faixa.multiplicador}x)_`;
            }
            
            resposta += `\n\n*1* - 🚗 Pedir agora\n*menu* - Voltar`;
            
            conversa.dados = {};
        }
        // Mensagem não reconhecida
        else {
            resposta = `🤔 Não entendi.\n\n${RebecaService.menuPrincipal(nome)}`;
        }

        conversas.set(telefone, conversa);
        return resposta;
    },

    // ==================== RASTREAMENTO ====================
    gerarLinkRastreamento: (corridaId) => {
        const baseUrl = process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com';
        return `${baseUrl}/rastrear/${corridaId.slice(-8)}`;
    },

    async enviarRastreamento(telefone) {
        const cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) return `Você não tem corridas ativas no momento.`;
        
        const corridas = CorridaService.listarPorCliente(cliente.id);
        const corridaAtiva = corridas.find(c => ['aceita', 'em_andamento', 'a_caminho'].includes(c.status));
        
        if (!corridaAtiva) {
            return `📍 Você não tem corridas ativas no momento.\n\nDigite *1* para pedir uma corrida!`;
        }
        
        const link = RebecaService.gerarLinkRastreamento(corridaAtiva.id);
        return `📲 *RASTREAMENTO*\n\n🔢 Corrida #${corridaAtiva.id.slice(-6)}\n📍 Status: ${RebecaService.formatarStatus(corridaAtiva.status)}\n\n🔗 Acompanhe ao vivo:\n${link}`;
    },

    formatarStatus: (status) => {
        const map = {
            'pendente': '⏳ Buscando motorista',
            'aceita': '✅ Motorista aceitou',
            'a_caminho': '🚗 Motorista a caminho',
            'em_andamento': '🚀 Em viagem',
            'finalizada': '✅ Finalizada',
            'cancelada': '❌ Cancelada'
        };
        return map[status] || status;
    },

    // ==================== NOTIFICAÇÕES TEMPO ====================
    gerarNotificacaoTempo: (minutos, motorista, corrida) => {
        if (minutos === 3) {
            return `🚗 *MOTORISTA A 3 MINUTOS*\n\n👨‍✈️ ${motorista.nome} está chegando!\n🚗 ${motorista.veiculo?.modelo} ${motorista.veiculo?.cor}\n🔢 Placa: *${motorista.veiculo?.placa}*\n\n_Prepare-se para embarcar!_`;
        } else if (minutos === 1) {
            return `🚗 *MOTORISTA A 1 MINUTO*\n\n👨‍✈️ ${motorista.nome} está quase aí!\n\n_Vá para o ponto de embarque!_`;
        } else if (minutos === 0) {
            return `🎉 *MOTORISTA CHEGOU!*\n\n👨‍✈️ ${motorista.nome}\n🚗 ${motorista.veiculo?.modelo} ${motorista.veiculo?.cor}\n🔢 *${motorista.veiculo?.placa}*\n\n_Procure o veículo!_`;
        }
        return null;
    },

    gerarMensagemBoaViagem: (corrida, motorista) => {
        return `🚀 *BOA VIAGEM!*\n\n📍 Destino: ${corrida.destino?.endereco || corrida.destino}\n⏱️ Tempo estimado: ~${corrida.tempoEstimado || 15} min\n\n_Aproveite o trajeto!_`;
    },

    // ==================== MENUS E RESPOSTAS ====================
    menuPrincipal: (nome) => {
        return `Olá${nome ? ', *' + nome + '*' : ''}! 👋\n\nSou a *Rebeca*, assistente virtual.\n\nComo posso ajudar?\n\n*1* - 🚗 Pedir corrida\n*2* - 💵 Ver preços\n*3* - 💰 Fazer cotação\n*4* - 📋 Minhas corridas\n*5* - 👤 Falar com atendente\n*6* - 📊 Exemplos de preço\n\n💡 _Ou envie seu endereço para chamar um carro!_`;
    },

    async enviarTabelaPrecos() {
        const config = PrecoDinamicoService.getConfig();
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const diaHoje = diasSemana[new Date().getDay()];
        
        const faixasHoje = PrecoDinamicoService.listarFaixas(diaHoje).filter(f => f.ativo);
        
        let tabela = `📋 *TABELA DE PREÇOS*\n\n💵 *Valores Base:*\n• Taxa inicial: R$ ${config.taxaBase.toFixed(2)}\n• Por km: R$ ${config.precoKm.toFixed(2)}\n• Mínimo: R$ ${config.taxaMinima.toFixed(2)}\n\n⏰ *Faixas Hoje (${diaHoje}):*\n`;

        faixasHoje.forEach(f => {
            if (f.tipo === 'fixo' && f.valorFixo > 0) {
                tabela += `\n💵 *${f.horaInicio}-${f.horaFim}*: ${f.nome} = R$ ${f.valorFixo.toFixed(2)}`;
            } else {
                const emoji = f.multiplicador >= 1.4 ? '🔴' : f.multiplicador >= 1.2 ? '🟡' : '🟢';
                tabela += `\n${emoji} *${f.horaInicio}-${f.horaFim}*: ${f.nome}`;
                if (f.multiplicador > 1) tabela += ` (${f.multiplicador}x)`;
            }
        });

        tabela += `\n\n📍 *Agora:* ${faixaAtual.nome}`;
        if (faixaAtual.tipo === 'fixo' && faixaAtual.valorFixo > 0) {
            tabela += ` = R$ ${faixaAtual.valorFixo.toFixed(2)}`;
        } else if (faixaAtual.multiplicador > 1) {
            tabela += ` (${faixaAtual.multiplicador}x)`;
        }
        
        tabela += `\n\n_Envie seu endereço para chamar um carro!_`;

        return tabela;
    },

    async enviarExemplosPreco() {
        const exemplos = [3, 5, 8, 10, 15, 20];
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        
        let msg = `📊 *EXEMPLOS DE PREÇO*\n_(${faixaAtual.nome})_\n\n`;
        
        exemplos.forEach(km => {
            const calc = PrecoDinamicoService.calcularPreco(km);
            msg += `📍 *${km} km* → R$ ${calc.precoFinal.toFixed(2)}\n`;
        });
        
        msg += `\n_Envie seu endereço para cotação exata!_`;

        return msg;
    },

    // ==================== CÁLCULOS ====================
    async calcularCorrida(origem, destino) {
        const rota = await MapsService.calcularRota(origem, destino);
        
        const distanciaKm = rota.sucesso ? rota.distancia.km : 5;
        const tempoMinutos = rota.sucesso ? rota.duracao.minutos : 15;
        
        const calculo = PrecoDinamicoService.calcularPreco(distanciaKm);
        const faixa = PrecoDinamicoService.obterFaixaAtual();
        
        return {
            distancia: rota.sucesso ? rota.distancia.texto : `~${distanciaKm} km`,
            tempo: rota.sucesso ? rota.duracao.texto : `~${tempoMinutos} min`,
            distanciaKm,
            tempoMinutos,
            preco: calculo.precoFinal,
            detalhes: calculo.detalhes,
            faixa,
            origem: rota.sucesso ? rota.origem : { endereco: origem },
            destino: rota.sucesso ? rota.destino : { endereco: destino }
        };
    },

    async criarCorrida(telefone, nomeCliente, dados) {
        let cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) {
            cliente = ClienteService.criar({ nome: nomeCliente, telefone });
        }
        
        const corrida = CorridaService.criar({
            clienteId: cliente.id,
            clienteNome: cliente.nome,
            clienteTelefone: telefone,
            origem: dados.calculo.origem,
            destino: dados.calculo.destino,
            distanciaKm: dados.calculo.distanciaKm,
            tempoEstimado: dados.calculo.tempoMinutos,
            precoEstimado: dados.calculo.preco,
            faixaPreco: dados.calculo.faixa.nome,
            multiplicador: dados.calculo.faixa.multiplicador
        });
        
        return {
            id: corrida.id,
            origem: dados.origem || dados.calculo.origem?.endereco,
            destino: dados.destino || dados.calculo.destino?.endereco,
            preco: dados.calculo.preco
        };
    },

    async historicoCliente(telefone) {
        const cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) {
            return `📋 *HISTÓRICO*\n\nVocê ainda não tem corridas.\n\nEnvie seu endereço para chamar um carro! 🚗`;
        }
        
        const corridas = CorridaService.listarPorCliente(cliente.id);
        
        if (!corridas || corridas.length === 0) {
            return `📋 *HISTÓRICO*\n\nVocê ainda não tem corridas.\n\nEnvie seu endereço para chamar um carro! 🚗`;
        }
        
        let msg = `📋 *SUAS CORRIDAS*\n\n`;
        
        corridas.slice(0, 5).forEach((c) => {
            const status = c.status === 'finalizada' ? '✅' : c.status === 'cancelada' ? '❌' : '⏳';
            msg += `${status} *#${c.id.slice(-6)}* - R$ ${(c.precoFinal || c.precoEstimado || 0).toFixed(2)}\n`;
        });
        
        msg += `\n_Envie seu endereço para nova corrida!_`;
        
        return msg;
    },

    // ==================== NOTIFICAÇÕES MOTORISTA ====================
    gerarMensagemMotoristaAceitou(corrida, motorista) {
        let msg = `🎉 *MOTORISTA A CAMINHO!*\n\n👨‍✈️ *${motorista.nome}*\n🚗 ${motorista.veiculo?.modelo} ${motorista.veiculo?.cor}\n🔢 Placa: *${motorista.veiculo?.placa}*\n⭐ ${(motorista.avaliacao || 5).toFixed(1)}`;
        
        if (configRebeca.enviarLinkRastreamento) {
            msg += `\n\n📲 *Acompanhe:*\n${RebecaService.gerarLinkRastreamento(corrida.id)}`;
        }
        
        msg += `\n\n_Você será avisado quando ele estiver chegando!_`;
        
        return msg;
    },

    gerarMensagemCorridaFinalizada(corrida) {
        return `✅ *CORRIDA FINALIZADA!*\n\n🔢 #${corrida.id.slice(-6)}\n💰 R$ ${(corrida.precoFinal || corrida.precoEstimado).toFixed(2)}\n📏 ${corrida.distanciaKm?.toFixed(1) || '?'} km\n\nObrigado! 🚗\n\n⭐ Avalie de 1 a 5:`;
    },

    gerarMensagemCorridaCancelada(corrida, motivo) {
        return `❌ *CORRIDA CANCELADA*\n\n🔢 #${corrida.id.slice(-6)}\n📝 ${motivo || 'Não informado'}\n\n_Envie seu endereço para nova corrida!_`;
    }
};

module.exports = RebecaService;
