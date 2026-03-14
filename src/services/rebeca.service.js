const { PrecoIntermunicipal } = require('../models');
const PrecoDinamicoService = require('./preco-dinamico.service');
const PrecoAdminService = require('./preco-admin.service');
const MapsService = require('./maps.service');
const CorridaService = require('./corrida.service');
const ClienteService = require('./cliente.service');
const MotoristaService = require('./motorista.service');
const NLPService = require('./nlp.service');
const DespachoService = require('./despacho.service');
const EvolutionMultiService = require('./evolution-multi.service');
const IAService = require('./ia.service');
const OpenAIRebecaService = require('./openai-rebeca.service');
const AprendizadoService = require('./rebeca-aprendizado.service');
const RaciocinioService = require('./rebeca-raciocinio.service');
const CerebroRebeca = require('./cerebro-rebeca.service');

const conversas = new Map();

// Carregar conversas do banco ao iniciar
// Conversas carregadas sob demanda via AprendizadoService

// Salvar conversas no banco a cada 2 min
// Persistencia via AprendizadoService (registra cada interacao automaticamente)

// Auto-cleanup conversas inativas (a cada 5 min, remove conversas >30min sem interacao)
setInterval(async () => {
    const agora = Date.now();
    let limpas = 0;
    for (const [telefone, conversa] of conversas.entries()) {
        const ultimaMsg = conversa._ultimaAtividade || conversa.ultimaMensagem || conversa.updatedAt || Date.now();
        
        // Timeout etapas que podem travar o cliente
        const minutos = (agora - ultimaMsg) / 60000;
        if (conversa.etapa === 'aguardando_motorista' && minutos > 5) {
            // 5min+ sem motorista → tentar redirecionar antes de cancelar
            try {
                const { Corrida } = require('../models');
                const EvolutionMultiService = require('./evolution-multi.service');
                const { InstanciaWhatsapp } = require('../models');
                const inst = await InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: 'conectado' });
                
                if (conversa.dados?.corridaId && minutos <= 10) {
                    // 5-10min: tentar redirecionar
                    const _corridaRedir = await Corrida.findById(conversa.dados.corridaId);
                    if (_corridaRedir && _corridaRedir.status === 'pendente') {
                        const _motsRedir = await MotoristaService.listarDisponiveis(conversa.adminId);
                        if (_motsRedir.length > 0) {
                            await DespachoService.despacharCorrida(_corridaRedir, _motsRedir, conversa.adminId);
                            console.log('[CLEANUP] Redirecionando corrida após ' + minutos.toFixed(0) + 'min');
                            if (inst) await EvolutionMultiService.enviarMensagem(inst._id, telefone, 'Ainda estou procurando motorista pra você! Só mais um instante 🚗');
                            continue;
                        }
                    }
                }
                
                if (conversa.dados?.corridaId && minutos > 10) {
                    // 10min+: cancelar
                    await Corrida.findByIdAndUpdate(conversa.dados.corridaId, { status: 'cancelada', motivoCancelamento: 'timeout_sem_motorista' });
                    if (inst) {
                        await EvolutionMultiService.enviarMensagem(inst._id, telefone, 'Poxa, não encontramos motorista disponível no momento 😔\n\nTente novamente daqui a pouco! Quando precisar é só chamar.');
                    }
                }
            } catch(e) { console.log('[CATCH]', e.message); }
            conversa.etapa = 'inicio';
            conversa.dados = {};
            conversas.set(telefone, conversa);
            console.log('[CLEANUP] Timeout aguardando_motorista:', telefone);
            continue;
        }
        if (conversa.etapa === 'avaliar' && minutos > 60) {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            conversas.set(telefone, conversa);
            console.log('[CLEANUP] Timeout avaliação:', telefone);
            continue;
        }
        const tempoInativo = agora - new Date(ultimaMsg).getTime();
        
        // Aviso em 25min se conversa está no meio de algo
        if (tempoInativo > 25 * 60 * 1000 && tempoInativo < 30 * 60 * 1000 && !conversa.avisouTimeout && conversa.etapa !== 'inicio') {
            conversa.avisouTimeout = true;
            conversas.set(telefone, conversa);
            try {
                const { InstanciaWhatsapp } = require('../models');
                const EvolutionMultiService = require('./evolution-multi.service');
                if (conversa.instanciaId) {
                    await EvolutionMultiService.enviarMensagem(conversa.instanciaId, telefone, '⏰ Ainda está aí? Sua conversa expira em 5 minutos por inatividade. Me manda uma mensagem para continuar!');
                }
            } catch(e) { console.log('[CATCH]', e.message); }
        }
        
        // Remover após 30min
        if (tempoInativo > 30 * 60 * 1000) {
            conversas.delete(telefone);
            limpas++;
        }
    }
    if (limpas > 0) console.log('[REBECA] Cleanup: ' + limpas + ' conversas inativas removidas. Ativas: ' + conversas.size);
}, 5 * 60 * 1000);
const ultimasRespostas = new Map(); // Anti-repeticao
const favoritosClientes = new Map();
const localidadeService = require('./localidade.service');


// ===== ANTI-REPETICAO: Frases variadas =====
const _fraseIdx = new Map();
const FRASES = {
    buscando: ['⏳ Buscando motorista...','⏳ Localizando motorista perto de você...','⏳ Procurando motorista...','⏳ Chamando motoristas da região...'],
    cancelar_hint: ['_CANCELAR se precisar_','_Digite CANCELAR pra desistir_','_Mande CANCELAR se mudar de ideia_'],
    agradecimento: ['Imagina! Sempre que precisar 😊','Por nada! É só chamar!','Disponha! 😊','Que nada! Me chama quando quiser!'],
    cancelado: ['Corrida cancelada! Quando precisar é só chamar 😊','Cancelado! Me chama quando quiser 😊','Pronto, cancelei! É só chamar de novo!'],
    msg_enviada: ['✅ Mensagem enviada pro motorista!','✅ Repassei pro motorista!','✅ Motorista recebeu sua mensagem!'],
    demora_calma: ['Já estou localizando o motorista mais perto! 🚗','Só mais um instante, estou chamando motoristas!','Calma que já vai! Estou buscando o mais próximo 🚗'],
    demora_redirecionou: ['Entendo a pressa! Já chamei outros motoristas 🚗💨','Sem problemas! Já estou redirecionando pra agilizar!','Compreendo! Chamando mais motoristas pra você!']
};
function variar(tipo) {
    const f = FRASES[tipo]; if (!f||!f.length) return '';
    const ult = _fraseIdx.get(tipo)||-1;
    let i = Math.floor(Math.random()*f.length);
    if (f.length>1) while(i===ult) i=Math.floor(Math.random()*f.length);
    _fraseIdx.set(tipo,i); return f[i];
}

const fs = require('fs');
const path = require('path');
const CONFIG_FILE = path.join(__dirname, '../../data/rebeca-config.json');

function _carregarConfigSalvo() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch(e) { console.error('[RebecaService] Erro ao carregar config:', e.message); }
    return {};
}

const configRebeca = {
    enviarLinkRastreamento: true,
    notificarTempoMotorista: true,
    temposNotificacao: [3, 1, 0],
    autoDetectarEndereco: true,
    mensagemBoaViagem: true,
    pedirObservacaoEnderecoImpreciso: true,
    usarIA: true,
    ..._carregarConfigSalvo()
};

// ===== CONFIG POR ADMINID =====
const CONFIG_DIR = path.join(__dirname, '../../data/configs');
const CONFIG_DEFAULTS = {
    enviarLinkRastreamento: true,
    notificarTempoMotorista: true,
    temposNotificacao: [3, 1, 0],
    autoDetectarEndereco: true,
    mensagemBoaViagem: true,
    pedirObservacaoEnderecoImpreciso: true,
    usarIA: true
};
const _configCache = {};
function _getConfigFile(adminId) {
    return path.join(CONFIG_DIR, 'config-' + adminId + '.json');
}
function _carregarConfigAdmin(adminId) {
    if (_configCache[adminId]) return _configCache[adminId];
    try {
        const file = _getConfigFile(adminId);
        if (fs.existsSync(file)) {
            _configCache[adminId] = { ...CONFIG_DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
        } else {
            _configCache[adminId] = { ...CONFIG_DEFAULTS };
        }
    } catch(e) {
        console.error('[RebecaService] Erro ao carregar config do admin:', e.message);
        _configCache[adminId] = { ...CONFIG_DEFAULTS };
    }
    return _configCache[adminId];
}
function _salvarConfigAdmin(adminId, config) {
    try {
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(_getConfigFile(adminId), JSON.stringify(config, null, 2));
    } catch(e) { console.error('[RebecaService] Erro ao salvar config:', e.message); }
}
// ===== FIM CONFIG POR ADMINID =====

const RebecaService = {
    // ==================== CONFIG ====================
    getConfig: (adminId) => {
        const cfg = adminId ? _carregarConfigAdmin(adminId) : configRebeca;
        return {
            ...cfg,
            iaAtiva: IAService.isAtivo(),
            iaConfig: IAService.getConfig()
        };
    },
    
    setConfig: (novaConfig) => {
        const adminId = novaConfig.adminId;
        if (adminId) {
            const cfg = _carregarConfigAdmin(adminId);
            Object.assign(cfg, novaConfig);
            _salvarConfigAdmin(adminId, cfg);
            _configCache[adminId] = cfg;
        } else {
            // fallback legado sem adminId
            Object.assign(configRebeca, novaConfig);
        }
        return RebecaService.getConfig(adminId);
    },

    // ==================== HELPERS ====================
    pareceEndereco: (texto) => {
        if (!texto || texto.length < 3) return false;
        const lower = texto.toLowerCase().trim();
        
        // NUNCA é endereço se contém palavras de pergunta
        const palavrasPerguntas = ['?', 'como funciona', 'qual o', 'quanto', 'quando', 'onde fica', 'posso', 'voce', 'você', 'aceita', 'funciona', 'horario', 'horário', 'aberto', 'fecha', 'demora quanto', 'valor da', 'custa', 'pago', 'pagar', 'dinheiro', 'pix', 'cartao', 'cartão', 'credito', 'crédito', 'debito', 'débito', 'troco', 'seguro', 'segurança', 'confiavel', 'confiável'];
        for (const p of palavrasPerguntas) {
            if (lower.includes(p)) return false;
        }
        
        // Ignorar comandos obvios
        const comandos = ['menu','oi','ola','olá','bom dia','boa tarde','boa noite','obrigado','obrigada','valeu','sim','nao','não','ok','1','2','3','4','5','6','7','casa','trabalho','cancelar','aceitar','finalizar','cheguei','preço','preco','historico','cotação','cotacao','ajuda','atendente','ola rebeca','oi rebeca','eai','e ai','tudo bem','blz','beleza','ja te mandei','ja mandei','te mandei','mandei','uai','ue','ne','a maravilha','maravilha','otimo','ótimo','legal','show','perfeito','certo','entendi','isso','isso mesmo','pode ser','vamos','bora','ta','tá','vlw','brigado','brigada'];
        const frasesComuns = ['ja te', 'já te', 'te mandei', 'mandei uai', 'uai', 'ue', 'a maravilha'];
        for (const f of frasesComuns) {
            if (lower.includes(f)) return false;
        }
        if (comandos.includes(lower)) return false;
        
        // PONTOS DE REFERÊNCIA CONHECIDOS - despachar direto!
        const pontosReferencia = ['hospital', 'rodoviaria', 'rodoviária', 'aeroporto', 'shopping', 'terminal', 'mercado', 'supermercado', 'escola', 'colegio', 'colégio', 'universidade', 'faculdade', 'forum', 'fórum', 'prefeitura', 'posto de saude', 'posto de saúde', 'upa ', 'ubs ', 'igreja', 'catedral', 'capela', 'cemiterio', 'cemitério', 'estadio', 'estádio', 'ginasio', 'ginásio', 'pronto socorro', 'farmacia', 'farmácia', 'banco ', 'lotérica', 'loterica', 'correios', 'delegacia', 'bombeiros', 'cartorio', 'cartório', 'detran', 'sesi', 'senai', 'senac', 'sesc', 'parque ', 'praça ', 'praca ', 'feira', 'mercadao', 'mercadão', 'padaria', 'açougue', 'acougue'];
        for (const p of pontosReferencia) {
            if (lower.includes(p)) return true;
        }
        // PONTOS CADASTRADOS PELO ADMIN (banco + memória)
        try {
            const localidadeService = require('./localidade.service');
            const pontosAdmin = localidadeService.buscarPontos(lower);
            if (pontosAdmin.length > 0) return true;
        } catch(e) {}
        
        // Frases de pedido com localização (ex: "manda um carro aqui no frei gabriel", "me busca no centro")
        const frasesPedidoLocal = /(manda|busca|pega|vem|carro|moto).*(aqui|no |na |em |pro |pra )/i;
        if (frasesPedidoLocal.test(lower)) return true;
        
        // "aqui no/na/em" + nome = ponto de referência
        const aquiNo = /aqui (no|na|em|do|da) .+/i;
        if (aquiNo.test(lower)) return true;
        
        // "estou no/na/em" + nome
        const estouNo = /(estou|to|tô|tou) (no|na|em|do|da|aqui) .+/i;
        if (estouNo.test(lower)) return true;
        
        // "me busca/pega no/na"
        const meBusca = /(me |busca|pega|vem).*(no |na |em )/i;
        if (meBusca.test(lower) && lower.length > 10) return true;
        
        // SÓ é endereço se tem palavra-chave de endereço
        const palavrasEndereco = ['rua ', 'r. ', 'av ', 'av. ', 'avenida ', 'alameda ', 'travessa ', 'estrada ', 'rodovia ', 'praca ', 'praça ', 'bairro ', 'setor ', 'quadra ', 'lote ', 'condominio ', 'condomínio ', 'conjunto ', 'vila ', 'jardim ', 'parque ', 'residencial ', 'numero ', 'número ', 'nº ', 'n. ', 'centro', 'zona sul', 'zona norte', 'zona leste', 'zona oeste', 'br-', 'br ', 'mg-', 'sp-', 'go-', 'distrito'];
        for (const p of palavrasEndereco) {
            if (lower.includes(p)) return true;
        }
        
        // Tem número E pelo menos uma palavra antes? (ex: "Alexandre Rodrigues 180")
        const temNumero = /\d{2,}/.test(texto);
        const palavras = texto.split(/\s+/).length;
        if (temNumero && palavras >= 2 && texto.length > 10) {
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

    ePontoDeReferencia: (texto) => {
        const t = (texto || '').toLowerCase();
        return /(shopping|rodoviaria|rodoviária|aeroporto|hospital|upa |ubs |terminal|mercado|supermercado|escola|colegio|colégio|universidade|faculdade|igreja|catedral|praça|praca|forum|fórum|prefeitura|banco |farmacia|farmácia|correios|delegacia|bombeiros|cartorio|cartório|detran|sesi|senai|senac|sesc|parque |feira|padaria|posto de saude|posto de saúde|pronto socorro|ginasio|ginásio|estadio|estádio|cemiterio|cemitério|loterica|lotérica|clube |hotel |restaurante |lanchonete )/.test(t) ||
            /(me busca|me pega|busca aqui|pega aqui|aqui no |aqui na |estou no |estou na |to no |to na |tô no |tô na |manda um carro|manda carro)/.test(t);
    },

    getFavoritos: (telefone) => favoritosClientes.get(telefone) || {},
    
    // Carregar favoritos do MongoDB para memória (chamado no inicio da conversa)
    async carregarFavoritos(telefone, adminId) {
        try {
            const { Cliente } = require('../models');
            const tels = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
            const query = { telefone: { $in: tels } };
            if (adminId) query.adminId = adminId;
            const cliente = await Cliente.findOne(query);
            if (cliente?.enderecoFavorito) {
                favoritosClientes.set(telefone, cliente.enderecoFavorito);
                return cliente.enderecoFavorito;
            }
        } catch(e) { console.log('[CATCH]', e.message); }
        return {};
    },

    salvarFavorito: async (telefone, tipo, endereco, adminId) => {
        // Salvar em memória
        const favoritos = favoritosClientes.get(telefone) || {};
        favoritos[tipo] = endereco;
        favoritosClientes.set(telefone, favoritos);
        // Persistir no MongoDB
        try {
            const { Cliente } = require('../models');
            const tels = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
            const query = { telefone: { $in: tels } };
            if (adminId) query.adminId = adminId;
            await Cliente.findOneAndUpdate(query, { $set: { ['enderecoFavorito.' + tipo]: endereco } }, { upsert: false });
        } catch(e) { console.log('[REBECA] Erro salvar favorito MongoDB:', e.message); }
        return favoritos;
    },

    normalizarEndereco(texto) {
        if (!texto || typeof texto !== 'string') return texto;
        let end = texto.trim();
        // Capitalizar primeira letra de cada palavra relevante
        end = end.replace(/(rua|av|avenida|r\.|travessa|tv|alameda|al|estrada|rod|rodovia|praça|pc)/gi, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        // Corrigir abreviações comuns
        end = end.replace(/av\.?/gi, 'Avenida').replace(/r\.?\s/gi, 'Rua ').replace(/tv\.?/gi, 'Travessa');
        // Inserir vírgula entre rua e número se faltar (ex: "Rua das Flores 123" → "Rua das Flores, 123")
        end = end.replace(/([a-záéíóúâêîôûãõçàèìòùA-Z]{3,})\s+(\d+)(?!\s*km|\s*min)/g, '$1, $2');
        // Inserir vírgula entre número e bairro se faltar (ex: "123 Centro" → "123, Centro")
        end = end.replace(/(\d+)\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç])/g, '$1, $2');
        // Remover vírgulas duplicadas
        end = end.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
        return end;
    },

    async validarEndereco(endereco) {
        if (!endereco || endereco.trim().length < 3) {
            return { valido: false, endereco: endereco || '', latitude: null, longitude: null, precisao: 'invalido' };
        }
        // Normalizar antes de validar
        endereco = this.normalizarEndereco(endereco);
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
                valido: true, precisao: 'sem_numero', semNumero: true,
                endereco: resultado.endereco,
                latitude: resultado.latitude,
                longitude: resultado.longitude,
                precisaObservacao: true
            };
        }
        
        const locationType = resultado.locationType || '';
        const types = resultado.types || [];
        const partialMatch = resultado.partialMatch || false;
        const apenasLocalidade = types.length > 0 && types.every(t => ['locality','political','administrative_area_level_1','administrative_area_level_2','country','sublocality','sublocality_level_1'].includes(t));
        const suspeito = partialMatch || locationType === 'APPROXIMATE' || apenasLocalidade;
        return {
            valido: true, precisao: 'exato',
            endereco: resultado.endereco,
            latitude: resultado.latitude,
            longitude: resultado.longitude,
            componentes: resultado.componentes,
            precisaObservacao: false,
            suspeito,
            motivoSuspeita: partialMatch ? 'partial_match' : locationType === 'APPROXIMATE' ? 'approximate' : apenasLocalidade ? 'so_localidade' : null
        };
    },

    // ==================== PROCESSAR MENSAGEM PRINCIPAL ====================
    async processarMensagem(telefone, mensagem, nome = 'Cliente', contexto = {}) {
        const adminId = contexto.adminId || null;
        // Carregar config isolada por adminId (nunca mistura entre admins)
        const _cfg = adminId ? _carregarConfigAdmin(adminId) : configRebeca;
        
        // ========== VERIFICAR SE É ADMIN RESPONDENDO DÚVIDA ==========
        if (adminId) {
            const respostaAdmin = await RebecaService.processarRespostaAdmin(telefone, mensagem, adminId, contexto.instanciaId);
            if (respostaAdmin) {
                return '✅ Resposta enviada ao cliente!';
            }
        }
        
        // ========== COMANDOS DO MOTORISTA ==========
        const msgUpper = typeof mensagem === 'string' ? mensagem.toUpperCase().trim() : '';
        
        // Verificar se é motorista ANTES de processar comandos de motorista
        const telsMotorista = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
        // Buscar motorista COM adminId para não confundir entre admins
        const ehMotorista = await MotoristaService.buscarPorWhatsapp(telsMotorista[0], adminId) || 
                            await MotoristaService.buscarPorWhatsapp(telsMotorista[1], adminId) || 
                            await MotoristaService.buscarPorWhatsapp(telsMotorista[2], adminId) ||
                            // Se não achou com adminId, buscar sem (compatibilidade)
                            await MotoristaService.buscarPorWhatsapp(telsMotorista[0]) || 
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
            
            // MOTORISTA: Se chegou aqui, mensagem não reconhecida - NÃO PROCESSAR COMO CLIENTE
            console.log('[REBECA] Motorista enviou msg não reconhecida:', msgUpper);
            // Chat intermediado: motorista com corrida ativa repassa msg pro cliente
            const _corridaMot = await CorridaService.buscarCorridaAtivaMotorista(ehMotorista._id);
            if (_corridaMot && _corridaMot.clienteTelefone) {
                // Usar adminId da corrida se o contexto não trouxer
                const _adminChat = adminId || _corridaMot.adminId?.toString();
                const _instChat = contexto.instanciaId || _corridaMot.instanciaId?.toString();
                const _resChat = await RebecaService.motoristaMensagemParaCliente(telefone, msgOriginal, _adminChat, _instChat);
                if (_resChat && _resChat.enviado) return '✅ Mensagem enviada pro cliente!';
                console.log('[CHAT] motorista->cliente falhou, adminId:', _adminChat, 'instanciaId:', _instChat);
            }
            return null;
        }
        if (adminId) console.log('[REBECA] Admin:', adminId);
        
        // Guardar adminId na conversa para usar depois
        const msg = typeof mensagem === 'string' ? mensagem.toLowerCase().trim() : '';
        const msgOriginal = typeof mensagem === 'string' ? mensagem.trim() : '';
        const conversa = conversas.get(telefone) || { etapa: 'inicio', dados: {} };
        if (adminId) conversa.adminId = adminId;
        if (contexto.instanciaId) conversa.instanciaId = contexto.instanciaId;
        // Carregar favoritos do MongoDB (atualiza cache em memória)
        await RebecaService.carregarFavoritos(telefone, adminId);
        const favoritos = RebecaService.getFavoritos(telefone);
        
        let resposta = null; // null = sem resposta ainda (diferente de '' que ativa anti-repeticao)

        // ========== CLIENTE FREQUENTE — oferecer destinos recentes ==========
        if (conversa.etapa === 'inicio' && NLPService.eSaudacao(msg)) {
            try {
                const ultimosDestinos = await ClienteService.buscarUltimosDestinos(telefone, adminId);
                const clienteDoc = await ClienteService.buscarPorTelefone(telefone, adminId);
                const primeiraVez = !clienteDoc || clienteDoc.primeiraVez !== false;
                const totalCorridas = clienteDoc?.totalCorridas || clienteDoc?.corridasRealizadas || 0;

                if (!primeiraVez && ultimosDestinos.length > 0 && totalCorridas >= 2) {
                    // Cliente frequente — oferecer últimos destinos
                    let menuDestinos = `${NLPService.saudacaoTemporal()} *${nome?.split(' ')[0] || ''}*! Que bom te ver de novo 😊

`;
                    menuDestinos += `Quer ir pro mesmo lugar?

`;
                    ultimosDestinos.forEach((d, i) => {
                        menuDestinos += `*${i+1}* - ${d.endereco.substring(0, 50)}
`;
                    });
                    menuDestinos += `
Ou me manda o endereço novo! 📍`;

                    conversa.etapa = 'escolher_destino_recente';
                    conversa.dados = { ...conversa.dados, ultimosDestinos };
                    conversas.set(telefone, conversa);
                    resposta = menuDestinos;
                } else if (primeiraVez) {
                    // Primeira vez — boas vindas especial
                    await ClienteService.marcarPrimeiraVezFeita(telefone, adminId);
                    resposta = `${NLPService.saudacaoTemporal()} *${nome?.split(' ')[0] || ''}*! Bem-vindo(a)! 😊

Sou a Rebeca, sua assistente de transporte.

Me manda o endereço de *onde você está* que chamo um motorista pra você! 🚗`;
                }
                // Se nao primeiraVez mas sem destinos — deixa fluir normalmente
            } catch(_e) { console.log('[REBECA] Erro destinos recentes:', _e.message); }
        }

        // ========== DESTINO RECENTE ESCOLHIDO ==========
        if (conversa.etapa === 'escolher_destino_recente') {
            const ultimosDestinos = conversa.dados?.ultimosDestinos || [];
            const numEscolhido = parseInt(msg);
            if (numEscolhido >= 1 && numEscolhido <= ultimosDestinos.length) {
                const destinoEscolhido = ultimosDestinos[numEscolhido - 1];
                // Definir como destino e pedir origem
                conversa.dados.destino = destinoEscolhido.endereco;
                conversa.dados.destinoCoords = { latitude: destinoEscolhido.latitude, longitude: destinoEscolhido.longitude };
                conversa.etapa = 'pedir_origem';
                conversas.set(telefone, conversa);
                resposta = `Ótimo! Indo para *${destinoEscolhido.endereco.substring(0, 60)}* 📍

Me manda o endereço de *onde você está*!`;
            } else if (NLPService.eCancelar(msg) || msg === 'outro' || msg === 'outro endereco') {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                resposta = `Tudo bem! Me manda o endereço de *onde você está* então! 😊`;
            } else {
                // Pode ter mandado endereço ou mensagem — raciocinar
                if (RaciocinioService.isAtivo()) {
                    try {
                        const _racDest = await Promise.race([
                            RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                            new Promise(r => setTimeout(() => r(null), 5000))
                        ]);
                        if (_racDest && _racDest.resposta) {
                            conversas.set(telefone, conversa);
                            return _racDest.resposta;
                        }
                    } catch(e) {}
                }
                conversa.etapa = 'inicio';
                conversas.set(telefone, conversa);
                // Deixa cair no fluxo normal de endereço
            }
        }

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
        // Usar Claude para extrair nome limpo do ponto (ex: "me busca no Frei Gabriel" → "Frei Gabriel")
        let _textoParaBusca = msgLower;
        if (RebecaService.ePontoDeReferencia(msgLower)) {
            try {
                const _nomeLimpo = await RaciocinioService.extrairPontoReferencia(msgOriginal);
                if (_nomeLimpo) _textoParaBusca = _nomeLimpo.toLowerCase();
            } catch(e) { /* usa msgLower como fallback */ }
        }
        if (msgLower.length > 2 && !RebecaService.pareceLocalizacao(mensagem)) {
            const pontosEncontrados = localidadeService.buscarPontos(_textoParaBusca);
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
                // Oferecer fila de espera
                const estimativa = await RebecaService.estimarTempoEspera(adminId);
                conversa.etapa = 'oferecer_fila_espera';
                conversa.dados.origemGPS = coords;
                conversas.set(telefone, conversa);
                return 'Poxa, no momento todos os nossos motoristas estão em corrida! ' +
                    'A previsão é de ' + estimativa.texto + ' para um ficar disponível.\n\n' +
                    'Posso te avisar assim que um motorista desocupar? Responde *SIM* que eu te coloco na fila!';
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
            
            // CRIAR CORRIDA DIRETO - sem pedir referência
            const corridaGps = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);

            // Se foi agendado, responder e sair
            if (corridaGps && corridaGps.agendado) {
                const _dtAg = new Date(conversa.dados.horario_agendamento);
                const _hAg = _dtAg.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                return `Agendado para ${_hAg}! Te mando um lembrete 30 minutos antes. Qualquer coisa é só chamar.`;
            }
            
            if (corridaGps.cooldown) {
                return '⏳ Aguarde um momento...\n\nVocê finalizou uma corrida há pouco.\nPode pedir nova corrida em ' + Math.ceil(corridaGps.segundosRestantes / 60) + ' minuto(s).';
            }
            if (corridaGps.duplicada) {
                return '⚠️ Você já tem uma corrida em andamento!\n\nDigite *CANCELAR* para cancelar ou aguarde o motorista.';
            }
            
            conversa.etapa = 'aguardando_motorista';
            conversa.dados.corridaId = corridaGps.id;
            conversas.set(telefone, conversa);
            
            const _preco1 = conversa.dados?.calculo?.preco || conversa.dados?.calculo?.precoFinal || corridaGps.preco || 0;
            let _msgGps = `✅ *Corrida solicitada!*\n\n📍 *Origem:* ${conversa.dados.origem}`;
            if (_preco1 > 0) _msgGps += `\n💰 *Valor estimado: R$ ${_preco1.toFixed(2)}*`;
            _msgGps += `\n\n⏳ Buscando o motorista mais próximo...`;
            if (_cfg.enviarLinkRastreamento) {
                _msgGps += `\n\n📲 *Acompanhe em tempo real:*\n${RebecaService.gerarLinkRastreamento(corridaGps.id)}`;
            }
            _msgGps += `\n\n_Digite CANCELAR se precisar_`;
            return _msgGps;
        }
        // ========== RACIOCÍNIO AMPLIFICADO: endereço não detectado por regex mas pode ser pedido de corrida ==========
        // ========== CÉREBRO NAS ETAPAS INTERMEDIÁRIAS ==========
        // Roda em qualquer etapa ativa — lê histórico e age de forma inteligente
        const _etapasComCerebro = ['pedir_origem','pedir_destino','confirmar_corrida','pedir_aparencia','pedir_bairro_origem','pedir_bairro_destino','confirmar_preco','avaliar','aguardando_fila','aguardando_motorista','em_corrida','aguardando_embarque','motorista_a_caminho'];
        if (_etapasComCerebro.includes(conversa.etapa) && CerebroRebeca.isAtivo()) {
            try {
                let _nomeEmp2 = 'Central de Corridas', _nomeAss2 = 'Rebeca';
                try {
                    const { Admin } = require('../models');
                    const _adm2 = await Admin.findById(conversa.adminId);
                    if (_adm2) { _nomeEmp2 = _adm2.nomeMarca || _adm2.empresa || _nomeEmp2; _nomeAss2 = _adm2.nomeAssistente || _nomeAss2; _nomePropr2 = _adm2.nome || ''; }
                } catch(e) {}

                const _resInt = await Promise.race([
                    CerebroRebeca.raciocinar(telefone, msgOriginal, conversa, { nome, nomeEmpresa: _nomeEmp2, nomeAssistente: _nomeAss2, nomeProprietario: _nomePropr2 }),
                    new Promise(r => setTimeout(() => r(null), 6000))
                ]);

                if (_resInt) {
                    const _deInt = _resInt.dados_extraidos || {};

                    // Extrair dados que o Cérebro identificou
                    if (_deInt.origem) { conversa.dados.origem = _deInt.origem; conversa.dados.origemValidada = { valido: true, precisao: 'cerebro', endereco: _deInt.origem }; }
                    if (_deInt.destino) { conversa.dados.destino = _deInt.destino; }
                    if (_deInt.cor_camisa) { conversa.dados.aparenciaCliente = _deInt.cor_camisa; }
                    if (_deInt.nome_cliente) { conversa.dados.nomeCliente = _deInt.nome_cliente; }
                    if (_deInt.observacao) { conversa.dados.observacao = (_deInt.observacao + (conversa.dados.observacao ? ' | ' + conversa.dados.observacao : '')); }

                    // DESPACHAR se tiver origem
                    if (_resInt.acao === 'despachar_agora' && conversa.dados.origem) {
                        try {
                            const _motsInt = await MotoristaService.listarDisponiveis(conversa.adminId);
                            if (_motsInt.length === 0) {
                                conversa.etapa = 'oferecer_fila_espera';
                                conversas.set(telefone, conversa);
                                const _mf = 'Poxa, todos os motoristas estão ocupados agora. Posso te avisar quando um desocupar?';
                                CerebroRebeca.salvarHistorico(conversa, _mf, 'rebeca');
                                return _mf;
                            }
                            if (!conversa.dados.calculo) {
                                conversa.dados.calculo = { origem: { endereco: conversa.dados.origem }, destino: conversa.dados.destino ? { endereco: conversa.dados.destino } : null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                            }
                            const _corrInt = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                            if (_corrInt && _corrInt.cooldown) return 'Aguarda ' + Math.ceil(_corrInt.segundosRestantes / 60) + ' min para nova corrida.';
                            if (_corrInt && _corrInt.duplicada) return 'Você já tem uma corrida ativa!';
                            conversa.etapa = 'pedir_aparencia';
                            conversa.dados.corridaId = _corrInt.id;
                            conversas.set(telefone, conversa);
                            _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corrInt.id, conversas);
                            const _instDi = await require('../models').InstanciaWhatsapp.findById(conversa.instanciaId).catch(() => null);
                            if (_instDi) {
                                await EvolutionMultiService.enviarMensagem(conversa.instanciaId, telefone, 'Certo, já chamei um motorista!');
                                await new Promise(r => setTimeout(r, 700));
                                await EvolutionMultiService.enviarMensagem(conversa.instanciaId, telefone, 'Qual a cor da sua camisa? 👕');
                                CerebroRebeca.salvarHistorico(conversa, 'Certo, já chamei um motorista!', 'rebeca');
                                CerebroRebeca.salvarHistorico(conversa, 'Qual a cor da sua camisa? 👕', 'rebeca');
                                return null;
                            }
                            const _mOk = 'Certo! Motorista chamado. Qual a cor da sua camisa? 👕';
                            CerebroRebeca.salvarHistorico(conversa, _mOk, 'rebeca');
                            return _mOk;
                        } catch(e) { console.log('[CEREBRO_INT] Erro despachar:', e.message); }
                    }

                    // CANCELAR
                    if (_resInt.intencao === 'CANCELAR') {
                        // Cancelar direto, sem exigir dupla confirmação
                        conversa.dados._aguardandoCancelamento = true;
                        if (true || conversa.dados._aguardandoCancelamento) {
                            conversa.etapa = 'inicio';
                            conversa.dados = {};
                            conversas.set(telefone, conversa);

                            // === NOTIFICAR MOTORISTA QUE CLIENTE CANCELOU ===
                            try {
                                const { Corrida: _CorrCanc, InstanciaWhatsapp: _InstCanc } = require('../models');
                                const _corridaCanc = await _CorrCanc.findOne({
                                    clienteTelefone: telefone,
                                    status: { $in: ['pendente','aceita','motorista_a_caminho','aguardando_cliente','em_andamento'] },
                                    adminId: conversa.adminId
                                }).sort({ createdAt: -1 });
                                if (_corridaCanc && _corridaCanc.motoristaId) {
                                    const { Motorista: _MotCanc } = require('../models');
                                    const _motCanc = await _MotCanc.findById(_corridaCanc.motoristaId);
                                    if (_motCanc && _motCanc.whatsapp) {
                                        const _instCanc = await _InstCanc.findOne({ adminId: conversa.adminId, status: { $in: ['conectado','open','connected'] } });
                                        if (_instCanc) {
                                            await EvolutionMultiService.enviarMensagem(_instCanc._id, _motCanc.whatsapp, '❌ *CORRIDA CANCELADA*\n\nO cliente cancelou a corrida.\n\nVocê está *DISPONÍVEL* novamente.');
                                            await require('./motorista.service').atualizarStatus(_corridaCanc.motoristaId, 'disponivel');
                                            console.log('[CANCEL-CLI] Motorista notificado:', _motCanc.whatsapp);
                                        }
                                    }
                                    await _CorrCanc.findByIdAndUpdate(_corridaCanc._id, { status: 'cancelada', motivoCancelamento: 'Cancelado pelo cliente' });
                                }
                            } catch(_eCanc) { console.log('[CANCEL-CLI] Erro notif motorista:', _eCanc.message); }
                            // =====================================================
                            const _mc = 'Cancelado! Quando precisar é só chamar.';
                            CerebroRebeca.salvarHistorico(conversa, _mc, 'rebeca');
                            return _mc;
                        }
                        conversa.dados._aguardandoCancelamento = true;
                        conversas.set(telefone, conversa);
                        const _mcConf = 'Confirma o cancelamento?';
                        CerebroRebeca.salvarHistorico(conversa, _mcConf, 'rebeca');
                        return _mcConf;
                    }

                    // Resposta normal do cérebro
                    if (_resInt.resposta) {
                        if (_resInt.acao === 'pedir_destino') conversa.etapa = 'pedir_destino';
                        if (_resInt.acao === 'pedir_origem') conversa.etapa = 'pedir_origem';
                        // Enviar em múltiplas mensagens se necessário
                        if (_resInt.mensagens && _resInt.mensagens.length > 1) {
                            const _instMs2 = await require('../models').InstanciaWhatsapp.findById(conversa.instanciaId).catch(() => null);
                            if (_instMs2) {
                                for (let _mi = 0; _mi < _resInt.mensagens.length; _mi++) {
                                    if (_resInt.mensagens[_mi]) {
                                        await EvolutionMultiService.enviarMensagem(conversa.instanciaId, telefone, _resInt.mensagens[_mi]);
                                        CerebroRebeca.salvarHistorico(conversa, _resInt.mensagens[_mi], 'rebeca');
                                        if (_mi < _resInt.mensagens.length - 1) await new Promise(r => setTimeout(r, 600));
                                    }
                                }
                                conversas.set(telefone, conversa);
                                return null;
                            }
                        }
                        CerebroRebeca.salvarHistorico(conversa, _resInt.resposta, 'rebeca');
                        conversas.set(telefone, conversa);
                        return _resInt.resposta;
                    }
                }
            } catch(e) { console.log('[CEREBRO_INT] Erro:', e.message); }
        }

        // Fallback global: se CerebroRebeca falhar, usar OpenAI diretamente
        const _etapasComRaciocinio = ['pedir_origem','pedir_destino','confirmar_corrida','pedir_aparencia','pedir_bairro_origem'];
        if (_etapasComRaciocinio.includes(conversa.etapa) && !RaciocinioService.isAtivo()) {
            try {
                const OpenAIRebecaService = require('./openai-rebeca.service');
                if (OpenAIRebecaService.isAtivo()) {
                    const _resOAI = await OpenAIRebecaService.gerarResposta(telefone, msgOriginal, conversa, { nome });
                    if (_resOAI) {
                        conversas.set(telefone, conversa);
                        return _resOAI;
                    }
                }
            } catch(e) { console.log('[FALLBACK_OAI]', e.message); }
        }

        // ========== CÉREBRO CENTRAL — raciocínio unificado no início ==========
        if (conversa.etapa === 'inicio' && CerebroRebeca.isAtivo()) {
            try {
                // Buscar nome da empresa do admin
                let _nomeEmpresaCerebro = 'Central de Corridas';
                let _nomeAssistenteCerebro = 'Rebeca';
                let _nomeProprietarioCerebro = '';
                try {
                    const { Admin } = require('../models');
                    const _admCerebro = await Admin.findById(conversa.adminId);
                    if (_admCerebro) {
                        _nomeEmpresaCerebro = _admCerebro.nomeMarca || _admCerebro.empresa || _nomeEmpresaCerebro;
                        _nomeAssistenteCerebro = _admCerebro.nomeAssistente || _nomeAssistenteCerebro;
                        _nomeProprietarioCerebro = _admCerebro.nome || '';
                    }
                } catch(e) {}

                const _resCerebro = await Promise.race([
                    CerebroRebeca.raciocinar(telefone, msgOriginal, conversa, {
                        nome,
                        nomeEmpresa: _nomeEmpresaCerebro,
                        nomeAssistente: _nomeAssistenteCerebro,
                        nomeProprietario: _nomeProprietarioCerebro
                    }),
                    new Promise(r => setTimeout(() => r(null), 6000))
                ]);

                if (_resCerebro && _resCerebro.resposta) {
                    // Notificar admin se necessário
                    if (_resCerebro.notificar_admin) {
                        try {
                            const { Admin } = require('../models');
                            const _admN = await Admin.findById(conversa.adminId);
                            if (_admN && _admN.telefone) {
                                const _instN = await require('../models').InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: 'conectado' });
                                if (_instN) await EvolutionMultiService.enviarMensagem(_instN._id, _admN.telefone,
                                    '📩 *NOTIFICAÇÃO*\n\n👤 ' + (nome || telefone) + '\n💬 ' + msgOriginal);
                            }
                        } catch(e) {}
                    }

                    // Extrair dados que o Cérebro identificou
                    const _de = _resCerebro.dados_extraidos || {};
                    if (_de.origem) { conversa.dados.origem = _de.origem; conversa.dados.origemValidada = { valido: true, precisao: 'cerebro', endereco: _de.origem }; }
                    if (_de.destino) { conversa.dados.destino = _de.destino; conversa.dados.destinoValidado = { valido: true, precisao: 'cerebro', endereco: _de.destino }; }
                    if (_de.nome_terceiro) conversa.dados.nomeTerceiro = _de.nome_terceiro;
                    if (_de.horario) conversa.dados.horarioAgendamento = _de.horario;

                    // DESPACHAR AGORA — só origem já basta
                    const _origemFinal = _de.origem || conversa.dados.origem;
                    if (_resCerebro.acao === 'despachar_agora' && _origemFinal) {
                        conversa.dados.origem = _origemFinal;
                        conversa.dados.origemValidada = { valido: true, precisao: 'cerebro', endereco: _origemFinal };
                        if (_de.nome_cliente) conversa.dados.nomeCliente = _de.nome_cliente;
                        try {
                            const _motsC = await MotoristaService.listarDisponiveis(conversa.adminId);
                            if (_motsC.length === 0) {
                                const _estC = await RebecaService.estimarTempoEspera(conversa.adminId);
                                conversa.etapa = 'oferecer_fila_espera';
                                conversas.set(telefone, conversa);
                                const _msgFila = 'Poxa, todos os motoristas estão ocupados. ' + (_estC ? _estC.texto : '') + ' Posso te avisar quando um desocupar?';
                                CerebroRebeca.salvarHistorico(conversa, _msgFila, 'rebeca');
                                return _msgFila;
                            }
                            if (!conversa.dados.calculo) {
                                conversa.dados.calculo = {
                                    origem: { endereco: _de.origem, latitude: null, longitude: null },
                                    destino: _de.destino ? { endereco: _de.destino } : null,
                                    distanciaKm: 0, tempoMinutos: 0, preco: 15,
                                    faixa: { nome: 'padrao', multiplicador: 1 }
                                };
                            }
                            const _corridaC = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                            if (_corridaC && _corridaC.cooldown) {
                                const _mc = 'Aguarda ' + Math.ceil(_corridaC.segundosRestantes / 60) + ' minutinhos para pedir outra corrida.';
                                CerebroRebeca.salvarHistorico(conversa, _mc, 'rebeca');
                                return _mc;
                            }
                            if (_corridaC && _corridaC.duplicada) {
                                const _md = 'Você já tem uma corrida ativa! Aguarda o motorista chegar.';
                                CerebroRebeca.salvarHistorico(conversa, _md, 'rebeca');
                                return _md;
                            }
                            conversa.etapa = 'pedir_aparencia';
                            conversa.dados.corridaId = _corridaC.id;
                            conversas.set(telefone, conversa);
                            _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corridaC.id, conversas);

                            // Enviar confirmação em 2 mensagens separadas, naturais
                            const _instDesp = await require('../models').InstanciaWhatsapp.findById(conversa.instanciaId);
                            if (_instDesp) {
                                await EvolutionMultiService.enviarMensagem(conversa.instanciaId, telefone, 'Certo, já tô chamando um motorista pra você!');
                                await new Promise(r => setTimeout(r, 800));
                                await EvolutionMultiService.enviarMensagem(conversa.instanciaId, telefone, 'Qual a cor da sua camisa? 👕');
                                CerebroRebeca.salvarHistorico(conversa, 'Certo, já tô chamando um motorista pra você!', 'rebeca');
                                CerebroRebeca.salvarHistorico(conversa, 'Qual a cor da sua camisa? 👕', 'rebeca');
                                return null; // já enviou direto
                            }
                            const _msgOk = 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                            CerebroRebeca.salvarHistorico(conversa, _msgOk, 'rebeca');
                            return _msgOk;
                        } catch(e) {
                            console.log('[CEREBRO] Erro despachar:', e.message);
                        }
                    }

                    // Atualizar etapa se o Cérebro sugeriu
                    if (_resCerebro.acao === 'pedir_destino' && conversa.dados.origem) {
                        conversa.etapa = 'pedir_destino';
                    } else if (_resCerebro.acao === 'pedir_origem') {
                        conversa.etapa = 'pedir_origem';
                    }

                    // Enviar em múltiplas mensagens se Cérebro retornou array
                    if (_resCerebro.mensagens && _resCerebro.mensagens.length > 1) {
                        const _instMs = await require('../models').InstanciaWhatsapp.findById(conversa.instanciaId).catch(() => null);
                        if (_instMs) {
                            for (let _mi = 0; _mi < _resCerebro.mensagens.length; _mi++) {
                                const _mtxt = _resCerebro.mensagens[_mi];
                                if (_mtxt) {
                                    await EvolutionMultiService.enviarMensagem(conversa.instanciaId, telefone, _mtxt);
                                    CerebroRebeca.salvarHistorico(conversa, _mtxt, 'rebeca');
                                    if (_mi < _resCerebro.mensagens.length - 1) await new Promise(r => setTimeout(r, 600));
                                }
                            }
                            conversas.set(telefone, conversa);
                            return null;
                        }
                    }
                    // Salvar resposta no histórico
                    CerebroRebeca.salvarHistorico(conversa, _resCerebro.resposta, 'rebeca');
                    conversas.set(telefone, conversa);
                    return _resCerebro.resposta;
                }
            } catch(e) {
                console.log('[CEREBRO] Erro no inicio:', e.message);
            }
        }

        if (conversa.etapa === 'inicio' && RaciocinioService.isAtivo() && !conversa.dados.origem) {
            // Verificar se parece pedido de corrida com endereço informal (ex: "avenida brasilia 80", "me busca no mercado X")
            // Só entra aqui se origem ainda não foi coletada (evita reprocessar após CerebroRebeca)
            const _msgLower = msg.toLowerCase();
            const _pareceCorridaInformal = (
                _msgLower.match(/(me busca|me pega|vem aqui|manda um carro|quero carro|preciso de carro|to na|to no|estou na|estou no|aqui no|aqui na|me buscar em|ir para|ir pra|quero ir|chama um carro|chama o carro|manda o carro|me leva|pode me buscar|pode me pegar|quero uma corrida|preciso de corrida|quero corrida|me chama|busca aqui|pega aqui|to aqui|tô aqui|sou daqui|to em|tô em|to no|tô no|to na|tô na|saindo de|saindo do|saindo da|partindo de|partindo do|partindo da)/) ||
                (_msgLower.match(/\d+/) && _msgLower.match(/(rua|av|avenida|r\.|travessa|alameda|estrada|bairro|praça|praca|quadra|qd|setor|conjunto|cj|vila|jardim|jd|residencial|res\.)/i)) ||
                RebecaService.pareceEndereco(msgOriginal)
            );
            // Regra: endereço/ponto/rua com número → despacha direto
            //        rua/av SEM número → pede só o número
            //        Maps não validou → despacha mesmo assim
            if (_pareceCorridaInformal) {
                try {
                    const _matchEmb = msgOriginal.match(/(?:na|no|em|desde|saindo de|sou d[ao]?|estou n[ao]?|t[oô] n[ao]?|aqui n[ao]?|busca n[ao]?|buscar n[ao]?|carro n[ao]?|carro em|me busca|me pega)\s+(.{4,60}?)(?:\s*,|\s*$)/i);
                    const _endEmb = _matchEmb ? _matchEmb[1].trim() : (RebecaService.pareceEndereco(msgOriginal) ? msgOriginal.trim() : null);
                    if (_endEmb) {
                        // Rua/av sem número → pede só o número
                        const _eRuaSemNum = _endEmb.match(/(rua|av|avenida|r\.|travessa|alameda|estrada)/i) && !_endEmb.match(/\d+/) && !_endEmb.match(/s\/n|sn\b/i);
                        if (_eRuaSemNum) {
                            conversa.dados.origemTexto = _endEmb;
                            conversa.etapa = 'pedir_numero_origem';
                            conversas.set(telefone, conversa);
                            return `📍 *${_endEmb}*\n\nQual o número?`;
                        }
                        // Com número ou ponto de referência → tenta validar mas despacha de qualquer jeito
                        let _origemFinal = _endEmb;
                        let _origemValidada = { valido: true, precisao: 'texto_livre', endereco: _endEmb, latitude: null, longitude: null };
                        try {
                            const _valEmb = await RebecaService.validarEndereco(_endEmb);
                            if (_valEmb.valido) {
                                _origemFinal = _valEmb.endereco;
                                _origemValidada = _valEmb;
                            }
                        } catch(_eVal) {}
                        conversa.dados.origem = _origemFinal;
                        conversa.dados.origemValidada = _origemValidada;
                        conversa.dados.calculo = { origem: { endereco: _origemFinal, latitude: _origemValidada.latitude || null, longitude: _origemValidada.longitude || null }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                        const _motsEmb = await MotoristaService.listarDisponiveis(conversa.adminId);
                        if (_motsEmb.length === 0) {
                            const _estEmb = await RebecaService.estimarTempoEspera(conversa.adminId);
                            conversa.etapa = 'oferecer_fila_espera';
                            conversas.set(telefone, conversa);
                            return 'Poxa, todos os motoristas estão em corrida! Previsão: ' + _estEmb.texto + '.\n\nPosso te avisar quando um desocupar? Responde *SIM*!';
                        }
                        const _corrEmb = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                        if (_corrEmb.cooldown) return '⏳ Aguarde ' + Math.ceil(_corrEmb.segundosRestantes / 60) + ' min para nova corrida.';
                        if (_corrEmb.duplicada) return '⚠️ Você já tem corrida ativa! Digite *CANCELAR* para cancelar.';
                        conversa.etapa = 'pedir_aparencia';
                        conversa.dados.corridaId = _corrEmb.id;
                        conversas.set(telefone, conversa);
                        return 'Anotei! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                    }
                } catch(_eEmb) { console.log('[EMBUTIDO]', _eEmb.message); }
            }
            if (_pareceCorridaInformal && !RebecaService.pareceEndereco(msgOriginal)) {
                try {
                    const racInicio = await RaciocinioService.raciocinar(telefone, msgOriginal, { etapa: 'pedir_origem', dados: {} }, { nome });
                    if (racInicio && racInicio.acao === 'avancar' && racInicio.valor) {
                        const valRacInicio = await RebecaService.validarEndereco(racInicio.valor);
                        if (valRacInicio.valido) {
                            conversa.dados.origem = valRacInicio.endereco;
                            conversa.dados.origemValidada = valRacInicio;
                            conversa.dados.calculo = { origem: { endereco: valRacInicio.endereco, latitude: valRacInicio.latitude, longitude: valRacInicio.longitude }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                            const _motsRacInicio = await MotoristaService.listarDisponiveis(conversa.adminId);
                            if (_motsRacInicio.length === 0) {
                                const _estRac = await RebecaService.estimarTempoEspera(conversa.adminId);
                                conversa.etapa = 'oferecer_fila_espera';
                                conversas.set(telefone, conversa);
                                return 'Poxa, todos os motoristas estão em corrida! Previsão: ' + _estRac.texto + '.\n\nPosso te avisar quando um desocupar? Responde *SIM*!';
                            }
                            const corridaRac = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                            if (corridaRac.cooldown) return '⏳ Aguarde ' + Math.ceil(corridaRac.segundosRestantes / 60) + ' min para nova corrida.';
                            if (corridaRac.duplicada) return '⚠️ Você já tem corrida ativa! Digite *CANCELAR* para cancelar.';
                            conversa.etapa = 'pedir_aparencia';
                            conversa.dados.corridaId = corridaRac.id;
                            conversas.set(telefone, conversa);
                            return 'Certo, já chamei um motorista! Qual a cor da sua camisa? 👕';
                        }
                    }
                } catch(_eRac) { console.log('[RAC_INICIO]', _eRac.message); }
            }
        }

        // ========== DETECTOR DE BRAVO GLOBAL (qualquer etapa) ==========
        {
            const _msgBravoCheck = msgOriginal.toLowerCase();
            const _palavrasBravo = ['vai se fuder','vai se foder','vsf','fdp','merda','porra','caralho','bosta','lixo de atendimento','alguém nessa','alguem nessa','tem alguem','nessa bosta','nessa merda','pqp','que merda','que bosta','inútil','incompetente','absurdo','ridículo','ridiculo','vergonha','nunca mais','vou processar','péssimo','pessimo','horrível','horrivel','odeio','raiva','maldito','inferno','idiota','burro','palhaço','palhaçada','imbecil','otario','otário'];
            const _estaBravo = _palavrasBravo.some(p => _msgBravoCheck.includes(p));
            if (_estaBravo) {
                // Acalmar e continuar na mesma etapa
                const _frasesCalma = [
                    'Entendo sua frustração e me desculpe pela demora! Vou te ajudar agora mesmo 🙏',
                    'Peço desculpas! Não era pra ser assim. Pode contar comigo, vou resolver agora 💙',
                    'Sinto muito mesmo! Vou priorizar você agora. Me passa o que precisa 🙏',
                    'Desculpe o transtorno! Estou aqui agora, 100% focada em você ❤️'
                ];
                const _fraseCalma = _frasesCalma[Math.floor(Math.random() * _frasesCalma.length)];
                // Notificar admin
                try {
                    const { Admin } = require('../models');
                    const _admBravo = conversa.adminId ? await Admin.findById(conversa.adminId) : null;
                    if (_admBravo && _admBravo.telefone) {
                        const _instBravo = conversa.instanciaId;
                        const _msgAdmBravo = '🔴 *CLIENTE BRAVO*\n\n' +
                            '👤 *Cliente:* ' + (nome || telefone) + '\n' +
                            '📱 *Contato:* wa.me/55' + telefone.replace(/\D/g,'') + '\n' +
                            '💬 *Mensagem:* ' + msgOriginal + '\n\n' +
                            '⚡ Intervença manual recomendada.';
                        await require('./evolution-multi.service').enviarMensagem(_instBravo, _admBravo.telefone, _msgAdmBravo);
                    }
                } catch(_eBravo) { console.log('[REBECA] Erro bloco bravo:', _eBravo.message); }
                return _fraseCalma;
            }
        }

        // ========== TENTAR OPENAI PRIMEIRO ==========
        if (conversa.etapa === 'inicio') {
            // Tentar OpenAI para classificar mensagem
            if (OpenAIRebecaService.isAtivo()) {
                try {
                    // Buscar contexto enriquecido com aprendizados
                    const _contextoIA = await AprendizadoService.gerarContextoEnriquecido(telefone, conversa.adminId);
                    let nomeEmpresa = '';
                    if (conversa.adminId) {
                        const { Admin } = require('../models');
                        const admin = await Admin.findById(conversa.adminId);
                        nomeEmpresa = admin?.empresa || admin?.nome || '';
                    }
                    
                    // Buscar contexto do cliente (histórico de corridas)
                    const contextoCliente = await OpenAIRebecaService.buscarContextoCliente(telefone, conversa.adminId);
                    
                    // Se cliente recorrente pedindo corrida simples
                    if (contextoCliente.clienteRecorrente && contextoCliente.ultimoEndereco) {
                        const msgLower = msgOriginal.toLowerCase();
                        const pedindoCorrida = msgLower.match(/(quero|preciso|carro|corrida|busca|me pega|oi|ola|olá|bom dia|boa tarde|boa noite|manda|chama|vem)/);
                        const informouEndereco = msgLower.match(/(rua|av\b|avenida|travessa|alameda|estrada|numero|número|aqui no|aqui na|\d{3,}|bairro|praca|praça|esquina|proximo|próximo)/);
                        
                        if (pedindoCorrida && !informouEndereco) {
                            // CLIENTE SUPER RECORRENTE (5+ corridas mesmo endereço) = DESPACHO DIRETO
                            if (contextoCliente.enderecoFrequente && contextoCliente.vezesUsouEndereco >= 5) {
                                console.log('[REBECA] Cliente super recorrente (' + contextoCliente.vezesUsouEndereco + 'x) - despacho direto!');
                                const endFreq = contextoCliente.enderecoFrequente;
                                // Validar e criar corrida direto
                                const valFreq = await RebecaService.validarEndereco(endFreq);
                                if (valFreq.valido) {
                                    conversa.dados.origem = valFreq.endereco;
                                    conversa.dados.origemValidada = valFreq;
                                    conversa.dados.calculo = { origem: { endereco: valFreq.endereco, latitude: valFreq.latitude, longitude: valFreq.longitude }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                                    const corridaDir = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                                    if (!corridaDir.duplicada && !corridaDir.cooldown) {
                                        conversa.etapa = 'pedir_aparencia';
                                        conversa.dados.corridaId = corridaDir.id;
                                        conversas.set(telefone, conversa);
                                        _agendarTimeoutAparencia(telefone, conversa.instanciaId, corridaDir.id, conversas);
                                        return 'Oi ' + (nome || '') + '! Já mandei pro mesmo lugar 🚗 Qual a cor da sua camisa? 👕';
                                    }
                                }
                            }
                            
                            // CLIENTE RECORRENTE (3+ corridas) = Perguntar rápido
                            conversa.dados.ultimoEnderecoSugerido = contextoCliente.ultimoEndereco;
                            conversa.etapa = 'confirmar_endereco_anterior';
                            conversas.set(telefone, conversa);
                            return 'Oi ' + (nome || '') + '! Mesmo lugar de antes? 🚗\n\n📍 ' + contextoCliente.ultimoEndereco + '\n\n*1* - Sim\n*2* - Outro endereço';
                        }
                    }
                    
                    const resultadoGPT = await OpenAIRebecaService.classificarMensagem(msgOriginal, { 
                        nome,
                        nomeEmpresa,
                        adminId: conversa.adminId,
                        etapa: conversa.etapa,
                        dadosConversa: conversa.dados,
                        mensagem: msgOriginal,
                        ...contextoCliente
                    });
                    
                    // Usar endereço corrigido pelo GPT se disponível
                    if (resultadoGPT?.endereco_corrigido) {
                        console.log('[GPT] Endereço corrigido:', resultadoGPT.endereco_corrigido);
                        msgOriginal = resultadoGPT.endereco_corrigido;
                    }
                    // Salvar horario_agendamento em conversa.dados se GPT detectou
                    if (resultadoGPT?.horario_agendamento) {
                        conversa.dados = conversa.dados || {};
                        conversa.dados.horario_agendamento = resultadoGPT.horario_agendamento;
                        console.log('[GPT] Horario agendamento detectado:', resultadoGPT.horario_agendamento);
                    }
                    // Corrigir nome do cliente se GPT sugeriu
                    if (resultadoGPT?.nome_cliente_corrigido && nome === nome.toLowerCase()) {
                        nome = resultadoGPT.nome_cliente_corrigido;
                    }
                    if (resultadoGPT && resultadoGPT.resposta) {
                        console.log('[OPENAI] Intenção:', resultadoGPT.intencao);
            
            // MODO SECRETÁRIA: notificar admin quando necessário
            const humorFinal = resultadoGPT.humorCliente || resultadoGPT.humor_cliente || 'NORMAL';
            
            // Detectar BRINCANDO pelo conteúdo da mensagem se GPT não detectou
            const _msgHumor = (msg || '').toLowerCase();
            const _eBrincando = humorFinal === 'BRINCANDO' || 
                (_msgHumor.match(/kkk|haha|rsrs|hauha|kk+|😂|🤣/) && !_msgHumor.includes('bravo') && !_msgHumor.includes('raiva'));
            const humorEfetivo = _eBrincando ? 'BRINCANDO' : humorFinal;

            const deveNotificarAdmin = resultadoGPT.notificarAdmin || resultadoGPT.notificar_admin ||
                resultadoGPT.intencao === 'FALAR_RESPONSAVEL' ||
                resultadoGPT.intencao === 'RECLAMACAO' ||
                humorFinal === 'BRAVO';
            // BRINCANDO e OUTRO nunca notificam admin — são mensagens casuais

            // Se cliente BRAVO — acalmar primeiro
            if (humorEfetivo === 'BRAVO') {
                const frasesCalma = [
                    'Calma, estou aqui! 🙏 Já vou resolver isso pra você agora mesmo.',
                    'Oi! Respira, pode contar comigo 😊 Me fala o que aconteceu que já resolvo.',
                    'Ei, aqui estou! Entendo sua frustração e vou resolver agora. Me conta tudo.',
                    'Calma! Estou te ouvindo e vou resolver isso agora mesmo. O que aconteceu?'
                ];
                const fraseBravo = frasesCalma[Math.floor(Math.random() * frasesCalma.length)];
                try {
                    const instObj = await require('./evolution-multi.service').buscarInstancia(instanciaId);
                    if (instObj) await require('./evolution-multi.service').enviarMensagem(instanciaId, telefone, fraseBravo);
                } catch(_) { console.log('[REBECA] Erro bloco secundario:', _.message); }
            }

            if (deveNotificarAdmin) {
                try {
                    const { Admin } = require('../models');
                    const adminDoc = await Admin.findById(adminId);
                    if (adminDoc && adminDoc.telefone) {
                        // Montar mensagem rica pro admin
                        const emoji = humorEfetivo === 'BRAVO' ? '🔴' : resultadoGPT.intencao === 'RECLAMACAO' ? '🟠' : resultadoGPT.intencao === 'FALAR_RESPONSAVEL' ? '🟡' : '📩';
                        const situacao = humorEfetivo === 'BRAVO' ? 'CLIENTE BRAVO' :
                            resultadoGPT.intencao === 'RECLAMACAO' ? 'RECLAMAÇÃO' :
                            resultadoGPT.intencao === 'FALAR_RESPONSAVEL' ? 'QUER FALAR COM RESPONSÁVEL' :
                            resultadoGPT.intencao === 'AGENDAMENTO' ? 'QUER AGENDAR' : 'FORA DO CONTEXTO';
                        const msgAdmin = emoji + ' *' + situacao + '*\n\n' +
                            '👤 *Cliente:* ' + (nome || 'Sem nome') + '\n' +
                            '📱 *Contato:* wa.me/' + telefone + '\n' +
                            '💬 *Mensagem:* ' + msg + '\n\n' +
                            '⚡ *Ação:* Clique no contato acima para falar diretamente com o cliente.';
                        await require('./evolution-multi.service').enviarMensagem(instanciaId, adminDoc.telefone, msgAdmin);
                        console.log('[SECRETARIA] Admin notificado:', situacao, '| Cliente:', telefone);
                    }
                } catch(e2) { console.log('[SECRETARIA] Erro notificar admin:', e2.message); }
            }
            
            // Se quer falar com responsável, responder e sair (não processar como corrida)
            if (resultadoGPT.intencao === 'FALAR_RESPONSAVEL') {
                return resultadoGPT.resposta || 'Claro! Vou chamar o responsável agora. Pode me dizer sobre o que precisa falar?';
            }
                        
                        // Saudação, agradecimento, outro
                        if (['AGRADECIMENTO', 'INFORMACAO'].includes(resultadoGPT.intencao)) {
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta;
                        }
                        if (resultadoGPT.intencao === 'SAUDACAO') {
                            // Se saudacao veio com origem na mesma mensagem, despachar direto
                            const _origSaud = resultadoGPT.origem || resultadoGPT.endereco || resultadoGPT.endereco_corrigido;
                            if (_origSaud) {
                                conversa.dados.origem = _origSaud;
                                conversa.dados.origemValidada = { valido: true, precisao: 'gpt', endereco: _origSaud };
                                conversa.dados.calculo = { origem: { endereco: _origSaud, latitude: null, longitude: null }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                                const _motsS = await MotoristaService.listarDisponiveis(conversa.adminId);
                                if (_motsS.length > 0) {
                                    const _cS = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                                    if (!_cS.cooldown && !_cS.duplicada) {
                                        conversa.etapa = 'pedir_aparencia';
                                        conversa.dados.corridaId = _cS.id;
                                        conversas.set(telefone, conversa);
                                        return (resultadoGPT.resposta ? resultadoGPT.resposta + ' ' : '') + 'Já chamei um motorista! Qual a cor da sua camisa? 👕';
                                    }
                                }
                            }
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta;
                        }
                        
                        // OUTRO — redirecionar suavemente para corrida
                        if (resultadoGPT.intencao === 'OUTRO') {
                            conversas.set(telefone, conversa);
                            const _respostaOUTRO = (resultadoGPT.resposta || '').toLowerCase();
                            // Filtrar respostas genéricas proibidas
                            const _proibidas = ['como posso ajudar', 'posso te ajudar', 'posso fazer por você', 'aqui é a rebeca', 'da ubmax', 'em que posso', 'é só chamar', 'quando precisar de um carro'];
                            const _temProibida = _proibidas.some(p => _respostaOUTRO.includes(p));
                            if (!_temProibida && resultadoGPT.resposta && resultadoGPT.resposta.length > 5) {
                                return resultadoGPT.resposta;
                            }
                            // Fallback contextual variado — sem frase fixa
                            const _msgLower = (msg || '').toLowerCase();
                            if (_msgLower.includes('kk') || _msgLower.includes('haha') || _msgLower.includes('rsrs')) return ['Haha! 😄', 'Kkk tô aqui! 😄', '😂 Boa!'][Math.floor(Math.random()*3)];
                            if (_msgLower.includes('fds') || _msgLower.includes('droga') || _msgLower.includes('merda')) return ['Eita! 😅 Tá tudo bem?', 'Ops! 😅'][Math.floor(Math.random()*2)];
                            if (_msgLower.includes('dormir') || _msgLower.includes('boa noite')) return 'Boa noite! 😴';
                            if (_msgLower.includes('dinheiro') || _msgLower.includes('pix') || _msgLower.includes('reais')) return 'Haha, só faço corridas por aqui! 😄';
                            if (_msgLower.includes('internet') || _msgLower.includes('sinal') || _msgLower.includes('net')) return 'Eita, boa sorte com o sinal! 😅';
                            if (_msgLower.includes('humilh') || _msgLower.includes('triste') || _msgLower.includes('chateado')) return 'Espero melhorar seu dia! 😊';
                            return ['Entendido! 😊', 'Tô aqui! 😊', 'Ok! 😄'][Math.floor(Math.random()*3)];
                        }
                        
                        // Verificar disponibilidade - já consultou motoristas
                        if (resultadoGPT.intencao === 'VERIFICAR_DISPONIBILIDADE') {
                            if (resultadoGPT.oferecerFila) {
                                conversa.etapa = 'oferecer_fila_espera';
                            }
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta;
                        }
                        
                        // Solicitar corrida (inclui AGENDAMENTO — corrida com horário)
                        if (resultadoGPT.intencao === 'SOLICITAR_CORRIDA' || resultadoGPT.intencao === 'AGENDAMENTO') {
                            conversa.dados.tipo = 'passageiro';
                            if (resultadoGPT.urgente) {
                                conversa.dados.prioridade = 'urgente';
                            }
                            // Se GPT ja extraiu origem — despachar direto sem perguntar
                            const _origGPT = resultadoGPT.origem || resultadoGPT.endereco || resultadoGPT.endereco_corrigido;
                            if (_origGPT) {
                                conversa.dados.origem = _origGPT;
                                conversa.dados.origemValidada = { valido: true, precisao: 'gpt', endereco: _origGPT };
                                conversa.dados.calculo = { origem: { endereco: _origGPT, latitude: null, longitude: null }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                                const _motsGPT = await MotoristaService.listarDisponiveis(conversa.adminId);
                                if (_motsGPT.length > 0) {
                                    const _cGPT = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                                    if (!_cGPT.cooldown && !_cGPT.duplicada) {
                                        conversa.etapa = 'pedir_aparencia';
                                        conversa.dados.corridaId = _cGPT.id;
                                        conversas.set(telefone, conversa);
                                        return 'Certo, já chamei um motorista! Qual a cor da sua camisa? 👕';
                                    }
                                }
                            }
                            conversa.etapa = 'pedir_origem';
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta;
                        }
                        
                        // Solicitar ENCOMENDA
                        if (resultadoGPT.intencao === 'SOLICITAR_ENCOMENDA') {
                            conversa.etapa = 'pedir_origem_encomenda';
                            conversa.dados.tipo = 'encomenda';
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta;
                        }

                        // Buscar terceiro (mãe, filho, amigo...)
                        if (resultadoGPT.intencao === 'BUSCAR_TERCEIRO') {
                            conversa.etapa = 'pedir_nome_buscado';
                            conversa.dados.tipo = 'passageiro';
                            conversa.dados.buscandoTerceiro = true;
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta || 'Claro! Qual o nome da pessoa que devo buscar? 😊';
                        }
                        
                        // Perguntas sobre a empresa (white-label)
                        if (resultadoGPT.intencao === 'SOBRE_EMPRESA') {
                            try {
                                const { Admin } = require('../models');
                                const admin = await Admin.findById(conversa.adminId);
                                const nomeMarca = admin?.nomeMarca || 'nossa empresa';
                                const nomeAssistente = admin?.nomeAssistente || 'Rebeca';
                                return 'Oi! Eu sou a ' + nomeAssistente + ', assistente comercial da ' + nomeMarca + '. Posso te ajudar a pedir uma corrida ou tirar dúvidas.';
                            } catch (e) {
                                return 'Oi! Eu sou a Rebeca, assistente comercial. Posso te ajudar a pedir uma corrida ou tirar dúvidas.';
                            }
                        }

                        if (resultadoGPT.intencao === 'ENTREVISTA_COMERCIAL') {
                            try {
                                const { Admin } = require('../models');
                                const admin = await Admin.findById(conversa.adminId);
                                const nomeEmpresa = admin?.nomeMarca || admin?.empresa || 'sua empresa';
                                const OpenAIRebecaService = require('./openai-rebeca.service');
                                const resposta = await OpenAIRebecaService.combaterObjecaoComercial(msgOriginal, nomeEmpresa);
                                return resposta;
                            } catch(e) {
                                return 'Sou a melhor escolha pro seu negócio — atendo +1.000 pedidos simultâneos, 24h por dia, sem falhas. Reduzo seu custo operacional e não perco nenhum cliente. Posso chamar um veículo pra você agora pra você testar? 😉';
                            }
                        }
                        
                        // Endereço sem número
                        if (resultadoGPT.intencao === 'INFORMAR_ENDERECO_SEM_NUMERO') {
                            // Tentar com cidade do admin
                            conversa.etapa = 'pedir_numero_origem';
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta;
                        }
                        
                        // Endereço sem bairro
                        if (resultadoGPT.intencao === 'INFORMAR_ENDERECO_SEM_BAIRRO') {
                            conversa.dados.origemTexto = msgOriginal;
                            conversa.etapa = 'pedir_bairro_origem';
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta || '📍 Qual o *bairro*? (ex: Centro, Jardim América)';
                        }
                        
                        // Endereço completo - processar normalmente
                        if (resultadoGPT.intencao === 'INFORMAR_ENDERECO_COMPLETO') {
                            // GPT identificou endereço — processar direto aqui
                            // Salvar obs do motorista se for ponto de referencia
                            if (resultadoGPT.pontoReferencia && resultadoGPT.obsMotorista) {
                                conversa.dados.obsMotorista = '📍 Ponto de referência: ' + resultadoGPT.obsMotorista;
                                conversa.dados.origem = resultadoGPT.enderecoFormatado || msgOriginal;
                            }
                            const _endGPT = resultadoGPT.pontoReferencia
                                ? (resultadoGPT.enderecoFormatado || msgOriginal)
                                : (resultadoGPT.endereco_corrigido || msgOriginal);
                            const _valGPT = await RebecaService.validarEndereco(_endGPT);
                            const _enderecoFinal = _valGPT.valido ? _valGPT.endereco : _endGPT;
                            const _latFinal = _valGPT.valido ? _valGPT.latitude : null;
                            const _lngFinal = _valGPT.valido ? _valGPT.longitude : null;

                            // Salvar origem
                            conversa.dados.origem = _enderecoFinal;
                            if (_valGPT.valido) conversa.dados.origemValidada = _valGPT;
                            conversa.dados.calculo = { origem: { endereco: _enderecoFinal, latitude: _latFinal, longitude: _lngFinal }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };

                            // Se ja tem destino na mesma mensagem (cliente mandou origem+destino juntos)
                            if (conversa.dados.destino) {
                                const _corrGPT = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                                if (_corrGPT.cooldown) return '⏳ Aguarde ' + Math.ceil(_corrGPT.segundosRestantes / 60) + ' min.';
                                if (_corrGPT.duplicada) return '⚠️ Já tem corrida ativa! Digite *CANCELAR* para cancelar.';
                                conversa.etapa = 'pedir_aparencia';
                                conversa.dados.corridaId = _corrGPT.id;
                                conversas.set(telefone, conversa);
                                _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corrGPT.id, conversas);
                                return 'Certo, já chamei um motorista! Qual a cor da sua camisa? 👕';
                            }

                            // Pedir destino — sempre, proativamente
                            conversa.etapa = 'pedir_destino';
                            conversas.set(telefone, conversa);
                            return '📍 *' + _enderecoFinal + '*\n\n🏁 Qual o destino?';
                        }
                        
                        // Perguntar preço - se tem dados de origem/destino, calcular valor real
                        if (resultadoGPT.intencao === 'PERGUNTAR_PRECO') {
                            // Se já tem cálculo com preço, mostrar e oferecer corrida
                            if (conversa.dados?.calculo?.preco > 0 && conversa.dados?.calculo?.destino) {
                                const calc = conversa.dados.calculo;
                                const valor = calc.precoFinal || calc.preco || 0;
                                // Despacha direto
                                const _corrP = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                                conversa.etapa = 'pedir_aparencia';
                                conversa.dados.corridaId = _corrP.id;
                                conversas.set(telefone, conversa);
                                _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corrP.id, conversas);
                                return 'Certo, já chamei! 💰 *R$ ' + valor.toFixed(2) + '* — Qual a cor da sua camisa? 👕';
                            }
                            return await RebecaService.enviarTabelaPrecos(conversa.adminId);
                        }
                        
                        // Cancelamento
                        if (resultadoGPT.intencao === 'CANCELAMENTO') {
                            if (conversa.dados._aguardandoCancelamento) {
                                conversa.etapa = 'inicio';
                                conversa.dados = {};
                                conversas.set(telefone, conversa);

                            // === NOTIFICAR MOTORISTA QUE CLIENTE CANCELOU ===
                            try {
                                const { Corrida: _CorrCanc, InstanciaWhatsapp: _InstCanc } = require('../models');
                                const _corridaCanc = await _CorrCanc.findOne({
                                    clienteTelefone: telefone,
                                    status: { $in: ['pendente','aceita','motorista_a_caminho','aguardando_cliente','em_andamento'] },
                                    adminId: conversa.adminId
                                }).sort({ createdAt: -1 });
                                if (_corridaCanc && _corridaCanc.motoristaId) {
                                    const { Motorista: _MotCanc } = require('../models');
                                    const _motCanc = await _MotCanc.findById(_corridaCanc.motoristaId);
                                    if (_motCanc && _motCanc.whatsapp) {
                                        const _instCanc = await _InstCanc.findOne({ adminId: conversa.adminId, status: { $in: ['conectado','open','connected'] } });
                                        if (_instCanc) {
                                            await EvolutionMultiService.enviarMensagem(_instCanc._id, _motCanc.whatsapp, '❌ *CORRIDA CANCELADA*\n\nO cliente cancelou a corrida.\n\nVocê está *DISPONÍVEL* novamente.');
                                            await require('./motorista.service').atualizarStatus(_corridaCanc.motoristaId, 'disponivel');
                                            console.log('[CANCEL-CLI] Motorista notificado:', _motCanc.whatsapp);
                                        }
                                    }
                                    await _CorrCanc.findByIdAndUpdate(_corridaCanc._id, { status: 'cancelada', motivoCancelamento: 'Cancelado pelo cliente' });
                                }
                            } catch(_eCanc) { console.log('[CANCEL-CLI] Erro notif motorista:', _eCanc.message); }
                            // =====================================================
                                return 'Cancelado! Quando precisar é só chamar 😊';
                            }
                            conversa.dados._aguardandoCancelamento = true;
                            conversas.set(telefone, conversa);
                            return 'Confirma o cancelamento?';
                        }
                        
                        // Reclamação - resposta empática
                        if (resultadoGPT.intencao === 'RECLAMACAO') {
                            const sentCliente = AprendizadoService.detectarSentimento(msgOriginal);
                            console.log('[REBECA] Reclamação detectada, sentimento:', sentCliente);
                            
                            // Tentar resolver com IA
                            const resolucao = await AprendizadoService.resolverConflito(telefone, msgOriginal, {
                                sentimento: sentCliente,
                                etapa: conversa.etapa,
                                temCorrida: !!conversa.dados?.corridaId,
                                adminId: conversa.adminId
                            });
                            
                            if (resolucao) {
                                // Registrar aprendizado
                                await AprendizadoService.registrar({
                                    telefone, adminId: conversa.adminId,
                                    mensagemCliente: msgOriginal,
                                    intencaoDetectada: 'RECLAMACAO',
                                    respostaRebeca: resolucao.resposta,
                                    etapaAntes: conversa.etapa, etapaDepois: conversa.etapa,
                                    resultado: resolucao.escalado ? 'escalado' : 'conflito',
                                    sentimentoCliente: sentCliente
                                });
                                
                                if (resolucao.escalado) {
                                    // Escalar pro admin com contexto
                                    try {
                                        await RebecaService.encaminharDuvidaAoAdmin(telefone, nome, 
                                            '⚠️ CONFLITO: ' + msgOriginal + '\n\nMotivo: ' + (resolucao.motivo_escalar || 'Cliente insatisfeito'),
                                            conversa.adminId, conversa.instanciaId);
                                    } catch(e) { console.log('[CATCH]', e.message); }
                                    conversa.etapa = 'aguardando_resposta_admin';
                                    conversas.set(telefone, conversa);
                                    return resolucao.resposta;
                                }
                                
                                conversas.set(telefone, conversa);
                                return resolucao.resposta;
                            }
                            
                            // Fallback: resposta do GPT normal
                            if (resultadoGPT.clienteNervoso) {
                                console.log('[REBECA] ⚠️ Cliente NERVOSO detectado:', telefone);
                            }
                            conversas.set(telefone, conversa);
                            return resultadoGPT.resposta;
                        }
                    }
                } catch (e) {
                    console.log('[OPENAI] Erro:', e.message);
                }
            }
        }
        
        // ========== FALLBACK: IA CLAUDE ==========
        if (_cfg.usarIA && IAService.isAtivo() && conversa.etapa === 'inicio') {
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
            } catch(e) { console.log('[CATCH]', e.message); }
            
            const analise = await IAService.analisarMensagem(msgOriginal, {
                nome, telefone,
                etapa: conversa.etapa,
                temCasa: !!favoritos.casa,
                temTrabalho: !!favoritos.trabalho,
                nomeEmpresa,
                telefoneEmpresa
            });

            // Se IAService identificou endereço livre mas fluxo já está coletando endereço,
            // deixa o fluxo normal processar (analise.usarIA=false já tratado no IAService)
            if (analise.usarIA && analise.intencao === 'pedir_corrida' && analise.endereco && 
                ['pedir_origem','pedir_destino','confirmar_corrida'].includes(conversa.etapa)) {
                // Re-injetar a mensagem no fluxo normal — não interceptar
                analise.usarIA = false;
            }
            if (analise.usarIA && analise.respostaCurta) {
                const resultadoIA = await RebecaService.processarComIA(telefone, nome, analise, conversa, favoritos);
                if (resultadoIA) {
                    conversas.set(telefone, conversa);
                    return resultadoIA;
                }
            }
        }
 
        // ========== SALVAR HISTÓRICO — toda mensagem do cliente ==========
        if (CerebroRebeca.isAtivo()) {
            CerebroRebeca.salvarHistorico(conversa, msgOriginal, 'cliente');
        }

        // ========== INTERCEPTOR UNIVERSAL — roda em QUALQUER etapa ==========
        // Detecta intenções críticas antes de qualquer processamento de etapa
        const _etapasAtivas = ['aguardando_motorista','em_corrida','aguardando_embarque','motorista_a_caminho','pedir_origem','pedir_destino','confirmar_corrida','confirmar_preco','pedir_aparencia','pedir_bairro_origem','pedir_bairro_destino'];
        if (_etapasAtivas.includes(conversa.etapa)) {
            // FALAR COM RESPONSÁVEL em qualquer etapa
            const _eFalarResp = msg.match(/(quero falar|falar com|chamar|responsavel|responsável|dono|gerente|humano|atendente real|pessoa real)/i);
            if (_eFalarResp) {
                try {
                    const { Admin } = require('../models');
                    const _admInt = await Admin.findById(conversa.adminId);
                    if (_admInt && _admInt.telefone) {
                        const _instInt = await require('../models').InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: 'conectado' });
                        if (_instInt) {
                            await EvolutionMultiService.enviarMensagem(_instInt._id, _admInt.telefone,
                                '📩 *CLIENTE QUER FALAR COM RESPONSÁVEL*\n\n' +
                                '👤 *Cliente:* ' + (nome || telefone) + '\n' +
                                '📱 *Contato:* wa.me/' + telefone + '\n' +
                                '📍 *Etapa atual:* ' + conversa.etapa + '\n' +
                                '💬 *Mensagem:* ' + msgOriginal);
                        }
                    }
                } catch(e) { console.log('[INTERCEPTOR] Erro notif responsavel:', e.message); }
                conversas.set(telefone, conversa);
                return 'Já avisei o responsável! 🙏 Em breve alguém entra em contato com você diretamente.';
            }

            // RECLAMAÇÃO em qualquer etapa — usar Claude para responder
            const _eReclamacao = msg.match(/(pessimo|péssimo|horrivel|horrível|absurdo|ridiculo|ridículo|vergonha|lixo|raiva|indignado|cancelar tudo|nunca mais|reclamar|reclamacao|reclamação)/i);
            if (_eReclamacao && RaciocinioService.isAtivo()) {
                try {
                    const _resRac = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000))
                    ]);
                    if (_resRac && _resRac.resposta) {
                        // Notificar admin
                        try {
                            const { Admin } = require('../models');
                            const _admRec = await Admin.findById(conversa.adminId);
                            if (_admRec && _admRec.telefone) {
                                const _instRec = await require('../models').InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: 'conectado' });
                                if (_instRec) await EvolutionMultiService.enviarMensagem(_instRec._id, _admRec.telefone,
                                    '🟠 *RECLAMAÇÃO*\n\n👤 ' + (nome || telefone) + '\n💬 ' + msgOriginal);
                            }
                        } catch(e) {}
                        conversas.set(telefone, conversa);
                        return _resRac.resposta;
                    }
                } catch(e) { console.log('[INTERCEPTOR] Erro raciocinio reclamacao:', e.message); }
            }
        }

        // ========== AGUARDANDO MOTORISTA OU EM CORRIDA ==========
        if ((conversa.etapa === 'aguardando_motorista' || conversa.etapa === 'em_corrida') && !msg.includes('cancelar')) {
            // CLIENTE NERVOSO/RECLAMANDO DA DEMORA → Redirecionar corrida
            const _reclamaDemora = msg.match(/(demora|demorando|cadê|cade|onde|tá onde|ta onde|quanto tempo|muito tempo|esperando|cansei|absurdo|ridiculo|ridículo|péssimo|pessimo|horrível|horrivel|nunca chega|não chega|nao chega|vou cancelar|demais|muito lento)/);
            if (_reclamaDemora && (conversa.etapa === 'aguardando_motorista' || conversa.etapa === 'em_corrida')) {
                try {
                    const { Corrida: _CM } = require('../models');
                    const _corridaPend = await _CM.findById(conversa.dados.corridaId);
                    if (_corridaPend && _corridaPend.status === 'pendente') {
                        const _minPend = (Date.now() - new Date(_corridaPend.createdAt).getTime()) / 60000;
                        if (_minPend > 3) {
                            console.log('[REBECA] Cliente reclamando demora (' + _minPend.toFixed(0) + 'min), redirecionando corrida');
                            try {
                                const _motsDisp = await MotoristaService.listarDisponiveis(conversa.adminId);
                                if (_motsDisp.length > 0) {
                                    const resultadoRedespacho = await DespachoService.despacharCorrida(_corridaPend, _motsDisp, conversa.adminId);
                                    if (resultadoRedespacho.sucesso) {
                                        try { const PushService = require('./push.service'); await PushService.notificarNovaCorrida(conversa.adminId, _corridaPend); } catch(e){}
                                    }
                                }
                            } catch(e) { console.log('[REBECA] Erro redirecionar:', e.message); }
                            // Notificar admin da urgencia do cliente
                            try {
                                const { Admin } = require('../models');
                                const _admDoc = await Admin.findById(conversa.adminId);
                                if (_admDoc && _admDoc.telefone) {
                                    const _instUrgente = await require('../models').InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: 'conectado' });
                                    if (_instUrgente) {
                                        const _msgUrgAdmin = '🚨 *CLIENTE URGENTE — DEMORA NA CORRIDA*\n\n' +
                                            '👤 *Cliente:* ' + (nome || telefone) + '\n' +
                                            '📱 *Contato:* wa.me/' + telefone + '\n' +
                                            '⏱ *Tempo esperando:* ' + _minPend.toFixed(0) + ' minutos\n' +
                                            '💬 *Mensagem:* ' + msg + '\n\n' +
                                            '⚡ Cliente está reclamando da demora. Verifique a corrida!';
                                        await EvolutionMultiService.enviarMensagem(_instUrgente._id, _admDoc.telefone, _msgUrgAdmin);
                                        console.log('[URGENCIA] Admin notificado sobre demora cliente:', telefone);
                                    }
                                }
                            } catch(eAdm) { console.log('[URGENCIA] Erro notif admin:', eAdm.message); }
                            conversas.set(telefone, conversa);
                            return 'Entendo sua pressa! 🙏 Já estou chamando mais motoristas pra agilizar agora mesmo 🚗💨\n\nO responsável também já foi avisado!';
                        }
                    } else if (_corridaPend && ['aceita','motorista_a_caminho'].includes(_corridaPend.status)) {
                        // Motorista ja aceitou mas ta demorando → notificar motorista da urgencia
                        try {
                            const _motUrgente = await MotoristaService.buscarPorId(_corridaPend.motoristaId);
                            if (_motUrgente && _motUrgente.whatsapp) {
                                const _instUrg = await require('../models').InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: 'conectado' });
                                if (_instUrg) {
                                    const _msgMot = '🚨 *ATENÇÃO — CLIENTE URGENTE*\n\n' +
                                        'O cliente *' + (nome || telefone) + '* está esperando e ficou ansioso.\n' +
                                        'Por favor, confirme que está a caminho ou atualize sua posição!\n\n' +
                                        '_Responda aqui para eu repassar ao cliente._';
                                    await EvolutionMultiService.enviarMensagem(_instUrg._id, _motUrgente.whatsapp, _msgMot);
                                    console.log('[URGENCIA] Motorista notificado urgencia:', _motUrgente.whatsapp);
                                    // Push com flag urgente para painel piscar vermelho
                                    try {
                                        const PushService = require('./push.service');
                                        await PushService.notificarUrgenciaMotorista(_corridaPend.motoristaId, _corridaPend, nome || telefone);
                                    } catch(ePush) { console.log('[URGENCIA] Push falhou:', ePush.message); }
                                }
                            }
                        } catch(eMot) { console.log('[URGENCIA] Erro notif motorista:', eMot.message); }
                        conversas.set(telefone, conversa);
                        return 'Calma! 🙏 Já avisei o motorista que você está esperando — ele deve chegar logo! 🚗';
                    }
                } catch(e) { console.log('[REBECA] Erro check demora:', e.message); }
                conversas.set(telefone, conversa);
                return 'Já estou localizando o motorista mais perto de você! Só um instante 🚗';
            }

            // Verificar se tem motorista atribuido - encaminhar mensagem
            try {
                const { Corrida } = require('../models');
                const telsC = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
                const queryMsg = { 
                    clienteTelefone: { $in: telsC }, 
                    status: { $in: ['aceita', 'em_andamento', 'motorista_a_caminho', 'aguardando_cliente'] }
                };
                if (conversa.adminId) queryMsg.adminId = conversa.adminId;
                const corridaAtiva = await Corrida.findOne(queryMsg);
                
                if (corridaAtiva && corridaAtiva.motoristaId) {
                    // Tem motorista - salvar mensagem para o painel (sem WhatsApp)
                    const motoristaAtivo = await MotoristaService.buscarPorId(corridaAtiva.motoristaId);
                    if (motoristaAtivo) {
                        // CHAT VIA WHATSAPP: repassar pro motorista
                        try {
                            const _resChatCli = await RebecaService.clienteMensagemParaMotorista(telefone, msgOriginal, conversa.adminId, conversa.instanciaId);
                            if (conversa.etapa === 'aguardando_cliente') {
                                conversa.etapa = 'em_corrida';
                            }
                            conversas.set(telefone, conversa);
                            if (_resChatCli && _resChatCli.enviado) {
                                return '✅ Enviado!';
                            }
                            // Fallback: enviar direto pelo WhatsApp mesmo sem corrida no cache
                            const { InstanciaWhatsapp: _IWFb, Corrida: _CFb } = require('../models');
                            const _instFb = conversa.instanciaId
                                ? await _IWFb.findById(conversa.instanciaId).catch(() => null)
                                : await _IWFb.findOne({ adminId: conversa.adminId, status: { $in: ['conectado','open','connected'] } });
                            if (_instFb && motoristaAtivo.whatsapp) {
                                const _nomeCli = corridaAtiva.clienteNome || nome || 'Cliente';
                                const _msgFb = '💬 *' + _nomeCli + ':* ' + msgOriginal + '\n_Responda pelo app._';
                                await EvolutionMultiService.enviarMensagem(_instFb._id, motoristaAtivo.whatsapp, _msgFb);
                                await _CFb.findByIdAndUpdate(corridaAtiva._id, {
                                    $push: { chatMensagens: { texto: msgOriginal, remetente: 'cliente', nomeRemetente: _nomeCli, data: new Date() } }
                                });
                                console.log('[CHAT] Fallback direto -> motorista:', motoristaAtivo.whatsapp);
                                return '✅ Enviado!';
                            }
                        } catch(e2) { console.log('[CHAT] Erro chat cliente->motorista:', e2.message); }
                        conversas.set(telefone, conversa);
                        return '✅ Enviado!';
                    }
                }
            } catch (e) { console.log('[REBECA] Erro encaminhar msg:', e.message); }
            
            // Verificar se quer falar com responsável ou cancelar durante espera
            const _querResponsavel = msg.match(/(responsavel|responsável|dono|gerente|falar com|chamar|humano|atendente|pessoa)/i);
            if (_querResponsavel) {
                try {
                    const { Admin } = require('../models');
                    const _admR = await Admin.findById(conversa.adminId);
                    if (_admR && _admR.telefone) {
                        const _instR = await require('../models').InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: 'conectado' });
                        if (_instR) {
                            const _msgR = '📩 *CLIENTE QUER FALAR COM RESPONSÁVEL*\n\n' +
                                '👤 *Cliente:* ' + (nome || telefone) + '\n' +
                                '📱 *Contato:* wa.me/' + telefone + '\n' +
                                '💬 *Mensagem:* ' + msg;
                            await EvolutionMultiService.enviarMensagem(_instR._id, _admR.telefone, _msgR);
                        }
                    }
                } catch(e) { console.log('[RESPONSAVEL] Erro:', e.message); }
                conversas.set(telefone, conversa);
                return 'Já avisei o responsável! 🙏 Em breve alguém entra em contato com você.\n\nEnquanto isso, seu motorista está sendo localizado 🚗';
            }

            // Sem motorista ainda
            conversas.set(telefone, conversa);
            return '⏳ Estou localizando o motorista mais próximo...\n\nAssim que um aceitar, te aviso! Para cancelar, digite *CANCELAR*.';
        }

        // ========== AGUARDANDO EMBARQUE — resposta para msgs normais ==========
        if (conversa.etapa === 'aguardando_embarque' && !resposta) {
            // Mensagem fora do padrão — raciocinar antes de responder com frase fixa
            const _eMsgEspecial = msg.match(/(nao chegou|não chegou|cadê|cade|onde|motorista|chegou|esperando|não vejo|nao vejo|cancelar|problema|errado|errada)/i);
            if (_eMsgEspecial && RaciocinioService.isAtivo()) {
                try {
                    const _racEmb = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000))
                    ]);
                    if (_racEmb && _racEmb.resposta) {
                        conversas.set(telefone, conversa);
                        return _racEmb.resposta;
                    }
                } catch(e) { console.log('[EMBARQUE] Raciocinio falhou:', e.message); }
            }
            const _frasesEmbarque = [
                'Seu motorista já está te esperando! É só subir no veículo. 🚗',
                'Ele está no local! Pode ir que a corrida começa assim que embarcar. 😊',
                'Motorista aguardando você! Dirija-se ao veículo. 🚙',
                'Já pode ir! O motorista está no local esperando você.'
            ];
            resposta = _frasesEmbarque[Math.floor(Math.random() * _frasesEmbarque.length)];
        }

        // ========== MOTORISTA A CAMINHO (aceitou, indo buscar cliente) ==========
        if (conversa.etapa === 'motorista_a_caminho') {
            if (NLPService.eCancelar(msg)) {
                resposta = 'Seu motorista ja esta a caminho! Para cancelar agora precisaria entrar em contato direto com ele.\n\nSe precisar de ajuda manda mensagem aqui!';
            } else {
                // Raciocinar antes de resposta genérica
                if (RaciocinioService.isAtivo()) {
                    try {
                        const _racCam = await Promise.race([
                            RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                            new Promise(r => setTimeout(() => r(null), 5000))
                        ]);
                        if (_racCam && _racCam.resposta) {
                            conversas.set(telefone, conversa);
                            return _racCam.resposta;
                        }
                    } catch(e) {}
                }
                const _frasesCaminho = [
                    'Seu motorista está a caminho! 🚗 Fique de olho no WhatsApp, ele vai te avisar quando chegar.',
                    'Ele já está indo até você! Assim que chegar no local você recebe uma mensagem aqui. 😊',
                    'Motorista a caminho! Qualquer dúvida é só me chamar.',
                    'Já mandei o motorista! Aguarde a mensagem de chegada no seu WhatsApp. 📲'
                ];
                resposta = _frasesCaminho[Math.floor(Math.random() * _frasesCaminho.length)];
            }
            conversas.set(telefone, conversa);
        }

        // ========== AGUARDANDO EMBARQUE (motorista chegou, cliente vai embarcar) ==========
        if (conversa.etapa === 'aguardando_embarque') {
            if (NLPService.eCancelar(msg)) {
                try {
                    const { Corrida } = require('../models');
                    if (conversa.dados && conversa.dados.corridaId) {
                        const corridaCancelar = await Corrida.findById(conversa.dados.corridaId);
                        if (corridaCancelar) {
                            await Corrida.findByIdAndUpdate(corridaCancelar._id, {
                                status: 'cancelada',
                                motivoCancelamento: 'cliente_cancelou_apos_chegada'
                            });
                            try {
                                const inst = await require('../models').InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });
                                if (inst && corridaCancelar.motoristaId) {
                                    const mot = await MotoristaService.buscarPorId(corridaCancelar.motoristaId);
                                    if (mot && mot.whatsapp) {
                                        await EvolutionMultiService.enviarMensagem(
                                            inst._id, mot.whatsapp,
                                            'O cliente cancelou a corrida apos sua chegada.\n\nVoce esta disponivel para novas corridas!'
                                        );
                                    }
                                }
                            } catch(_mn) {}
                        }
                    }
                } catch(_ce) {}
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                resposta = 'Corrida cancelada. Pedimos desculpas pela situacao.\n\nQuando precisar e so chamar!';
            } else {
                const _opcs = [
                    'Seu motorista esta te aguardando! Por favor, dirija-se ao veiculo.',
                    'Motorista no local, pode ir! Ele esta esperando voce.',
                    'Seu motorista chegou e esta aguardando. Se precisar cancelar, manda CANCELAR.'
                ];
                resposta = _opcs[Math.floor(Math.random() * _opcs.length)];
                conversas.set(telefone, conversa);
            }
        }

        // ========== EM CORRIDA (corrida em andamento) ==========
        if (conversa.etapa === 'em_corrida') {
            if (NLPService.eCancelar(msg)) {
                resposta = 'A corrida ja foi iniciada e nao pode ser cancelada agora.\n\nSe tiver algum problema, fale diretamente com o motorista.';
                conversas.set(telefone, conversa);
            } else {
                try {
                    const { Corrida } = require('../models');
                    if (conversa.dados && conversa.dados.corridaId) {
                        const corridaAtiva = await Corrida.findById(conversa.dados.corridaId);
                        if (corridaAtiva && corridaAtiva.motoristaId) {
                            const mot = await MotoristaService.buscarPorId(corridaAtiva.motoristaId);
                            if (mot && mot.whatsapp) {
                                const inst = await require('../models').InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });
                                if (inst) {
                                    await EvolutionMultiService.enviarMensagem(
                                        inst._id, mot.whatsapp,
                                        'Mensagem do cliente ' + (nome || '') + ':\n\n' + msgOriginal
                                    );
                                    await Corrida.findByIdAndUpdate(corridaAtiva._id, {
                                        $push: { chatMensagens: {
                                            texto: msgOriginal, remetente: 'cliente',
                                            nomeRemetente: nome, data: new Date(), tipo: 'cliente'
                                        }}
                                    });
                                    resposta = 'Mensagem enviada ao motorista!';
                                }
                            }
                        }
                    }
                } catch(_ec) {}
                if (!resposta) {
                    resposta = 'Sua corrida esta em andamento! Pode mandar mensagem aqui para falar com o motorista.';
                }
                conversas.set(telefone, conversa);
            }
        }

        // ========== AVALIACAO ==========
        if (conversa.etapa === 'avaliar') {
            const nota = parseInt(msg);
            const corridaId = conversa.dados?.corridaId;
            if (nota >= 1 && nota <= 5 && corridaId) {
                try {
                    const { Corrida, Motorista } = require('../models');
                    await Corrida.findByIdAndUpdate(corridaId, { avaliacao: nota });

                    // Atualizar média do motorista
                    const corridaAvaliada = await Corrida.findById(corridaId);
                    if (corridaAvaliada?.motoristaId) {
                        const corridas = await Corrida.find({
                            motoristaId: corridaAvaliada.motoristaId,
                            avaliacao: { $exists: true, $gt: 0 }
                        });
                        if (corridas.length > 0) {
                            const media = corridas.reduce((s, c) => s + c.avaliacao, 0) / corridas.length;
                            await Motorista.findByIdAndUpdate(corridaAvaliada.motoristaId, {
                                avaliacao: Math.round(media * 10) / 10
                            });
                        }
                    }

                    // Registrar aprendizado
                    try {
                        const AprendizadoService = require('./rebeca-aprendizado.service');
                        await AprendizadoService.aprenderComAvaliacao(corridaId, nota, adminId);
                    } catch(_ae) {}

                } catch(_av) { console.log('[AVALIACAO] Erro:', _av.message); }

                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);

                const respostas = {
                    1: 'Lamentamos muito pela experiência ruim 😔 Vamos verificar o que aconteceu. Obrigada pelo feedback!',
                    2: 'Poxa, lamentamos que não foi tão bom 😕 Seu feedback nos ajuda a melhorar!',
                    3: 'Obrigada pela avaliação! Estamos sempre buscando melhorar 😊',
                    4: 'Que ótimo! Fico feliz que foi uma boa experiência 😊 Até a próxima!',
                    5: 'Incrível! Ficamos muito felizes 😍⭐ Até a próxima corrida!'
                };
                resposta = respostas[nota] || 'Obrigada pela avaliação! 😊';
            } else if (NLPService.eCancelar(msg) || msg === 'pular' || msg === 'depois') {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                resposta = 'Tudo bem! Até a próxima 😊';
            } else {
                resposta = 'Por favor, manda um número de *1 a 5* para avaliar sua corrida ⭐';
            }
        }
        // ========== FILA DE ESPERA ==========
        if (conversa.etapa === 'oferecer_fila_espera') {
            // Raciocinar sobre resposta ambígua antes de processar
            if (!NLPService.eSim(msg) && !NLPService.eNao(msg) && RaciocinioService.isAtivo()) {
                try {
                    const _racFila = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000))
                    ]);
                    if (_racFila && _racFila.resposta) {
                        conversas.set(telefone, conversa);
                        return _racFila.resposta;
                    }
                } catch(e) {}
            }
            if (NLPService.eSim(msg)) {
                // Cliente quer entrar na fila
                const resultado = await RebecaService.adicionarFilaEspera(
                    telefone, nome, 
                    conversa.dados.calculo?.origem || conversa.dados.origem,
                    conversa.dados.calculo?.destino || conversa.dados.destino,
                    conversa.adminId, conversa.instanciaId
                );
                
                if (resultado) {
                    conversa.etapa = 'aguardando_fila';
                    conversas.set(telefone, conversa);
                    if (resultado.posicao === 1) {
                        return 'Pronto! Você é o próximo da fila! Assim que um motorista desocupar eu te aviso e já crio sua corrida automaticamente!';
                    }
                    return 'Pronto! Te coloquei na fila, você é o ' + resultado.posicao + 'º da vez! Assim que um motorista desocupar eu te aviso!';
                }
                conversa.etapa = 'inicio';
                conversas.set(telefone, conversa);
                return 'Ops, não consegui te adicionar na fila. Tenta de novo daqui a pouco!';
            } else if (NLPService.eNao(msg)) {
                // Cliente não quer esperar
                conversa.etapa = 'inicio';
                conversas.set(telefone, conversa);
                return 'Sem problemas! Quando precisar é só me chamar!';
            } else {
                // Ainda não entendeu — reforçar
                conversas.set(telefone, conversa);
                return 'Quer que eu te avise assim que um motorista ficar livre?\n\nResponde *SIM* para entrar na fila ou *NAO* para tentar depois!';
            }
        }

        // ========== AGUARDANDO NA FILA ==========
        if (conversa.etapa === 'aguardando_fila') {
            if (msg.includes('cancelar') || msg.includes('desistir') || msg.includes('sair')) {
                await RebecaService.removerDaFila(telefone, conversa.adminId);
                conversa.etapa = 'inicio';
                conversas.set(telefone, conversa);
                return 'Ok, te tirei da fila! Quando precisar é só chamar!';
            }
            return 'Você ainda está na fila de espera! Assim que um motorista desocupar eu te aviso. Se quiser desistir, digite *CANCELAR*.';
        }


        // ========== CONFIRMAÇÃO DE PREÇO ==========

        // ========== AGUARDANDO RESPOSTA DO ADMIN ==========
        if (conversa.etapa === 'aguardando_resposta_admin') {
            if (msg.includes('cancelar') || msg.includes('desistir') || msg.includes('deixa') || msg.includes('esquece')) {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                return 'Ok! Se precisar de algo é só chamar!';
            }
            // Liberar após 10 min sem resposta do admin — não prender o cliente
            const _tsAdmin = conversa.dados?._aguardandoAdminTs || Date.now();
            if (!conversa.dados._aguardandoAdminTs) conversa.dados._aguardandoAdminTs = Date.now();
            const _minAdmin = (Date.now() - _tsAdmin) / 60000;
            if (_minAdmin > 10) {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                return 'O responsável ainda não respondeu. Pode me perguntar qualquer coisa!';
            }
            conversas.set(telefone, conversa);
            return 'Sua mensagem foi enviada ao responsável! Aguarde. Se quiser cancelar, digite *CANCELAR*.';
        }

        if (conversa.etapa === 'confirmar_preco') {
            if (msg.includes('sim') || msg.includes('confirma') || msg.includes('pode') || msg.includes('ok') || msg.includes('bora') || msg.includes('vai') || msg.includes('quero') || msg === 's') {
                // Cliente confirmou - criar corrida
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                if (corrida && corrida.agendado) {
                    const _dtA = new Date(conversa.dados.horario_agendamento);
                    const _hA = _dtA.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                    conversa.etapa = 'inicio'; conversa.dados = {}; conversas.set(telefone, conversa);
                    return `Agendado para ${_hA}! Te aviso 30 minutos antes. Qualquer coisa é só falar.`;
                }
                if (corrida.duplicada) return '⚠️ Você já tem uma corrida em andamento!\n\nDigite *CANCELAR* para cancelar ou aguarde.';
                conversa.etapa = 'pedir_aparencia';
                conversa.dados.corridaId = corrida.id;
                conversas.set(telefone, conversa);
                _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
                const _precoConf = conversa.dados?.calculo?.preco || conversa.dados?.calculo?.precoFinal || 0;
                return 'Certo!' + (_precoConf > 0 ? ' 💰 *R$ ' + _precoConf.toFixed(2) + '*' : '') + ' Já chamei um motorista! Qual a cor da sua camisa? 👕';
            } else if (msg.includes('nao') || msg.includes('não') || msg.includes('cancelar') || msg.includes('desisto')) {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                return 'Sem problemas! Corrida cancelada. Quando precisar é só chamar! 😊';
            }
            // Mensagem ambígua — passar pelo Claude para interpretar
            if (RaciocinioService.isAtivo()) {
                try {
                    const _racPreco = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000))
                    ]);
                    if (_racPreco && (_racPreco.acao === 'confirmar' || _racPreco.acao === 'avancar')) {
                        const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                        conversa.etapa = 'pedir_aparencia';
                        conversa.dados.corridaId = corrida.id;
                        conversas.set(telefone, conversa);
                        _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
                        return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                    }
                    if (_racPreco && _racPreco.resposta) {
                        conversas.set(telefone, conversa);
                        return _racPreco.resposta;
                    }
                } catch(e) { console.log('[CONFIRMAR_PRECO] Raciocinio falhou:', e.message); }
            }
            conversas.set(telefone, conversa);
            return 'Confirma a corrida? Responde *SIM* para confirmar ou *NÃO* para cancelar.';
        }

        if (conversa.etapa === 'avaliar') {
            const nota = parseInt(msg);
            // Feedback em texto livre — passar pelo Claude para interpretar e responder
            if (isNaN(nota) && msg.length > 2 && RaciocinioService.isAtivo()) {
                try {
                    const _racAval = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000))
                    ]);
                    if (_racAval && _racAval.resposta) {
                        conversas.set(telefone, conversa);
                        return _racAval.resposta;
                    }
                } catch(e) {}
                conversas.set(telefone, conversa);
                return 'Obrigada pelo feedback! 😊 Como você avalia a corrida de 1 a 5?';
            }
            if (nota >= 1 && nota <= 5) {
                const estrelas = '⭐'.repeat(nota);
                
                // Salvar nota na corrida
                try {
                    const { Corrida, Motorista } = require('../models');
                    const ultimaCorrida = await Corrida.findOne({ clienteTelefone: telefone, status: 'finalizada', ...(conversa?.adminId ? { adminId: conversa.adminId } : {}) }).sort({ updatedAt: -1 });
                    if (ultimaCorrida) {
                        await Corrida.findByIdAndUpdate(ultimaCorrida._id, { avaliacao: nota });
                        // Atualizar média do motorista
                        if (ultimaCorrida.motoristaId) {
                            const corridas = await Corrida.find({ motoristaId: ultimaCorrida.motoristaId, avaliacao: { $exists: true, $gt: 0 } });
                            if (corridas.length > 0) {
                                const media = corridas.reduce((s, c) => s + c.avaliacao, 0) / corridas.length;
                                await Motorista.findByIdAndUpdate(ultimaCorrida.motoristaId, { avaliacao: Math.round(media * 10) / 10 });
                            }
                        }
                    }
                } catch(e) { console.log('[AVALIACAO] Erro ao salvar:', e.message); }
                
                // Rebeca aprende com a avaliação
                try {
                    const { Corrida: _CorrAval } = require('../models');
                    const _ucAval = await _CorrAval.findOne({ clienteTelefone: telefone, avaliacao: nota }).sort({ updatedAt: -1 });
                    if (_ucAval) {
                        await AprendizadoService.aprenderComAvaliacao(_ucAval._id, nota, conversa.adminId);
                    }
                } catch(e) { console.log('[CATCH]', e.message); }
                
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
        // Registrar interação para aprendizado
        const _sentimento = AprendizadoService.detectarSentimento(msgOriginal);
        const _etapaAntes = conversa.etapa;
        const _inicioProcessamento = Date.now();
        
        // COMANDOS DIRETOS: apenas menu numérico explícito
        // Tudo mais vai pro GPT processar com inteligência
        if (msg === 'menu') {
            conversa.etapa = 'inicio';
            conversa.dados = {};
            resposta = RebecaService.menuPrincipal(nome, telefone);
        }
        else if (msg === '2' && conversa.etapa === 'inicio') {
            resposta = await RebecaService.enviarTabelaPrecos();
        }
        else if (msg === '4' && conversa.etapa === 'inicio') {
            resposta = await RebecaService.historicoCliente(telefone);
        }
        else if (msg === '7' && conversa.etapa === 'inicio') {
            conversa.etapa = 'menu_favoritos';
            resposta = `⭐ *FAVORITOS*\n\n`;
            resposta += favoritos.casa ? `🏠 Casa: ${favoritos.casa.endereco}\n` : `🏠 Casa: _Não cadastrado_\n`;
            resposta += favoritos.trabalho ? `🏢 Trabalho: ${favoritos.trabalho.endereco}\n` : `🏢 Trabalho: _Não cadastrado_\n`;
            resposta += `\n*1* - Cadastrar Casa\n*2* - Cadastrar Trabalho\n*0* - Voltar`;
        }
        else if (msg.includes("cancelar")) {
            // Pedir confirmação antes de cancelar (exceto se já confirmou)
            if (!conversa.dados._aguardandoCancelamento) {
                conversa.dados._aguardandoCancelamento = true;
                conversas.set(telefone, conversa);
                resposta = "Confirma o cancelamento? Responde *SIM* para confirmar.";
            } else {
            conversa.dados._aguardandoCancelamento = false;
            // Buscar corrida ativa do cliente
            let cancelou = false;
            try {
                const { Corrida } = require('../models');
                // Buscar por telefone com diferentes formatos
                const tels = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
                const queryCancelar = {
                    clienteTelefone: { $in: tels },
                    status: { $in: ['pendente', 'aceita', 'a_caminho', 'motorista_a_caminho', 'em_andamento'] }
                };
                if (conversa.adminId) queryCancelar.adminId = conversa.adminId;
                const corridaAtiva = await Corrida.findOne(queryCancelar);
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
                            
                            // Motorista recebe cancelamento APENAS no painel (sem WhatsApp)
                            console.log('[CANCELAR] Cancelamento salvo no painel para motorista:', motorista?.nomeCompleto || motorista?.nome);
                            // Notificar motorista via WhatsApp
                            try {
                                const { InstanciaWhatsapp } = require('../models');
                                const instMot = conversa.instanciaId
                                    ? await InstanciaWhatsapp.findById(conversa.instanciaId)
                                    : await InstanciaWhatsapp.findOne({ adminId: conversa.adminId, status: { $in: ['conectado','open','connected'] } });
                                if (instMot && motorista.whatsapp) {
                                    await EvolutionMultiService.enviarMensagem(instMot._id, motorista.whatsapp,
                                        '❌ *CORRIDA CANCELADA PELO CLIENTE*\n\nVocê está disponível para novas corridas!');
                                    console.log('[CANCELAR] Motorista notificado via WhatsApp');
                                }
                            } catch(eMot) { console.log('[CANCELAR] Erro notif motorista:', eMot.message); }
                            // Liberar motorista
                            await MotoristaService.atualizarStatus(corridaAtiva.motoristaId, 'disponivel');
                            console.log('[CANCELAR] Motorista liberado para novas corridas');
                            // Limpar conversa do motorista no mapa de conversas
                            try {
                                if (motorista.whatsapp) {
                                    const _telMot = motorista.whatsapp.replace(/\D/g, '');
                                    const _convMot = conversas.get(_telMot);
                                    if (_convMot) {
                                        conversas.set(_telMot, { etapa: 'inicio', dados: {}, adminId: _convMot.adminId, instanciaId: _convMot.instanciaId });
                                        console.log('[CANCELAR] Conversa do motorista resetada:', _telMot);
                                    }
                                }
                            } catch(eConv) { console.log('[CANCELAR] Erro reset conversa motorista:', eConv.message); }
                        } catch(e) { console.log('[REBECA] Erro notificar motorista cancelamento:', e.message); }
                    }
                }
            } catch(e) { console.log('[REBECA] Erro cancelar:', e.message); }
            
            // Resetar conversa do cliente completamente
            conversa.etapa = 'inicio';
            conversa.dados = {};
            conversas.set(telefone, conversa);
            if (cancelou) {
                resposta = '✅ Corrida cancelada!\n\nQuando precisar, é só chamar! 📍';
            } else {
                resposta = 'Você não tem corrida ativa.\n\nEnvie sua localização para pedir! 📍';
            }
            } // fim else confirmacao cancelamento
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
                conversa.etapa = 'confirmar_corrida';
                resposta = `📍 *Origem:* ${favoritos[tipo].endereco}\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar`;
            } else {
                conversa.etapa = tipo === 'casa' ? 'salvar_casa' : 'salvar_trabalho';
                resposta = `Você não cadastrou ${tipo} ainda.\n\nEnvie o endereço:`;
            }
        }
        // ========== AUTO-DETECT ENDEREÇO ==========
        else if (_cfg.autoDetectarEndereco && conversa.etapa === 'inicio' && RebecaService.pareceEndereco(msgOriginal)) {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            
            if (!validacao.valido) {
                // Classificar endereço antes de desistir
                const classif = await RaciocinioService.classificarEnderecoNaoEncontrado(msgOriginal, conversa.adminId);
                console.log('[CLASSIF]', msgOriginal, '->', classif.tipo, classif.confianca);

                // texto_invalido — não é endereço, sair do bloco autoDetect e deixar fluxo normal tratar
                if (classif.tipo === 'texto_invalido' && classif.confianca > 0.8) {
                    // Cai fora — o fluxo normal (saudação, menu, etc) vai processar
                    // Forçar saída do else if autoDetectarEndereco setando validacao.valido = false
                    // e não retornando nada aqui
                    resposta = null; // será preenchido pelo fluxo normal abaixo
                    // break artificial — o bloco autoDetect não deve retornar nada
                }

                // Nao achou no Maps - tentar com cidade do admin
                let achouComCidade = false;
                try {
                    const { Admin } = require('../models');
                    const adminDoc = conversa.adminId ? await Admin.findById(conversa.adminId) : null;
                    const cidade = adminDoc?.cidadeAtuacao || adminDoc?.cidade || '';
                    // Tentar com cidade + endereço corrigido pelo classificador
                    const textoTentar = classif.enderecoLimpo || msgOriginal;
                    if (cidade) {
                        const val2 = await RebecaService.validarEndereco(textoTentar + ', ' + cidade);
                        if (val2.valido) {
                            conversa.dados.origem = val2.endereco;
                            conversa.dados.origemValidada = val2;
                            conversa.dados.calculo = { origem: { endereco: val2.endereco, latitude: val2.latitude, longitude: val2.longitude }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                            const corridaDireta = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                            if (corridaDireta.cooldown) return '⏳ Aguarde ' + Math.ceil(corridaDireta.segundosRestantes / 60) + ' min para nova corrida.';
                            if (corridaDireta.duplicada) return '⚠️ Você já tem corrida ativa! Digite *CANCELAR* para cancelar.';
                            conversa.etapa = 'pedir_aparencia';
                            conversa.dados.corridaId = corridaDireta.id;
                            achouComCidade = true;
                            conversas.set(telefone, conversa);
                            return 'Certo, já chamei um motorista! Qual a cor da sua camisa? 👕';
                        }
                    }
                } catch(e) { console.log('[CATCH]', e.message); }
                if (!achouComCidade) {
                    // Verificar se tem numero - se nao tem, pedir
                    const temNumero = /\d/.test(msgOriginal);
                    conversa.dados.origemTexto = msgOriginal;
                    // Se é ponto de referência, NÃO pedir número - despachar direto
                    const ehPontoRef = /(hospital|rodoviaria|rodoviária|aeroporto|shopping|terminal|mercado|supermercado|escola|colegio|colégio|universidade|faculdade|forum|fórum|prefeitura|posto|upa|ubs|igreja|catedral|cemiterio|cemitério|estadio|estádio|farmacia|farmácia|banco|correios|delegacia|parque|praça|praca|feira|padaria)/i.test(msgOriginal);
                    const ehFrasePedido = /(aqui no|aqui na|estou no|estou na|to no|to na|me busca|me pega|manda.*aqui)/i.test(msgOriginal);
                    
                    if (!temNumero && !ehPontoRef && !ehFrasePedido) {
                        // Classificar antes de pedir número — pode ser ponto de referência local
                        const classifTL = await RaciocinioService.classificarEnderecoNaoEncontrado(msgOriginal, conversa.adminId);
                        if (classifTL.tipo === 'ponto_referencia' && classifTL.confianca > 0.75) {
                            // Motorista provavelmente conhece — pedir aparência antes de despachar
                            conversa.dados.origem = classifTL.enderecoLimpo || msgOriginal;
                            conversa.dados.origemPontoRef = true;
                            conversa.etapa = 'pedir_aparencia';
                            conversas.set(telefone, conversa);
                            return `📍 *${conversa.dados.origem}*

Qual a cor da sua camisa? 👕

_(ou mande *0* para pular)_`;
                        } else if (classifTL.tipo === 'texto_invalido' && classifTL.confianca > 0.8) {
                            // Não é endereço — pedir origem corretamente
                            conversa.etapa = 'pedir_origem';
                            conversas.set(telefone, conversa);
                            return '📍 Qual o endereço de onde você está? (rua e número)';
                        } else {
                            conversa.etapa = 'pedir_numero_origem';
                            conversas.set(telefone, conversa);
                            return '📍 ' + msgOriginal + '\n\nQual o número?';
                        }
                    } else {
                        // Tem numero ou ponto de referência — criar com texto como está
                        conversa.dados.origem = msgOriginal;
                    }
                    // Salvar origem e pedir destino
                    conversa.dados.origem = conversa.dados.origem || msgOriginal;
                    conversa.dados.origemValidada = { valido: true, precisao: 'texto_livre', endereco: conversa.dados.origem };
                    conversa.dados.calculo = { origem: { endereco: conversa.dados.origem }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                    conversa.etapa = 'pedir_destino';
                    conversas.set(telefone, conversa);
                    return '📍 *' + conversa.dados.origem + '*\n\n🏁 Qual o destino?';
                }
            } else {
                // FLUXO DIRETO: Achou no Maps - verificar suspeito
                if (validacao.suspeito) {
                    // Se é ponto de referência, aceitar sem confirmar - despachar direto!
                    const pontRef = /(hospital|rodoviaria|rodoviária|aeroporto|shopping|terminal|mercado|escola|universidade|prefeitura|posto|igreja|farmacia|farmácia|praça|praca|aqui no|aqui na|estou no|to no)/i.test(msgOriginal);
                    if (!pontRef) {
                        conversa.dados.origemValidadaSuspeita = validacao;
                        conversa.etapa = 'confirmar_endereco_suspeito';
                        conversas.set(telefone, conversa);
                        return `📍 Encontrei: *${validacao.endereco}*\n\nEsse é o endereço correto? Responda *SIM* ou corrija.`;
                    }
                    // Ponto de referência - segue direto pro despacho
                }
                conversa.dados.origem = validacao.endereco;
                conversa.dados.origemValidada = validacao;
                conversa.dados.calculo = {
                    origem: { endereco: validacao.endereco, latitude: validacao.latitude, longitude: validacao.longitude },
                    destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                    faixa: { nome: 'padrao', multiplicador: 1 }
                };
                
                // Verificar motoristas disponíveis
                const motoristasDisponiveis = await MotoristaService.listarDisponiveis(conversa.adminId);
                if (motoristasDisponiveis.length === 0) {
                    // Oferecer fila de espera
                    const estimativa2 = await RebecaService.estimarTempoEspera(conversa.adminId);
                    conversa.etapa = 'oferecer_fila_espera';
                    conversas.set(telefone, conversa);
                    return 'Poxa, no momento todos os nossos motoristas estão em corrida! ' +
                        'A previsão é de ' + estimativa2.texto + ' para um ficar disponível.\n\n' +
                        'Posso te avisar assim que um motorista desocupar? Responde *SIM* que eu te coloco na fila!';
                }
                
                // Salvar origem validada — despachar se já tem destino, senão pedir
                if (conversa.dados.destino) {
                    const _corrD = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                    if (!_corrD.cooldown && !_corrD.duplicada) {
                        conversa.etapa = 'pedir_aparencia';
                        conversa.dados.corridaId = _corrD.id;
                        conversas.set(telefone, conversa);
                        return 'Certo, já chamei um motorista! Qual a cor da sua camisa? 👕';
                    }
                }
                conversa.etapa = 'pedir_destino';
                conversas.set(telefone, conversa);
                return '📍 *' + validacao.endereco + '*\n\n🏁 Qual o destino?';
            }
        }
        // ========== COMPLEMENTO GPS (número/referência) ==========
        else if (conversa.etapa === 'pedir_complemento_gps') {
            // Salvar complemento/referência
            if (msg !== '0' && msg !== 'nao' && msg !== 'não' && msg !== 'n') {
                conversa.dados.observacaoOrigem = msgOriginal;
            }
            
            // Ir para pedir_aparencia — motorista precisa encontrar o cliente no ponto
            conversa.dados.origemPontoRef = true;
            conversa.etapa = 'pedir_aparencia';
            conversas.set(telefone, conversa);
            return `📍 *${conversa.dados.origem}*

Qual a cor da sua camisa? 👕

_(ou mande *0* para pular)_`;
        }
        // ========== CLIENTE RECORRENTE - CONFIRMAR ENDEREÇO ==========
        else if (conversa.etapa === 'confirmar_endereco_anterior') {
            // Cliente recorrente - confirmando se quer usar endereço anterior
            if (msg === '1' || NLPService.eSim(msg)) {
                conversa.dados.origem = conversa.dados.ultimoEnderecoSugerido;
                conversa.etapa = 'confirmar_corrida';
                resposta = '📍 *Origem:* ' + conversa.dados.origem + '\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar';
            } else if (msg === '2' || NLPService.eNao(msg)) {
                conversa.etapa = 'pedir_origem';
                resposta = 'Sem problemas! Me passa o novo endereço ou sua localização 📍';
            } else {
                resposta = 'Responde *1* para usar esse endereço ou *2* para outro 😊';
            }
        }
                // ========== FLUXO DE ENCOMENDA ==========
        else if (conversa.etapa === 'pedir_origem_encomenda') {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            if (validacao.valido) {
                conversa.dados.origem = validacao.endereco;
                conversa.etapa = 'pedir_destino_encomenda';
                resposta = 'Certo! E qual o endereço de entrega?';
            } else {
                // Endereço inválido — tentar raciocinar (pode ser ponto de referência)
                if (RaciocinioService.isAtivo()) {
                    try {
                        const _racEnc = await Promise.race([
                            RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                            new Promise(r => setTimeout(() => r(null), 5000))
                        ]);
                        if (_racEnc && _racEnc.resposta) { resposta = _racEnc.resposta; }
                        else if (_racEnc && _racEnc.endereco) {
                            conversa.dados.origem = _racEnc.endereco;
                            conversa.etapa = 'pedir_destino_encomenda';
                            resposta = 'Certo! E qual o endereço de entrega?';
                        } else { resposta = 'Não consegui encontrar esse endereço. Pode informar com mais detalhes?'; }
                    } catch(e) { resposta = 'Não consegui encontrar esse endereço. Pode informar com mais detalhes?'; }
                } else { resposta = 'Não consegui encontrar esse endereço. Pode informar com mais detalhes?'; }
            }
        }
        else if (conversa.etapa === 'pedir_destino_encomenda') {
            const validacao = await RebecaService.validarEndereco(msgOriginal);
            if (validacao.valido) {
                conversa.dados.destino = validacao.endereco;
                conversa.etapa = 'pedir_descricao_encomenda';
                resposta = 'Perfeito! O que vai ser transportado?';
            } else {
                if (RaciocinioService.isAtivo()) {
                    try {
                        const _racEncD = await Promise.race([
                            RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                            new Promise(r => setTimeout(() => r(null), 5000))
                        ]);
                        if (_racEncD && _racEncD.resposta) { resposta = _racEncD.resposta; }
                        else if (_racEncD && _racEncD.endereco) {
                            conversa.dados.destino = _racEncD.endereco;
                            conversa.etapa = 'pedir_descricao_encomenda';
                            resposta = 'Perfeito! O que vai ser transportado?';
                        } else { resposta = 'Não consegui encontrar esse endereço. Pode informar com mais detalhes?'; }
                    } catch(e) { resposta = 'Não consegui encontrar esse endereço. Pode informar com mais detalhes?'; }
                } else { resposta = 'Não consegui encontrar esse endereço. Pode informar com mais detalhes?'; }
            }
        }
        else if (conversa.etapa === 'pedir_descricao_encomenda') {
            conversa.dados.descricaoEncomenda = msgOriginal;
            conversa.etapa = 'pedir_nome_coleta';
            resposta = 'Qual o nome de quem vai entregar o pacote na coleta?';
        }
        else if (conversa.etapa === 'pedir_nome_coleta') {
            conversa.dados.nomeColeta = msgOriginal;
            conversa.etapa = 'pedir_nome_entrega';
            resposta = 'E o nome de quem vai receber na entrega?';
        }
        else if (conversa.etapa === 'pedir_nome_entrega') {
            conversa.dados.nomeEntrega = msgOriginal;
            conversa.etapa = 'pedir_fragil_encomenda';
            resposta = 'A encomenda é frágil, perecível ou pesada? (ou digite NAO)';
        }
        else if (conversa.etapa === 'pedir_fragil_encomenda') {
            conversa.dados.fragilPerecivel = msg === 'nao' ? '' : msgOriginal;
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino, conversa.adminId);
            conversa.dados.calculo = calculo;
            conversa.etapa = 'confirmar_encomenda';
            resposta = '*RESUMO DA ENCOMENDA*\n\n' +
                '📦 ' + conversa.dados.descricaoEncomenda + '\n' +
                '📍 Coleta: ' + conversa.dados.origem + '\n' +
                '👤 Entregar: ' + conversa.dados.nomeColeta + '\n\n' +
                '🏁 Entrega: ' + conversa.dados.destino + '\n' +
                '👤 Receber: ' + conversa.dados.nomeEntrega + '\n\n' +
                '💰 Valor: R$ ' + calculo.preco.toFixed(2) + '\n\n' +
                '*1* - Confirmar\n*2* - Cancelar';
        }
        else if (conversa.etapa === 'confirmar_encomenda') {
            if (msg === '1' || msg.includes('confirma') || msg.includes('sim')) {
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                if (corrida.cooldown) return 'Aguarde um momento. Você finalizou uma corrida há pouco.';
                if (corrida.duplicada) return 'Você já tem uma corrida em andamento!';
                conversa.etapa = 'pedir_aparencia';
                conversa.dados.corridaId = corrida.id;
                _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
                conversas.set(telefone, conversa);
                const _precoEnc = conversa.dados?.calculo?.preco || 0;
                return 'Encomenda confirmada!' + (_precoEnc > 0 ? ' 💰 *R$ ' + _precoEnc.toFixed(2) + '*' : '') + ' Qual a cor da sua camisa? 👕';
            } else {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                resposta = 'Encomenda cancelada. Quando precisar é só chamar.';
            }
        }
        // ========== PEDIR BAIRRO ==========
        else if (conversa.etapa === 'confirmar_endereco_suspeito') {
            const confirmou = /^s(im)?$|^ok$|^yes$/i.test(msg.trim());
            if (confirmou) {
                const val = conversa.dados.origemValidadaSuspeita;
                conversa.dados.origem = val.endereco;
                conversa.dados.origemValidada = val;
                conversa.dados.calculo = { origem: { endereco: val.endereco, latitude: val.latitude, longitude: val.longitude }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                if (corrida.cooldown) return `⏳ Aguarde ${Math.ceil(corrida.segundosRestantes / 60)} min para nova corrida.`;
                if (corrida.duplicada) return '⚠️ Você já tem corrida ativa! Digite *CANCELAR* para cancelar.';
                conversa.etapa = 'pedir_aparencia';
                conversa.dados.corridaId = corrida.id;
                _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
                conversas.set(telefone, conversa);
                return 'Confirmado! Já chamei um motorista. Qual a cor da sua camisa? 👕';
            } else {
                conversa.etapa = 'inicio';
                conversa.dados.origemValidadaSuspeita = null;
                conversas.set(telefone, conversa);
                return '📍 Ok! Me manda o endereço correto então:';
            }
        }
        else if (conversa.etapa === 'pedir_numero_origem') {
            // Cliente mandou endereço sem número, pedimos o número
            const numero = msgOriginal.trim();
            if (numero && (numero.match(/\d+/) || numero.toLowerCase() === 'sn' || numero.toLowerCase() === 's/n')) {
                const enderecoCompleto = conversa.dados.origemTexto + ', ' + numero;
                const validacao = await RebecaService.validarEndereco(enderecoCompleto);
                
                if (validacao.valido) {
                    conversa.dados.origem = validacao.endereco;
                    conversa.dados.origemValidada = validacao;
                    conversa.etapa = 'pedir_referencia';
                    resposta = '📍 ' + validacao.endereco + '\n\nReferência? (ou *0* se não tiver)';
                } else {
                    // Nao achou mesmo com numero - criar corrida com texto livre
                    conversa.dados.origem = enderecoCompleto;
                    conversa.dados.origemValidada = { valido: true, precisao: 'texto_livre', endereco: enderecoCompleto };
                    conversa.dados.calculo = { origem: { endereco: enderecoCompleto }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                    const corridaNum = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                    if (corridaNum.cooldown) return '⏳ Aguarde ' + Math.ceil(corridaNum.segundosRestantes / 60) + ' min para nova corrida.';
                    if (corridaNum.duplicada) return '⚠️ Você já tem corrida ativa! Digite *CANCELAR* para cancelar.';
                    conversa.etapa = 'pedir_aparencia';
                    conversa.dados.corridaId = corridaNum.id;
                    _agendarTimeoutAparencia(telefone, conversa.instanciaId, corridaNum.id, conversas);
                    conversas.set(telefone, conversa);
                    return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                }
            } else {
                resposta = '🔢 Por favor, informe o *número* da casa/prédio (ou *SN* se não tiver):';
            }
        }
        else if (conversa.etapa === 'pedir_bairro_origem') {
            // VALIDAR: ignorar expressões de confirmação/comandos
            const expressoesIgnorar = ['maravilha','beleza','show','legal','perfeito','otimo','ótimo','certo','entendi','isso','ok','sim','blz','vlw','valeu','brigado','brigada','obrigado','obrigada','ta','tá','vamos','bora','pode ser','isso mesmo','a maravilha','top','dahora','massa','nice','maneiro'];
            if (expressoesIgnorar.includes(msg) || msg.length < 3) {
                if (RaciocinioService.isAtivo()) {
                    try {
                        const _racBairro = await Promise.race([
                            RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                            new Promise(r => setTimeout(() => r(null), 4000))
                        ]);
                        if (_racBairro && _racBairro.resposta) {
                            conversas.set(telefone, conversa);
                            return _racBairro.resposta;
                        }
                    } catch(e) {}
                }
                conversas.set(telefone, conversa);
                return '📍 Por favor, informe o *bairro* para completar o endereço:';
            }
            
            const enderecoCompleto = conversa.dados.origemTexto + ', ' + msgOriginal;
            conversa.dados.origem = enderecoCompleto;
            conversa.dados.origemValidada = { valido: true, precisao: 'texto_livre', endereco: enderecoCompleto };
            conversa.dados.calculo = {
                origem: { endereco: enderecoCompleto },
                destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                faixa: { nome: 'padrao', multiplicador: 1 }
            };
            // CRIAR CORRIDA DIRETO - sem pedir referência
            const corridaBairro = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
            
            if (corridaBairro.cooldown) {
                return '⏳ Aguarde um momento...\n\nVocê finalizou uma corrida há pouco.\nPode pedir nova corrida em ' + Math.ceil(corridaBairro.segundosRestantes / 60) + ' minuto(s).';
            }
            if (corridaBairro.duplicada) {
                return '⚠️ Você já tem uma corrida em andamento!\n\nDigite *CANCELAR* para cancelar ou aguarde o motorista.';
            }
            
            conversa.etapa = 'pedir_aparencia';
            conversa.dados.corridaId = corridaBairro.id;
            _agendarTimeoutAparencia(telefone, conversa.instanciaId, corridaBairro.id, conversas);
            conversas.set(telefone, conversa);
            return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
        }
        // ========== REFERÊNCIA (NOVO FLUXO DIRETO) ==========
        // ========== BUSCAR TERCEIRO — NOME ==========
        else if (conversa.etapa === 'pedir_nome_buscado') {
            conversa.dados.nomeBuscado = msgOriginal;
            conversa.etapa = 'pedir_aparencia_buscado';
            conversas.set(telefone, conversa);
            return `Qual a cor da camisa de *${conversa.dados.nomeBuscado}*? 👕\n\n_(ou mande *0* para pular)_`;
        }

        // ========== BUSCAR TERCEIRO — APARÊNCIA ==========
        else if (conversa.etapa === 'pedir_aparencia_buscado') {
            if (msg !== '0' && msg !== 'nao' && msg !== 'não') {
                conversa.dados.aparenciaBuscado = msgOriginal;
            }
            conversa.etapa = 'pedir_origem';
            conversas.set(telefone, conversa);
            const nomeB = conversa.dados.nomeBuscado || 'a pessoa';
            let resp = `Anotado! 📝`;
            if (conversa.dados.aparenciaBuscado) resp += ` *${conversa.dados.aparenciaBuscado}*`;
            resp += `\n\nAgora me diz: *onde ${nomeB} está?* Manda o endereço ou ponto de referência 📍`;
            return resp;
        }

        // ========== APARÊNCIA DO CLIENTE (ponto de referência) ==========
        else if (conversa.etapa === 'pedir_aparencia') {
            // Salvar aparência (ou pular com 0)
            if (msg !== '0' && msg !== 'nao' && msg !== 'não' && msg !== 'n') {
                conversa.dados.aparenciaCliente = msgOriginal;
            }

            // Verificar motoristas disponíveis
            const motoristasAp = await MotoristaService.listarDisponiveis(adminId);
            if (motoristasAp.length === 0) {
                conversa.etapa = 'oferecer_fila_espera';
                conversas.set(telefone, conversa);
                const estimativaAp = await RebecaService.estimarTempoEspera(conversa.adminId);
                return 'Poxa, no momento todos os motoristas estão em corrida! ' +
                    'A previsão é de ' + estimativaAp.texto + ' para um ficar disponível.\n\n' +
                    'Posso te avisar assim que um motorista desocupar? Responde *SIM*!';
            }

            // Usar corridaId existente — corrida já foi criada antes de pedir_aparencia
            const _corridaIdAp = conversa.dados.corridaId;
            if (!_corridaIdAp) {
                // Fallback: criar se por algum motivo não existe
                const corridaApFb = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                if (corridaApFb.cooldown) return '⏳ Aguarde ' + Math.ceil(corridaApFb.segundosRestantes / 60) + ' min.';
                if (corridaApFb.duplicada) return '⚠️ Você já tem corrida ativa! Digite *CANCELAR* para cancelar.';
                conversa.dados.corridaId = corridaApFb.id;
            }

            // Salvar aparência na corrida no banco
            if (conversa.dados.aparenciaCliente && conversa.dados.corridaId) {
                try {
                    await require('../models').Corrida.findByIdAndUpdate(conversa.dados.corridaId, { aparenciaCliente: conversa.dados.aparenciaCliente });
                } catch(e) { console.log('[REBECA] Erro salvar aparencia:', e.message); }
            }

            // Repassar cor da camisa ao motorista via WhatsApp
            if (conversa.dados.aparenciaCliente && conversa.dados.corridaId) {
                try {
                    const { Corrida: _CA, InstanciaWhatsapp: _IWA } = require('../models');
                    const _corrAp = await _CA.findById(conversa.dados.corridaId).lean();
                    if (_corrAp && _corrAp.motoristaId) {
                        const _motAp = await MotoristaService.buscarPorId(_corrAp.motoristaId);
                        if (_motAp && _motAp.whatsapp) {
                            const _instAp = conversa.instanciaId
                                ? await _IWA.findById(conversa.instanciaId).catch(() => null)
                                : await _IWA.findOne({ adminId: conversa.adminId, status: { $in: ['conectado','open','connected'] } });
                            if (_instAp) {
                                await EvolutionMultiService.enviarMensagem(
                                    _instAp._id,
                                    _motAp.whatsapp,
                                    '👕 *Aparência do cliente:* ' + conversa.dados.aparenciaCliente
                                );
                                console.log('[APARENCIA] Cor enviada ao motorista:', conversa.dados.aparenciaCliente);
                            }
                        }
                    }
                } catch(eAp) { console.log('[APARENCIA] Erro enviar ao motorista:', eAp.message); }
            }

            conversa.etapa = 'aguardando_motorista';
            conversas.set(telefone, conversa);

            let msgAp = `📍 *${conversa.dados.origem}*`;
            if (conversa.dados.aparenciaCliente) msgAp += `\n👕 *${conversa.dados.aparenciaCliente}*`;
            msgAp += `\n\n⏳ Buscando motorista...\n_CANCELAR se precisar_`;
            return msgAp;
        }

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
                // Oferecer fila de espera
                const estimativa3 = await RebecaService.estimarTempoEspera(conversa.adminId);
                conversa.etapa = 'oferecer_fila_espera';
                conversas.set(telefone, conversa);
                return 'Poxa, no momento todos os nossos motoristas estão em corrida! ' +
                    'A previsão é de ' + estimativa3.texto + ' para um ficar disponível.\n\n' +
                    'Posso te avisar assim que um motorista desocupar? Responde *SIM* que eu te coloco na fila!';
            }
            
            // Criar corrida e despachar DIRETO
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
            
            // Se cooldown ativo
            if (corrida.cooldown) {
                return '⏳ Aguarde um momento...\n\nVocê finalizou uma corrida há pouco.\nPode pedir nova corrida em ' + Math.ceil(corrida.segundosRestantes / 60) + ' minuto(s).';
            }
            
            // Se duplicada, avisar cliente
            if (corrida.duplicada) {
                return '⚠️ Você já tem uma corrida em andamento!\n\nDigite *CANCELAR* para cancelar ou aguarde o motorista.';
            }
            
            conversa.etapa = 'pedir_aparencia';
            conversa.dados.corridaId = corrida.id;
            _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
            conversas.set(telefone, conversa);
            return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
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
                conversa.etapa = 'confirmar_corrida';
                resposta = `✅ *Origem confirmada!*\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar`;
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
            // Destino é informado ao motorista — aceitar qualquer texto sem validar
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
                    if (_cfg.usarIA && IAService.isAtivo()) {
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
                        // Raciocínio amplificado — tentar entender o que o cliente quis dizer
                        if (RaciocinioService.isAtivo()) {
                            const rac = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000)) // 5s timeout
                    ]);
                            if (rac) {
                                if (rac.acao === 'avancar' && rac.valor) {
                                    const val3 = await RebecaService.validarEndereco(rac.valor);
                                    if (val3.valido) {
                                        conversa.dados.destino = val3.endereco;
                                        conversa.dados.destinoValidado = val3;
                                        destinoFinal = val3;
                                    }
                                } else if (rac.acao === 'cancelar' || rac.acao === 'negar') {
                                    conversa.etapa = 'inicio';
                                    conversa.dados = {};
                                    conversas.set(telefone, conversa);
                                    return 'Ok! Corrida cancelada. Quando precisar é só chamar! 😊';
                                } else if (rac.acao === 'voltar') {
                                    conversa.etapa = 'pedir_origem';
                                    conversas.set(telefone, conversa);
                                    return rac.resposta || '📍 Tudo bem! Me passa o endereço de origem novamente.';
                                } else {
                                    // repetir — reformular sem perder etapa
                                    conversas.set(telefone, conversa);
                                    return rac.resposta || RaciocinioService.reformularPergunta(conversa.etapa, conversa.dados);
                                }
                            }
                        }
                        if (!destinoFinal) {
                            // Criar corrida mesmo assim com texto livre — motorista entra em contato
                            conversa.dados.destino = msgOriginal;
                            conversa.dados.destinoTextoLivre = true;
                        }
                    }
                } else {
                    conversa.dados.destino = validacao.endereco;
                    conversa.dados.destinoValidado = validacao;
                    
                    if (validacao.precisaObservacao && _cfg.pedirObservacaoEnderecoImpreciso) {
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
            if (corrida.cooldown) { conversas.set(telefone, conversa); return '⏳ Aguarde ' + Math.ceil(corrida.segundosRestantes / 60) + ' min para nova corrida.'; }
            if (corrida.duplicada) { conversas.set(telefone, conversa); return '⚠️ Você já tem corrida ativa! Digite *CANCELAR* para cancelar.'; }
            conversa.etapa = 'pedir_aparencia';
            conversa.dados.corridaId = corrida.id;
            _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
            conversas.set(telefone, conversa);
            const _precoRapido = calculo?.preco || corrida?.preco || 0;
            resposta = 'Certo!' + (_precoRapido > 0 ? ' 💰 *R$ ' + _precoRapido.toFixed(2) + '*' : '') + ' Já chamei um motorista! Qual a cor da sua camisa? 👕';
        }
        // ========== OBSERVAÇÃO DESTINO ==========
        else if (conversa.etapa === 'pedir_observacao_destino') {
            if (msg !== '0') conversa.dados.observacaoDestino = msgOriginal;
            
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            
            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
            conversa.etapa = 'pedir_aparencia';
            conversa.dados.corridaId = corrida.id;
            _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
            conversas.set(telefone, conversa);
            const _precoObsDest = calculo?.preco || corrida?.preco || 0;
            resposta = 'Certo!' + (_precoObsDest > 0 ? ' 💰 *R$ ' + _precoObsDest.toFixed(2) + '*' : '') + ' Já chamei um motorista! Qual a cor da sua camisa? 👕';
        }
        // ========== PEDIR ORIGEM NORMAL ==========
        else if (conversa.etapa === 'pedir_origem') {
            if (msg === 'casa' && favoritos.casa) {
                conversa.dados.origem = favoritos.casa.endereco;
                conversa.dados.origemValidada = { valido: true, precisao: 'favorito', ...favoritos.casa };
                conversa.etapa = 'confirmar_corrida';
                resposta = `📍 *Origem:* ${favoritos.casa.endereco}\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar`;
            } else if (msg === 'trabalho' && favoritos.trabalho) {
                conversa.dados.origem = favoritos.trabalho.endereco;
                conversa.dados.origemValidada = { valido: true, precisao: 'favorito', ...favoritos.trabalho };
                conversa.etapa = 'confirmar_corrida';
                resposta = `📍 *Origem:* ${favoritos.trabalho.endereco}\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar`;
            } else {
                const validacao = await RebecaService.validarEndereco(msgOriginal);
                if (!validacao.valido) {
                    // Raciocínio amplificado antes de pedir bairro
                    if (RaciocinioService.isAtivo()) {
                        const rac = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000)) // 5s timeout
                    ]);
                        if (rac && rac.acao === 'avancar' && rac.valor) {
                            const valOrig = await RebecaService.validarEndereco(rac.valor);
                            if (valOrig.valido) {
                                conversa.dados.origem = valOrig.endereco;
                                conversa.dados.origemValidada = valOrig;
                                conversa.dados.calculo = { origem: { endereco: valOrig.endereco, latitude: valOrig.latitude, longitude: valOrig.longitude }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                                conversa.etapa = 'confirmar_corrida';
                                resposta = `📍 *Origem:* ${valOrig.endereco}\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar`;
                                conversas.set(telefone, conversa);
                                return resposta;
                            }
                        } else if (rac && (rac.acao === 'cancelar' || rac.acao === 'negar')) {
                            conversa.etapa = 'inicio'; conversa.dados = {};
                            conversas.set(telefone, conversa);
                            return 'Ok! Quando precisar é só chamar 😊';
                        }
                    }
                    // Aceitar como referencia/ponto de local — nao exigir endereco formal
                    // Ex: "jb7", "perto do mercado", "aqui no shopping", "me busca no centro"
                    conversa.dados.origem = msgOriginal;
                    conversa.dados.origemValidada = { valido: false, precisao: 'referencia', endereco: msgOriginal };
                    conversa.dados.calculo = { origem: { endereco: msgOriginal, latitude: null, longitude: null }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
                    conversa.etapa = 'confirmar_corrida';
                    conversas.set(telefone, conversa);
                    resposta = `📍 *${msgOriginal}*\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar`;
                } else {
                    conversa.dados.origem = validacao.endereco;
                    conversa.dados.origemValidada = validacao;
                    conversa.dados.calculo = {
                        origem: { endereco: validacao.endereco, latitude: validacao.latitude, longitude: validacao.longitude },
                        destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                        faixa: { nome: 'padrao', multiplicador: 1 }
                    };
                    conversa.etapa = 'confirmar_corrida';
                    resposta = `📍 *Origem:* ${validacao.endereco}\n\nConfirma a corrida?\n\n*1* - Sim\n*CANCELAR* - Cancelar`;
                }
            }
        }
        else if (conversa.etapa === 'pedir_destino') {
            if (msg === 'casa' && favoritos.casa) {
                conversa.dados.destino = favoritos.casa.endereco;
            } else if (msg === 'trabalho' && favoritos.trabalho) {
                conversa.dados.destino = favoritos.trabalho.endereco;
            } else {
                let validacao = await RebecaService.validarEndereco(msgOriginal);
                if (!validacao.valido) {
                    // Aceitar como referência de destino — não travar
                    conversa.dados.destino = msgOriginal;
                    validacao = { valido: true, endereco: msgOriginal, latitude: null, longitude: null };
                    if (RaciocinioService.isAtivo()) {
                        const rac = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000)) // 5s timeout
                    ]);
                        if (rac) {
                            if (rac.acao === 'avancar' && rac.valor) {
                                const valRac = await RebecaService.validarEndereco(rac.valor);
                                if (valRac.valido) {
                                    conversa.dados.destino = valRac.endereco;
                                    validacao = valRac;
                                    const calculoRac = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
                                    conversa.dados.calculo = calculoRac;
                                    // Despacha direto
                                    const _corrRac = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                                    conversa.etapa = 'pedir_aparencia';
                                    conversa.dados.corridaId = _corrRac.id;
                                    _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corrRac.id, conversas);
                                    conversas.set(telefone, conversa);
                                    return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                                }
                            } else if (rac.acao === 'cancelar' || rac.acao === 'negar') {
                                conversa.etapa = 'inicio'; conversa.dados = {};
                                conversas.set(telefone, conversa);
                                return 'Ok! Cancelado. Quando precisar é só chamar! 😊';
                            } else {
                                conversas.set(telefone, conversa);
                                return rac.resposta || RaciocinioService.reformularPergunta('pedir_destino', conversa.dados);
                            }
                        }
                    }
                    // Criar corrida mesmo assim com texto livre
                    conversa.dados.destino = msgOriginal;
                    conversa.dados.destinoTextoLivre = true;
                    const calculoTL = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
                    conversa.dados.calculo = calculoTL;
                    // Despacha direto
                    const _corrTL = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                    conversa.etapa = 'pedir_aparencia';
                    conversa.dados.corridaId = _corrTL.id;
                    _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corrTL.id, conversas);
                    conversas.set(telefone, conversa);
                    return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                }
                conversa.dados.destino = validacao.endereco;
            }
            
            // Despacha direto
            const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
            conversa.dados.calculo = calculo;
            const _corr2141 = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
            conversa.etapa = 'pedir_aparencia';
            conversa.dados.corridaId = _corr2141.id;
            _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corr2141.id, conversas);
            conversas.set(telefone, conversa);
            resposta = 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
        }
        else if (conversa.etapa === 'confirmar_corrida') {
            if (msg === '1' || NLPService.eSim(msg)) {
                const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                conversa.etapa = 'pedir_aparencia';
                conversa.dados.corridaId = corrida.id;
                _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
                resposta = 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
            } else if (msg === '2' || NLPService.eNao(msg)) {
                conversa.etapa = 'inicio';
                conversa.dados = {};
                resposta = `Tudo bem! Corrida cancelada. Quando precisar é só chamar 😊`;
            } else {
                // Raciocínio amplificado — cliente pode ter confirmado de forma diferente
                if (RaciocinioService.isAtivo()) {
                    const rac = await Promise.race([
                        RaciocinioService.raciocinar(telefone, msgOriginal, conversa, { nome }),
                        new Promise(r => setTimeout(() => r(null), 5000)) // 5s timeout
                    ]);
                    if (rac) {
                        if (rac.acao === 'confirmar' || rac.acao === 'avancar') {
                            const corrida = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                            conversa.etapa = 'pedir_aparencia';
                            conversa.dados.corridaId = corrida.id;
                            _agendarTimeoutAparencia(telefone, conversa.instanciaId, corrida.id, conversas);
                            resposta = 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                        } else if (rac.acao === 'negar' || rac.acao === 'cancelar') {
                            conversa.etapa = 'inicio'; conversa.dados = {};
                            resposta = `Tudo bem! Corrida cancelada. Quando precisar é só chamar 😊`;
                        } else if (rac.acao === 'voltar') {
                            conversa.etapa = 'pedir_destino';
                            resposta = rac.resposta || `🏁 Qual o endereço de destino?`;
                        } else {
                            resposta = rac.resposta || `👆 Confirma a corrida? Responde *1* - ✅ SIM ou *2* - ❌ Cancelar`;
                        }
                        conversas.set(telefone, conversa);
                        return resposta;
                    }
                }
                resposta = `👆 Confirma? Responde *1* - ✅ SIM ou *2* - ❌ Cancelar`;
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
        else if (_cfg.usarIA && IAService.isAtivo()) {
            // Buscar dados empresa para IA
            let infoEmpresa = {};
            try {
                if (conversa.adminId) {
                    const { Admin } = require('../models');
                    const adm = await Admin.findById(conversa.adminId);
                    if (adm) infoEmpresa = { nomeEmpresa: adm.empresa || adm.nome || '', telefoneEmpresa: adm.telefone || '' };
                }
            } catch(e) { console.log('[CATCH]', e.message); }
            const respostaIA = await IAService.responderPergunta(msgOriginal, { ...PrecoDinamicoService.getConfig(), ...infoEmpresa });
            if (respostaIA) {
                resposta = respostaIA + `\n\n`;
            } else {
                // Encaminhar dúvida ao admin
                if (conversa.adminId && conversa.instanciaId) {
                    const duvida = await RebecaService.encaminharDuvidaAoAdmin(
                        telefone, nome, msgOriginal, conversa.adminId, conversa.instanciaId
                    );
                    if (duvida) {
                        conversa.dados.duvidaId = duvida._id;
                        // Verificar se pergunta sobre disponibilidade
                        const perguntaDisponibilidade = msgOriginal.toLowerCase().match(/(tem carro|tem motorista|tem veiculo|tem veículo|disponivel|disponível|funcionando|aberto|atende)/);
                        if (perguntaDisponibilidade) {
                            try {
                                const motoristasOnline = await MotoristaService.listarDisponiveis(conversa.adminId);
                                if (motoristasOnline.length > 0) {
                                    resposta = 'Sim! Temos ' + motoristasOnline.length + ' motorista(s) disponível(is) agora! 🚗\n\nMe manda sua localização 📍 que já chamo um pra você!';
                                } else {
                                    resposta = 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível? Responde *SIM* 😊';
                                    conversa.etapa = 'oferecer_fila_espera';
                                }
                            } catch(e) {
                                resposta = 'Sim, estamos funcionando! Me manda sua localização 📍';
                            }
                        } else {
                            // Nao setar aguardando_admin para perguntas gerais — responder e liberar
                            conversa.etapa = 'inicio';
                            resposta = 'Posso te ajudar a pedir um carro! Me manda o endereço de onde você está 📍';
                        }
                    } else {
                        conversa.etapa = 'inicio';
                        resposta = 'Oi! 😊 Me manda o endereço de onde você está que chamo um carro pra você 📍';
                    }
                } else {
                    conversa.etapa = 'inicio';
                    resposta = 'Oi! 😊 Me manda o endereço de onde você está que chamo um carro pra você 📍';
                }
            }
        }
        else {
            // Encaminhar dúvida ao admin
                if (conversa.adminId && conversa.instanciaId) {
                    const duvida = await RebecaService.encaminharDuvidaAoAdmin(
                        telefone, nome, msgOriginal, conversa.adminId, conversa.instanciaId
                    );
                    if (duvida) {
                        // Nao setar aguardando_admin — cliente fica preso. Apenas informar e liberar
                        conversa.dados.duvidaId = duvida._id;
                        // Verificar se pergunta sobre disponibilidade
                        const perguntaDisponibilidade = msgOriginal.toLowerCase().match(/(tem carro|tem motorista|tem veiculo|tem veículo|disponivel|disponível|funcionando|aberto|atende)/);
                        if (perguntaDisponibilidade) {
                            try {
                                const motoristasOnline = await MotoristaService.listarDisponiveis(conversa.adminId);
                                if (motoristasOnline.length > 0) {
                                    resposta = 'Sim! Temos ' + motoristasOnline.length + ' motorista(s) disponível(is) agora! 🚗\n\nMe manda sua localização 📍 que já chamo um pra você!';
                                } else {
                                    resposta = 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível? Responde *SIM* 😊';
                                    conversa.etapa = 'oferecer_fila_espera';
                                }
                            } catch(e) {
                                resposta = 'Sim, estamos funcionando! Me manda sua localização 📍';
                            }
                        } else {
                            conversa.etapa = 'inicio';
                            resposta = 'Oi! 😊 Pra pedir um carro é só me mandar de onde você está 📍';
                        }
                    } else {
                        conversa.etapa = 'inicio';
                        resposta = 'Oi! 😊 Me manda o endereço de onde você está que chamo um carro pra você 📍';
                    }
                } else {
                    conversa.etapa = 'inicio';
                    resposta = 'Oi! 😊 Me manda o endereço de onde você está que chamo um carro pra você 📍';
                }
        }

        conversas.set(telefone, conversa);
        
        // ===== FALLBACK UNIVERSAL — nenhuma etapa pode travar =====
        if (!resposta) {
            const etapaAtual = conversa.etapa;
            console.log('[REBECA] ⚠️ Sem resposta na etapa:', etapaAtual, '— aplicando fallback');
            
            // Etapas que devem pedir destino
            if (['pedir_destino'].includes(etapaAtual)) {
                resposta = '🏁 Qual o destino?';
            }
            // Etapas que devem pedir origem
            else if (['pedir_origem', 'pedir_origem_encomenda'].includes(etapaAtual)) {
                resposta = '📍 De onde você sai?';
            }
            // Etapas de espera de motorista
            else if (etapaAtual === 'aguardando_motorista') {
                resposta = '⏳ Ainda buscando motorista... aguarde!';
            }
            // Fila de espera
            else if (etapaAtual === 'oferecer_fila_espera') {
                resposta = 'Posso te avisar quando um motorista desocupar. Responde *SIM*!';
            }
            // Qualquer outra etapa desconhecida — resetar
            else {
                console.log('[REBECA] Etapa sem handler:', etapaAtual, '— resetando');
                conversa.etapa = 'inicio';
                conversa.dados = {};
                conversas.set(telefone, conversa);
                resposta = 'Oi! Precisa de um carro? 🚗';
            }
        }

        // Timeout de segurança: se conversa está travada há mais de 10min sem resposta, resetar
        if (!conversa._ultimaAtividade) conversa._ultimaAtividade = Date.now();
        const minutosSemAtividade = (Date.now() - conversa._ultimaAtividade) / 60000;
        if (minutosSemAtividade > 10 && !['aguardando_motorista', 'em_corrida'].includes(conversa.etapa)) {
            console.log('[REBECA] Conversa travada há', Math.round(minutosSemAtividade), 'min — resetando');
            conversa.etapa = 'inicio';
            conversa.dados = {};
        }
        conversa._ultimaAtividade = Date.now();
        conversas.set(telefone, conversa);

        // Anti-repeticao: nunca mandar mesma msg 2x seguidas (exceto tabela de preços)
        const ultimaResp = ultimasRespostas.get(telefone);
        const ehTabelaPrecos = resposta && resposta.includes('PREÇOS');
        // So bloquear repeticao se resposta tem conteudo real (nao vazio/null)
        if (resposta && ultimaResp && ultimaResp === resposta && !ehTabelaPrecos) {
            console.log('[REBECA] Resposta repetida bloqueada para', telefone);
            return null;
        }
        if (resposta) ultimasRespostas.set(telefone, resposta);
        
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
                        
                        // Despacha direto
                        const _corr2329 = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                        conversa.etapa = 'pedir_aparencia';
                        conversa.dados.corridaId = _corr2329.id;
                        _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corr2329.id, conversas);
                        conversas.set(telefone, conversa);
                        return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                    }
                }
                
                conversa.etapa = 'confirmar_corrida';
                conversas.set(telefone, conversa);
                return `📍 *Origem:* ${conversa.dados.origem}\n\n🏁 Pra onde você quer ir?`;
            }
            
            // Endereço livre detectado (sem favorito, sem origem separada)
            // Ex: "Mercado São João, bairro Centro" ou "Rua X, 100"
            if (analise.endereco && !analise.origem && !analise.usarFavorito) {
                // Se fluxo já tem origem, tratar como destino
                if (conversa.dados.origem && conversa.dados.origemValidada?.valido) {
                    const valDest = await RebecaService.validarEndereco(analise.endereco);
                    if (valDest.valido) {
                        conversa.dados.destino = valDest.endereco;
                        const calculo = await RebecaService.calcularCorrida(conversa.dados.origem, conversa.dados.destino);
                        conversa.dados.calculo = calculo;
                        conversa.etapa = 'confirmar_corrida';
                        conversas.set(telefone, conversa);
                        return `✅ *Confirmar corrida?*

📍 *De:* ${conversa.dados.origem}
🏁 *Para:* ${conversa.dados.destino}

📏 ${calculo.distancia} | ⏱️ ${calculo.tempo}
💰 *R$ ${calculo.preco.toFixed(2)}*

Responda *1* para confirmar ou *CANCELAR`;
                    } else {
                        conversa.etapa = 'pedir_destino';
                        conversas.set(telefone, conversa);
                        return `Não achei esse endereço 😕

Pode me passar o destino de outro jeito? Ex: Rua X, número, bairro`;
                    }
                }
                // Sem origem ainda — validar como origem
                const valOrig = await RebecaService.validarEndereco(analise.endereco);
                if (valOrig.valido) {
                    conversa.dados.origem = valOrig.endereco;
                    conversa.dados.origemValidada = valOrig;
                    conversa.etapa = 'pedir_destino';
                    conversas.set(telefone, conversa);
                    return `📍 *Origem:* ${valOrig.endereco}

🏁 Ótimo! Agora me passa o *destino*:`;
                } else {
                    // Tentar com cidade do admin como contexto
                    try {
                        const { Admin } = require('../models');
                        const adminDoc = conversa.adminId ? await Admin.findById(conversa.adminId).lean() : null;
                        const cidade = adminDoc?.cidadeAtuacao || adminDoc?.cidade || '';
                        if (cidade) {
                            const val2 = await RebecaService.validarEndereco(analise.endereco + ', ' + cidade);
                            if (val2.valido) {
                                conversa.dados.origem = val2.endereco;
                                conversa.dados.origemValidada = val2;
                                conversa.etapa = 'pedir_destino';
                                conversas.set(telefone, conversa);
                                return `📍 *Origem:* ${val2.endereco}

🏁 Ótimo! Agora me passa o *destino*:`;
                            }
                        }
                    } catch(e) {}
                    conversa.etapa = 'pedir_origem';
                    conversas.set(telefone, conversa);
                    return `Não encontrei esse local 😕

Pode me passar o endereço completo? Ex: Rua X, número, bairro`;
                }
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
                            
                            // Despacha direto
                            const _corr2359 = await RebecaService.criarCorrida(telefone, nome, conversa.dados, conversa.adminId, conversa.instanciaId);
                            conversa.etapa = 'pedir_aparencia';
                            conversa.dados.corridaId = _corr2359.id;
                            _agendarTimeoutAparencia(telefone, conversa.instanciaId, _corr2359.id, conversas);
                            conversas.set(telefone, conversa);
                            return 'Certo! Já chamei um motorista. Qual a cor da sua camisa? 👕';
                        }
                    }
                    
                    // Pedir referencia antes de despachar
                    conversa.dados.calculo = {
                        origem: { endereco: validacao.endereco, latitude: validacao.latitude, longitude: validacao.longitude },
                        destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15,
                        faixa: { nome: 'padrao', multiplicador: 1 }
                    };
                    // Se veio de frase de pedido (me busca na X), pedir aparência
                    const _eraPedidoLocal = /(me busca|me pega|busca aqui|aqui na|aqui no|estou na|estou no|tô na|tô no)/i.test(msgOriginal);
                    if (_eraPedidoLocal || conversa.dados.origemPontoRef) {
                        conversa.dados.origemPontoRef = true;
                        conversa.etapa = 'pedir_aparencia';
                        conversas.set(telefone, conversa);
                        return `📍 *${conversa.dados.origem}*

Qual a cor da sua camisa? 👕

_(ou mande *0* para pular)_`;
                    }
                    conversa.etapa = 'pedir_referencia';
                    conversas.set(telefone, conversa);
                    return `📍 ${conversa.dados.origem}\n\nReferência? (ou 0)`;
                } else {
                    // Maps nao achou - perguntar bairro
                    conversa.dados.origemTexto = analise.origem;
                    conversa.etapa = 'pedir_numero_origem';
                    conversas.set(telefone, conversa);
                    return `📍 ${analise.origem}\n\nQual bairro?`;
                }
            }
            
            // IA detectou intencao de corrida mas sem endereco
            conversa.etapa = 'pedir_origem';
            conversas.set(telefone, conversa);
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
        
        // Respostas com respostaCurta (novo formato IA)
        if (analise.respostaCurta) {
            return analise.respostaCurta;
        }
        
        // Pergunta - IA responde direto (formato antigo)
        if (analise.intencao === 'pergunta' && analise.respostaPergunta) {
            return analise.respostaPergunta;
        }
        
        // Saudacao - responder de forma humana e variada
        if (analise.intencao === 'saudacao') {
            const hora = new Date().getHours();
            const saudTemporal = hora >= 5 && hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
            const opcoes = [
                `${saudTemporal}! 😊 Pra onde você vai hoje?`,
                `${saudTemporal}! Tô aqui prontinha. Me manda o endereço! 📍`,
                `${saudTemporal}! 😊 Me diz de onde você está que chamo um motorista!`,
                `Olá! ${saudTemporal}! Pode falar, pra onde vamos? 🚗`
            ];
            return opcoes[Math.floor(Math.random() * opcoes.length)];
        }
        
        // Confirmacao
        if (analise.intencao === 'confirmacao') {
            return 'Entendi! Me manda o endereço de onde você está.';
        }
        
        // Agradecimento
        if (analise.intencao === 'agradecimento') {
            const opcoes = [
                'Por nada! Foi um prazer te atender 😊 Qualquer hora é só chamar!',
                'Imagina! Fico feliz em ajudar 😊 Até a próxima!',
                'Disponha! 😊 Estarei aqui sempre que precisar.',
                'De nada! Foi ótimo te atender 🚗 Até logo!'
            ];
            return opcoes[Math.floor(Math.random() * opcoes.length)];
        }

        // Qualquer outra intencao nao mapeada — nao retornar null, responder algo util
        console.log('[processarComIA] Intencao nao mapeada:', analise.intencao, '— usando fallback');
        return 'Oi! Precisa de um carro? Me manda o endereço de onde você está. 🚗';
    },

    // ==================== FUNÇÕES AUXILIARES ====================
    menuPrincipal: (nome, telefone) => {
        const hora = new Date().getHours();
        let saudacao = 'Oi';
        if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
        else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
        else saudacao = 'Boa noite';
        
        // Verificar se cliente ja usou antes
        let jaUsou = false;
        try {
            const cl = ClienteService.buscarPorTelefone(telefone);
            if (cl) jaUsou = true;
        } catch(e) { console.log('[CATCH]', e.message); }
        
        // Resposta simples e direta
        if (jaUsou) {
            return `${saudacao}${nome ? ', ' + nome : ''}! Onde te busco?`;
        } else {
            return `${saudacao}! Sou a Rebeca, é um prazer te atender. Onde te busco?`;
        }
    },
    gerarLinkRastreamento: (corridaId, token = null) => {
        const base = process.env.BASE_URL || 'https://rebeca-sistema-br.onrender.com';
        // Sempre usa os últimos 8 chars do corridaId — a rota /rastrear/:codigo busca por endsWith
        const codigo = corridaId ? corridaId.toString().slice(-8) : 'xxx';
        return `${base}/rastrear/${codigo}`;
    },

    gerarTokenRastreamento: () => {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let token = '';
        for (let i = 0; i < 12; i++) token += chars[Math.floor(Math.random() * chars.length)];
        return token;
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

    async enviarTabelaPrecos(adminId = null) {
        try {
            if (adminId) {
                const faixa = await PrecoAdminService.getFaixaAtual(adminId);
                const exemplos = [];
                for (const km of [3, 5, 10]) {
                    const calc = await PrecoAdminService.calcularPreco(adminId, km);
                    if (calc?.precoFinal) exemplos.push(`${km}km → R$ ${calc.precoFinal.toFixed(2)}`);
                }
                let t = `💰 *TABELA DE PREÇOS*\n\n🕐 Agora: *${faixa.nome}*`;
                if (faixa.multiplicador > 1) t += ` (${faixa.multiplicador}x)`;
                if (exemplos.length) t += `\n\n${exemplos.join('\n')}`;
                return t + `\n\n_Me manda o endereço para calcular o valor exato!_`;
            }
        } catch(e) { console.log('[CATCH]', e.message); }
        const config = PrecoDinamicoService.getConfig();
        const faixa = PrecoDinamicoService.obterFaixaAtual();
        let t = `💰 *TABELA DE PREÇOS*\n\n• Taxa: R$ ${config.taxaBase.toFixed(2)}\n• Km: R$ ${config.precoKm.toFixed(2)}\n\n🕐 *Agora:* ${faixa.nome}`;
        if (faixa.multiplicador > 1) t += ` (${faixa.multiplicador}x)`;
        return t + `\n\n_Me manda o endereço para calcular o valor exato!_`;
    },

    async enviarExemplosPreco(adminId = null) {
        try {
            const faixa = await PrecoAdminService.getFaixaAtual(adminId);
            let m = `📊 *EXEMPLOS* _(${faixa.nome})_\n\n`;
            for (const km of [3, 5, 10, 15, 20]) {
                const calc = await PrecoAdminService.calcularPreco(adminId, km);
                if (calc?.precoFinal) m += `${km}km → R$ ${calc.precoFinal.toFixed(2)}\n`;
            }
            return m;
        } catch(e) { return null; }
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
        
        // Verificar zona de preço por localização da origem
        const origemLat = rota.sucesso ? rota.origem?.latitude : null;
        const origemLng = rota.sucesso ? rota.origem?.longitude : null;
        let precoZona = null;
        if (origemLat && origemLng) {
            try {
                const PrecoSimplesService = require('./preco-simples.service');
                const zonaRes = await PrecoSimplesService.calcularPreco(adminId, origemLat, origemLng);
                if (zonaRes && zonaRes.periodo === 'zona') precoZona = zonaRes;
            } catch(e) { console.log('[REBECA] Erro catch silencioso:', e.message); }
        }
        const calc = precoZona || await PrecoAdminService.calcularPreco(adminId, km);
        return {
            distancia: rota.sucesso ? rota.distancia.texto : `~${km} km`,
            tempo: rota.sucesso ? rota.duracao.texto : `~${min} min`,
            distanciaKm: km, tempoMinutos: min,
            preco: precoZona ? precoZona.preco : calc.precoFinal,
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
        // AGENDAMENTO — se dados tem horario_agendamento, salva e nao cria corrida agora
        if (dados && dados.horario_agendamento) {
            try {
                const AgendamentoService = require('./agendamento.service');
                const ag = await AgendamentoService.salvar({
                    adminId, instanciaId,
                    telefone, nomeCliente,
                    origem: dados.origem,
                    destino: dados.destino || null,
                    dataHora: dados.horario_agendamento
                });
                console.log('[REBECA] Agendamento salvo via criarCorrida:', ag._id, '|', dados.horario_agendamento);
                // Retornar objeto fake compativel com o fluxo (sem criar corrida real)
                return { agendado: true, id: ag._id, agendamento: ag };
            } catch(e) {
                console.log('[REBECA] Erro ao agendar — criando corrida normal:', e.message);
                // Se falhar o agendamento, continua e cria corrida normal
            }
        }

        const { Corrida } = require('../models');
        
        // Anti-duplicacao: verificar se ja tem corrida ativa
        const queryAtiva = {
            clienteTelefone: telefone,
            status: { $in: ['pendente', 'aceita', 'aguardando_cliente', 'em_andamento', 'motorista_a_caminho'] }
        };
        if (adminId) queryAtiva.adminId = adminId;
        const corridaAtiva = await Corrida.findOne(queryAtiva);
        
        if (corridaAtiva) {
            // TIMEOUT: Se corrida PENDENTE há mais de 10 minutos, cancelar automaticamente
            const agora = new Date();
            const criacao = new Date(corridaAtiva.createdAt || corridaAtiva.dataCriacao || agora);
            const minutosPendente = (agora - criacao) / 1000 / 60;
            
            if (corridaAtiva.status === 'aguardando_cliente' && minutosPendente > 30) {
                // Motorista esperando cliente ha mais de 30 min - cancelar
                await Corrida.findByIdAndUpdate(corridaAtiva._id, { status: 'cancelada', motivoCancelamento: 'timeout_aguardando_30min' });
                if (corridaAtiva.motoristaId) {
                    try { await MotoristaService.atualizarStatus(corridaAtiva.motoristaId, 'disponivel'); } catch(e) { console.log('[CATCH]', e.message); }
                }
                console.log('[REBECA] Corrida aguardando_cliente cancelada (timeout 30min):', corridaAtiva._id);
            } else if (corridaAtiva.status === 'pendente' && minutosPendente > 10) {
                // Corrida pendente sem motorista por 10min - cancelar
                await Corrida.findByIdAndUpdate(corridaAtiva._id, { status: 'cancelada', motivoCancelamento: 'timeout_10min' });
                console.log('[REBECA] Corrida pendente antiga cancelada (timeout 10min):', corridaAtiva._id);
            } else if (['aceita', 'em_andamento', 'motorista_a_caminho'].includes(corridaAtiva.status) && minutosPendente > 120) {
                // Corrida aceita/em andamento há mais de 2h — provavelmente esquecida
                await Corrida.findByIdAndUpdate(corridaAtiva._id, { status: 'cancelada', motivoCancelamento: 'timeout_2h_sem_finalizacao' });
                if (corridaAtiva.motoristaId) {
                    try { await MotoristaService.atualizarStatus(corridaAtiva.motoristaId, 'disponivel'); } catch(e) {}
                }
                console.log('[REBECA] Corrida aceita/em_andamento cancelada (timeout 2h):', corridaAtiva._id);
            } else {
                // Corrida ativa recente - bloquear duplicada
                console.log('[REBECA] Corrida duplicada bloqueada para', telefone, '- Status:', corridaAtiva.status, '- Minutos:', minutosPendente.toFixed(1));
                return { id: corridaAtiva._id, duplicada: true };
            }
        }
        
        let cliente = await ClienteService.buscarPorTelefone(telefone, adminId);
        if (!cliente) cliente = await ClienteService.criar({ nome: nomeCliente, telefone, adminId });
        
        // Buscar foto do perfil do cliente no WhatsApp
        let clienteFotoUrl = null;
        try {
            const { InstanciaWhatsapp } = require('../models');
            const inst = await InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });
            if (inst) {
                const _evoUrl = inst.apiUrl + '/chat/fetchProfilePictureUrl/' + inst.nomeInstancia;
                const _evoKey = inst.apiKey || process.env.EVOLUTION_API_KEY;
                const _fotoRes = await require('axios').get(_evoUrl, { params: { number: telefone + '@s.whatsapp.net' }, headers: { 'apikey': _evoKey }, timeout: 5000 });
                clienteFotoUrl = _fotoRes.data?.profilePictureUrl || null;
            }
        } catch(e) { console.log('[REBECA] Foto cliente não obtida:', e.message); }

        const corrida = await CorridaService.criar({
            adminId,
            instanciaId: instanciaId || null,
            clienteId: cliente._id || cliente.id,
            clienteNome: cliente.nome,
            clienteTelefone: telefone,
            clienteFoto: clienteFotoUrl,
            aparenciaCliente: dados.aparenciaCliente || null,
            observacao: dados.observacao || null,
            referencia: dados.observacao || null,
            obsMotorista: dados.obsMotorista || null,
            origem: dados.calculo.origem,
            destino: dados.calculo.destino,
            distanciaKm: dados.calculo.distanciaKm,
            tempoEstimado: dados.calculo.tempoMinutos,
            precoEstimado: dados.calculo.preco,
            faixaPreco: dados.calculo.faixa?.nome || 'normal',
            multiplicador: dados.calculo.faixa?.multiplicador || 1,
            observacaoOrigem: dados.observacaoOrigem || null,
            observacaoDestino: dados.observacaoDestino || null,
            // Campos de encomenda
            tipo: dados.tipo || 'passageiro',
            descricaoEncomenda: dados.descricaoEncomenda || null,
            nomeColeta: dados.nomeColeta || null,
            nomeEntrega: dados.nomeEntrega || null,
            fragilPerecivel: dados.fragilPerecivel || null,
            status: 'pendente'
        });
        
        // ========== VERIFICAR MOTORISTA FAVORITO ==========
        try {
            const favorito = await RebecaService.verificarMotoristaFavorito(telefone, adminId);
            
            if (favorito?.disponivel) {
                // FAVORITO DISPONÍVEL - Priorizar ele!
                console.log('[REBECA] Motorista favorito disponível:', favorito.motorista.nomeCompleto);
                
                // Despachar APENAS para o favorito primeiro
                const resultadoFavorito = await DespachoService.despacharCorrida(corrida, [favorito.motorista], adminId);
                
                if (resultadoFavorito.sucesso) {
                    // Motorista favorito recebe APENAS no painel/app (sem WhatsApp)
                    console.log('[REBECA] Corrida despachada para motorista favorito (painel):', favorito.motorista.nomeCompleto);
                    
                    // Salvar que foi para favorito primeiro (timeout de 60s antes de broadcast)
                    corrida.favoritoPriorizado = true;
                    corrida.favoritoMotoristaId = favorito.motorista._id;
                    
                    return { id: corrida.id || corrida._id, favoritoPriorizado: true, motorista: favorito.motorista.nomeCompleto };
                }
            }
        } catch (e) {
            console.log('[REBECA] Erro verificar favorito:', e.message);
        }
        
        // ========== DESPACHAR PARA MOTORISTAS ==========
        try {
            // Buscar motoristas disponiveis DO ADMIN
            console.log('[REBECA] Buscando motoristas para adminId:', adminId);
            const motoristasDisponiveis = await MotoristaService.listarDisponiveis(adminId);
            console.log('[REBECA] Motoristas encontrados:', motoristasDisponiveis.length, motoristasDisponiveis.map(m => ({ nome: m.nomeCompleto || m.nome, status: m.status, whatsapp: m.whatsapp })));
            
            if (motoristasDisponiveis.length > 0) {
                // Despachar corrida (usa modo configurado: broadcast ou proximo)
                const resultadoDespacho = await DespachoService.despacharCorrida(corrida, motoristasDisponiveis, adminId);
                
                if (resultadoDespacho.sucesso) {
                    // Motoristas recebem APENAS no painel/app (sem WhatsApp)
                    console.log('[REBECA] Corrida despachada no painel - Modo:', resultadoDespacho.modo, '- Motoristas:', motoristasDisponiveis.length);
                }
                
                console.log('[REBECA] Despacho:', resultadoDespacho.modo, '- Motoristas:', motoristasDisponiveis.length);
                
                // Verificar se tem motorista EM CORRIDA mas próximo (notifica no painel)
                const motProximo = await DespachoService.verificarProximaCorrida(corrida, adminId);
                if (motProximo) {
                    // Salvar próxima corrida para o motorista ver no painel
                    console.log('[REBECA] Próxima corrida disponível no painel para:', motProximo.nomeCompleto || motProximo.nome);
                }
            } else {
                console.log('[REBECA] Nenhum motorista disponivel para admin:', adminId);

                // Verificar se tem motorista em corrida há mais de 7 min — provavelmente terminando
                try {
                    const { Corrida: _Corrida } = require('../models');
                    const _agora = new Date();
                    const _corridasAndamento = await _Corrida.find({
                        adminId,
                        status: { $in: ['em_andamento', 'motorista_a_caminho', 'aceita'] }
                    }).populate('motoristaId').lean();

                    // Achar motorista em corrida ha mais de 7 min
                    const _maisAntiga = _corridasAndamento
                        .filter(c => {
                            const mins = (_agora - new Date(c.updatedAt || c.createdAt)) / 60000;
                            return mins > 7;
                        })
                        .sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt))[0];

                    const _instNotif = await InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });

                    if (_maisAntiga?.motoristaId?.whatsapp && _instNotif) {
                        const EvoService = require('./evolution-multi.service');
                        // Avisar motorista que tem cliente esperando
                        await EvoService.enviarMensagem(_instNotif._id, _maisAntiga.motoristaId.whatsapp,
                            `Tem um cliente aguardando corrida! Assim que finalizar sua corrida atual, o próximo já está na fila.`
                        );
                        console.log('[REBECA] Motorista próximo de terminar notificado:', _maisAntiga.motoristaId.whatsapp);
                        // Avisar cliente com estimativa real
                        const _est = await RebecaService.estimarTempoEspera(adminId);
                        if (_instNotif) {
                            await EvoService.enviarMensagem(_instNotif._id, corrida.clienteTelefone,
                                'Todos os motoristas estão em corrida, mas já avisamos o mais próximo de terminar. Previsão: ' + _est.texto + '. Aguarda!'
                            );
                        }
                    } else if (_instNotif) {
                        // Sem nenhum motorista próximo de terminar — aviso genérico
                        const EvoService = require('./evolution-multi.service');
                        const _est = await RebecaService.estimarTempoEspera(adminId);
                        await EvoService.enviarMensagem(_instNotif._id, corrida.clienteTelefone,
                            'Todos os motoristas estão ocupados no momento. Previsão de espera: ' + _est.texto + '. Você será avisado assim que um desocupar!'
                        );
                    }
                } catch(_ne) { console.log('[REBECA] Erro notificar sem motorista:', _ne.message); }
            }
        } catch (e) {
            console.error('[REBECA] Erro no despacho:', e.message);
        }
        
        // Rebeca aprende endereço popular
        try { await AprendizadoService.aprenderEnderecoPopular(dados.origem, adminId); } catch(e) { console.log('[CATCH]', e.message); }
        
        // Push notification para motoristas disponíveis
        try { const PushService = require('./push.service'); await PushService.notificarNovaCorrida(adminId, corrida); } catch(e) { console.log('[CATCH]', e.message); }
        
        return { id: corrida._id || corrida.id, origem: dados.origem, destino: dados.destino, preco: dados.calculo.preco, tempoEstimado: dados.calculo?.tempoMinutos || 0 };
    },

    async historicoCliente(telefone) {
        const cliente = await ClienteService.buscarPorTelefone(telefone);
        if (!cliente) return `📋 Sem corridas. Envie endereço para pedir!`;
        const corridas = await CorridaService.listarPorCliente(cliente.id);
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
        if (_cfg.enviarLinkRastreamento) r += `\n\n📲 ${RebecaService.gerarLinkRastreamento(c.id)}`;
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
            console.log('[ACEITAR] Telefone:', telefoneMotorista, 'AdminId:', adminId);
            
            const motorista = await MotoristaService.buscarPorWhatsapp(telefoneMotorista, adminId);
            console.log('[ACEITAR] Motorista encontrado:', motorista ? (motorista.nomeCompleto || motorista.nome) : 'NÃO');
            
            if (!motorista) return '❌ Você não está cadastrado como motorista.';
            if (motorista.status === 'em_corrida') return '⚠️ Você já está em uma corrida.';
            
            const motoristaId = motorista._id?.toString() || motorista.id;
            console.log('[ACEITAR] MotoristaId:', motoristaId);
            
            // Buscar corridas pendentes para este motorista
            const corridasDisponiveis = DespachoService.getCorridasDisponiveis(motoristaId);
            console.log('[ACEITAR] Corridas disponíveis:', corridasDisponiveis?.length || 0);
            
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
            if (corrida && corrida.clienteTelefone) {
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
                // Gerar token único de rastreamento e salvar na corrida
                let tokenRastr = corrida.tokenRastreamento;
                if (!tokenRastr) {
                    tokenRastr = RebecaService.gerarTokenRastreamento();
                    await require('../models').Corrida.findByIdAndUpdate(corrida._id || corrida.id, { tokenRastreamento: tokenRastr });
                }
                const linkRastreamento = RebecaService.gerarLinkRastreamento(corrida._id || corrida.id, tokenRastr);

                // Montar mensagem rica ao cliente
                const _nomeMotorista = motorista.nomeCompleto || motorista.nome || 'Motorista';
                const _veiculo = [motorista.veiculo?.modelo, motorista.veiculo?.cor].filter(Boolean).join(' ');
                const _placa = motorista.veiculo?.placa || '';
                let msgCliente = `🚗 *MOTORISTA A CAMINHO!*\n\n`;
                msgCliente += `👨‍✈️ *${_nomeMotorista}*\n`;
                if (_veiculo) msgCliente += `🚙 ${_veiculo}\n`;
                if (_placa) msgCliente += `🔢 *${_placa}*`;
                if (tempoEstimado) msgCliente += tempoEstimado;
                msgCliente += `\n\n📲 *Acompanhe o motorista em tempo real:*\n${linkRastreamento}`;
                msgCliente += `\n\n💬 Qualquer dúvida pode falar aqui!`;

                // Buscar instância disponível — usa instanciaId da conversa ou qualquer conectada do admin
                const { InstanciaWhatsapp } = require('../models');
                const instEnvio = instanciaId
                    ? await InstanciaWhatsapp.findById(instanciaId)
                    : await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } });
                if (instEnvio) {
                    await EvolutionMultiService.enviarMensagem(instEnvio._id, corrida.clienteTelefone, msgCliente);
                    console.log('[ACEITAR-WA] Notificação enviada para cliente via', instEnvio.nomeInstancia);
                } else {
                    console.log('[ACEITAR-WA] FALHA: nenhuma instancia disponivel para adminId:', adminId);
                }
            }
            
            // ===== ENVIAR FOTO DO CLIENTE PARA O MOTORISTA =====
            try {
                if (corrida.clienteFoto && instanciaId && motorista.whatsapp) {
                    const _nomeCliente = corrida.clienteNome || 'Cliente';
                    const _telCliente = corrida.clienteTelefone ? corrida.clienteTelefone.replace(/\D/g,'').slice(-9) : '';
                    const _camisaLeg = corrida.aparenciaCliente || '';
                    const legenda = `👤 *${_nomeCliente}*\n📞 *${_telCliente}*` +
                        (_camisaLeg ? `\n👕 *${_camisaLeg}*` : '') +
                        `\n\n📍 ${corrida.origem?.endereco || corrida.enderecoOrigemTexto || 'Ver no app'}`;
                    await new Promise(r => setTimeout(r, 1000));
                    await EvolutionMultiService.enviarImagem(instanciaId, motorista.whatsapp, corrida.clienteFoto, legenda);
                    console.log('[REBECA] Foto do cliente enviada para motorista:', motorista.whatsapp);
                }
            } catch(fotoErr) {
                console.log('[REBECA] Não enviou foto do cliente:', fotoErr.message);
            }

            return `✅ *CORRIDA ACEITA!*\n\n📍 ${corrida?.origem?.endereco || 'Ver no app'}\n💰 R$ ${corrida?.precoEstimado?.toFixed(2) || '?'}\n\nUse o app para:\n1️⃣ *CHEGUEI NO LOCAL* → avisa o cliente\n2️⃣ *INICIAR CORRIDA* → quando cliente embarcar\n3️⃣ *FINALIZAR* → ao concluir`;
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
            
            // Só permite CHEGUEI se ainda não iniciou a corrida
            const statusPermitidos = ['aceita', 'a_caminho', 'motorista_a_caminho'];
            if (!statusPermitidos.includes(corrida.status)) {
                return '⚠️ Corrida já iniciada. Use *FINALIZAR* ao concluir.';
            }
            
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
            
            // Notificar cliente — com fallback de instância
            if (corrida.clienteTelefone) {
                const msgCliente = '❌ *CORRIDA CANCELADA*\n\nO motorista precisou cancelar.\n\nEnvie sua localização para solicitar outro motorista.';
                const { InstanciaWhatsapp } = require('../models');
                const instEnvio = instanciaId
                    ? await InstanciaWhatsapp.findById(instanciaId).catch(() => null)
                    : await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } });
                // Fallback: buscar qualquer instância conectada do admin
                const instFinal = instEnvio || await InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).catch(() => null);
                if (instFinal) {
                    await EvolutionMultiService.enviarMensagem(instFinal._id, corrida.clienteTelefone, msgCliente);
                    console.log('[CANCEL-MOT] Cliente notificado do cancelamento via:', instFinal._id);
                } else {
                    console.log('[CANCEL-MOT] ERRO: nenhuma instância disponível para notificar cliente, adminId:', adminId);
                }
                // Resetar conversa do cliente para inicio
                try {
                    const _telCli = corrida.clienteTelefone.replace(/\D/g, '');
                    const _convCli = conversas.get(_telCli) || conversas.get('55' + _telCli) || conversas.get(_telCli.replace(/^55/, ''));
                    const _keyReset = conversas.has(_telCli) ? _telCli : conversas.has('55' + _telCli) ? '55' + _telCli : _telCli.replace(/^55/, '');
                    conversas.set(_keyReset, { etapa: 'inicio', dados: {}, adminId, instanciaId });
                    console.log('[CANCEL-MOT] Conversa do cliente resetada:', _keyReset);
                } catch(eReset) { console.log('[CANCEL-MOT] Erro reset cliente:', eReset.message); }
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

    
    // ===== PONTOS DE REFERÊNCIA — localidade.service + MongoDB =====
    async buscarPontoReferencia(texto, adminId) {
        const lower = texto.toLowerCase().trim();
        // 1. Buscar no banco MongoDB (pontos cadastrados pelo admin)
        try {
            const { PontoReferencia } = require('../models');
            const pontosBanco = await PontoReferencia.find({
                adminId,
                $or: [
                    { nome: { $regex: lower, $options: 'i' } },
                    { apelidos: { $elemMatch: { $regex: lower, $options: 'i' } } }
                ],
                ativo: { $ne: false }
            }).limit(3).lean();
            if (pontosBanco.length > 0) {
                console.log('[PONTO_REF] Encontrado no banco:', pontosBanco[0].nome);
                return pontosBanco[0];
            }
        } catch(e) { /* continua */ }
        // 2. Buscar no localidade.service (memória)
        try {
            const localidadeService = require('./localidade.service');
            const pontosMemoria = localidadeService.buscarPontos(lower);
            if (pontosMemoria.length > 0) {
                console.log('[PONTO_REF] Encontrado em memória:', pontosMemoria[0].nome);
                return pontosMemoria[0];
            }
        } catch(e) { /* continua */ }
        return null;
    },

    // ===== CHAT INTERMEDIADO MOTORISTA↔CLIENTE =====
    async motoristaMensagemParaCliente(telefoneMotorista, mensagem, adminId, instanciaId) {
        try {
            const mot = await MotoristaService.buscarPorWhatsapp(telefoneMotorista, adminId);
            if (!mot) return null;
            const corrida = await CorridaService.buscarCorridaAtivaMotorista(mot._id);
            if (!corrida || !corrida.clienteTelefone) return null;
            const nomeMot = mot.nomeCompleto || mot.nome;
            // Buscar instância com fallback
            const { InstanciaWhatsapp: IWm } = require('../models');
            const instMot = instanciaId
                ? await IWm.findById(instanciaId).catch(() => null)
                : await IWm.findOne({ adminId, status: { $in: ['conectado','open','connected'] } });
            if (!instMot) { console.log('[CHAT] Sem instancia para motorista->cliente, adminId:', adminId); return null; }
            await EvolutionMultiService.enviarMensagem(instMot._id, corrida.clienteTelefone, '💬 *' + nomeMot + ':* ' + mensagem);
            try { const { Corrida: CM } = require('../models'); await CM.findByIdAndUpdate(corrida._id, { $push: { chatMensagens: { texto: mensagem, remetente: 'motorista', nomeRemetente: nomeMot, data: new Date() } } }); } catch(e){}
            console.log('[CHAT] Motorista->Cliente:', mensagem.substring(0,40));
            return { enviado: true };
        } catch(e) { return null; }
    },

    async clienteMensagemParaMotorista(telefoneCliente, mensagem, adminId, instanciaId) {
        try {
            const { Corrida: CM } = require('../models');
            const tels = [telefoneCliente, '55'+telefoneCliente, telefoneCliente.replace(/^55/,'')];
            const queryChat = { clienteTelefone:{$in:tels}, status:{$in:['aceita','em_andamento','motorista_a_caminho','aguardando_cliente']} };
            if (adminId) queryChat.adminId = adminId;
            const corrida = await CM.findOne(queryChat);
            if (!corrida || !corrida.motoristaId) return null;
            const mot = await MotoristaService.buscarPorId(corrida.motoristaId);
            if (!mot || !mot.whatsapp) return null;
            const nomeCli = corrida.clienteNome || 'Cliente';
            // Buscar instância com fallback
            const { InstanciaWhatsapp: IW } = require('../models');
            const instChat = instanciaId
                ? await IW.findById(instanciaId).catch(() => null)
                : await IW.findOne({ adminId, status: { $in: ['conectado','open','connected'] } });
            // Fallback: qualquer instância conectada do admin
            const instFinalChat = instChat || await IW.findOne({ adminId, status: { $in: ['conectado','open','connected'] } }).catch(() => null);
            if (!instFinalChat) { console.log('[CHAT] Sem instancia disponivel para adminId:', adminId); return null; }
            await EvolutionMultiService.enviarMensagem(instFinalChat._id, mot.whatsapp, '💬 *' + nomeCli + ':* ' + mensagem + '\n_Responda aqui que eu repasso!_');
            await CM.findByIdAndUpdate(corrida._id, { $push: { chatMensagens: { texto: mensagem, remetente: 'cliente', nomeRemetente: nomeCli, data: new Date() } } });
            console.log('[CHAT] Cliente->Motorista:', mensagem.substring(0,40));
            return { enviado: true, motoristaNome: mot.nomeCompleto||mot.nome };
        } catch(e) { return null; }
    },

    // ==================== SISTEMA DE DÚVIDAS AO DONO ====================
    async encaminharDuvidaAoAdmin(telefoneCliente, nomeCliente, mensagemCliente, adminId, instanciaId) {
        try {
            const { Admin, DuvidaPendente, InstanciaWhatsapp } = require('../models');
            const EvolutionMultiService = require('./evolution-multi.service');
            
            // Buscar admin
            const admin = await Admin.findById(adminId);
            if (!admin || !admin.telefone) {
                console.log('[DUVIDA] Admin sem telefone cadastrado');
                return null;
            }
            
            // Criar registro de dúvida
            const duvida = await DuvidaPendente.create({
                adminId,
                clienteTelefone: telefoneCliente,
                clienteNome: nomeCliente,
                mensagemCliente,
                instanciaId,
                status: 'pendente'
            });
            
            // Buscar instância para enviar mensagem
            const instancia = await InstanciaWhatsapp.findById(instanciaId) || 
                await InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });
            
            if (!instancia) {
                console.log('[DUVIDA] Sem instância conectada');
                return null;
            }
            
            // Enviar mensagem ao dono da frota
            const msgParaAdmin = `🤖 *REBECA - DÚVIDA DO CLIENTE*\n\n` +
                `👤 Cliente: ${nomeCliente || 'Não identificado'}\n` +
                `📱 Tel: ${telefoneCliente}\n\n` +
                `💬 Mensagem:\n"${mensagemCliente}"\n\n` +
                `📝 Responda esta mensagem que eu repasso ao cliente!\n` +
                `🔖 #DUV${duvida._id.toString().slice(-6)}`;
            
            await EvolutionMultiService.enviarMensagem(instancia._id, admin.telefone, msgParaAdmin);
            console.log('[DUVIDA] Enviada ao admin:', admin.telefone);
            
            return duvida;
        } catch (e) {
            console.error('[DUVIDA] Erro:', e.message);
            return null;
        }
    },

    async processarRespostaAdmin(telefoneAdmin, mensagem, adminId, instanciaId) {
        try {
            const { Admin, DuvidaPendente, InstanciaWhatsapp } = require('../models');
            const EvolutionMultiService = require('./evolution-multi.service');
            
            // Verificar se é o admin
            const admin = await Admin.findById(adminId);
            if (!admin || admin.telefone !== telefoneAdmin) return null;
            
            // Buscar dúvida pendente mais recente deste admin
            const duvida = await DuvidaPendente.findOne({ 
                adminId, 
                status: 'pendente' 
            }).sort({ createdAt: -1 });
            
            if (!duvida) return null;
            
            // Atualizar dúvida como respondida
            duvida.status = 'respondida';
            duvida.respostaAdmin = mensagem;
            duvida.respondidaEm = new Date();
            await duvida.save();
            
            // Buscar instância
            const instancia = await InstanciaWhatsapp.findById(instanciaId) || 
                await InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });
            
            if (!instancia) return null;
            
            // Enviar resposta ao cliente
            const msgParaCliente = `${mensagem}`;
            await EvolutionMultiService.enviarMensagem(instancia._id, duvida.clienteTelefone, msgParaCliente);
            
            console.log('[DUVIDA] Resposta enviada ao cliente:', duvida.clienteTelefone);
            
            // Confirmar ao admin
            await EvolutionMultiService.enviarMensagem(instancia._id, telefoneAdmin, 
                `✅ Resposta enviada ao cliente ${duvida.clienteNome || duvida.clienteTelefone}!`);
            
            return duvida;
        } catch (e) {
            console.error('[DUVIDA] Erro resposta:', e.message);
            return null;
        }
    },

    async verificarSeEhAdmin(telefone, adminId) {
        try {
            const { Admin } = require('../models');
            const admin = await Admin.findById(adminId);
            return admin && admin.telefone === telefone;
        } catch (e) {
            return false;
        }
    },

    pedirAvaliacao(telefone) {
        const conversa = conversas.get(telefone);
        if (conversa) {
            conversa.etapa = 'avaliar';
            conversa.dados = {};
            conversas.set(telefone, conversa);
        }
    },
};

// Método para áudio atualizar conversa no Map
RebecaService.atualizarConversa = function(telefone, adminId, dados) {
    const chave = telefone + '_' + (adminId || 'global');
    let conversa = conversas.get(chave) || conversas.get(telefone);
    if (!conversa) {
        conversa = { telefone, adminId, etapa: 'inicio', dados: {}, historico: [], ts: Date.now() };
    }
    if (dados.origem) conversa.dados = conversa.dados || {};
    if (dados.origem) {
        conversa.dados.origem = dados.origem;
        conversa.dados.origemValidada = conversa.dados.origemValidada || { valido: true, precisao: 'texto_livre', endereco: dados.origem, latitude: null, longitude: null };
        conversa.dados.calculo = conversa.dados.calculo || { origem: { endereco: dados.origem }, destino: null, distanciaKm: 0, tempoMinutos: 0, preco: 15, faixa: { nome: 'padrao', multiplicador: 1 } };
    }
    if (dados.destino) conversa.dados.destino = dados.destino;
    if (dados.nome) conversa.dados.nome = dados.nome;
    // Campos úteis do áudio para o motorista
    if (dados.obs_motorista) conversa.dados.obsMotorista = dados.obs_motorista;
    if (dados.ponto_referencia) conversa.dados.observacao = dados.ponto_referencia;
    if (dados.observacao_origem) conversa.dados.observacaoOrigem = dados.observacao_origem;
    if (dados.cor_camisa) conversa.dados.aparenciaCliente = dados.cor_camisa;
    if (dados.etapa) conversa.etapa = dados.etapa;
    conversa.ts = Date.now();

    // Salvar no histórico do CerebroRebeca — aprende com dados do áudio
    try {
        const CerebroRebeca = require('./cerebro-rebeca.service');
        if (dados.textoOriginal) {
            CerebroRebeca.salvarHistorico(conversa, '[áudio] ' + dados.textoOriginal, 'cliente');
        }
        if (dados.origem) CerebroRebeca.salvarHistorico(conversa, '[dados áudio] origem: ' + dados.origem, 'sistema');
        if (dados.destino) CerebroRebeca.salvarHistorico(conversa, '[dados áudio] destino: ' + dados.destino, 'sistema');
        if (dados.nome) CerebroRebeca.salvarHistorico(conversa, '[dados áudio] nome cliente: ' + dados.nome, 'sistema');
    } catch(e) {}

    conversas.set(telefone, conversa);
    console.log('[AUDIO] Conversa atualizada no Map:', telefone, '| etapa:', conversa.etapa);
};


// ===== CRON: Timeout da fila de espera =====
// Roda a cada 5min — avisa clientes há 30min na fila, cancela após 60min
setInterval(async () => {
    try {
        const { FilaEspera, InstanciaWhatsapp } = require('./models' in require.cache ? '../models' : '../models');
        const agora = Date.now();
        const em30min = new Date(agora - 30 * 60 * 1000); // entrada há 30min
        const em60min = new Date(agora - 60 * 60 * 1000); // entrada há 60min

        // Avisar quem está há 30min sem aviso prévio
        const aguardando30 = await FilaEspera.find({
            status: 'aguardando',
            criadoEm: { $lte: em30min, $gt: em60min },
            avisado30min: { $ne: true }
        }).lean().catch(() => []);

        for (const entrada of aguardando30) {
            try {
                const inst = entrada.instanciaId
                    ? await InstanciaWhatsapp.findById(entrada.instanciaId)
                    : await InstanciaWhatsapp.findOne({ adminId: entrada.adminId, status: 'conectado' });
                if (inst) {
                    const EvolutionMultiService = require('./evolution-multi.service');
                    await EvolutionMultiService.enviarMensagem(
                        inst._id, entrada.telefone,
                        'Voce ainda esta na fila de espera por um motorista.\n\nAssim que um ficar livre eu te aviso! Se quiser cancelar, manda CANCELAR.'
                    );
                    await FilaEspera.findByIdAndUpdate(entrada._id, { avisado30min: true });
                }
            } catch(_fa) {}
        }

        // Cancelar quem está há 60min — sem motorista disponível
        const expirados = await FilaEspera.find({
            status: 'aguardando',
            criadoEm: { $lte: em60min }
        }).lean().catch(() => []);

        for (const entrada of expirados) {
            try {
                await FilaEspera.findByIdAndUpdate(entrada._id, { status: 'cancelado' });
                const inst = entrada.instanciaId
                    ? await InstanciaWhatsapp.findById(entrada.instanciaId)
                    : await InstanciaWhatsapp.findOne({ adminId: entrada.adminId, status: 'conectado' });
                if (inst) {
                    const EvolutionMultiService = require('./evolution-multi.service');
                    await EvolutionMultiService.enviarMensagem(
                        inst._id, entrada.telefone,
                        'Poxa, ficamos 1 hora sem encontrar motorista disponivel para voce.\n\nSua posicao na fila foi cancelada. Quando quiser tentar de novo e so chamar!'
                    );
                    // Resetar conversa
                    const conv = RebecaService.conversas ? RebecaService.conversas.get(entrada.telefone) : null;
                    if (conv) {
                        conv.etapa = 'inicio';
                        conv.dados = {};
                        RebecaService.conversas.set(entrada.telefone, conv);
                    }
                }
            } catch(_fe) {}
        }
    } catch(_cron) { console.log('[FILA-CRON] Erro:', _cron.message); }
}, 5 * 60 * 1000); // a cada 5 minutos



// ===== TIMEOUT APARENCIA: 30s sem resposta → avança para aguardando_motorista =====
const _agendarTimeoutAparencia = (telefone, instanciaId, corridaId, conversas) => {
    if (!global._timeoutsAparencia) global._timeoutsAparencia = new Map();
    const _chave = telefone + '_aparencia';
    // Cancela timeout anterior se existir
    if (global._timeoutsAparencia.has(_chave)) {
        clearTimeout(global._timeoutsAparencia.get(_chave));
    }
    const _tid = setTimeout(async () => {
        global._timeoutsAparencia.delete(_chave);
        const _conv = conversas.get(telefone);
        if (!_conv || _conv.etapa !== 'pedir_aparencia') return; // cliente já respondeu
        _conv.etapa = 'aguardando_motorista';
        conversas.set(telefone, _conv);
        console.log('[APARENCIA_TIMEOUT] 15s sem resposta, avançando:', telefone);
        try {
            const { InstanciaWhatsapp: IWT, Corrida: CT } = require('../models');
            const _inst = instanciaId
                ? await IWT.findById(instanciaId).catch(() => null)
                : await IWT.findOne({ status: { $in: ['conectado','open','connected'] } });
            // Só avisar cliente se motorista já aceitou
            if (corridaId) {
                const _corrT = await CT.findById(corridaId).lean();
                if (_corrT && _corrT.motoristaId && _inst) {
                    await EvolutionMultiService.enviarMensagem(_inst._id, telefone,
                        'Tudo certo! O motorista já está sendo chamado 🚗');
                }
            }
            // Avisar motorista que cliente não informou cor
            if (corridaId) {
                const _corrT = await CT.findById(corridaId).lean();
                if (_corrT && _corrT.motoristaId) {
                    const _motT = await MotoristaService.buscarPorId(_corrT.motoristaId);
                    if (_motT && _motT.whatsapp && _inst) {
                        await EvolutionMultiService.enviarMensagem(_inst._id, _motT.whatsapp,
                            '👕 *Aparência do cliente:* não informada');
                        console.log('[APARENCIA_TIMEOUT] Motorista avisado: sem cor informada');
                    }
                }
            }
        } catch(e) { console.log('[APARENCIA_TIMEOUT] Erro:', e.message); }
    }, 30 * 1000);
    global._timeoutsAparencia.set(_chave, _tid);
};

module.exports = RebecaService;

// ==================== FILA DE ESPERA ====================
const filaEsperaFunctions = {
    async verificarMotoristaFavorito(telefoneCliente, adminId) {
        try {
            const { Cliente, Motorista } = require('../models');
            const cliente = await Cliente.findOne({ telefone: telefoneCliente, adminId });
            if (!cliente || !cliente.ultimoMotorista) return null;
            
            const motorista = await Motorista.findById(cliente.ultimoMotorista);
            if (!motorista || !motorista.ativo) return null;
            
            return {
                motorista,
                disponivel: motorista.status === 'disponivel',
                emCorrida: motorista.status === 'em_corrida'
            };
        } catch (e) {
            console.error('[FILA] Erro verificar favorito:', e.message);
            return null;
        }
    },

    async salvarUltimoMotorista(telefoneCliente, motoristaId, adminId) {
        try {
            const { Cliente } = require('../models');
            await Cliente.findOneAndUpdate(
                { telefone: telefoneCliente, adminId },
                { ultimoMotorista: motoristaId },
                { upsert: true }
            );
        } catch (e) {
            console.error('[FILA] Erro salvar ultimo motorista:', e.message);
        }
    },

    async adicionarFilaEspera(telefoneCliente, nomeCliente, origem, destino, adminId, instanciaId) {
        try {
            const { FilaEspera } = require('../models');
            
            // Calcular posição na fila
            const aguardando = await FilaEspera.countDocuments({ adminId, status: 'aguardando' });
            
            const entrada = await FilaEspera.create({
                clienteTelefone: telefoneCliente,
                clienteNome: nomeCliente,
                origem,
                destino,
                posicao: aguardando + 1,
                status: 'aguardando',
                adminId,
                instanciaId
            });
            
            return { entrada, posicao: aguardando + 1 };
        } catch (e) {
            console.error('[FILA] Erro adicionar fila:', e.message);
            return null;
        }
    },

    async estimarTempoEspera(adminId) {
        try {
            const { Corrida } = require('../models');
            const agora = new Date();

            // Buscar corridas em andamento com tempo de inicio
            const corridasAtivas = await Corrida.find({
                adminId,
                status: { $in: ['aceita', 'em_andamento', 'motorista_a_caminho'] }
            }).lean();

            if (corridasAtivas.length === 0) return { minutos: 0, texto: 'poucos minutos', proximaTerminando: null };

            // Calcular tempo decorrido de cada corrida e estimar restante
            // Assumindo media de 20min por corrida
            const MEDIA_CORRIDA_MIN = 20;
            let menorTempoRestante = Infinity;
            let corridaMaisAntiga = null;

            for (const c of corridasAtivas) {
                const inicio = new Date(c.updatedAt || c.createdAt || agora);
                const minutosDecorridos = (agora - inicio) / 1000 / 60;
                const minutosRestantes = Math.max(2, MEDIA_CORRIDA_MIN - minutosDecorridos);
                if (minutosRestantes < menorTempoRestante) {
                    menorTempoRestante = minutosRestantes;
                    corridaMaisAntiga = c;
                }
            }

            const minutos = Math.round(menorTempoRestante);
            const proximaTerminando = corridaMaisAntiga;

            let texto;
            if (minutos <= 3) texto = 'menos de 5 minutos';
            else if (minutos <= 8) texto = 'uns 5 a 10 minutos';
            else if (minutos <= 15) texto = 'uns 10 a 15 minutos';
            else texto = 'aproximadamente ' + minutos + ' minutos';

            return { minutos, texto, proximaTerminando };
        } catch (e) {
            return { minutos: 10, texto: 'aproximadamente 10 minutos' };
        }
    },

    async notificarFilaQuandoDisponivel(adminId, instanciaId) {
        try {
            const { FilaEspera, InstanciaWhatsapp } = require('../models');
            const EvolutionMultiService = require('./evolution-multi.service');
            
            // Buscar próximo da fila
            const proximo = await FilaEspera.findOne({ 
                adminId, 
                status: 'aguardando' 
            }).sort({ posicao: 1 });
            
            if (!proximo) return null;
            
            // Buscar instância
            const instancia = await InstanciaWhatsapp.findById(instanciaId) || 
                await InstanciaWhatsapp.findOne({ adminId, status: 'conectado' });
            
            if (!instancia) return null;
            
            // Notificar cliente
            await EvolutionMultiService.enviarMensagem(
                instancia._id, 
                proximo.clienteTelefone,
                `🎉 Boa notícia! Um motorista acabou de ficar disponível!\n\nDigite o endereço de destino para eu criar sua corrida!`
            );
            
            // Atualizar status
            proximo.status = 'notificado';
            await proximo.save();
            
            // Atualizar conversa do cliente
            const conversa = conversas.get(proximo.clienteTelefone);
            if (conversa) {
                conversa.etapa = 'pedir_origem';
                conversa.dados = {};
                conversas.set(proximo.clienteTelefone, conversa);
            }
            
            console.log('[FILA] Cliente notificado:', proximo.clienteTelefone);
            return proximo;
        } catch (e) {
            console.error('[FILA] Erro notificar fila:', e.message);
            return null;
        }
    },

    async removerDaFila(telefoneCliente, adminId) {
        try {
            const { FilaEspera } = require('../models');
            await FilaEspera.updateOne(
                { clienteTelefone: telefoneCliente, adminId, status: 'aguardando' },
                { status: 'atendido' }
            );
        } catch (e) {
            console.error('[FILA] Erro remover da fila:', e.message);
        }
    }
};

// Adicionar funções ao RebecaService
Object.assign(RebecaService, filaEsperaFunctions);

// ==================== TRANSCRIÇÃO DE ÁUDIO ====================
RebecaService.transcreverAudio = async function(audioMessage, instancia) {
    try {
        // Baixar áudio da Evolution API
        const axios = require('axios');
        
        if (!audioMessage.mediaKey || !instancia.apiUrl || !instancia.apiKey) {
            console.log('[AUDIO] Dados insuficientes para baixar audio');
            return null;
        }
        
        // Tentar baixar o áudio via Evolution API
        const mediaUrl = audioMessage.url || audioMessage.directPath;
        if (!mediaUrl) {
            console.log('[AUDIO] URL do audio nao encontrada');
            return null;
        }
        
        // Se não tiver OpenAI configurado, retornar aviso amigável
        if (!process.env.OPENAI_API_KEY) {
            console.log('[AUDIO] OpenAI API Key nao configurada para transcrição');
            // Retornar mensagem genérica para tratar como pedido de corrida
            return 'preciso de um carro';
        }
        
        // Baixar áudio
        const audioBuffer = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        
        // Enviar para OpenAI Whisper
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', Buffer.from(audioBuffer.data), { filename: 'audio.ogg', contentType: 'audio/ogg' });
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');
        formData.append('temperature', '0');
        formData.append('prompt', 'Rebeca, corrida, endereço, rua, avenida, bairro, número, destino, origem, mototaxi, delivery, pedido, cancelar, confirmar, sim, não, obrigado');
        
        const whisperResponse = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
                ...formData.getHeaders()
            }
        });
        
        const transcricao = whisperResponse.data?.text;
        console.log('[AUDIO] Transcricao:', transcricao);
        return transcricao || null;
    } catch (e) {
        console.error('[AUDIO] Erro transcrever:', e.message);
        // Se falhar, assumir que é pedido de corrida (comportamento amigável)
        return 'preciso de um carro';
    }
};
