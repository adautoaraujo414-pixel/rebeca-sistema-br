const PrecoDinamicoService = require('./preco-dinamico.service');
const MapsService = require('./maps.service');
const CorridaService = require('./corrida.service');
const ClienteService = require('./cliente.service');
const MotoristaService = require('./motorista.service');
const IAService = require('./ia.service');

const conversas = new Map();
const favoritosClientes = new Map();

const configRebeca = {
    enviarLinkRastreamento: true,
    notificarTempoMotorista: true,
    temposNotificacao: [3, 1, 0],
    autoDetectarEndereco: true,
    mensagemBoaViagem: true,
    pedirObservacaoEnderecoImpreciso: true,
    usarIA: true
};

const RebecaService = {
    // ==================== CONFIG ====================
    getConfig: () => ({ 
        ...configRebeca,
        iaAtiva: IAService.isAtivo(),
        iaConfig: IAService.getConfig()
    }),
    
    setConfig: (novaConfig) => {
        Object.assign(configRebeca, novaConfig);
        return RebecaService.getConfig();
    },

    // ==================== HELPERS ====================
    pareceEndereco: (texto) => {
        const padroes = [
            /\d+\s*,?\s*(rua|av|avenida|alameda|travessa|estrada|rod|rodovia|praca|praça)/i,
            /(rua|av|avenida|alameda|travessa|estrada|rod|rodovia|praca|praça)\s+.+\d+/i,
            /\d{5}-?\d{3}/,
            /.+,\s*\d+\s*[-–]\s*.+/i,
            /.+\s+\d+\s*,\s*.+/i,
        ];
        return padroes.some(p => p.test(texto)) && texto.length > 10;
    },

    pareceLocalizacao: (mensagem) => {
        if (typeof mensagem === 'object' && mensagem.latitude && mensagem.longitude) return true;
        return /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(mensagem.toString().trim());
    },

    extrairCoordenadas: (mensagem) => {
        if (typeof mensagem === 'object' && mensagem.latitude && mensagem.longitude) {
            return { latitude: mensagem.latitude, longitude: mensagem.longitude };
        }
        const partes = mensagem.toString().trim().split(',');
        return { latitude: parseFloat(partes[0]), longitude: parseFloat(partes[1]) };
    },

    getFavoritos: (telefone) => favoritosClientes.get(telefone) || {},
    
    salvarFavorito: (telefone, tipo, endereco) => {
        const favoritos = favoritosClientes.get(telefone) || {};
        favoritos[tipo] = endereco;
        favoritosClientes.set(telefone, favoritos);
        return favoritos;
    },

    async validarEndereco(endereco) {
        const resultado = await MapsService.geocodificar(endereco);
        
        if (!resultado.sucesso) {
            return { valido: false, precisao: 'nao_encontrado' };
        }
        
        const temNumero = resultado.componentes?.numero || /\d+/.test(endereco);
        
        if (resultado.offline) {
            return {
                valido: true, precisao: 'aproximado',
                endereco: resultado.endereco,
                latitude: resultado.latitude,
                longitude: resultado.longitude,
                precisaObservacao: true
            };
        }
        
        if (!temNumero) {
            return {
                valido: true, precisao: 'sem_numero',
                endereco: resultado.endereco,
                latitude: resultado.latitude,
                longitude: resultado.longitude,
                precisaObservacao: true
            };
        }
        
        return {
            valido: true, precisao: 'exato',
            endereco: resultado.endereco,
            latitude: resultado.latitude,
            longitude: resultado.longitude,
            componentes: resultado.componentes,
            precisaObservacao: false
        };
    },

    // ==================== PROCESSAR MENSAGEM PRINCIPAL ====================
    async processarMensagem(telefone, mensagem, nome = 'Cliente') {
        const msg = typeof mensagem === 'string' ? mensagem.toLowerCase().trim() : '';
        const msgOriginal = typeof mensagem === 'string' ? mensagem.trim() : '';
        const conversa = conversas.get(telefone) || { etapa: 'inicio', dados: {} };
        const favoritos = RebecaService.getFavoritos(telefone);
        
        let resposta = '';

        // ========== GPS ==========
        if (RebecaService.pareceLocalizacao(mensagem)) {
            const coords = RebecaService.extrairCoordenadas(mensagem);
            const endereco = await MapsService.geocodificarReverso(coords.latitude, coords.longitude);
            
            conversa.dados.origemGPS = coords;
            conversa.dados.origem = endereco.endereco || `${coords.latitude}, ${coords.longitude}`;
            conversa.dados.origemValidada = { valido: true, precisao: 'gps', latitude: coords.latitude, longitude: coords.longitude };
            conversa.etapa = 'pedir_destino_rapido';
            
            resposta = `📍 *Localização recebida!*\n\n${conversa.dados.origem}\n\n🏁 Envie o *destino*:`;
            if (favoritos.casa) resposta += `\n• Digite *casa*`;
            if (favoritos.trabalho) resposta += `\n• Digite *trabalho*`;
            
            conversas.set(telefone, conversa);
            return resposta;
        }

        // ========== TENTAR IA PRIMEIRO ==========
        if (configRebeca.usarIA && IAService.isAtivo() && conversa.etapa === 'inicio') {
            const analise = await IAService.analisarMensagem(msgOriginal, {
                nome, telefone,
                etapa: conversa.etapa,
                temCasa: !!favoritos.casa,
                temTrabalho: !!favoritos.trabalho
            });

            if (analise.usarIA && analise.confianca >= 0.7) {
                const resultadoIA = await RebecaService.processarComIA(telefone, nome, analise, conversa, favoritos);
                if (resultadoIA) {
                    conversas.set(telefone, conversa);
                    return resultadoIA;
                }
            }
        }

        // ========== COMANDOS DIRETOS ==========
        if (msg === 'menu' || msg === 'oi' || msg === 'olá' || msg === 'ola' || msg === 'inicio' || msg === 'boa tarde' || msg === 'boa noite' || msg === 'bom dia') {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            resposta = RebecaService.menuPrincipal(nome, telefone);
        }
        else if (msg === '1' || msg.includes('pedir') || msg.includes('corrida') || msg.includes('carro') || msg.includes('taxi') || msg.includes('uber') || msg.includes('chamar') || msg.includes('preciso ir') || msg.includes('me busca') || msg.includes('vem me buscar')) {
            conversa.etapa = 'pedir_origem';
            resposta = `📍 *SOLICITAR CORRIDA*\n\nEnvie:\n• 📍 Sua *localização*\n• 🏠 Digite *casa* ou *trabalho*\n• 📝 Ou o endereço completo`;
        }
        else if (msg === '2' || msg.includes('preço') || msg.includes('preco') || msg.includes('tabela') || msg.includes('quanto custa')) {
            resposta = await RebecaService.enviarTabelaPrecos();
        }
        else if (msg === '3' || msg.includes('cotação') || msg.includes('cotacao') || msg.includes('simular') || msg.includes('quanto fica') || msg.includes('qual o valor')) {
            conversa.etapa = 'cotacao_origem';
            resposta = `💰 *COTAÇÃO*\n\nEnvie o *endereço de origem*:`;
        }
        else if (msg === '4' || msg.includes('minhas corridas') || msg.includes('historico') || msg.includes('histórico')) {
            resposta = await RebecaService.historicoCliente(telefone);
        }
        else if (msg === '5' || msg.includes('atendente') || msg.includes('humano') || msg.includes('falar com')) {
            resposta = `👤 *ATENDIMENTO*\n\nUm atendente vai te ajudar em breve.\n\n📞 Ou ligue: (11) 99999-9999`;
        }
        else if (msg === '6' || msg.includes('exemplo')) {
            resposta = await RebecaService.enviarExemplosPreco();
        }
        else if (msg === '7' || msg.includes('favorito') || msg.includes('salvar endereco') || msg.includes('cadastrar casa')) {
            conversa.etapa = 'menu_favoritos';
            resposta = `⭐ *FAVORITOS*\n\n`;
            resposta += favoritos.casa ? `🏠 Casa: ${favoritos.casa.endereco}\n` : `🏠 Casa: _Não cadastrado_\n`;
            resposta += favoritos.trabalho ? `🏢 Trabalho: ${favoritos.trabalho.endereco}\n` : `🏢 Trabalho: _Não cadastrado_\n`;
            resposta += `\n*1* - Cadastrar Casa\n*2* - Cadastrar Trabalho\n*0* - Voltar`;
        }
        else if (msg.includes('cancelar')) {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            resposta = `❌ Cancelado.\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
        }
        else if (msg.includes('rastrear') || msg.includes('onde está') || msg.includes('cadê') || msg.includes('cade o motorista')) {
            resposta = await RebecaService.enviarRastreamento(telefone);
        }
        // ========== FAVORITOS ==========
        else if (conversa.etapa === 'menu_favoritos') {
            if (msg === '1') {
                conversa.etapa = 'salvar_casa';
                resposta = `🏠 Envie o endereço da sua *casa*:`;
            } else if (msg === '2') {
                conversa.etapa = 'salvar_trabalho';
                resposta = `🏢 Envie o endereço do *trabalho*:`;
            } else {
                conversa.etapa = 'inicio';
                resposta = RebecaService.menuPrincipal(nome, telefone);
            }
        }
        else if (conversa.etapa === 'salvar_casa' || conversa.etapa === 'salvar_trabalho') {
            const tipo = conversa.etapa === 'salvar_casa' ? 'casa' : 'trabalho';
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            
            if (validacao.valido) {
                RebecaService.salvarFavorito(telefone, tipo, {
                    endereco: validacao.endereco,
                    latitude: validacao.latitude,
                    longitude: validacao.longitude
                });
                conversa.etapa = 'inicio';
                resposta = `✅ *${tipo.toUpperCase()} SALVO!*\n\n${validacao.endereco}\n\nAgora digite *${tipo}* para usar!\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
            } else {
                resposta = `❌ Não encontrei. Tente com mais detalhes.`;
            }
        }
        // ========== ATALHO FAVORITOS ==========
        else if ((msg === 'casa' || msg === 'trabalho' || msg === 'ir pra casa' || msg === 'ir pro trabalho' || msg === 'voltar pra casa') && conversa.etapa === 'inicio') {
            const tipo = msg.includes('trabalho') ? 'trabalho' : 'casa';
            
            if (favoritos[tipo]) {
                conversa.dados.origem = favoritos[tipo].endereco;
                conversa.dados.origemValidada = { valido: true, precisao: 'favorito', ...favoritos[tipo] };
                conversa.etapa = 'pedir_destino_rapido';
                resposta = `📍 *Origem:* ${favoritos[tipo].endereco}\n\n🏁 Envie o *destino*:`;
            } else {
                conversa.etapa = tipo === 'casa' ? 'salvar_casa' : 'salvar_trabalho';
                resposta = `Você não cadastrou ${tipo} ainda.\n\nEnvie o endereço:`;
            }
        }
        // ========== AUTO-DETECT ENDEREÇO ==========
        else if (configRebeca.autoDetectarEndereco && conversa.etapa === 'inicio' && RebecaService.pareceEndereco(msgOriginal)) {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            
            conversa.dados.origemTexto = msgOriginal;
            conversa.dados.origemValidada = validacao;
            
            if (!validacao.valido) {
                // Tentar IA para extrair endereço
                if (configRebeca.usarIA && IAService.isAtivo()) {
                    const extracao = await IAService.extrairEndereco(msgOriginal);
                    if (extracao.encontrado && extracao.endereco) {
                        const validacao2 = await RebecaService.validarEndereco(extracao.endereco);
                        if (validacao2.valido) {
                            conversa.dados.origemValidada = validacao2;
                            conversa.dados.origem = validacao2.endereco;
                            if (extracao.referencia) {
                                conversa.dados.observacaoOrigem = extracao.referencia;
                            }
                            conversa.etapa = 'confirmar_origem_auto';
                            resposta = `📍 Entendi! Você está em:\n*${validacao2.endereco}*`;
                            if (extracao.referencia) resposta += `\n📝 Ref: ${extracao.referencia}`;
                            resposta += `\n\n*1* - ✅ Chamar carro\n*2* - 📝 Outro endereço`;
                            conversas.set(telefone, conversa);
                            return resposta;
                        }
                    }
                }
                conversa.etapa = 'pedir_origem';
                resposta = `❌ Não encontrei esse endereço.\n\nTente com número, bairro e cidade.\nOu envie sua 📍 localização.`;
            } else if (validacao.precisaObservacao && configRebeca.pedirObservacaoEnderecoImpreciso) {
                conversa.etapa = 'pedir_observacao_origem';
                resposta = `📍 *Encontrei:* ${validacao.endereco}\n\n⚠️ _Localização aproximada_\n\nEnvie uma *referência* pro motorista:\n_Ex: casa azul, perto do mercado_\n\nOu *0* para continuar sem.`;
            } else {
                conversa.dados.origem = validacao.endereco;
                conversa.etapa = 'confirmar_origem_auto';
                resposta = `📍 Você está em:\n*${validacao.endereco}*?\n\n*1* - ✅ Chamar carro\n*2* - 📝 Outro endereço\n*3* - 💰 Só cotação`;
            }
        }
        // ========== OBSERVAÇÃO ==========
        else if (conversa.etapa === 'pedir_observacao_origem') {
            if (msg !== '0') conversa.dados.observacaoOrigem = msgOriginal;
            conversa.dados.origem = conversa.dados.origemValidada.endereco;
            conversa.etapa = 'confirmar_origem_auto';
            resposta = `📍 *Origem:* ${conversa.dados.origem}`;
            if (conversa.dados.observacaoOrigem) resposta += `\n📝 *Ref:* ${conversa.dados.observacaoOrigem}`;
            resposta += `\n\n*1* - ✅ Chamar carro\n*2* - 📝 Outro endereço`;
        }
        // ========== CONFIRMAR ORIGEM ==========
        else if (conversa.etapa === 'confirmar_origem_auto') {
            if (msg === '1' || msg.includes('sim') || msg.includes('confirmar') || msg.includes('isso')) {
                conversa.etapa = 'pedir_destino_rapido';
                resposta = `✅ *Origem confirmada!*\n\n🏁 Agora o *destino*:`;
                if (favoritos.casa) resposta += `\n• *casa* - 🏠`;
                if (favoritos.trabalho) resposta += `\n• *trabalho* - 🏢`;
            } else if (msg === '2') {
                conversa.etapa = 'pedir_origem';
                conversa.dados = {};
                resposta = `📍 Envie o endereço de origem:`;
            } else if (msg === '3') {
                conversa.etapa = 'cotacao_destino';
                resposta = `💰 *COTAÇÃO*\n\n📍 Origem: ${conversa.dados.origem}\n\n🏁 Envie o destino:`;
            } else {
                resposta = `Digite *1*, *2* ou *3*.`;
            }
        }
        // ========== DESTINO RÁPIDO ==========
        else if (conversa.etapa === 'pedir_destino_rapido') {
            let destinoFinal = null;
            
            if ((msg === '1' || msg === 'casa' || msg === 'ir pra casa') && favoritos.casa) {
                destinoFinal = favoritos.casa;
                conversa.dados.destino = favoritos.casa.endereco;
            } else if ((msg === '2' || msg === 'trabalho' || msg === 'ir pro trabalho') && favoritos.trabalho) {
                destinoFinal = favoritos.trabalho;
                conversa.dados.destino = favoritos.trabalho.endereco;
            } else {
                const validacao = await RebecaService.validarEndereco(msgOriginal);
                
                if (!validacao.valido) {
                    // Tentar IA
                    if (configRebeca.usarIA && IAService.isAtivo()) {
                        const extracao = await IAService.extrairEndereco(msgOriginal);
                        if (extracao.encontrado && extracao.endereco) {
                            const val2 = await RebecaService.validarEndereco(extracao.endereco);
                            if (val2.valido) {
                                conversa.dados.destino = val2.endereco;
                                if (extracao.referencia) conversa.dados.observacaoDestino = extracao.referencia;
                                destinoFinal = val2;
                            }
                        }
                    }
                    
                    if (!destinoFinal) {
                        resposta = `❌ Destino não encontrado. Tente novamente.`;
                        conversas.set(telefone, conversa);
                        return resposta;
                    }
                } else {
                    conversa.dados.destino = validacao.endereco;
                    conversa.dados.destinoValidado = validacao;
                    
                    if (validacao.precisaObservacao && configRebeca.pedirObservacaoEnderecoImpreciso) {
                        conversa.etapa = 'pedir_observacao_destino';
                        resposta = `🏁 *Destino:* ${validacao.endereco}\n\n⚠️ Envie referência ou *0*:`;
                        conversas.set(telefone, conversa);
                        return resposta;
                    }
                }
            }
            
            // Criar corrida
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
            conversa.etapa = 'inicio';
            
            resposta = `🚗 *CARRO SOLICITADO!*\n\n📍 *De:* ${conversa.dados.origem}`;
            if (conversa.dados.observacaoOrigem) resposta += `\n📝 _${conversa.dados.observacaoOrigem}_`;
            resposta += `\n\n🏁 *Para:* ${conversa.dados.destino}`;
            if (conversa.dados.observacaoDestino) resposta += `\n📝 _${conversa.dados.observacaoDestino}_`;
            resposta += `\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *R$ ${corrida.preco.toFixed(2)}*`;
            resposta += `\n\n⏳ Buscando motorista...\n🔢 #${corrida.id.slice(-6)}`;
            
            if (configRebeca.enviarLinkRastreamento) {
                resposta += `\n\n📲 ${RebecaService.gerarLinkRastreamento(corrida.id)}`;
            }
            
            conversa.dados = {};
        }
        // ========== OBSERVAÇÃO DESTINO ==========
        else if (conversa.etapa === 'pedir_observacao_destino') {
            if (msg !== '0') conversa.dados.observacaoDestino = msgOriginal;
            
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
            conversa.etapa = 'inicio';
            
            resposta = `🚗 *CARRO SOLICITADO!*\n\n📍 *De:* ${conversa.dados.origem}`;
            if (conversa.dados.observacaoOrigem) resposta += `\n📝 _${conversa.dados.observacaoOrigem}_`;
            resposta += `\n\n🏁 *Para:* ${conversa.dados.destino}`;
            if (conversa.dados.observacaoDestino) resposta += `\n📝 _${conversa.dados.observacaoDestino}_`;
            resposta += `\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *R$ ${corrida.preco.toFixed(2)}*`;
            resposta += `\n\n⏳ Buscando motorista...\n🔢 #${corrida.id.slice(-6)}`;
            
            if (configRebeca.enviarLinkRastreamento) {
                resposta += `\n\n📲 ${RebecaService.gerarLinkRastreamento(corrida.id)}`;
            }
            
            conversa.dados = {};
        }
        // ========== PEDIR ORIGEM NORMAL ==========
        else if (conversa.etapa === 'pedir_origem') {
            if (msg === 'casa' && favoritos.casa) {
                conversa.dados.origem = favoritos.casa.endereco;
                conversa.etapa = 'pedir_destino';
                resposta = `📍 *Origem:* ${favoritos.casa.endereco}\n\n🏁 Destino:`;
            } else if (msg === 'trabalho' && favoritos.trabalho) {
                conversa.dados.origem = favoritos.trabalho.endereco;
                conversa.etapa = 'pedir_destino';
                resposta = `📍 *Origem:* ${favoritos.trabalho.endereco}\n\n🏁 Destino:`;
            } else {
                const validacao = await RebecaService.validarEndereco(msgOriginal);
                if (!validacao.valido) {
                    resposta = `❌ Não encontrei. Envie com número e bairro.`;
                } else {
                    conversa.dados.origem = validacao.endereco;
                    conversa.etapa = 'pedir_destino';
                    resposta = `✅ *Origem:* ${validacao.endereco}\n\n🏁 Agora o destino:`;
                }
            }
        }
        else if (conversa.etapa === 'pedir_destino') {
            if (msg === 'casa' && favoritos.casa) {
                conversa.dados.destino = favoritos.casa.endereco;
            } else if (msg === 'trabalho' && favoritos.trabalho) {
                conversa.dados.destino = favoritos.trabalho.endereco;
            } else {
                const validacao = await RebecaService.validarEndereco(msgOriginal);
                if (!validacao.valido) {
                    resposta = `❌ Destino não encontrado.`;
                    conversas.set(telefone, conversa);
                    return resposta;
                }
                conversa.dados.destino = validacao.endereco;
            }
            
            conversa.etapa = 'confirmar_corrida';
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            resposta = `🚗 *RESUMO*\n\n📍 ${conversa.dados.origem}\n🏁 ${conversa.dados.destino}\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar`;
        }
        else if (conversa.etapa === 'confirmar_corrida') {
            if (msg === '1' || msg.includes('sim') || msg.includes('confirmar')) {
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
                conversa.etapa = 'inicio';
                
                resposta = `🎉 *CONFIRMADO!*\n\n🔢 #${corrida.id.slice(-6)}\n💰 R$ ${corrida.preco.toFixed(2)}\n\n⏳ Buscando motorista...`;
                if (configRebeca.enviarLinkRastreamento) {
                    resposta += `\n\n📲 ${RebecaService.gerarLinkRastreamento(corrida.id)}`;
                }
                conversa.dados = {};
            } else {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                resposta = `❌ Cancelado.\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
            }
        }
        // ========== COTAÇÃO ==========
        else if (conversa.etapa === 'cotacao_origem') {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            if (!validacao.valido) {
                resposta = `❌ Não encontrei. Tente novamente.`;
            } else {
                conversa.dados.origem = validacao.endereco;
                conversa.etapa = 'cotacao_destino';
                resposta = `✅ Origem: ${validacao.endereco}\n\n🏁 Destino:`;
            }
        }
        else if (conversa.etapa === 'cotacao_destino') {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            if (!validacao.valido) {
                resposta = `❌ Não encontrei. Tente novamente.`;
            } else {
                conversa.etapa = 'inicio';
                const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, validacao.endereco);
                resposta = `💰 *COTAÇÃO*\n\n📍 ${conversa.dados.origem}\n🏁 ${validacao.endereco}\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n\n💵 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - 🚗 Pedir agora\n*menu* - Voltar`;
                conversa.dados = {};
            }
        }
        // ========== TENTAR IA PARA PERGUNTAS ==========
        else if (configRebeca.usarIA && IAService.isAtivo()) {
            const respostaIA = await IAService.responderPergunta(msgOriginal, PrecoDinamicoService.getConfig());
            if (respostaIA) {
                resposta = respostaIA + `\n\n_Digite *menu* para ver opções._`;
            } else {
                resposta = `🤔 Não entendi.\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
            }
        }
        else {
            resposta = `🤔 Não entendi.\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
        }

        conversas.set(telefone, conversa);
        return resposta;
    },

    // ==================== PROCESSAR COM IA ====================
    async processarComIA(telefone, nome, analise, conversa, favoritos) {
        // Pedir corrida com origem e destino já identificados
        if (analise.intencao === 'pedir_corrida') {
            // Usar favorito
            if (analise.usarFavorito && favoritos[analise.usarFavorito]) {
                conversa.dados.origem = favoritos[analise.usarFavorito].endereco;
                conversa.dados.origemValidada = { valido: true, ...favoritos[analise.usarFavorito] };
                
                if (analise.destino) {
                    const validacao = await RebecaService.validarEndereco(analise.destino);
                    if (validacao.valido) {
                        conversa.dados.destino = validacao.endereco;
                        if (analise.observacao) conversa.dados.observacaoDestino = analise.observacao;
                        
                        const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
                        conversa.dados.calculo = calculo;
                        
                        conversa.etapa = 'confirmar_corrida';
                        let resp = `🚗 *Entendi!*\n\n📍 *De:* ${conversa.dados.origem}\n🏁 *Para:* ${conversa.dados.destino}`;
                        if (analise.observacao) resp += `\n📝 _${analise.observacao}_`;
                        resp += `\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar`;
                        return resp;
                    }
                }
                
                conversa.etapa = 'pedir_destino_rapido';
                return `📍 *Origem:* ${conversa.dados.origem}\n\n🏁 Pra onde você quer ir?`;
            }
            
            // Origem identificada
            if (analise.origem) {
                const validacao = await RebecaService.validarEndereco(analise.origem);
                if (validacao.valido) {
                    conversa.dados.origem = validacao.endereco;
                    conversa.dados.origemValidada = validacao;
                    if (analise.observacao) conversa.dados.observacaoOrigem = analise.observacao;
                    
                    // Se também tem destino
                    if (analise.destino) {
                        const valDest = await RebecaService.validarEndereco(analise.destino);
                        if (valDest.valido) {
                            conversa.dados.destino = valDest.endereco;
                            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
                            conversa.dados.calculo = calculo;
                            
                            conversa.etapa = 'confirmar_corrida';
                            let resp = `🚗 *Entendi!*\n\n📍 *De:* ${conversa.dados.origem}`;
                            if (conversa.dados.observacaoOrigem) resp += `\n📝 _${conversa.dados.observacaoOrigem}_`;
                            resp += `\n\n🏁 *Para:* ${conversa.dados.destino}`;
                            resp += `\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar`;
                            return resp;
                        }
                    }
                    
                    conversa.etapa = 'pedir_destino_rapido';
                    let resp = `📍 *Origem:* ${conversa.dados.origem}`;
                    if (conversa.dados.observacaoOrigem) resp += `\n📝 _${conversa.dados.observacaoOrigem}_`;
                    resp += `\n\n🏁 Pra onde?`;
                    return resp;
                }
            }
            
            // Só intenção
            conversa.etapa = 'pedir_origem';
            return `🚗 Beleza! Vamos lá.\n\n📍 Envie sua *localização* ou o endereço de origem:`;
        }
        
        // Cotação
        if (analise.intencao === 'cotacao' && analise.origem && analise.destino) {
            const valOrig = await RebecaService.validarEndereco(analise.origem);
            const valDest = await RebecaService.validarEndereco(analise.destino);
            
            if (valOrig.valido && valDest.valido) {
                const calculo = await RebecaService.calcularCorrida(valOrig.endereco, valDest.endereco);
                return `💰 *COTAÇÃO*\n\n📍 ${valOrig.endereco}\n🏁 ${valDest.endereco}\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n\n💵 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - 🚗 Pedir agora`;
            }
        }
        
        // Histórico
        if (analise.intencao === 'historico') {
            return await RebecaService.historicoCliente(telefone);
        }
        
        // Preços
        if (analise.intencao === 'precos') {
            return await RebecaService.enviarTabelaPrecos();
        }
        
        // Rastrear
        if (analise.intencao === 'rastrear') {
            return await RebecaService.enviarRastreamento(telefone);
        }
        
        return null;
    },

    // ==================== FUNÇÕES AUXILIARES ====================
    menuPrincipal: (nome, telefone) => {
        const favoritos = RebecaService.getFavoritos(telefone);
        let menu = `Olá${nome ? ', *' + nome + '*' : ''}! 👋\n\n`;
        menu += `*1* - 🚗 Pedir corrida\n`;
        menu += `*2* - 💵 Ver preços\n`;
        menu += `*3* - 💰 Cotação\n`;
        menu += `*4* - 📋 Histórico\n`;
        menu += `*5* - 👤 Atendente\n`;
        menu += `*7* - ⭐ Favoritos\n`;
        menu += `\n💡 _Envie seu endereço ou localização!_`;
        if (favoritos.casa || favoritos.trabalho) {
            menu += `\n⭐ _Atalhos: *casa* ou *trabalho*_`;
        }
        return menu;
    },

    gerarLinkRastreamento: (corridaId) => {
        return `${process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com'}/rastrear/${corridaId.slice(-8)}`;
    },

    async enviarRastreamento(telefone) {
        const cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) return `Sem corridas ativas. Digite *1* para pedir!`;
        const corridas = CorridaService.listarPorCliente(cliente.id);
        const ativa = corridas.find(c => ['aceita', 'em_andamento', 'a_caminho', 'pendente'].includes(c.status));
        if (!ativa) return `Sem corridas ativas. Digite *1* para pedir!`;
        return `📲 *RASTREAMENTO*\n\n#${ativa.id.slice(-6)}\n${RebecaService.formatarStatus(ativa.status)}\n\n🔗 ${RebecaService.gerarLinkRastreamento(ativa.id)}`;
    },

    formatarStatus: (s) => ({ 'pendente': '⏳ Buscando', 'aceita': '✅ Aceita', 'a_caminho': '🚗 A caminho', 'em_andamento': '🚀 Em viagem', 'finalizada': '✅ Finalizada', 'cancelada': '❌ Cancelada' }[s] || s),

    async enviarTabelaPrecos() {
        const config = PrecoDinamicoService.getConfig();
        const faixa = PrecoDinamicoService.obterFaixaAtual();
        let t = `📋 *PREÇOS*\n\n• Taxa: R$ ${config.taxaBase.toFixed(2)}\n• Km: R$ ${config.precoKm.toFixed(2)}\n• Mínimo: R$ ${config.taxaMinima.toFixed(2)}\n\n📍 *Agora:* ${faixa.nome}`;
        if (faixa.tipo === 'fixo' && faixa.valorFixo > 0) t += ` = R$ ${faixa.valorFixo.toFixed(2)}`;
        else if (faixa.multiplicador > 1) t += ` (${faixa.multiplicador}x)`;
        return t + `\n\n_Envie endereço para cotação!_`;
    },

    async enviarExemplosPreco() {
        const faixa = PrecoDinamicoService.obterFaixaAtual();
        let m = `📊 *EXEMPLOS* _(${faixa.nome})_\n\n`;
        [3, 5, 10, 15, 20].forEach(km => {
            m += `${km}km → R$ ${PrecoDinamicoService.calcularPreco(km).precoFinal.toFixed(2)}\n`;
        });
        return m;
    },

    async calcularCorrida(origem, destino) {
        const rota = await MapsService.calcularRota(origem, destino);
        const km = rota.sucesso ? rota.distancia.km : 5;
        const min = rota.sucesso ? rota.duracao.minutos : 15;
        const calc = PrecoDinamicoService.calcularPreco(km);
        return {
            distancia: rota.sucesso ? rota.distancia.texto : `~${km} km`,
            tempo: rota.sucesso ? rota.duracao.texto : `~${min} min`,
            distanciaKm: km, tempoMinutos: min,
            preco: calc.precoFinal,
            detalhes: calc.detalhes,
            faixa: PrecoDinamicoService.obterFaixaAtual(),
            origem: rota.sucesso ? rota.origem : { endereco: origem },
            destino: rota.sucesso ? rota.destino : { endereco: destino }
        };
    },

    async criarCorrida(telefone, nomeCliente, dados) {
        let cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) cliente = ClienteService.criar({ nome: nomeCliente, telefone });
        
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
            multiplicador: dados.calculo.faixa.multiplicador,
            observacaoOrigem: dados.observacaoOrigem || null,
            observacaoDestino: dados.observacaoDestino || null
        });
        
        return { id: corrida.id, origem: dados.origem, destino: dados.destino, preco: dados.calculo.preco };
    },

    async historicoCliente(telefone) {
        const cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) return `📋 Sem corridas. Envie endereço para pedir!`;
        const corridas = CorridaService.listarPorCliente(cliente.id);
        if (!corridas?.length) return `📋 Sem corridas. Envie endereço para pedir!`;
        let m = `📋 *CORRIDAS*\n\n`;
        corridas.slice(0, 5).forEach(c => {
            m += `${c.status === 'finalizada' ? '✅' : c.status === 'cancelada' ? '❌' : '⏳'} #${c.id.slice(-6)} - R$ ${(c.precoFinal || c.precoEstimado || 0).toFixed(2)}\n`;
        });
        return m;
    },

    // Notificações
    gerarNotificacaoTempo: (min, mot) => {
        if (min === 3) return `🚗 *3 MINUTOS*\n\n${mot.nome} chegando!\n${mot.veiculo?.modelo} *${mot.veiculo?.placa}*`;
        if (min === 1) return `🚗 *1 MINUTO*\n\nPrepare-se!`;
        if (min === 0) return `🎉 *CHEGOU!*\n\n${mot.nome}\n*${mot.veiculo?.placa}*`;
        return null;
    },
    gerarMensagemBoaViagem: (c) => `🚀 *BOA VIAGEM!*\n\n🏁 ${c.destino?.endereco || c.destino}`,
    gerarMensagemMotoristaAceitou: (c, m) => {
        let r = `🎉 *MOTORISTA A CAMINHO!*\n\n👨‍✈️ *${m.nome}*\n🚗 ${m.veiculo?.modelo} ${m.veiculo?.cor}\n🔢 *${m.veiculo?.placa}*`;
        if (c.observacaoOrigem) r += `\n\n📝 *Obs:* ${c.observacaoOrigem}`;
        if (configRebeca.enviarLinkRastreamento) r += `\n\n📲 ${RebecaService.gerarLinkRastreamento(c.id)}`;
        return r;
    },
    gerarMensagemCorridaFinalizada: (c) => `✅ *FINALIZADA!*\n\n#${c.id.slice(-6)}\n💰 R$ ${(c.precoFinal || c.precoEstimado).toFixed(2)}\n\n⭐ Avalie de 1 a 5:`,
    gerarMensagemCorridaCancelada: (c, m) => `❌ *CANCELADA*\n\n#${c.id.slice(-6)}\n📝 ${m || '-'}`
};

module.exports = RebecaService;
