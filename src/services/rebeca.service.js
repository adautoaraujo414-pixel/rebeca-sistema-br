const PrecoDinamicoService = require('./preco-dinamico.service');
const MapsService = require('./maps.service');
const CorridaService = require('./corrida.service');
const ClienteService = require('./cliente.service');
const MotoristaService = require('./motorista.service');

const conversas = new Map();

const RebecaService = {
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
        else if (msg === '1' || msg.includes('pedir') || msg.includes('corrida') || msg.includes('solicitar')) {
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
        // Fluxo de solicitação de corrida
        else if (conversa.etapa === 'pedir_origem') {
            conversa.dados.origem = mensagem;
            conversa.etapa = 'pedir_destino';
            resposta = `✅ Origem: *${mensagem}*\n\nAgora envie o *endereço de destino*:`;
        }
        else if (conversa.etapa === 'pedir_destino') {
            conversa.dados.destino = mensagem;
            conversa.etapa = 'confirmar_corrida';
            
            // Calcular rota e preço
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            resposta = `🚗 *RESUMO DA CORRIDA*\n\n📍 *Origem:* ${conversa.dados.origem}\n🏁 *Destino:* ${conversa.dados.destino}\n\n📏 *Distância:* ${calculo.distancia}\n⏱️ *Tempo estimado:* ${calculo.tempo}\n\n💰 *VALOR: R$ ${calculo.preco.toFixed(2)}*\n\n${calculo.faixa.multiplicador > 1 ? `⚡ _Tarifa ${calculo.faixa.nome} (${calculo.faixa.multiplicador}x)_\n\n` : ''}Confirma a corrida?\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar`;
        }
        else if (conversa.etapa === 'confirmar_corrida') {
            if (msg === '1' || msg.includes('sim') || msg.includes('confirmar') || msg.includes('confirma')) {
                // Criar corrida
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
                conversa.etapa = 'inicio';
                conversa.dados = {};
                
                resposta = `🎉 *CORRIDA CONFIRMADA!*\n\n🔢 *Código:* #${corrida.id.slice(-6)}\n\n📍 ${corrida.origem}\n🏁 ${corrida.destino}\n💰 R$ ${corrida.preco.toFixed(2)}\n\n⏳ Buscando motorista...\n\nVocê receberá uma mensagem quando um motorista aceitar.\n\n_Para cancelar, digite "cancelar corrida"_`;
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
            
            resposta = `💰 *COTAÇÃO*\n\n📍 *Origem:* ${conversa.dados.origem}\n🏁 *Destino:* ${conversa.dados.destino}\n\n📏 *Distância:* ${calculo.distancia}\n⏱️ *Tempo:* ${calculo.tempo}\n\n💵 *VALOR ESTIMADO: R$ ${calculo.preco.toFixed(2)}*\n\n📊 *Detalhes:*\n• Taxa base: R$ ${calculo.detalhes.taxaBase.toFixed(2)}\n• ${calculo.detalhes.distanciaKm.toFixed(1)} km x R$ ${calculo.detalhes.precoKm.toFixed(2)} = R$ ${calculo.detalhes.valorDistancia.toFixed(2)}\n• Faixa: ${calculo.faixa.nome}${calculo.faixa.multiplicador > 1 ? ` (${calculo.faixa.multiplicador}x)` : ''}\n${calculo.faixa.taxaAdicional > 0 ? `• Taxa adicional: R$ ${calculo.faixa.taxaAdicional.toFixed(2)}\n` : ''}\n_Valor válido para o horário atual._\n\nDeseja solicitar esta corrida?\nDigite *1* para pedir ou *menu* para voltar.`;
            
            conversa.dados = {};
        }
        // Mensagem não reconhecida
        else {
            resposta = `🤔 Não entendi sua mensagem.\n\n${RebecaService.menuPrincipal(nome)}`;
        }

        conversas.set(telefone, conversa);
        return resposta;
    },

    // ==================== MENUS E RESPOSTAS ====================
    menuPrincipal: (nome) => {
        return `Olá${nome ? ', *' + nome + '*' : ''}! 👋\n\nSou a *Rebeca*, assistente virtual da UBMAX.\n\nComo posso ajudar?\n\n*1* - 🚗 Pedir corrida\n*2* - 💵 Ver preços\n*3* - 💰 Fazer cotação\n*4* - 📋 Minhas corridas\n*5* - 👤 Falar com atendente\n*6* - 📊 Exemplos de preço\n\n_Digite o número ou escreva o que precisa!_`;
    },

    async enviarTabelaPrecos() {
        const config = PrecoDinamicoService.getConfig();
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const diaHoje = diasSemana[new Date().getDay()];
        
        const faixasHoje = PrecoDinamicoService.listarFaixas(diaHoje).filter(f => f.ativo);
        
        let tabela = `📋 *TABELA DE PREÇOS*\n\n💵 *Valores Base:*\n• Taxa inicial: R$ ${config.taxaBase.toFixed(2)}\n• Por km rodado: R$ ${config.precoKm.toFixed(2)}\n• Corrida mínima: R$ ${config.taxaMinima.toFixed(2)}\n\n⏰ *Faixas de Horário (${diaHoje}):*\n`;

        faixasHoje.forEach(f => {
            const emoji = f.multiplicador >= 1.4 ? '🔴' : f.multiplicador >= 1.2 ? '🟡' : '🟢';
            tabela += `\n${emoji} *${f.horaInicio} - ${f.horaFim}*: ${f.nome}`;
            if (f.multiplicador > 1) tabela += ` _(${f.multiplicador}x)_`;
            if (f.taxaAdicional > 0) tabela += ` _+R$${f.taxaAdicional.toFixed(2)}_`;
        });

        tabela += `\n\n📍 *Agora:* ${faixaAtual.nome}`;
        if (faixaAtual.multiplicador > 1) {
            tabela += ` _(tarifa ${faixaAtual.multiplicador}x)_`;
        } else {
            tabela += ` _(tarifa normal)_`;
        }
        
        tabela += `\n\n🟢 Normal | 🟡 Moderado | 🔴 Alta demanda\n\n_Digite *3* para fazer uma cotação!_`;

        return tabela;
    },

    async enviarExemplosPreco() {
        const exemplos = [3, 5, 8, 10, 15, 20];
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        
        let msg = `📊 *EXEMPLOS DE PREÇO*\n_(Horário atual: ${faixaAtual.nome})_\n\n`;
        
        exemplos.forEach(km => {
            const calc = PrecoDinamicoService.calcularPreco(km);
            msg += `📍 *${km} km* → R$ ${calc.precoFinal.toFixed(2)}\n`;
        });
        
        msg += `\n_Valores estimados para agora._\n_Podem variar conforme horário e demanda._\n\nDigite *3* para cotação com endereço!`;

        return msg;
    },

    // ==================== CÁLCULOS ====================
    async calcularCorrida(origem, destino) {
        // Tentar usar Google Maps, senão usa offline
        const rota = await MapsService.calcularRota(origem, destino);
        
        const distanciaKm = rota.sucesso ? rota.distancia.km : 5; // Default 5km se falhar
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
        // Buscar ou criar cliente
        let cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) {
            cliente = ClienteService.criar({ nome: nomeCliente, telefone });
        }
        
        // Criar corrida
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
            origem: dados.origem,
            destino: dados.destino,
            preco: dados.calculo.preco
        };
    },

    async historicoCliente(telefone) {
        const cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) {
            return `📋 *HISTÓRICO*\n\nVocê ainda não tem corridas registradas.\n\nDigite *1* para solicitar sua primeira corrida! 🚗`;
        }
        
        const corridas = CorridaService.listarPorCliente(cliente.id);
        
        if (!corridas || corridas.length === 0) {
            return `📋 *HISTÓRICO*\n\nVocê ainda não tem corridas registradas.\n\nDigite *1* para solicitar sua primeira corrida! 🚗`;
        }
        
        let msg = `📋 *SUAS ÚLTIMAS CORRIDAS*\n\n`;
        
        corridas.slice(0, 5).forEach((c, i) => {
            const status = c.status === 'finalizada' ? '✅' : c.status === 'cancelada' ? '❌' : '⏳';
            msg += `${status} *#${c.id.slice(-6)}*\n`;
            msg += `📍 ${(c.origem?.endereco || c.origem || '').toString().slice(0, 25)}...\n`;
            msg += `💰 R$ ${(c.precoFinal || c.precoEstimado || 0).toFixed(2)}\n\n`;
        });
        
        msg += `Total de corridas: ${cliente.corridasRealizadas || corridas.length}\n\nDigite *1* para nova corrida!`;
        
        return msg;
    },

    // ==================== NOTIFICAÇÕES ====================
    gerarMensagemMotoristaAceitou(corrida, motorista) {
        return `🎉 *MOTORISTA A CAMINHO!*\n\n👨‍✈️ *${motorista.nome}*\n🚗 ${motorista.veiculo?.modelo} ${motorista.veiculo?.cor}\n🔢 Placa: *${motorista.veiculo?.placa}*\n⭐ Avaliação: ${(motorista.avaliacao || 5).toFixed(1)}\n\n📍 Tempo estimado: ~${corrida.tempoChegada || 5} min\n\n_Aguarde no local de embarque!_`;
    },

    gerarMensagemCorridaFinalizada(corrida) {
        return `✅ *CORRIDA FINALIZADA!*\n\n🔢 Código: #${corrida.id.slice(-6)}\n💰 Valor: R$ ${(corrida.precoFinal || corrida.precoEstimado).toFixed(2)}\n📏 Distância: ${corrida.distanciaKm?.toFixed(1) || '?'} km\n\nObrigado por viajar com a UBMAX! 🚗\n\n⭐ Avalie sua corrida de 1 a 5:`;
    },

    gerarMensagemCorridaCancelada(corrida, motivo) {
        return `❌ *CORRIDA CANCELADA*\n\n🔢 Código: #${corrida.id.slice(-6)}\n📝 Motivo: ${motivo || 'Não informado'}\n\nDeseja solicitar uma nova corrida?\nDigite *1* para pedir.`;
    }
};

module.exports = RebecaService;
