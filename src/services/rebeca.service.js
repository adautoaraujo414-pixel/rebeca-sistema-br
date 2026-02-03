const { PrecoIntermunicipal } = require('../models');
const PrecoDinamicoService = require('./preco-dinamico.service');
const PrecoAdminService = require('./preco-admin.service');
const MapsService = require('./maps.service');
const CorridaService = require('./corrida.service');
const ClienteService = require('./cliente.service');
const MotoristaService = require('./motorista.service');
const DespachoService = require('./despacho.service');
const EvolutionMultiService = require('./evolution-multi.service');
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
    async processarMensagem(telefone, mensagem, nome = 'Cliente', contexto = {}) {
        const adminId = contexto.adminId || null;
        
        // ========== COMANDOS DO MOTORISTA ==========
        const msgUpper = typeof mensagem === 'string' ? mensagem.toUpperCase().trim() : '';
        
        // Motorista aceitando corrida
        if (msgUpper === 'ACEITAR' || msgUpper.startsWith('ACEITAR ')) {
            return await RebecaService.motoristaAceitarCorrida(telefone, adminId, contexto.instanciaId);
        }
        
        // Motorista finalizando corrida
        if (msgUpper === 'FINALIZAR' || msgUpper === 'FINALIZADA' || msgUpper === 'FIM') {
            return await RebecaService.motoristaFinalizarCorrida(telefone, adminId, contexto.instanciaId);
        }
        
        // Motorista cancelando corrida
        if (msgUpper === 'CANCELAR' || msgUpper.startsWith('CANCELAR ')) {
            return await RebecaService.motoristaCancelarCorrida(telefone, adminId, contexto.instanciaId);
        }
        
        // Motorista chegou no local
        if (msgUpper === 'CHEGUEI' || msgUpper === 'CHEGOU') {
            return await RebecaService.motoristaChegou(telefone, adminId, contexto.instanciaId);
        }
        if (adminId) console.log('[REBECA] Admin:', adminId);
        
        // Guardar adminId na conversa para usar depois
        const msg = typeof mensagem === 'string' ? mensagem.toLowerCase().trim() : '';
        const msgOriginal = typeof mensagem === 'string' ? mensagem.trim() : '';
        const conversa = conversas.get(telefone) || { etapa: 'inicio', dados: {} };
        if (adminId) conversa.adminId = adminId;
        if (contexto.instanciaId) conversa.instanciaId = contexto.instanciaId;
        const favoritos = RebecaService.getFavoritos(telefone);
        
        let resposta = '';

        if (RebecaService.pareceLocalizacao(mensagem)) {
            const coords = RebecaService.extrairCoordenadas(mensagem);
            const endereco = await MapsService.geocodificarReverso(coords.latitude, coords.longitude);
            
            // Verificar motoristas disponíveis ANTES de criar corrida
            const motoristasDisponiveis = await MotoristaService.listarDisponiveis(adminId);
            
            if (motoristasDisponiveis.length === 0) {
                return `😔 Poxa, no momento não temos motoristas disponíveis.\n\nTente novamente em alguns minutos! 🙏`;
            }
            
            conversa.dados.origemGPS = coords;
            conversa.dados.origem = endereco.endereco || `${coords.latitude}, ${coords.longitude}`;
            conversa.dados.origemValidada = { valido: true, precisao: 'gps', latitude: coords.latitude, longitude: coords.longitude };
            conversa.dados.calculo = {
                origem: { endereco: conversa.dados.origem, latitude: coords.latitude, longitude: coords.longitude },
                destino: null,
                distanciaKm: 0,
                tempoMinutos: 0,
                preco: 15,
                faixa: { nome: 'chamada', multiplicador: 1 }
            };
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
            
            conversa.etapa = 'aguardando_motorista';
            conversa.dados.corridaId = corrida.id;
            conversas.set(telefone, conversa);
            
            return `📍 *${conversa.dados.origem}*\n\n⏳ Buscando motorista pra você...\n\nTe aviso assim que um aceitar! 😊\n\n_Digite CANCELAR se precisar_`;
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
 
        // ========== AGUARDANDO MOTORISTA ==========
        if (conversa.etapa === 'aguardando_motorista' && !msg.includes('cancelar')) {
            conversas.set(telefone, conversa);
            return 'Calma que ja estou buscando um motorista pra voce! \u23f3\n\nAssim que um aceitar, te aviso. Se quiser cancelar, digite *CANCELAR*.';
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
        else if (msg.includes("cancelar")) {
            // Buscar corrida ativa do cliente
            const cliente = ClienteService.buscarPorTelefone(telefone);
            if (cliente) {
                const corridas = await CorridaService.listarPorCliente(cliente._id || cliente.id);
                const corridaAtiva = corridas?.find(c => ["pendente", "aceita", "a_caminho"].includes(c.status));
                if (corridaAtiva) {
                    await CorridaService.cancelarCorrida(corridaAtiva._id, "Cancelado pelo cliente");
                    // Avisar motorista se tiver
                    if (corridaAtiva.motoristaId && conversa.instanciaId) {
                        const motorista = await MotoristaService.buscarPorId(corridaAtiva.motoristaId);
                        if (motorista?.whatsapp) {
                            await EvolutionMultiService.enviarMensagem(conversa.instanciaId, motorista.whatsapp, "❌ *CORRIDA CANCELADA*\n\nO cliente cancelou a corrida.\n\nVocê está disponível novamente!");
                        }
                    }
                }
            }
            conversa.etapa = "inicio";
            conversa.dados = {};
            resposta = "Poxa, que pena! 😔 Sua corrida foi cancelada.\n\nQuando precisar, é só mandar a localização!";
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
        // ========== AUTO-DETECT ENDEREÇO - CHAMAR CARRO DIRETO ==========
        else if (configRebeca.autoDetectarEndereco && conversa.etapa === 'inicio' && RebecaService.pareceEndereco(msgOriginal)) {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            
            if (!validacao.valido) {
                resposta = `❌ Não encontrei esse endereço.\n\nEnvie sua 📍 localização ou tente com mais detalhes.`;
            } else {
                // CHAMAR CARRO DIRETO!
                conversa.dados.origem = validacao.endereco;
                conversa.dados.origemValidada = validacao;
                conversa.dados.calculo = {
                    origem: { endereco: validacao.endereco, latitude: validacao.latitude, longitude: validacao.longitude },
                    destino: null,
                    distanciaKm: 0,
                    tempoMinutos: 0,
                    preco: 15, // Preço mínimo
                    faixa: { nome: 'padrao', multiplicador: 1 }
                };
                
                // Criar corrida e despachar
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                
                conversa.etapa = 'aguardando_motorista';
                conversa.dados.corridaId = corrida.id;
                conversas.set(telefone, conversa);
                
                return `🚗 *CARRO A CAMINHO!*\n\n📍 Buscar em: *${validacao.endereco}*\n\n⏳ Aguarde, estamos localizando motorista...\n\n_Informe o destino ao motorista quando ele chegar_\n\nDigite *CANCELAR* para cancelar.`;
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
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
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
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
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
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                conversa.etapa = 'inicio';
                
                resposta = `🎉 *CONFIRMADO!*\n\n🔢 #${corrida.id.slice(-6)}\n💰 R$ ${corrida.preco.toFixed(2)}\n\n⏳ Buscando motorista...`;
                if (configRebeca.enviarLinkRastreamento) {
                    resposta += `\n\n📲 ${RebecaService.gerarLinkRastreamento(corrida.id)}`;
                }
                conversa.dados = {};
            } else {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                resposta = `Poxa, que pena! 😔 Sua corrida foi cancelada.\n\nQuando precisar, é só mandar a localização!`;
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
        
        // Pergunta - IA responde direto
        if (analise.intencao === 'pergunta' && analise.respostaPergunta) {
            return analise.respostaPergunta;
        }
        
        // Saudacao
        if (analise.intencao === 'saudacao') {
            return null; // Deixa cair no menu normal
        }
        
        return null;
    },

    // ==================== FUNÇÕES AUXILIARES ====================
    menuPrincipal: (nome, telefone) => {
        const favoritos = RebecaService.getFavoritos(telefone);
        let menu = `Oi${nome ? " " + nome : ""}! Precisa de carro? 🚗\n\nMe manda a 📍 localização ou o endereço!`;
        if (favoritos.casa || favoritos.trabalho) {
            menu += `\n\n⭐ Atalhos: *casa* ou *trabalho*`;
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
        const faixa = await PrecoAdminService.getFaixaAtual(adminId);
        let m = `📊 *EXEMPLOS* _(${faixa.nome})_\n\n`;
        for (const km of [3, 5, 10, 15, 20]) {
            const calc = await PrecoAdminService.calcularPreco(adminId, km);
            m += `${km}km → R$ ${calc.preco.toFixed(2)}\n`;
        }
        return m;
    },

    async calcularCorrida(origem, destino, adminId = null) {
        const rota = await MapsService.calcularRota(origem, destino);
        const km = rota.sucesso ? rota.distancia.km : 5;
        const min = rota.sucesso ? rota.duracao.minutos : 15;
        
        // Verificar se é viagem intermunicipal
        let precoIntermunicipal = null;
        try {
            const cidadeOrigem = RebecaService.extrairCidade(rota.sucesso ? rota.origem.endereco : origem);
            const cidadeDestino = RebecaService.extrairCidade(rota.sucesso ? rota.destino.endereco : destino);
            
            if (cidadeOrigem && cidadeDestino && cidadeOrigem.toLowerCase() !== cidadeDestino.toLowerCase()) {
                // Buscar preço intermunicipal
                const query = { ativo: true };
                if (adminId) query.adminId = adminId;
                query.cidadeOrigem = new RegExp(cidadeOrigem, 'i');
                query.cidadeDestino = new RegExp(cidadeDestino, 'i');
                precoIntermunicipal = await PrecoIntermunicipal.findOne(query);
            }
        } catch (e) { console.log('Erro ao verificar intermunicipal:', e.message); }
        
        if (precoIntermunicipal) {
            return {
                distancia: rota.sucesso ? rota.distancia.texto : `~${km} km`,
                tempo: rota.sucesso ? rota.duracao.texto : `~${min} min`,
                distanciaKm: km, tempoMinutos: min,
                preco: precoIntermunicipal.precoFixo,
                detalhes: 'Viagem intermunicipal - Preço fixo',
                faixa: { nome: 'Intermunicipal', multiplicador: 1 },
                origem: rota.sucesso ? rota.origem : { endereco: origem },
                destino: rota.sucesso ? rota.destino : { endereco: destino },
                intermunicipal: true,
                rotaIntermunicipal: precoIntermunicipal.cidadeOrigem + ' → ' + precoIntermunicipal.cidadeDestino
            };
        }
        
        const calc = await PrecoAdminService.calcularPreco(adminId, km);
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
    
    // Extrair cidade do endereço
    extrairCidade(endereco) {
        if (!endereco) return null;
        // Formato comum: "Rua X, Bairro, Cidade - UF" ou "Cidade - UF"
        const partes = endereco.split(',');
        if (partes.length >= 2) {
            const ultimaParte = partes[partes.length - 1].trim();
            const penultimaParte = partes[partes.length - 2].trim();
            // Se última parte tem UF (ex: "SP", "RJ"), pega a penúltima como cidade
            if (ultimaParte.match(/^[A-Z]{2}$/) || ultimaParte.match(/ - [A-Z]{2}$/)) {
                return penultimaParte.replace(/ - [A-Z]{2}$/, '').trim();
            }
            // Se penúltima tem cidade - UF
            const matchCidade = penultimaParte.match(/^(.+) - [A-Z]{2}$/);
            if (matchCidade) return matchCidade[1].trim();
            return penultimaParte;
        }
        return endereco.split(' - ')[0].trim();
    },

    async criarCorrida(telefone, nomeCliente, dados, adminId = null, instanciaId = null) {
        // Anti-duplicacao: verificar se ja tem corrida ativa
        const { Corrida } = require('../models');
        const corridaAtiva = await Corrida.findOne({
            clienteTelefone: telefone,
            status: { $in: ['pendente', 'aceita', 'em_andamento', 'motorista_a_caminho'] }
        });
        if (corridaAtiva) {
            console.log('[REBECA] Corrida duplicada bloqueada para', telefone);
            return { id: corridaAtiva._id, duplicada: true };
        }
        
        let cliente = ClienteService.buscarPorTelefone(telefone);
        if (!cliente) cliente = await ClienteService.criar({ nome: nomeCliente, telefone, adminId });
        
        const corrida = await CorridaService.criar({
            adminId,
            clienteId: cliente._id || cliente.id,
            clienteNome: cliente.nome,
            clienteTelefone: telefone,
            origem: dados.calculo.origem,
            destino: dados.calculo.destino,
            distanciaKm: dados.calculo.distanciaKm,
            tempoEstimado: dados.calculo.tempoMinutos,
            precoEstimado: dados.calculo.preco,
            faixaPreco: dados.calculo.faixa?.nome || 'normal',
            multiplicador: dados.calculo.faixa?.multiplicador || 1,
            observacaoOrigem: dados.observacaoOrigem || null,
            observacaoDestino: dados.observacaoDestino || null,
            status: 'pendente'
        });
        
        // ========== DESPACHAR PARA MOTORISTAS ==========
        try {
            // Buscar motoristas disponiveis DO ADMIN
            const motoristasDisponiveis = await MotoristaService.listarDisponiveis(adminId);
            
            if (motoristasDisponiveis.length > 0) {
                // Despachar corrida (usa modo configurado: broadcast ou proximo)
                const resultadoDespacho = await DespachoService.despacharCorrida(corrida, motoristasDisponiveis, adminId);
                
                if (resultadoDespacho.sucesso && instanciaId) {
                    // Notificar motoristas via WhatsApp
                    const msgCorrida = `🚨 *NOVA CORRIDA!*\n\n📍 *Origem:* ${dados.calculo.origem?.endereco || dados.origem}\n🏁 *Destino:* ${dados.calculo.destino?.endereco || dados.destino}\n📏 *Distância:* ${dados.calculo.distanciaKm?.toFixed(1) || '?'}km\n💰 *Valor:* R$ ${dados.calculo.preco?.toFixed(2) || '?'}\n\n✅ Digite *ACEITAR* para pegar esta corrida!`;
                    
                    if (resultadoDespacho.modo === 'broadcast') {
                        // Enviar para todos os motoristas
                        for (const mot of motoristasDisponiveis) {
                            if (mot.whatsapp) {
                                await EvolutionMultiService.enviarMensagem(instanciaId, mot.whatsapp, msgCorrida);
                                console.log('[REBECA] Corrida enviada para motorista:', mot.nomeCompleto || mot.nome);
                            }
                        }
                    } else if (resultadoDespacho.modo === 'proximo' && resultadoDespacho.motorista) {
                        // Enviar só pro mais próximo
                        const mot = resultadoDespacho.motorista;
                        if (mot.whatsapp) {
                            await EvolutionMultiService.enviarMensagem(instanciaId, mot.whatsapp, msgCorrida);
                            console.log('[REBECA] Corrida enviada para motorista mais proximo:', mot.nome);
                        }
                    }
                }
                
                console.log('[REBECA] Despacho:', resultadoDespacho.modo, '- Motoristas:', motoristasDisponiveis.length);
            } else {
                console.log('[REBECA] Nenhum motorista disponivel para admin:', adminId);
            }
        } catch (e) {
            console.error('[REBECA] Erro no despacho:', e.message);
        }
        
        return { id: corrida._id || corrida.id, origem: dados.origem, destino: dados.destino, preco: dados.calculo.preco };
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
    gerarMensagemCorridaCancelada: (c, m) => `❌ *CANCELADA*\n\n#${c.id.slice(-6)}\n📝 ${m || '-'}`,

    // ==================== COMANDOS DO MOTORISTA ====================
    async motoristaAceitarCorrida(telefoneMotorista, adminId, instanciaId) {
        try {
            const motorista = await MotoristaService.buscarPorWhatsapp(telefoneMotorista, adminId);
            if (!motorista) return '❌ Você não está cadastrado como motorista.';
            if (motorista.status === 'em_corrida') return '⚠️ Você já está em uma corrida.';
            
            // Buscar corridas pendentes para este motorista
            const corridasDisponiveis = DespachoService.getCorridasDisponiveis(motorista._id?.toString() || motorista.id);
            
            if (!corridasDisponiveis || corridasDisponiveis.length === 0) {
                return '❌ Não há corridas disponíveis para você no momento.';
            }
            
            // Pegar a primeira corrida disponível
            const notif = corridasDisponiveis[0];
            const resultado = DespachoService.aceitarCorrida(notif.corridaId, motorista._id?.toString() || motorista.id, motorista.nomeCompleto || motorista.nome);
            
            if (!resultado.sucesso) return '❌ ' + resultado.error;
            
            // Atribuir motorista na corrida
            await CorridaService.atribuirMotorista(notif.corridaId, motorista._id, motorista.nomeCompleto || motorista.nome);
            
            // Notificar cliente que motorista está a caminho
            const corrida = await CorridaService.buscarPorId(notif.corridaId);
            if (corrida && corrida.clienteTelefone && instanciaId) {
                const msgCliente = `🚗 *MOTORISTA A CAMINHO!*\n\n👨‍✈️ *${motorista.nomeCompleto || motorista.nome}*\n🚙 ${motorista.veiculo?.modelo || ''} ${motorista.veiculo?.cor || ''}\n🔢 *${motorista.veiculo?.placa || ''}*\n\n📞 ${motorista.whatsapp}`;
                await EvolutionMultiService.enviarMensagem(instanciaId, corrida.clienteTelefone, msgCliente);
            }
            
            return `✅ *CORRIDA ACEITA!*\n\n📍 Origem: ${corrida?.origem?.endereco || 'Ver no app'}\n🏁 Destino: ${corrida?.destino?.endereco || 'Ver no app'}\n💰 Valor: R$ ${corrida?.precoEstimado?.toFixed(2) || '?'}\n\n📱 Cliente: ${corrida?.clienteTelefone || ''}\n\nDigite *CHEGUEI* ao chegar no local.\nDigite *FINALIZAR* ao concluir.`;
        } catch (e) {
            console.error('[REBECA] Erro ao aceitar:', e.message);
            return '❌ Erro ao processar. Tente novamente.';
        }
    },
    
    async motoristaChegou(telefoneMotorista, adminId, instanciaId) {
        try {
            const motorista = await MotoristaService.buscarPorWhatsapp(telefoneMotorista, adminId);
            if (!motorista) return '❌ Você não está cadastrado.';
            
            // Buscar corrida ativa do motorista
            const corrida = await CorridaService.buscarCorridaAtivaMotorista(motorista._id);
            if (!corrida) return '❌ Você não tem corrida ativa.';
            
            // Notificar cliente
            if (corrida.clienteTelefone && instanciaId) {
                const msgCliente = `🎉 *MOTORISTA CHEGOU!*\n\n👨‍✈️ ${motorista.nomeCompleto || motorista.nome}\n🚙 ${motorista.veiculo?.placa || ''}\n\nAguardando você!`;
                await EvolutionMultiService.enviarMensagem(instanciaId, corrida.clienteTelefone, msgCliente);
            }
            
            return '✅ Cliente notificado! Aguardando embarque.\n\nDigite *FINALIZAR* ao concluir a corrida.';
        } catch (e) {
            return '❌ Erro. Tente novamente.';
        }
    },
    
    async motoristaFinalizarCorrida(telefoneMotorista, adminId, instanciaId) {
        try {
            const motorista = await MotoristaService.buscarPorWhatsapp(telefoneMotorista, adminId);
            if (!motorista) return '❌ Você não está cadastrado.';
            
            // Buscar corrida ativa
            const corrida = await CorridaService.buscarCorridaAtivaMotorista(motorista._id);
            if (!corrida) return '❌ Você não tem corrida ativa para finalizar.';
            
            // Finalizar corrida (isso libera o motorista automaticamente)
            await CorridaService.finalizarCorrida(corrida._id, corrida.precoEstimado);
            
            // Notificar cliente
            if (corrida.clienteTelefone && instanciaId) {
                const msgCliente = `✅ *CORRIDA FINALIZADA!*\n\n💰 Valor: R$ ${corrida.precoEstimado?.toFixed(2) || '?'}\n\n⭐ Avalie o motorista de 1 a 5\n\nObrigado por usar nosso serviço!`;
                await EvolutionMultiService.enviarMensagem(instanciaId, corrida.clienteTelefone, msgCliente);
            }
            
            return `✅ *CORRIDA FINALIZADA!*\n\n💰 R$ ${corrida.precoEstimado?.toFixed(2) || '?'}\n\nVocê está *DISPONÍVEL* para novas corridas!\n\n📊 Bom trabalho!`;
        } catch (e) {
            console.error('[REBECA] Erro ao finalizar:', e.message);
            return '❌ Erro ao finalizar. Tente novamente.';
        }
    },
    
    async motoristaCancelarCorrida(telefoneMotorista, adminId, instanciaId) {
        try {
            const motorista = await MotoristaService.buscarPorWhatsapp(telefoneMotorista, adminId);
            if (!motorista) return '❌ Você não está cadastrado.';
            
            const corrida = await CorridaService.buscarCorridaAtivaMotorista(motorista._id);
            if (!corrida) return '❌ Você não tem corrida ativa.';
            
            await CorridaService.cancelarCorrida(corrida._id, 'Cancelado pelo motorista');
            
            // Notificar cliente
            if (corrida.clienteTelefone && instanciaId) {
                const msgCliente = '❌ *CORRIDA CANCELADA*\n\nO motorista precisou cancelar.\n\nEnvie sua localização para solicitar outro motorista.';
                await EvolutionMultiService.enviarMensagem(instanciaId, corrida.clienteTelefone, msgCliente);
            }
            
            return '❌ Corrida cancelada.\n\nVocê está *DISPONÍVEL* novamente.';
        } catch (e) {
            return '❌ Erro ao cancelar.';
        }
    }
};

    // Resetar conversa de um telefone
    resetarConversa(telefone) {
        const conversa = conversas.get(telefone);
        if (conversa) {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            conversas.set(telefone, conversa);
        }
    },
    
    // Colocar em modo avaliacao
    pedirAvaliacao(telefone) {
        const conversa = conversas.get(telefone);
        if (conversa) {
            conversa.etapa = 'avaliar';
            conversa.dados = {};
            conversas.set(telefone, conversa);
        }
    },
};

module.exports = RebecaService;
// fix
