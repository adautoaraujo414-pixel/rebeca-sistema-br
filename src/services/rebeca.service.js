const PrecoDinamicoService = require('./preco-dinamico.service');
const MapsService = require('./maps.service');
const CorridaService = require('./corrida.service');
const ClienteService = require('./cliente.service');
const MotoristaService = require('./motorista.service');

const conversas = new Map();
const favoritosClientes = new Map(); // telefone -> { casa: {}, trabalho: {} }

// Configurações da Rebeca
const configRebeca = {
    enviarLinkRastreamento: true,
    notificarTempoMotorista: true,
    temposNotificacao: [3, 1, 0],
    autoDetectarEndereco: true,
    mensagemBoaViagem: true,
    pedirObservacaoEnderecoImpreciso: true
};

const RebecaService = {
    // ==================== CONFIG ====================
    getConfig: () => ({ ...configRebeca }),
    
    setConfig: (novaConfig) => {
        Object.assign(configRebeca, novaConfig);
        return configRebeca;
    },

    // ==================== DETECTAR TIPO DE MENSAGEM ====================
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
        // Detectar se é coordenadas GPS (enviadas pelo WhatsApp)
        // Formato: latitude,longitude ou objeto com lat/lng
        if (typeof mensagem === 'object' && mensagem.latitude && mensagem.longitude) {
            return true;
        }
        // Formato texto: -23.5327,-46.7917
        const regex = /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/;
        return regex.test(mensagem.toString().trim());
    },

    extrairCoordenadas: (mensagem) => {
        if (typeof mensagem === 'object' && mensagem.latitude && mensagem.longitude) {
            return { latitude: mensagem.latitude, longitude: mensagem.longitude };
        }
        const partes = mensagem.toString().trim().split(',');
        return {
            latitude: parseFloat(partes[0]),
            longitude: parseFloat(partes[1])
        };
    },

    // ==================== VALIDAR ENDEREÇO NO GOOGLE MAPS ====================
    async validarEndereco(endereco) {
        const resultado = await MapsService.geocodificar(endereco);
        
        if (!resultado.sucesso) {
            return { valido: false, precisao: 'nao_encontrado', mensagem: 'Endereço não encontrado' };
        }
        
        // Verificar se tem número na rua
        const temNumero = resultado.componentes?.numero || /\d+/.test(endereco);
        
        // Verificar se retornou offline (sem Google Maps)
        if (resultado.offline) {
            return {
                valido: true,
                precisao: 'aproximado',
                endereco: resultado.endereco,
                latitude: resultado.latitude,
                longitude: resultado.longitude,
                mensagem: 'Localização aproximada (sem Google Maps)',
                precisaObservacao: true
            };
        }
        
        // Verificar precisão do resultado
        if (!temNumero) {
            return {
                valido: true,
                precisao: 'sem_numero',
                endereco: resultado.endereco,
                latitude: resultado.latitude,
                longitude: resultado.longitude,
                mensagem: 'Endereço sem número',
                precisaObservacao: true
            };
        }
        
        return {
            valido: true,
            precisao: 'exato',
            endereco: resultado.endereco,
            latitude: resultado.latitude,
            longitude: resultado.longitude,
            componentes: resultado.componentes,
            precisaObservacao: false
        };
    },

    // ==================== FAVORITOS ====================
    getFavoritos: (telefone) => {
        return favoritosClientes.get(telefone) || {};
    },

    salvarFavorito: (telefone, tipo, endereco) => {
        const favoritos = favoritosClientes.get(telefone) || {};
        favoritos[tipo] = endereco;
        favoritosClientes.set(telefone, favoritos);
        return favoritos;
    },

    // ==================== PROCESSAR MENSAGEM ====================
    async processarMensagem(telefone, mensagem, nome = 'Cliente') {
        const msg = typeof mensagem === 'string' ? mensagem.toLowerCase().trim() : '';
        const conversa = conversas.get(telefone) || { etapa: 'inicio', dados: {} };
        
        let resposta = '';

        // ========== LOCALIZAÇÃO GPS ==========
        if (RebecaService.pareceLocalizacao(mensagem)) {
            const coords = RebecaService.extrairCoordenadas(mensagem);
            const endereco = await MapsService.geocodificarReverso(coords.latitude, coords.longitude);
            
            conversa.dados.origemGPS = coords;
            conversa.dados.origem = endereco.endereco || `${coords.latitude}, ${coords.longitude}`;
            conversa.dados.origemValidada = {
                valido: true,
                precisao: 'gps',
                latitude: coords.latitude,
                longitude: coords.longitude,
                endereco: endereco.endereco
            };
            conversa.etapa = 'pedir_destino_rapido';
            
            resposta = `📍 *Localização recebida!*\n\n${endereco.endereco || 'Sua localização'}\n\n🏁 Agora envie o *destino* ou escolha:\n\n*1* - 🏠 Casa\n*2* - 🏢 Trabalho\n*3* - 📝 Digitar endereço`;
            
            conversas.set(telefone, conversa);
            return resposta;
        }

        // ========== COMANDOS RÁPIDOS ==========
        if (msg === 'menu' || msg === 'oi' || msg === 'olá' || msg === 'ola' || msg === 'inicio') {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            resposta = RebecaService.menuPrincipal(nome, telefone);
        }
        else if (msg === '1' || msg.includes('pedir') || msg.includes('corrida') || msg.includes('solicitar') || msg.includes('carro') || msg.includes('taxi')) {
            conversa.etapa = 'pedir_origem';
            resposta = `📍 *SOLICITAR CORRIDA*\n\nEnvie:\n• 📍 Sua *localização* (clique no 📎)\n• 🏠 Digite *casa* ou *trabalho*\n• 📝 Ou digite o endereço completo\n\n_Ex: Av Rio de Janeiro, 2981 - Osasco_`;
        }
        else if (msg === '2' || msg.includes('preço') || msg.includes('preco') || msg.includes('tabela')) {
            resposta = await RebecaService.enviarTabelaPrecos();
        }
        else if (msg === '3' || msg.includes('cotação') || msg.includes('cotacao') || msg.includes('simular')) {
            conversa.etapa = 'cotacao_origem';
            resposta = `💰 *COTAÇÃO*\n\nEnvie o *endereço de origem*:`;
        }
        else if (msg === '4' || msg.includes('minhas corridas') || msg.includes('historico') || msg.includes('histórico')) {
            resposta = await RebecaService.historicoCliente(telefone);
        }
        else if (msg === '5' || msg.includes('atendente') || msg.includes('humano')) {
            resposta = `👤 *ATENDIMENTO*\n\nUm atendente irá falar com você em breve.\n\n📞 Ou ligue: (11) 99999-9999`;
        }
        else if (msg === '6' || msg.includes('exemplo')) {
            resposta = await RebecaService.enviarExemplosPreco();
        }
        else if (msg === '7' || msg.includes('favorito') || msg.includes('salvar')) {
            conversa.etapa = 'menu_favoritos';
            const favoritos = RebecaService.getFavoritos(telefone);
            resposta = `⭐ *ENDEREÇOS FAVORITOS*\n\n`;
            resposta += favoritos.casa ? `🏠 Casa: ${favoritos.casa.endereco}\n` : `🏠 Casa: _Não cadastrado_\n`;
            resposta += favoritos.trabalho ? `🏢 Trabalho: ${favoritos.trabalho.endereco}\n` : `🏢 Trabalho: _Não cadastrado_\n`;
            resposta += `\n*1* - Cadastrar/Alterar Casa\n*2* - Cadastrar/Alterar Trabalho\n*0* - Voltar`;
        }
        else if (msg.includes('cancelar')) {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            resposta = `❌ Operação cancelada.\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
        }
        else if (msg.includes('rastrear') || msg.includes('onde está') || msg.includes('cadê')) {
            resposta = await RebecaService.enviarRastreamento(telefone);
        }
        // ========== FAVORITOS MENU ==========
        else if (conversa.etapa === 'menu_favoritos') {
            if (msg === '1') {
                conversa.etapa = 'salvar_casa';
                resposta = `🏠 *CADASTRAR CASA*\n\nEnvie o endereço completo da sua casa:`;
            } else if (msg === '2') {
                conversa.etapa = 'salvar_trabalho';
                resposta = `🏢 *CADASTRAR TRABALHO*\n\nEnvie o endereço completo do seu trabalho:`;
            } else {
                conversa.etapa = 'inicio';
                resposta = RebecaService.menuPrincipal(nome, telefone);
            }
        }
        else if (conversa.etapa === 'salvar_casa' || conversa.etapa === 'salvar_trabalho') {
            const tipo = conversa.etapa === 'salvar_casa' ? 'casa' : 'trabalho';
            const validacao = await RebecaService.validarEndereco(mensagem);
            
            if (validacao.valido) {
                RebecaService.salvarFavorito(telefone, tipo, {
                    endereco: validacao.endereco,
                    latitude: validacao.latitude,
                    longitude: validacao.longitude
                });
                conversa.etapa = 'inicio';
                const emoji = tipo === 'casa' ? '🏠' : '🏢';
                resposta = `✅ ${emoji} *${tipo.toUpperCase()} SALVO!*\n\n${validacao.endereco}\n\nAgora você pode pedir corrida digitando apenas *"${tipo}"*!\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
            } else {
                resposta = `❌ Não encontrei esse endereço. Tente novamente com mais detalhes (número, bairro, cidade).`;
            }
        }
        // ========== USAR FAVORITO COMO ORIGEM ==========
        else if ((msg === 'casa' || msg === 'trabalho') && conversa.etapa === 'inicio') {
            const favoritos = RebecaService.getFavoritos(telefone);
            const tipo = msg;
            
            if (favoritos[tipo]) {
                conversa.dados.origem = favoritos[tipo].endereco;
                conversa.dados.origemValidada = {
                    valido: true,
                    precisao: 'favorito',
                    ...favoritos[tipo]
                };
                conversa.etapa = 'pedir_destino_rapido';
                resposta = `📍 *Origem:* ${favoritos[tipo].endereco}\n\n🏁 Envie o *destino*:`;
            } else {
                conversa.etapa = tipo === 'casa' ? 'salvar_casa' : 'salvar_trabalho';
                resposta = `Você ainda não cadastrou ${tipo}.\n\nEnvie o endereço para cadastrar:`;
            }
        }
        // ========== AUTO-DETECTAR ENDEREÇO ==========
        else if (configRebeca.autoDetectarEndereco && conversa.etapa === 'inicio' && RebecaService.pareceEndereco(mensagem)) {
            const validacao = await RebecaService.validarEndereco(mensagem);
            
            conversa.dados.origemTexto = mensagem;
            conversa.dados.origemValidada = validacao;
            
            if (!validacao.valido) {
                conversa.etapa = 'pedir_origem';
                resposta = `❌ Não encontrei esse endereço.\n\nTente com mais detalhes:\n• Número\n• Bairro\n• Cidade\n\nOu envie sua 📍 localização.`;
            } else if (validacao.precisaObservacao && configRebeca.pedirObservacaoEnderecoImpreciso) {
                conversa.etapa = 'pedir_observacao_origem';
                resposta = `📍 *Encontrei:* ${validacao.endereco}\n\n⚠️ _${validacao.precisao === 'sem_numero' ? 'Endereço sem número' : 'Localização aproximada'}_\n\nPara o motorista te encontrar melhor, envie uma *observação*:\n\n_Ex: Casa azul, portão preto, próximo ao mercado_\n\nOu digite *0* para continuar sem observação.`;
            } else {
                conversa.dados.origem = validacao.endereco;
                conversa.etapa = 'confirmar_origem_auto';
                resposta = `📍 Você está em:\n*${validacao.endereco}*?\n\n*1* - ✅ Sim, chamar carro\n*2* - 📝 Outro endereço\n*3* - 💰 Só cotação`;
            }
        }
        // ========== OBSERVAÇÃO PARA MOTORISTA ==========
        else if (conversa.etapa === 'pedir_observacao_origem') {
            if (msg !== '0') {
                conversa.dados.observacaoOrigem = mensagem;
            }
            conversa.dados.origem = conversa.dados.origemValidada.endereco;
            conversa.etapa = 'confirmar_origem_auto';
            resposta = `📍 *Origem:* ${conversa.dados.origem}`;
            if (conversa.dados.observacaoOrigem) {
                resposta += `\n📝 *Obs:* ${conversa.dados.observacaoOrigem}`;
            }
            resposta += `\n\n*1* - ✅ Chamar carro aqui\n*2* - 📝 Outro endereço`;
        }
        // ========== CONFIRMAR ORIGEM AUTO ==========
        else if (conversa.etapa === 'confirmar_origem_auto') {
            if (msg === '1' || msg.includes('sim')) {
                conversa.etapa = 'pedir_destino_rapido';
                resposta = `✅ *Origem confirmada!*\n\n🏁 Agora envie o *destino*:\n\nOu digite:\n*casa* - 🏠 Ir para casa\n*trabalho* - 🏢 Ir para trabalho`;
            } else if (msg === '2') {
                conversa.etapa = 'pedir_origem';
                conversa.dados = {};
                resposta = `📍 Envie o *endereço de origem*:`;
            } else if (msg === '3') {
                conversa.etapa = 'cotacao_destino';
                resposta = `💰 *COTAÇÃO*\n\n📍 Origem: ${conversa.dados.origem}\n\n🏁 Envie o *destino*:`;
            } else {
                resposta = `Digite *1* para confirmar, *2* para outro endereço ou *3* para cotação.`;
            }
        }
        // ========== PEDIR DESTINO RÁPIDO ==========
        else if (conversa.etapa === 'pedir_destino_rapido') {
            // Verificar se é favorito
            const favoritos = RebecaService.getFavoritos(telefone);
            
            if ((msg === '1' || msg === 'casa') && favoritos.casa) {
                conversa.dados.destino = favoritos.casa.endereco;
                conversa.dados.destinoValidado = { valido: true, precisao: 'favorito', ...favoritos.casa };
            } else if ((msg === '2' || msg === 'trabalho') && favoritos.trabalho) {
                conversa.dados.destino = favoritos.trabalho.endereco;
                conversa.dados.destinoValidado = { valido: true, precisao: 'favorito', ...favoritos.trabalho };
            } else {
                // Validar endereço digitado
                const validacao = await RebecaService.validarEndereco(mensagem);
                
                if (!validacao.valido) {
                    resposta = `❌ Destino não encontrado. Tente com mais detalhes.`;
                    conversas.set(telefone, conversa);
                    return resposta;
                }
                
                conversa.dados.destino = validacao.endereco;
                conversa.dados.destinoValidado = validacao;
                
                // Se destino precisa observação
                if (validacao.precisaObservacao && configRebeca.pedirObservacaoEnderecoImpreciso) {
                    conversa.etapa = 'pedir_observacao_destino';
                    resposta = `🏁 *Destino:* ${validacao.endereco}\n\n⚠️ _Localização aproximada_\n\nEnvie uma *observação* para o motorista ou *0* para continuar:`;
                    conversas.set(telefone, conversa);
                    return resposta;
                }
            }
            
            // Criar corrida
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
            conversa.etapa = 'inicio';
            
            const linkRastreio = RebecaService.gerarLinkRastreamento(corrida.id);
            
            resposta = `🚗 *CARRO SOLICITADO!*\n\n📍 *De:* ${conversa.dados.origem}`;
            if (conversa.dados.observacaoOrigem) {
                resposta += `\n📝 _${conversa.dados.observacaoOrigem}_`;
            }
            resposta += `\n\n🏁 *Para:* ${conversa.dados.destino}`;
            if (conversa.dados.observacaoDestino) {
                resposta += `\n📝 _${conversa.dados.observacaoDestino}_`;
            }
            resposta += `\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *Valor: R$ ${corrida.preco.toFixed(2)}*`;
            resposta += `\n\n⏳ Buscando motorista...\n🔢 Código: #${corrida.id.slice(-6)}`;
            
            if (configRebeca.enviarLinkRastreamento) {
                resposta += `\n\n📲 *Acompanhe:*\n${linkRastreio}`;
            }
            
            conversa.dados = {};
        }
        // ========== OBSERVAÇÃO DESTINO ==========
        else if (conversa.etapa === 'pedir_observacao_destino') {
            if (msg !== '0') {
                conversa.dados.observacaoDestino = mensagem;
            }
            
            // Criar corrida
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
            conversa.etapa = 'inicio';
            
            const linkRastreio = RebecaService.gerarLinkRastreamento(corrida.id);
            
            resposta = `🚗 *CARRO SOLICITADO!*\n\n📍 *De:* ${conversa.dados.origem}`;
            if (conversa.dados.observacaoOrigem) resposta += `\n📝 _${conversa.dados.observacaoOrigem}_`;
            resposta += `\n\n🏁 *Para:* ${conversa.dados.destino}`;
            if (conversa.dados.observacaoDestino) resposta += `\n📝 _${conversa.dados.observacaoDestino}_`;
            resposta += `\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *Valor: R$ ${corrida.preco.toFixed(2)}*`;
            resposta += `\n\n⏳ Buscando motorista...\n🔢 #${corrida.id.slice(-6)}`;
            
            if (configRebeca.enviarLinkRastreamento) {
                resposta += `\n\n📲 *Acompanhe:*\n${linkRastreio}`;
            }
            
            conversa.dados = {};
        }
        // ========== FLUXO NORMAL PEDIR ORIGEM ==========
        else if (conversa.etapa === 'pedir_origem') {
            // Verificar favorito
            const favoritos = RebecaService.getFavoritos(telefone);
            if (msg === 'casa' && favoritos.casa) {
                conversa.dados.origem = favoritos.casa.endereco;
                conversa.dados.origemValidada = { valido: true, precisao: 'favorito', ...favoritos.casa };
                conversa.etapa = 'pedir_destino';
                resposta = `📍 *Origem:* ${favoritos.casa.endereco}\n\n🏁 Envie o *destino*:`;
            } else if (msg === 'trabalho' && favoritos.trabalho) {
                conversa.dados.origem = favoritos.trabalho.endereco;
                conversa.dados.origemValidada = { valido: true, precisao: 'favorito', ...favoritos.trabalho };
                conversa.etapa = 'pedir_destino';
                resposta = `📍 *Origem:* ${favoritos.trabalho.endereco}\n\n🏁 Envie o *destino*:`;
            } else {
                const validacao = await RebecaService.validarEndereco(mensagem);
                
                if (!validacao.valido) {
                    resposta = `❌ Não encontrei. Envie com número, bairro e cidade.`;
                } else {
                    conversa.dados.origem = validacao.endereco;
                    conversa.dados.origemValidada = validacao;
                    
                    if (validacao.precisaObservacao && configRebeca.pedirObservacaoEnderecoImpreciso) {
                        conversa.etapa = 'pedir_observacao_origem_normal';
                        resposta = `📍 *Origem:* ${validacao.endereco}\n\n⚠️ Envie observação para o motorista ou *0*:`;
                    } else {
                        conversa.etapa = 'pedir_destino';
                        resposta = `✅ *Origem:* ${validacao.endereco}\n\n🏁 Agora o *destino*:`;
                    }
                }
            }
        }
        else if (conversa.etapa === 'pedir_observacao_origem_normal') {
            if (msg !== '0') conversa.dados.observacaoOrigem = mensagem;
            conversa.etapa = 'pedir_destino';
            resposta = `✅ *Origem registrada!*\n\n🏁 Agora o *destino*:`;
        }
        else if (conversa.etapa === 'pedir_destino') {
            const favoritos = RebecaService.getFavoritos(telefone);
            
            if (msg === 'casa' && favoritos.casa) {
                conversa.dados.destino = favoritos.casa.endereco;
            } else if (msg === 'trabalho' && favoritos.trabalho) {
                conversa.dados.destino = favoritos.trabalho.endereco;
            } else {
                const validacao = await RebecaService.validarEndereco(mensagem);
                if (!validacao.valido) {
                    resposta = `❌ Destino não encontrado. Tente novamente.`;
                    conversas.set(telefone, conversa);
                    return resposta;
                }
                conversa.dados.destino = validacao.endereco;
                conversa.dados.destinoValidado = validacao;
            }
            
            conversa.etapa = 'confirmar_corrida';
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            resposta = `🚗 *RESUMO*\n\n📍 ${conversa.dados.origem}`;
            if (conversa.dados.observacaoOrigem) resposta += `\n📝 _${conversa.dados.observacaoOrigem}_`;
            resposta += `\n\n🏁 ${conversa.dados.destino}\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n💰 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - ✅ Confirmar\n*2* - ❌ Cancelar`;
        }
        else if (conversa.etapa === 'confirmar_corrida') {
            if (msg === '1' || msg.includes('sim') || msg.includes('confirmar')) {
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados);
                conversa.etapa = 'inicio';
                
                const linkRastreio = RebecaService.gerarLinkRastreamento(corrida.id);
                
                resposta = `🎉 *CORRIDA CONFIRMADA!*\n\n🔢 #${corrida.id.slice(-6)}\n💰 R$ ${corrida.preco.toFixed(2)}\n\n⏳ Buscando motorista...`;
                
                if (configRebeca.enviarLinkRastreamento) {
                    resposta += `\n\n📲 *Acompanhe:*\n${linkRastreio}`;
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
            const validacao = await RebecaService.validarEndereco(mensagem);
            if (!validacao.valido) {
                resposta = `❌ Origem não encontrada. Tente novamente.`;
            } else {
                conversa.dados.origem = validacao.endereco;
                conversa.etapa = 'cotacao_destino';
                resposta = `✅ *Origem:* ${validacao.endereco}\n\n🏁 Agora o *destino*:`;
            }
        }
        else if (conversa.etapa === 'cotacao_destino') {
            const validacao = await RebecaService.validarEndereco(mensagem);
            if (!validacao.valido) {
                resposta = `❌ Destino não encontrado. Tente novamente.`;
            } else {
                conversa.etapa = 'inicio';
                const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, validacao.endereco);
                resposta = `💰 *COTAÇÃO*\n\n📍 ${conversa.dados.origem}\n🏁 ${validacao.endereco}\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n\n💵 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - 🚗 Pedir agora\n*menu* - Voltar`;
                conversa.dados = {};
            }
        }
        // ========== NÃO RECONHECIDO ==========
        else {
            resposta = `🤔 Não entendi.\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
        }

        conversas.set(telefone, conversa);
        return resposta;
    },

    // ==================== MENUS ====================
    menuPrincipal: (nome, telefone) => {
        const favoritos = RebecaService.getFavoritos(telefone);
        let menu = `Olá${nome ? ', *' + nome + '*' : ''}! 👋\n\nComo posso ajudar?\n\n`;
        menu += `*1* - 🚗 Pedir corrida\n`;
        menu += `*2* - 💵 Ver preços\n`;
        menu += `*3* - 💰 Fazer cotação\n`;
        menu += `*4* - 📋 Minhas corridas\n`;
        menu += `*5* - 👤 Falar com atendente\n`;
        menu += `*6* - 📊 Exemplos de preço\n`;
        menu += `*7* - ⭐ Favoritos (casa/trabalho)\n`;
        menu += `\n💡 _Envie seu endereço ou 📍 localização para pedir rápido!_`;
        
        if (favoritos.casa || favoritos.trabalho) {
            menu += `\n\n⭐ _Atalhos: digite *casa* ou *trabalho*_`;
        }
        
        return menu;
    },

    // ==================== FUNÇÕES AUXILIARES ====================
    gerarLinkRastreamento: (corridaId) => {
        const baseUrl = process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com';
        return `${baseUrl}/rastrear/${corridaId.slice(-8)}`;
    },

    async enviarRastreamento(telefone) {
        const cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) return `Você não tem corridas ativas.\n\nDigite *1* para pedir!`;
        
        const corridas = CorridaService.listarPorCliente(cliente.id);
        const corridaAtiva = corridas.find(c => ['aceita', 'em_andamento', 'a_caminho', 'pendente'].includes(c.status));
        
        if (!corridaAtiva) return `Você não tem corridas ativas.\n\nDigite *1* para pedir!`;
        
        const link = RebecaService.gerarLinkRastreamento(corridaAtiva.id);
        return `📲 *RASTREAMENTO*\n\n🔢 #${corridaAtiva.id.slice(-6)}\n📍 ${RebecaService.formatarStatus(corridaAtiva.status)}\n\n🔗 ${link}`;
    },

    formatarStatus: (status) => {
        const map = {
            'pendente': '⏳ Buscando motorista',
            'aceita': '✅ Motorista aceitou',
            'a_caminho': '🚗 A caminho',
            'em_andamento': '🚀 Em viagem',
            'finalizada': '✅ Finalizada',
            'cancelada': '❌ Cancelada'
        };
        return map[status] || status;
    },

    async enviarTabelaPrecos() {
        const config = PrecoDinamicoService.getConfig();
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        
        let tabela = `📋 *PREÇOS*\n\n`;
        tabela += `• Taxa: R$ ${config.taxaBase.toFixed(2)}\n`;
        tabela += `• Km: R$ ${config.precoKm.toFixed(2)}\n`;
        tabela += `• Mínimo: R$ ${config.taxaMinima.toFixed(2)}\n\n`;
        tabela += `📍 *Agora:* ${faixaAtual.nome}`;
        
        if (faixaAtual.tipo === 'fixo' && faixaAtual.valorFixo > 0) {
            tabela += ` = R$ ${faixaAtual.valorFixo.toFixed(2)}`;
        } else if (faixaAtual.multiplicador > 1) {
            tabela += ` (${faixaAtual.multiplicador}x)`;
        }
        
        tabela += `\n\n_Envie seu endereço para cotação!_`;
        return tabela;
    },

    async enviarExemplosPreco() {
        const exemplos = [3, 5, 10, 15, 20];
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        
        let msg = `📊 *EXEMPLOS* _(${faixaAtual.nome})_\n\n`;
        exemplos.forEach(km => {
            const calc = PrecoDinamicoService.calcularPreco(km);
            msg += `${km} km → R$ ${calc.precoFinal.toFixed(2)}\n`;
        });
        msg += `\n_Envie seu endereço!_`;
        return msg;
    },

    async calcularCorrida(origem, destino) {
        const rota = await MapsService.calcularRota(origem, destino);
        const distanciaKm = rota.sucesso ? rota.distancia.km : 5;
        const tempoMinutos = rota.sucesso ? rota.duracao.minutos : 15;
        const calculo = PrecoDinamicoService.calcularPreco(distanciaKm);
        const faixa = PrecoDinamicoService.obterFaixaAtual();
        
        return {
            distancia: rota.sucesso ? rota.distancia.texto : `~${distanciaKm} km`,
            tempo: rota.sucesso ? rota.duracao.texto : `~${tempoMinutos} min`,
            distanciaKm, tempoMinutos,
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
            multiplicador: dados.calculo.faixa.multiplicador,
            observacaoOrigem: dados.observacaoOrigem || null,
            observacaoDestino: dados.observacaoDestino || null
        });
        
        return {
            id: corrida.id,
            origem: dados.origem,
            destino: dados.destino,
            preco: dados.calculo.preco,
            observacaoOrigem: dados.observacaoOrigem,
            observacaoDestino: dados.observacaoDestino
        };
    },

    async historicoCliente(telefone) {
        const cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) return `📋 Sem corridas.\n\n_Envie seu endereço para pedir!_`;
        
        const corridas = CorridaService.listarPorCliente(cliente.id);
        if (!corridas?.length) return `📋 Sem corridas.\n\n_Envie seu endereço para pedir!_`;
        
        let msg = `📋 *CORRIDAS*\n\n`;
        corridas.slice(0, 5).forEach(c => {
            const st = c.status === 'finalizada' ? '✅' : c.status === 'cancelada' ? '❌' : '⏳';
            msg += `${st} #${c.id.slice(-6)} - R$ ${(c.precoFinal || c.precoEstimado || 0).toFixed(2)}\n`;
        });
        return msg;
    },

    // ==================== NOTIFICAÇÕES ====================
    gerarNotificacaoTempo: (minutos, motorista, corrida) => {
        if (minutos === 3) return `🚗 *A 3 MINUTOS*\n\n${motorista.nome} está chegando!\n🚗 ${motorista.veiculo?.modelo} ${motorista.veiculo?.cor}\n🔢 *${motorista.veiculo?.placa}*`;
        if (minutos === 1) return `🚗 *A 1 MINUTO*\n\nPrepare-se!`;
        if (minutos === 0) return `🎉 *MOTORISTA CHEGOU!*\n\n${motorista.nome}\n🚗 ${motorista.veiculo?.modelo} *${motorista.veiculo?.placa}*`;
        return null;
    },

    gerarMensagemBoaViagem: (corrida) => `🚀 *BOA VIAGEM!*\n\n🏁 ${corrida.destino?.endereco || corrida.destino}`,

    gerarMensagemMotoristaAceitou(corrida, motorista) {
        let msg = `🎉 *MOTORISTA A CAMINHO!*\n\n👨‍✈️ *${motorista.nome}*\n🚗 ${motorista.veiculo?.modelo} ${motorista.veiculo?.cor}\n🔢 *${motorista.veiculo?.placa}*\n⭐ ${(motorista.avaliacao || 5).toFixed(1)}`;
        
        if (corrida.observacaoOrigem) {
            msg += `\n\n📝 *Obs cliente:* ${corrida.observacaoOrigem}`;
        }
        
        if (configRebeca.enviarLinkRastreamento) {
            msg += `\n\n📲 ${RebecaService.gerarLinkRastreamento(corrida.id)}`;
        }
        return msg;
    },

    gerarMensagemCorridaFinalizada: (corrida) => `✅ *FINALIZADA!*\n\n#${corrida.id.slice(-6)}\n💰 R$ ${(corrida.precoFinal || corrida.precoEstimado).toFixed(2)}\n\n⭐ Avalie de 1 a 5:`,

    gerarMensagemCorridaCancelada: (corrida, motivo) => `❌ *CANCELADA*\n\n#${corrida.id.slice(-6)}\n📝 ${motivo || 'Não informado'}\n\n_Envie endereço para nova corrida!_`
};

module.exports = RebecaService;
