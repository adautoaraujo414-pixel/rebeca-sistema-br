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
const ultimasRespostas = new Map(); // Anti-repeticao
const favoritosClientes = new Map();
const localidadeService = require('./localidade.service');

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
        if (!texto || texto.length < 5) return false;
        const lower = texto.toLowerCase().trim();
        
        // NUNCA é endereço se contém palavras de pergunta
        const palavrasPerguntas = ['?', 'como', 'qual', 'quanto', 'quando', 'onde fica', 'tem ', 'posso', 'pode', 'voce', 'você', 'aceita', 'funciona', 'horario', 'horário', 'aberto', 'fecha', 'demora', 'tempo', 'chega', 'valor', 'custa', 'pago', 'pagar', 'dinheiro', 'pix', 'cartao', 'cartão', 'credito', 'crédito', 'debito', 'débito', 'troco', 'seguro', 'segurança', 'confiavel', 'confiável'];
        for (const p of palavrasPerguntas) {
            if (lower.includes(p)) return false;
        }
        
        // Ignorar comandos obvios
        const comandos = ['menu','oi','ola','olá','bom dia','boa tarde','boa noite','obrigado','obrigada','valeu','sim','nao','não','ok','1','2','3','4','5','6','7','casa','trabalho','cancelar','aceitar','finalizar','cheguei','preço','preco','historico','cotação','cotacao','ajuda','atendente','ola rebeca','oi rebeca','eai','e ai','tudo bem','blz','beleza'];
        if (comandos.includes(lower)) return false;
        
        // SÓ é endereço se tem palavra-chave de endereço
        const palavrasEndereco = ['rua ', 'r. ', 'av ', 'av. ', 'avenida ', 'alameda ', 'travessa ', 'estrada ', 'rodovia ', 'praca ', 'praça ', 'bairro ', 'setor ', 'quadra ', 'lote ', 'condominio ', 'condomínio ', 'conjunto ', 'vila ', 'jardim ', 'parque ', 'residencial ', 'numero ', 'número ', 'nº ', 'n. ', 'centro', 'zona sul', 'zona norte', 'zona leste', 'zona oeste'];
        for (const p of palavrasEndereco) {
            if (lower.includes(p)) return true;
        }
        
        // Tem número E pelo menos uma palavra antes? (ex: "Alexandre Rodrigues 180")
        const temNumero = /\d{2,}/.test(texto);
        const palavras = texto.split(/\s+/).length;
        if (temNumero && palavras >= 2 && texto.length > 10) {
            // Mas não pode ser pergunta disfarçada
            if (!lower.startsWith('o ') && !lower.startsWith('a ') && !lower.startsWith('e ') && !lower.startsWith('é ')) {
                return true;
            }
        }
        
        return false;
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
        
        // Verificar se é motorista ANTES de processar comandos de motorista
        const telsMotorista = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
        const ehMotorista = await MotoristaService.buscarPorWhatsapp(telsMotorista[0]) || 
                            await MotoristaService.buscarPorWhatsapp(telsMotorista[1]) || 
                            await MotoristaService.buscarPorWhatsapp(telsMotorista[2]);
        
        if (ehMotorista) {
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
            
            // Motorista aceita/recusa próxima corrida
            if (msgUpper === 'ACEITAR PROXIMA') {
                return await RebecaService.aceitarProximaCorrida(telefone, adminId, contexto.instanciaId);
            }
            if (msgUpper === 'RECUSAR PROXIMA') {
                return '👍 Ok! Você pode terminar sua corrida atual primeiro.';
            }
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

        // ========== RECONHECER CASA/TRABALHO/PONTOS ==========
        const msgLower = msg.toLowerCase();
        
        // Cliente pede "casa" e tem favorito
        if ((msgLower === 'casa' || msgLower.includes('minha casa') || msgLower.includes('pra casa') || msgLower.includes('em casa')) && favoritos.casa) {
            conversa.dados.origem = favoritos.casa.endereco || favoritos.casa;
            conversa.dados.origemValidada = { valido: true, precisao: 'favorito' };
            if (favoritos.casa.latitude) {
                conversa.dados.calculo = {
                    origem: { endereco: conversa.dados.origem, latitude: favoritos.casa.latitude, longitude: favoritos.casa.longitude },
                    destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15
                };
            }
            conversa.etapa = 'pedir_complemento_gps';
            conversas.set(telefone, conversa);
            return `📍 ${conversa.dados.origem}\n\nÉ esse o endereço? Confirme ou mande outro!`;
        }
        
        // Cliente pede "trabalho" e tem favorito
        if ((msgLower === 'trabalho' || msgLower.includes('meu trabalho') || msgLower.includes('pro trabalho')) && favoritos.trabalho) {
            conversa.dados.origem = favoritos.trabalho.endereco || favoritos.trabalho;
            conversa.dados.origemValidada = { valido: true, precisao: 'favorito' };
            if (favoritos.trabalho.latitude) {
                conversa.dados.calculo = {
                    origem: { endereco: conversa.dados.origem, latitude: favoritos.trabalho.latitude, longitude: favoritos.trabalho.longitude },
                    destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15
                };
            }
            conversa.etapa = 'pedir_complemento_gps';
            conversas.set(telefone, conversa);
            return `📍 ${conversa.dados.origem}\n\nÉ esse o endereço? Confirme ou mande outro!`;
        }
        
        // Buscar pontos de referência cadastrados
        if (msgLower.length > 2 && !RebecaService.pareceLocalizacao(mensagem)) {
            const pontosEncontrados = localidadeService.buscarPontos(msgLower);
            if (pontosEncontrados && pontosEncontrados.length > 0) {
                const ponto = pontosEncontrados[0];
                conversa.dados.origem = ponto.endereco || ponto.nome;
                conversa.dados.observacaoOrigem = ponto.nome;
                conversa.dados.origemValidada = { valido: true, precisao: 'ponto_referencia' };
                if (ponto.latitude) {
                    conversa.dados.calculo = {
                        origem: { endereco: conversa.dados.origem, latitude: ponto.latitude, longitude: ponto.longitude },
                        destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15
                    };
                }
                conversa.etapa = 'pedir_complemento_gps';
                conversas.set(telefone, conversa);
                return `📍 *${ponto.nome}*\n${ponto.endereco}\n\nÉ esse o local? Confirme ou mande outro!`;
            }
        }

        if (RebecaService.pareceLocalizacao(mensagem)) {
            const coords = RebecaService.extrairCoordenadas(mensagem);
            const endereco = await MapsService.geocodificarReverso(coords.latitude, coords.longitude);
            
            // Verificar motoristas disponíveis ANTES de criar corrida
            const motoristasDisponiveis = await MotoristaService.listarDisponiveis(adminId);
            
            if (motoristasDisponiveis.length === 0) {
                return '😔 Sem motoristas no momento. Tente em alguns minutos!';
            }
            
            conversa.dados.origemGPS = coords;
            conversa.dados.origem = endereco.endereco || 'Localização recebida';
            conversa.dados.origemValidada = { valido: true, precisao: 'gps', latitude: coords.latitude, longitude: coords.longitude };
            conversa.dados.calculo = {
                origem: { endereco: conversa.dados.origem, latitude: coords.latitude, longitude: coords.longitude },
                destino: null,
                distanciaKm: 0,
                tempoMinutos: 0,
                preco: 15,
                faixa: { nome: 'chamada', multiplicador: 1 }
            };
            
            // Pedir número/complemento ANTES de criar corrida
            conversa.etapa = 'pedir_complemento_gps';
            conversas.set(telefone, conversa);
            
            return `📍 ${conversa.dados.origem}\n\nQual o número ou ponto de referência?`;
        }
        // ========== TENTAR IA PRIMEIRO ==========
        if (configRebeca.usarIA && IAService.isAtivo() && conversa.etapa === 'inicio') {
            // Buscar dados da empresa do admin
            let nomeEmpresa = '', telefoneEmpresa = '';
            try {
                if (conversa.adminId) {
                    const { Admin } = require('../models');
                    const admin = await Admin.findById(conversa.adminId);
                    if (admin) {
                        nomeEmpresa = admin.empresa || admin.nome || '';
                        telefoneEmpresa = admin.telefone || '';
                    }
                }
            } catch(e) {}
            
            const analise = await IAService.analisarMensagem(msgOriginal, {
                nome, telefone,
                etapa: conversa.etapa,
                temCasa: !!favoritos.casa,
                temTrabalho: !!favoritos.trabalho,
                nomeEmpresa,
                telefoneEmpresa
            });

            if (analise.usarIA && analise.confianca >= 0.7) {
                const resultadoIA = await RebecaService.processarComIA(telefone, nome, analise, conversa, favoritos);
                if (resultadoIA) {
                    conversas.set(telefone, conversa);
                    return resultadoIA;
                }
            }
        }
 
        // ========== AGUARDANDO MOTORISTA OU EM CORRIDA ==========
        if ((conversa.etapa === 'aguardando_motorista' || conversa.etapa === 'em_corrida') && !msg.includes('cancelar')) {
            // Verificar se tem motorista atribuido - encaminhar mensagem
            try {
                const { Corrida } = require('../models');
                const telsC = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
                const corridaAtiva = await Corrida.findOne({ 
                    clienteTelefone: { $in: telsC }, 
                    status: { $in: ['aceita', 'em_andamento', 'motorista_a_caminho'] }
                });
                
                if (corridaAtiva && corridaAtiva.motoristaId) {
                    // Tem motorista - encaminhar mensagem via WhatsApp
                    const motoristaAtivo = await MotoristaService.buscarPorId(corridaAtiva.motoristaId);
                    if (motoristaAtivo?.whatsapp && conversa.instanciaId) {
                        const msgMotorista = '💬 *Mensagem do cliente:*\n\n' + msgOriginal;
                        await EvolutionMultiService.enviarMensagem(conversa.instanciaId, motoristaAtivo.whatsapp, msgMotorista);
                        conversas.set(telefone, conversa);
                        return '✅ Mensagem enviada para o motorista *' + (motoristaAtivo.nomeCompleto || motoristaAtivo.nome) + '*!';
                    }
                }
            } catch (e) { console.log('[REBECA] Erro encaminhar msg:', e.message); }
            
            // Sem motorista ainda
            conversas.set(telefone, conversa);
            return '⏳ Estou localizando o motorista mais próximo...\n\nAssim que um aceitar, te aviso! Para cancelar, digite *CANCELAR*.';
        }

        // ========== AVALIACAO ==========
        if (conversa.etapa === 'avaliar') {
            const nota = parseInt(msg);
            if (nota >= 1 && nota <= 5) {
                const estrelas = '⭐'.repeat(nota);
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                return estrelas + ' Obrigada pela avaliacao! Sua opiniao e muito importante pra gente.\n\nQuando precisar, e so chamar!';
            } else if (msg === 'menu' || msg === 'oi' || msg === 'ola' || msg.length > 5) {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                return RebecaService.menuPrincipal(nome, telefone);
            } else {
                return 'Manda uma nota de *1* a *5* pra avaliar o motorista, ou digite *menu* pra voltar.';
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
        else if (msg.includes("cancelar")) {
            // Buscar corrida ativa do cliente
            let cancelou = false;
            try {
                const { Corrida } = require('../models');
                // Buscar por telefone com diferentes formatos
                const tels = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
                const corridaAtiva = await Corrida.findOne({
                    clienteTelefone: { $in: tels },
                    status: { $in: ['pendente', 'aceita', 'a_caminho', 'motorista_a_caminho', 'em_andamento'] }
                });
                console.log('[CANCELAR] Buscando corrida para tels:', tels, '| Encontrou:', !!corridaAtiva);
                
                if (corridaAtiva) {
                    console.log('[CANCELAR] Corrida encontrada:', corridaAtiva._id, '| motoristaId:', corridaAtiva.motoristaId);
                    await CorridaService.cancelarCorrida(corridaAtiva._id, "Cancelado pelo cliente");
                    cancelou = true;
                    
                    // Notificar motorista via WhatsApp
                    console.log('[CANCELAR] instanciaId:', conversa.instanciaId);
                    if (corridaAtiva.motoristaId) {
                        try {
                            const motorista = await MotoristaService.buscarPorId(corridaAtiva.motoristaId);
                            console.log('[CANCELAR] Motorista:', motorista?.nomeCompleto || motorista?.nome, '| WhatsApp:', motorista?.whatsapp);
                            
                            if (motorista?.whatsapp && conversa.instanciaId) {
                                const msgMot = '❌ *CORRIDA CANCELADA PELO CLIENTE*\n\n' +
                                    '📍 *Origem:* ' + (corridaAtiva.origem?.endereco || 'Não informado') + '\n\n' +
                                    'Você já está disponível para novas corridas! ✅';
                                await EvolutionMultiService.enviarMensagem(conversa.instanciaId, motorista.whatsapp, msgMot);
                                console.log('[CANCELAR] Notificacao enviada para motorista:', motorista.whatsapp);
                            } else if (!conversa.instanciaId) {
                                // Buscar instancia do admin
                                const { InstanciaWhatsapp } = require('../models');
                                const inst = await InstanciaWhatsapp.findOne({ adminId: corridaAtiva.adminId, status: 'conectado' }) || 
                                             await InstanciaWhatsapp.findOne({ status: 'conectado' });
                                if (inst && motorista?.whatsapp) {
                                    const msgMot = '❌ *CORRIDA CANCELADA PELO CLIENTE*\n\n' +
                                        '📍 *Origem:* ' + (corridaAtiva.origem?.endereco || 'Não informado') + '\n\n' +
                                        'Você já está disponível para novas corridas! ✅';
                                    await EvolutionMultiService.enviarMensagem(inst._id, motorista.whatsapp, msgMot);
                                    console.log('[CANCELAR] Notificacao enviada via instancia fallback');
                                }
                            }
                            // Liberar motorista
                            await MotoristaService.atualizarStatus(corridaAtiva.motoristaId, 'disponivel');
                            console.log('[CANCELAR] Motorista liberado para novas corridas');
                        } catch(e) { console.log('[REBECA] Erro notificar motorista cancelamento:', e.message); }
                    }
                }
            } catch(e) { console.log('[REBECA] Erro cancelar:', e.message); }
            
            conversa.etapa = 'inicio';
            conversa.dados = {};
            if (cancelou) {
                resposta = '✅ Corrida cancelada!\n\nQuando precisar, é só chamar! 📍';
            } else {
                resposta = 'Você não tem corrida ativa.\n\nEnvie sua localização para pedir! 📍';
            }
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
                // Salvar como texto livre
                RebecaService.salvarFavorito(telefone, tipo, { endereco: msgOriginal });
                conversa.etapa = 'inicio';
                resposta = `✅ *${tipo.toUpperCase()} SALVO!*\n\n${msgOriginal}\n\nAgora digite *${tipo}* para usar!`;
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
            
            if (!validacao.valido) {
                // Nao achou no Maps - perguntar bairro
                conversa.dados.origemTexto = msgOriginal;
                conversa.etapa = 'pedir_bairro_origem';
                conversas.set(telefone, conversa);
                return `📍 ${msgOriginal}\n\nQual bairro?`;
            } else {
                // Achou no Maps - pedir referencia
                conversa.dados.origem = validacao.endereco;
                conversa.dados.origemValidada = validacao;
                conversa.dados.calculo = {
                    origem: { endereco: validacao.endereco, latitude: validacao.latitude, longitude: validacao.longitude },
                    destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                    faixa: { nome: 'padrao', multiplicador: 1 }
                };
                conversa.etapa = 'pedir_referencia';
                conversas.set(telefone, conversa);
                return `📍 ${validacao.endereco}\n\nReferência? (ou 0)`;
            }
        }
        // ========== COMPLEMENTO GPS (número/referência) ==========
        else if (conversa.etapa === 'pedir_complemento_gps') {
            // Salvar complemento/referência
            conversa.dados.observacaoOrigem = msgOriginal;
            
            // Criar corrida e despachar
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
            conversa.etapa = 'aguardando_motorista';
            conversa.dados.corridaId = corrida.id;
            conversas.set(telefone, conversa);
            
            return `📍 ${conversa.dados.origem}\n📌 ${msgOriginal}\n\n⏳ Buscando motorista...\n_CANCELAR se precisar_`;
        }
        // ========== PEDIR BAIRRO ==========
        else if (conversa.etapa === 'pedir_bairro_origem') {
            const enderecoCompleto = conversa.dados.origemTexto + ', ' + msgOriginal;
            conversa.dados.origem = enderecoCompleto;
            conversa.dados.origemValidada = { valido: true, precisao: 'texto_livre', endereco: enderecoCompleto };
            conversa.dados.calculo = {
                origem: { endereco: enderecoCompleto },
                destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                faixa: { nome: 'padrao', multiplicador: 1 }
            };
            conversa.etapa = 'pedir_referencia';
            conversas.set(telefone, conversa);
            return `📍 ${enderecoCompleto}\n\nReferência? (ou 0)`;
        }
        // ========== REFERÊNCIA (NOVO FLUXO DIRETO) ==========
        else if (conversa.etapa === 'pedir_referencia') {
            if (msg !== '0' && msg !== 'não' && msg !== 'nao' && msg !== 'n') {
                conversa.dados.observacaoOrigem = msgOriginal;
            }
            
            // Verificar motoristas disponiveis
            const motoristasRef = await MotoristaService.listarDisponiveis(adminId);
            if (motoristasRef.length === 0) {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                return '😔 Sem motoristas no momento. Tente em alguns minutos!';
            }
            
            // Criar corrida e despachar DIRETO
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
            conversa.etapa = 'aguardando_motorista';
            conversa.dados.corridaId = corrida.id;
            conversas.set(telefone, conversa);
            
            return `📍 ${conversa.dados.origem}${conversa.dados.observacaoOrigem ? '\n📌 ' + conversa.dados.observacaoOrigem : ''}\n\n⏳ Buscando motorista...\n_CANCELAR se precisar_`;
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
                    // Aceitar texto e pedir bairro
                    conversa.dados.origemTexto = msgOriginal;
                    conversa.etapa = 'pedir_bairro_origem';
                    resposta = `📍 ${msgOriginal}\n\nQual bairro?`;
                } else {
                    conversa.dados.origem = validacao.endereco;
                    conversa.etapa = 'pedir_referencia';
                    conversa.dados.origemValidada = validacao;
                    conversa.dados.calculo = {
                        origem: { endereco: validacao.endereco, latitude: validacao.latitude, longitude: validacao.longitude },
                        destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                        faixa: { nome: 'padrao', multiplicador: 1 }
                    };
                    resposta = `📍 ${validacao.endereco}\n\nReferência? (ou 0)`;
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
                conversa.dados.origem = msgOriginal;
                conversa.etapa = 'cotacao_destino';
                resposta = `✅ Origem: ${msgOriginal}\n\n🏁 Destino:`;
            } else {
                conversa.dados.origem = validacao.endereco;
                conversa.etapa = 'cotacao_destino';
                resposta = `✅ Origem: ${validacao.endereco}\n\n🏁 Destino:`;
            }
        }
        else if (conversa.etapa === 'cotacao_destino') {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            if (!validacao.valido) {
                conversa.etapa = 'inicio';
                resposta = `💰 Cotação de *${conversa.dados.origem}* a *${msgOriginal}*\n\nPara valor exato, envie a localização 📍`;
                conversa.dados = {};
            } else {
                conversa.etapa = 'inicio';
                const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, validacao.endereco);
                resposta = `💰 *COTAÇÃO*\n\n📍 ${conversa.dados.origem}\n🏁 ${validacao.endereco}\n\n📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}\n\n💵 *R$ ${calculo.preco.toFixed(2)}*\n\n*1* - 🚗 Pedir agora\n*menu* - Voltar`;
                conversa.dados = {};
            }
        }
        // ========== TENTAR IA PARA PERGUNTAS ==========
        else if (configRebeca.usarIA && IAService.isAtivo()) {
            // Buscar dados empresa para IA
            let infoEmpresa = {};
            try {
                if (conversa.adminId) {
                    const { Admin } = require('../models');
                    const adm = await Admin.findById(conversa.adminId);
                    if (adm) infoEmpresa = { nomeEmpresa: adm.empresa || adm.nome || '', telefoneEmpresa: adm.telefone || '' };
                }
            } catch(e) {}
            const respostaIA = await IAService.responderPergunta(msgOriginal, { ...PrecoDinamicoService.getConfig(), ...infoEmpresa });
            if (respostaIA) {
                resposta = respostaIA + `\n\n_Digite *menu* para ver opções._`;
            } else {
                resposta = `🤔 Desculpe, não consegui entender. Posso te ajudar de outra forma?\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
            }
        }
        else {
            resposta = `🤔 Desculpe, não consegui entender. Posso te ajudar de outra forma?\n\n${RebecaService.menuPrincipal(nome, telefone)}`;
        }

        conversas.set(telefone, conversa);
        
        // Anti-repeticao: nunca mandar mesma msg 2x seguidas
        const ultimaResp = ultimasRespostas.get(telefone);
        if (ultimaResp && ultimaResp === resposta && resposta.length > 20) {
            console.log('[REBECA] Resposta repetida bloqueada para', telefone);
            return null;
        }
        ultimasRespostas.set(telefone, resposta);
        
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
            
            // Origem identificada pela IA
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
                    
                    // Pedir referencia antes de despachar
                    conversa.dados.calculo = {
                        origem: { endereco: validacao.endereco, latitude: validacao.latitude, longitude: validacao.longitude },
                        destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                        faixa: { nome: 'padrao', multiplicador: 1 }
                    };
                    conversa.etapa = 'pedir_referencia';
                    return `📍 ${conversa.dados.origem}\n\nReferência? (ou 0)`;
                } else {
                    // Maps nao achou - perguntar bairro
                    conversa.dados.origemTexto = analise.origem;
                    conversa.etapa = 'pedir_bairro_origem';
                    return `📍 ${analise.origem}\n\nQual bairro?`;
                }
            }
            
            // IA detectou intencao de corrida mas sem endereco
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
        const hora = new Date().getHours();
        let saudacao = 'Olá';
        if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
        else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
        else saudacao = 'Boa noite';
        
        const favoritos = RebecaService.getFavoritos(telefone);
        // Verificar se cliente ja usou antes
        let jaUsou = false;
        try {
            const cl = ClienteService.buscarPorTelefone(telefone);
            if (cl) jaUsou = true;
        } catch(e) {}
        
        let menu = jaUsou 
            ? `${saudacao}${nome ? ', ' + nome : ''}! Que bom te ver de novo! 🚗`
            : `${saudacao}${nome ? ', ' + nome : ''}! Sou a *Rebeca*, sua assistente de transporte. Seja bem-vindo! 🚗\n\nComo posso te ajudar?\n\n📍 Envie sua *localização* ou digite o *endereço* de origem\n💰 Digite *preços* para consultar valores\n📋 Digite *historico* para ver suas corridas`;
        if (favoritos.casa || favoritos.trabalho) {
            menu += `\n\n⭐ *Atalhos salvos:* ${favoritos.casa ? '*casa*' : ''}${favoritos.casa && favoritos.trabalho ? ' | ' : ''}${favoritos.trabalho ? '*trabalho*' : ''}`;
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
            console.log('[REBECA] Buscando motoristas para adminId:', adminId);
            const motoristasDisponiveis = await MotoristaService.listarDisponiveis(adminId);
            console.log('[REBECA] Motoristas encontrados:', motoristasDisponiveis.length, motoristasDisponiveis.map(m => ({ nome: m.nomeCompleto || m.nome, status: m.status, whatsapp: m.whatsapp })));
            
            if (motoristasDisponiveis.length > 0) {
                // Despachar corrida (usa modo configurado: broadcast ou proximo)
                const resultadoDespacho = await DespachoService.despacharCorrida(corrida, motoristasDisponiveis, adminId);
                
                if (resultadoDespacho.sucesso && instanciaId) {
                    // Notificar motoristas via WhatsApp
                    const endOrigem = dados.calculo.origem?.endereco || dados.origem || 'Ver app';
                    const refOrigem = dados.observacaoOrigem ? '\n📌 Ref: ' + dados.observacaoOrigem : '';
                    const linkMaps = (dados.calculo.origem?.latitude && dados.calculo.origem?.longitude) ? '\n🗺️ maps.google.com/?q=' + dados.calculo.origem.latitude + ',' + dados.calculo.origem.longitude : '';
                    const msgCorrida = `🚨 *NOVA CORRIDA!*\n\n📍 ${endOrigem}${refOrigem}${linkMaps}\n\n💰 R$ ${dados.calculo.preco?.toFixed(2) || '15.00'}\n\n✅ Digite ACEITAR`;
                    
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
                
                // Verificar se tem motorista EM CORRIDA mas próximo (próxima corrida)
                const motProximo = await DespachoService.verificarProximaCorrida(corrida, adminId);
                if (motProximo && instanciaId) {
                    const msgProxima = `🔔 *PRÓXIMA CORRIDA PERTO!*\n\n📍 ${dados.calculo.origem?.endereco || dados.origem}\n📏 ${motProximo.distanciaKm.toFixed(1)}km de você\n💰 R$ ${dados.calculo.preco?.toFixed(2) || '15.00'}\n\n✅ ACEITAR PROXIMA\n❌ RECUSAR PROXIMA`;
                    await EvolutionMultiService.enviarMensagem(instanciaId, motProximo.whatsapp, msgProxima);
                    console.log('[REBECA] Próxima corrida enviada para:', motProximo.nomeCompleto || motProximo.nome);
                }
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
    // Salvar endereço frequente do cliente
    salvarEnderecoFrequente: (telefone, endereco, tipo = 'recente') => {
        const favoritos = favoritosClientes.get(telefone) || {};
        if (!favoritos.recentes) favoritos.recentes = [];
        
        // Adicionar aos recentes se não existir
        if (!favoritos.recentes.includes(endereco)) {
            favoritos.recentes.unshift(endereco);
            if (favoritos.recentes.length > 5) favoritos.recentes.pop();
        }
        
        favoritosClientes.set(telefone, favoritos);
        return favoritos;
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
            
            // Notificar cliente que motorista está a caminho COM TEMPO ESTIMADO
            const corrida = await CorridaService.buscarPorId(notif.corridaId);
            if (corrida && corrida.clienteTelefone && instanciaId) {
                // Calcular tempo estimado de chegada
                let tempoEstimado = '';
                if (motorista.latitude && motorista.longitude && corrida.origem?.latitude && corrida.origem?.longitude) {
                    const distKm = MapsService.calcularDistancia(
                        motorista.latitude, motorista.longitude,
                        corrida.origem.latitude, corrida.origem.longitude
                    );
                    const minutos = Math.round((distKm / 30) * 60); // 30km/h média urbana
                    tempoEstimado = `\n⏱️ *Tempo estimado:* ${minutos} min`;
                }
                // Gerar link de rastreamento
                const linkRastreamento = RebecaService.gerarLinkRastreamento(corrida._id || corrida.id);
                const msgCliente = `🚗 *MOTORISTA A CAMINHO!*\n\n👨‍✈️ *${motorista.nomeCompleto || motorista.nome}*\n🚙 ${motorista.veiculo?.modelo || ''} ${motorista.veiculo?.cor || ''}\n🔢 *${motorista.veiculo?.placa || ''}*${tempoEstimado}\n\n📲 Acompanhe em tempo real:\n${linkRastreamento}\n\n💬 Use este chat para falar com o motorista!`;
                await EvolutionMultiService.enviarMensagem(instanciaId, corrida.clienteTelefone, msgCliente);
            }
            
            return `✅ *CORRIDA ACEITA!*\n\n📍 ${corrida?.origem?.endereco || 'Ver no app'}\n💰 R$ ${corrida?.precoEstimado?.toFixed(2) || '?'}\n\n💬 Use o chat do app para falar com o cliente!\n\nDigite *CHEGUEI* ao chegar.\nDigite *FINALIZAR* ao concluir.`;
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
    
    async aceitarProximaCorrida(telefoneMotorista, adminId, instanciaId) {
        try {
            const motorista = await MotoristaService.buscarPorWhatsapp(telefoneMotorista, adminId);
            if (!motorista) return '❌ Você não está cadastrado.';
            
            // Buscar corrida pendente mais recente
            const { Corrida } = require('../models');
            const corridaPendente = await Corrida.findOne({ 
                adminId, 
                status: 'pendente' 
            }).sort({ createdAt: -1 });
            
            if (!corridaPendente) return '❌ Não há corrida disponível no momento.';
            
            // Reservar a próxima corrida para este motorista
            corridaPendente.proximoMotoristaId = motorista._id;
            corridaPendente.proximoMotoristaNome = motorista.nomeCompleto || motorista.nome;
            await corridaPendente.save();
            
            return `✅ *PRÓXIMA CORRIDA RESERVADA!*\n\n📍 ${corridaPendente.origem?.endereco || 'Ver no app'}\n\nAssim que finalizar a corrida atual, ela será sua automaticamente!`;
        } catch(e) {
            console.error('[REBECA] Erro aceitarProxima:', e.message);
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
    },

    // Setar etapa da conversa (usado pelo motorista-app)
    setEtapaConversa(telefone, etapa) {
        const conversa = conversas.get(telefone) || { etapa: 'inicio', dados: {} };
        conversa.etapa = etapa;
        conversas.set(telefone, conversa);
    },

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
