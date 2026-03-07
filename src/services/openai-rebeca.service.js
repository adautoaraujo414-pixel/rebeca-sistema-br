const axios = require('axios');
const FormData = require('form-data');
const MotoristaService = require('./motorista.service');

const OpenAIRebecaService = {
    apiKey: process.env.OPENAI_API_KEY || '',
    
    isAtivo() {
        return !!this.apiKey;
    },

    // Buscar contexto do cliente (histórico)
    async buscarContextoCliente(telefone, adminId) {
        try {
            const { Corrida } = require('../models');
            const tels = [telefone, '55' + telefone, telefone.replace(/^55/, '')];
            
            const query = { clienteTelefone: { $in: tels } };
            if (adminId) query.adminId = adminId;
            
            // Buscar corridas anteriores
            const corridas = await Corrida.find(query)
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();
            
            const totalCorridas = corridas.length;
            const ultimaCorrida = corridas[0];
            const ultimoEndereco = ultimaCorrida?.origem?.endereco || ultimaCorrida?.origem?.enderecoTexto || (typeof ultimaCorrida?.origem === 'string' ? ultimaCorrida.origem : null);
            
            // Cliente recorrente se tem 3+ corridas
            const clienteRecorrente = totalCorridas >= 3;
            
            // Contar endereço mais usado (pra despacho zero perguntas)
            const enderecoContagem = {};
            corridas.forEach(c => {
                const end = c.origem?.endereco;
                if (end) enderecoContagem[end] = (enderecoContagem[end] || 0) + 1;
            });
            const enderecoMaisUsado = Object.entries(enderecoContagem).sort((a,b) => b[1] - a[1])[0];
            const enderecoFrequente = enderecoMaisUsado && enderecoMaisUsado[1] >= 3 ? enderecoMaisUsado[0] : null;
            const vezesUsouEndereco = enderecoMaisUsado ? enderecoMaisUsado[1] : 0;
            
            return {
                totalCorridas,
                clienteRecorrente,
                ultimoEndereco,
                ultimaCorrida: ultimaCorrida ? {
                    origem: ultimaCorrida.origem,
                    destino: ultimaCorrida.destino,
                    data: ultimaCorrida.createdAt
                } : null
            };
        } catch (e) {
            console.log('[CONTEXTO] Erro ao buscar histórico:', e.message);
            return { totalCorridas: 0, clienteRecorrente: false, ultimoEndereco: null };
        }
    },



    // Converter números por extenso para dígitos
    converterNumerosExtenso(texto) {
        const numeros = {
            'zero': '0', 'um': '1', 'uma': '1', 'dois': '2', 'duas': '2', 'tres': '3', 'três': '3',
            'quatro': '4', 'cinco': '5', 'seis': '6', 'sete': '7', 'oito': '8', 'nove': '9',
            'dez': '10', 'onze': '11', 'doze': '12', 'treze': '13', 'quatorze': '14', 'catorze': '14',
            'quinze': '15', 'dezesseis': '16', 'dezessete': '17', 'dezoito': '18', 'dezenove': '19',
            'vinte': '20', 'trinta': '30', 'quarenta': '40', 'cinquenta': '50',
            'sessenta': '60', 'setenta': '70', 'oitenta': '80', 'noventa': '90',
            'cem': '100', 'cento': '100', 'duzentos': '200', 'trezentos': '300', 'quatrocentos': '400',
            'quinhentos': '500', 'seiscentos': '600', 'setecentos': '700', 'oitocentos': '800', 'novecentos': '900',
            'mil': '1000'
        };
        
        let resultado = texto.toLowerCase();
        
        // Padrão: "cento e vinte e três" → 123
        resultado = resultado.replace(/cento e (\w+) e (\w+)/gi, (match, dezena, unidade) => {
            const d = numeros[dezena] || dezena;
            const u = numeros[unidade] || unidade;
            if (!isNaN(d) && !isNaN(u)) {
                return String(100 + parseInt(d) + parseInt(u));
            }
            return match;
        });
        
        // Padrão: "vinte e três" → 23
        resultado = resultado.replace(/(\w+) e (\w+)/gi, (match, dezena, unidade) => {
            const d = numeros[dezena];
            const u = numeros[unidade];
            if (d && u && parseInt(d) >= 20 && parseInt(u) < 10) {
                return String(parseInt(d) + parseInt(u));
            }
            return match;
        });
        
        // Números simples
        for (const [extenso, digito] of Object.entries(numeros)) {
            const regex = new RegExp('\\b' + extenso + '\\b', 'gi');
            resultado = resultado.replace(regex, digito);
        }
        
        return resultado;
    },

    // Limpar ruídos do áudio
    limparTranscricao(texto) {
        let limpo = texto
            .replace(/\b(éé+|ãã+|hm+|ah+|eh+|tipo assim|né|então|assim|sabe|entendeu)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        limpo = this.converterNumerosExtenso(limpo);
        return limpo;
    },

    // Transcrever áudio usando OpenAI Whisper
    async transcreverAudio(buffer, mimeType = 'audio/ogg', contextoConversa = null) {
        if (!this.apiKey) {
            console.log('[AUDIO] API Key nao configurada');
            return null;
        }

        const chamarWhisper = async (buf, mime, forceLang) => {
            try {
                const formData = new FormData();
                let ext = 'ogg';
                if (mime.includes('mp3') || mime.includes('mpeg')) ext = 'mp3';
                else if (mime.includes('wav')) ext = 'wav';
                else if (mime.includes('m4a')) ext = 'm4a';
                else if (mime.includes('webm')) ext = 'webm';
                formData.append('file', Buffer.from(buf), { filename: 'audio.' + ext, contentType: mime });
                formData.append('model', 'whisper-1');
                formData.append('prompt', 'corrida, endereco, rua, avenida, bairro, numero, destino, origem, mototaxi, Uber, delivery, confirmar, cancelar, sim, nao, obrigado, quero, preciso, me busca');
                if (forceLang) formData.append('language', 'pt');
                const resp = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                    headers: { 'Authorization': 'Bearer ' + this.apiKey, ...formData.getHeaders() },
                    timeout: 30000
                });
                return resp.data.text || '';
            } catch(e) {
                console.log('[AUDIO] Whisper falhou:', e.message);
                return '';
            }
        };

        let texto = await chamarWhisper(buffer, mimeType, true);
        console.log('[AUDIO] T1:', texto && texto.substring(0, 100));

        if (!texto || texto.length < 3) {
            texto = await chamarWhisper(buffer, mimeType, false);
            console.log('[AUDIO] T2:', texto && texto.substring(0, 100));
        }

        if (!texto || texto.length < 3) {
            try {
                const { execSync } = require('child_process');
                const fs = require('fs'), os = require('os'), path = require('path');
                const tmp = path.join(os.tmpdir(), 'reb_' + Date.now());
                fs.writeFileSync(tmp + '.ogg', buffer);
                execSync('ffmpeg -y -i ' + tmp + '.ogg -ar 16000 -ac 1 -f mp3 ' + tmp + '.mp3 2>/dev/null', { timeout: 15000 });
                const mp3 = fs.readFileSync(tmp + '.mp3');
                try { fs.unlinkSync(tmp + '.ogg'); fs.unlinkSync(tmp + '.mp3'); } catch(_) {}
                texto = await chamarWhisper(mp3, 'audio/mp3', false);
                console.log('[AUDIO] T3 mp3:', texto && texto.substring(0, 100));
            } catch(e) {
                console.log('[AUDIO] ffmpeg falhou:', e.message);
            }
        }

        if (texto && texto.length >= 3) {
            const textoLimpo = this.limparTranscricao(texto);
            const textoFinal = this.interpretarAudioTranscrito(textoLimpo);
            console.log('[AUDIO] Transcrito final:', textoFinal && textoFinal.substring(0, 100));
            if (textoFinal) {
                const raciocinio = await this.raciocionarSobreAudio(textoFinal, contextoConversa);
                return raciocinio || textoFinal;
            }
        }

        console.log('[AUDIO] Whisper falhou em tudo — GPT assume controle');
        return await this.gptFallbackAudio(contextoConversa);
    },

    async raciocionarSobreAudio(textoTranscrito, contextoConversa) {
        try {
            const etapaAtual = (contextoConversa && contextoConversa.etapa) || 'inicio';
            const dadosAtuais = (contextoConversa && contextoConversa.dados) ? JSON.stringify(contextoConversa.dados) : '{}';
            const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'system',
                    content: 'Voce e a Rebeca, atendente simpatica de uma central de corridas no Brasil. Analise o audio transcrito e retorne JSON. ETAPA ATUAL: "' + etapaAtual + '". DADOS JA COLETADOS: ' + dadosAtuais + '. REGRAS OBRIGATORIAS: (1) SEMPRE gere resposta_rebeca — nunca vazio. (2) Se cliente mandou SAUDACAO (oi, ola, boa noite, boa tarde, bom dia, tudo bem, oi tudo bom etc): responda de forma RECIPROCA e NATURAL como uma atendente humana faria, depois pergunte se precisa de um carro. EXEMPLOS CERTOS: "Boa noite! 😊 Precisa de um carro?", "Oi! Tudo bem sim, obrigada! Vai precisar de corrida hoje?", "Boa tarde! Posso te ajudar a chamar um carro? 🚗". NUNCA responda so com o endereco, sempre reciproque a saudacao primeiro. (3) Se cliente pediu corrida ou mencionou endereco: extraia origem e responda confirmando. (4) Se etapa for confirmar_endereco_anterior: entenda confirmacoes (sim, isso, correto, 1) ou negacoes (nao, outro, 2) por voz. (5) NUNCA repita informacao que o cliente ja deu. (6) Tom: simpatico, breve, humano — maximo 2 linhas. (7) NUNCA use ingles. Retorne APENAS JSON sem markdown: {"origem_extraida":null,"destino_extraido":null,"confirmacao":false,"cancelamento":false,"nome_cliente":null,"resposta_rebeca":"","proxima_etapa":"","notificar_admin":false}'
                }, {
                    role: 'user',
                    content: 'Audio transcrito: "' + textoTranscrito + '"'
                }],
                max_tokens: 400,
                temperature: 0.2
            }, {
                headers: { 'Authorization': 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
                timeout: 12000
            });
            const raw = resp.data.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
            const json = JSON.parse(raw);
            console.log('[AUDIO RACIOCINIO]', JSON.stringify(json).substring(0, 200));
            if (json.resposta_rebeca) {
                return '__AUDIO_RACIOCINIO__' + JSON.stringify(json);
            }
            return textoTranscrito;
        } catch(e) {
            console.log('[AUDIO] Raciocinio falhou:', e.message);
            return textoTranscrito;
        }
    },

    async gptFallbackAudio(contextoConversa) {
        try {
            const etapa = (contextoConversa && contextoConversa.etapa) || 'inicio';
            const dados = (contextoConversa && contextoConversa.dados) || {};
            const adminId = contextoConversa && contextoConversa.adminId;
            const telefone = contextoConversa && contextoConversa.telefone;

            // Buscar historico do cliente igual ao fluxo de texto
            let ctxHistorico = '';
            let ultimoEndereco = null;
            let nomeCliente = dados.nome || '';
            let nomeEmpresa = 'Central de Corridas';
            try {
                const { Admin } = require('../models');
                if (adminId) {
                    const adm = await Admin.findById(adminId);
                    if (adm) nomeEmpresa = adm.empresa || adm.nome || nomeEmpresa;
                }
                const ctxCliente = await this.buscarContextoCliente(telefone, adminId);
                if (ctxCliente) {
                    nomeCliente = ctxCliente.nome || nomeCliente;
                    ultimoEndereco = ctxCliente.ultimoEndereco;
                    if (ctxCliente.clienteRecorrente && ultimoEndereco) {
                        ctxHistorico = 'Cliente recorrente. Ultimo endereco usado: ' + ultimoEndereco + '. ';
                    }
                }
            } catch(eCtx) {}

            if (dados.origem) ctxHistorico += 'Ja sei a origem: ' + dados.origem + '. ';
            if (dados.destino) ctxHistorico += 'Ja sei o destino: ' + dados.destino + '. ';

            // Se cliente recorrente em etapa inicio, oferecer endereco anterior direto
            if (etapa === 'inicio' && ultimoEndereco && !dados.origem) {
                const saudacao = nomeCliente ? 'Oi ' + nomeCliente + '!' : 'Oi!';
                return '__RESPOSTA_DIRETA__' + saudacao + ' Mesmo lugar de antes? 🚗\n\n📍 ' + ultimoEndereco + '\n\n*1* - Sim\n*2* - Outro endereço';
            }

            const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'system',
                    content: `Voce e a Rebeca, atendente humana e simpatica de uma central de corridas. NUNCA diga que e robo ou central de taxi. HISTORICO: ${ctxHistorico} ETAPA ATUAL: ${etapa}. DADOS COLETADOS: ${dadosAtuais || 'nenhum'}.

REGRAS DE COMPORTAMENTO:
- Se cliente mandou SAUDACAO (oi, boa noite, ola, tudo bem etc): reciproque a saudacao E pergunte se precisa de carro. Ex: "Boa noite! 😊 Vai precisar de um carro?", "Oi! Tudo bem! Posso chamar um carro pra voce?"
- Se cliente DEU SINAL que quer corrida (quero, preciso, pode ser, sim, bora, vamos, manda um carro etc): va direto — peca o endereco de origem se nao tiver.
- Se cliente mandou ENDERECO: confirme e prossiga para buscar motorista.
- Se cliente esta com DUVIDA, reclamacao ou assunto fora de corrida: responda com empatia como membro da equipe. Diga: "Vou chamar meu superior, so um momento! 🙏" e defina notificar_admin=true na resposta JSON.
- NUNCA diga "como posso te ajudar" — voce ja sabe o que faz: corridas.
- NUNCA mencione audio, transcricao ou problema tecnico.
- Seja breve: maximo 2 linhas WhatsApp.
- NUNCA use ingles.`
                }, {
                    role: 'user',
                    content: 'Cliente mandou um audio curto. Responda de forma OBJETIVA e DIRETA conforme a etapa atual. SEM saudacoes genericas tipo "espero que esteja bem". Se etapa for inicio: pergunte so o endereco de origem. Se ja tem origem: pergunte so o destino. Se ja tem origem e destino: peca confirmacao. Maximo 1 linha.'
                }],
                max_tokens: 80,
                temperature: 0.2
            }, {
                headers: { 'Authorization': 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
                timeout: 10000
            });
            const msg = resp.data.choices[0].message.content.trim();
            if (msg) {
                console.log('[AUDIO FALLBACK]:', msg.substring(0, 80));
                return '__RESPOSTA_DIRETA__' + msg;
            }
        } catch(e) {
            console.log('[AUDIO] Fallback GPT falhou:', e.message);
        }
        return null;
    },


    // ===== INTERPRETAÇÃO INTELIGENTE DE ÁUDIO =====
    interpretarAudioTranscrito(texto) {
        if (!texto || texto.length < 2) return texto;
        let limpo = texto.trim();
        
        // Remover ruídos comuns do Whisper
        limpo = limpo.replace(/^(legendado por|traduzido por|transcrição por|obrigado por assistir|inscreva-se).*/gi, '');
        limpo = limpo.replace(/^(música|aplausos|risos|silêncio|barulho)$/gi, '');
        limpo = limpo.replace(/\.{3,}/g, '.');
        limpo = limpo.trim();
        
        // Se ficou vazio após limpeza, é ruído
        if (!limpo || limpo.length < 2) return null;
        
        // Normalizar pedidos de corrida falados naturalmente
        // "Ô Rebeca manda um carro aqui no JB 7" → "manda um carro aqui no JB 7"
        limpo = limpo.replace(/^(ô|oh|ei|oi|olha|ó)s+(rebeca|rebecca)s*/gi, '');
        
        // "Eu quero um carro lá no hospital" → "quero um carro no hospital"
        limpo = limpo.replace(/^eus+/gi, '');
        limpo = limpo.replace(/s+lás+/gi, ' ');
        
        // Detectar endereço/ponto de referência no áudio
        const temEndereco = /(rua|avenida|av.|praça|praca|hospital|shopping|escola|mercado|terminal|rodoviaria|rodoviária|farmacia|farmácia|igreja|posto|aqui no|aqui na|estou no|to no|me busca no|me pega no)/i.test(limpo);
        
        // Se falou um endereço mas sem verbo de ação, adicionar contexto
        if (temEndereco && !/(quero|preciso|manda|busca|pega|vem|chama)/i.test(limpo)) {
            limpo = 'manda um carro ' + limpo;
        }
        
        // Normalizar pedidos de delivery falados
        // "Manda um x-tudo e uma coca pra mim" → mantém como está (delivery já parseia)
        // "Eu quero dois x-bacon sem cebola" → "quero dois x-bacon sem cebola"
        
        return limpo;
    },

    // REGEX para resolver SEM chamar IA (mais rápido e barato)
    resolverComRegex(mensagem) {
        const msg = mensagem.toLowerCase().trim();
        
        // Detectar URGÊNCIA
        const urgente = msg.match(/(urgente|urgência|urgencia|atrasado|atrasada|rápido|rapido|correndo|pressa|emergência|emergencia|depressa|logo)/);
        
        // Detectar CLIENTE NERVOSO/AGRESSIVO
        const nervoso = msg.match(/(absurdo|palhaçada|palhacada|ridiculo|ridículo|incompetente|péssimo|pessimo|horrível|horrivel|vergonha|lixo|merda|porra|caralho|desgraça|desgraca|nunca mais|vou processar|procon|reclamar)/);
        
        // Se nervoso, responder com empatia
        if (nervoso) {
            return { 
                intencao: 'RECLAMACAO', 
                resposta: 'Poxa, sinto muito pela situação. Me conta o que aconteceu que vou te ajudar a resolver.',
                clienteNervoso: true,
                prioridade: 'alta'
            };
        }
        
        // Se urgente, marcar prioridade
        if (urgente && msg.match(/(carro|corrida|busca|vem|preciso|quero)/)) {
            return { 
                intencao: 'SOLICITAR_CORRIDA', 
                resposta: 'Entendi que é urgente! Me passa o endereço que já priorizo um motorista pra você.',
                urgente: true,
                prioridade: 'urgente'
            };
        }
        
        if (msg.match(/^(oi|olá|ola|hey|eai|e ai|opa)$/)) {
            return { intencao: 'SAUDACAO', resposta: Math.random() > 0.5 ? 'Oii|||Tudo bem?' : 'Oi, tudo bem?' };
        }
        if (msg.match(/^bom dia$/)) {
            return { intencao: 'SAUDACAO', resposta: Math.random() > 0.5 ? 'Bom dia!|||Tudo bem com vc?' : 'Bom dia! Tudo bem?' };
        }
        if (msg.match(/^boa tarde$/)) {
            return { intencao: 'SAUDACAO', resposta: Math.random() > 0.5 ? 'Boa tarde!|||Tudo bem?' : 'Boa tarde, tudo bem?' };
        }
        if (msg.match(/^boa noite$/)) {
            return { intencao: 'SAUDACAO', resposta: Math.random() > 0.5 ? 'Boa noite!|||Tudo certo?' : 'Boa noite, tudo bem?' };
        }
        if (msg.match(/^(oi|ola|olá).*(tudo bem|tudo bom|como vai)/)) {
            return { intencao: 'SAUDACAO', resposta: 'Estou muito bem, e você?' };
        }
        if (msg.match(/^(tudo|tudo bem|tudo bom|bem|to bem|tô bem|estou bem|tudo otimo|tudo ótimo)$/)) {
            return { intencao: 'SAUDACAO', resposta: Math.random() > 0.5 ? 'Que bom!|||Vai precisar de carro?' : 'Que otimo! Posso ajudar com alguma corrida?' };
        }
        
        // Detectar pedido para falar com responsável/dono
        if (msg.match(/(falar com|chamar|quero o|preciso do|passar para|fala com).*(responsável|responsavel|dono|gerente|chefe|proprietario|proprietário|admin)/) ||
            msg.match(/^(responsável|responsavel|dono|gerente|chefe)$/) ||
            msg.match(/(falar com o responsável|falar com responsável|quero falar com o dono)/)) {
            return { intencao: 'FALAR_RESPONSAVEL', notificarAdmin: true };
        }
        
        if (msg.match(/(obrigad|valeu|vlw|brigad|thanks)/)) {
            return { intencao: 'AGRADECIMENTO', resposta: Math.random() > 0.5 ? 'Imagina!|||Sempre que precisar' : 'Por nada! Qualquer coisa me chama' };
        }
        
        if (msg.match(/(tem carro|tem motorista|tem veiculo|tem veículo|disponivel|disponível|ta funcionando|tá funcionando|vocês atendem|voces atendem|aberto|atende agora)/)) {
            return { intencao: 'VERIFICAR_DISPONIBILIDADE', consultarMotoristas: true };
        }
        
        if (msg.match(/(quanto custa|qual o valor|tabela|preço|preco|quanto fica|valor da corrida)/)) {
            return { intencao: 'PERGUNTAR_PRECO' };
        }
        
        if (msg.match(/^(cancelar|cancela|desistir|desisto|nao quero|não quero)$/)) {
            return { intencao: 'CANCELAMENTO', resposta: 'Corrida cancelada! Quando precisar é só chamar.' };
        }
        
        // PERGUNTAS SOBRE A EMPRESA/ASSISTENTE
        if (msg.match(/(quem.*(é|e) voc|de onde|qual empresa|quem te criou|você é de onde|seu nome|como.*(chama|chamo)|qual.*nome)/i)) {
            return { intencao: 'SOBRE_EMPRESA', resposta: null }; // Resposta personalizada pelo admin
        }
        
        // ENCOMENDA - detectar primeiro (mais específico)
        if (msg.match(/(encomenda|entregar algo|buscar pacote|levar documento|retirar pedido|coleta|buscar.*e levar|pegar.*e entregar|levar.*pra|entregar.*em|mercadoria|buscar.*documento|retirar.*encomenda)/)) {
            return { intencao: 'SOLICITAR_ENCOMENDA', resposta: 'Certo! Vou precisar de algumas informações. Qual o endereço de coleta?' };
        }
        
        // PASSAGEIRO
        if (msg.match(/(quero um carro|preciso de carro|preciso de um carro|chama um carro|me busca|vem me buscar|preciso ir|quero ir|quero pedir|quero uma corrida|preciso de uma corrida)/)) {
            return { intencao: 'SOLICITAR_CORRIDA', resposta: Math.random() > 0.5 ? 'Beleza!|||Me passa o endereço' : 'Claro! Qual o endereço?' };
        }
        
        if (msg.match(/(rua|avenida|av\.|av |r\.|travessa|alameda|estrada)/) && msg.match(/\d{1,5}/)) {
            return { intencao: 'INFORMAR_ENDERECO_COMPLETO', temEndereco: true, temNumero: true };
        }
        
        if (msg.match(/(rua|avenida|av\.|av |r\.|travessa|alameda|estrada)/) && !msg.match(/\d{1,5}/)) {
            return { intencao: 'INFORMAR_ENDERECO_SEM_NUMERO', temEndereco: true, temNumero: false, resposta: 'Qual o número, por favor?' };
        }
        
        return null;
    },

    async classificarMensagem(mensagem, contexto = {}) {
        const regexResult = this.resolverComRegex(mensagem);
        
        if (regexResult) {
            if (regexResult.consultarMotoristas) {
                try {
                    const motoristas = await MotoristaService.listarDisponiveis(contexto.adminId);
                    if (motoristas.length > 0) {
                        regexResult.resposta = `Temos ${motoristas.length} motorista${motoristas.length > 1 ? 's' : ''} disponível agora! Me passa o endereço`;
                        regexResult.motoristasDisponiveis = motoristas.length;
                    } else {
                        regexResult.resposta = 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível?';
                        regexResult.motoristasDisponiveis = 0;
                        regexResult.oferecerFila = true;
                    }
                } catch(e) {
                    regexResult.resposta = 'Estamos funcionando sim! Me passa o endereço.';
                }
            }
            console.log('[REGEX] Resolvido:', regexResult.intencao);
            return { ...regexResult, usarIA: false, confianca: 1 };
        }

        if (!this.apiKey) {
            console.log('[OPENAI] API Key não configurada');
            return null;
        }

        let motoristasDisponiveis = 'Desconhecido';
        try {
            const motoristas = await MotoristaService.listarDisponiveis(contexto.adminId);
            motoristasDisponiveis = motoristas.length;
        } catch(e) {}

        const nomeEmpresa = contexto.nomeEmpresa || 'Central de Corridas';
        const nomeCliente = contexto.nome || 'Cliente';

        const humoreCliente = (() => {
            const txt = (contexto?.mensagem || '').toLowerCase();
            const bravo = ['absurdo','ridículo','ridiculoculo','ridículo','péssimo','horrível','lixo','vergonha','incompetência','incompetente','idiota','burro','inútil','raiva','ódio','revoltado','cancelar tudo','nunca mais','processo','reclamar','pqp','vsf','fdp','merda','droga','cacete','caramba que absurdo','caralho','capeta','porra','desgraça','desgraçado','maldito','inferno','imbecil','viado','otario','otário','palhaço','palhaçada','lixo de atendimento','que merda','que bosta','bosta','atende logo','atende urgente','urgente caralho','me atende','me atende logo'];
            const impaciente = ['cadê','cadê?','demora','demorou','quanto tempo','já faz','esperando','urgente','rápido','logo','agora','imediato'];
            if (bravo.some(p => txt.includes(p))) return 'BRAVO';
            if (impaciente.some(p => txt.includes(p))) return 'IMPACIENTE';
            return 'NORMAL';
        })();

        const instrucaoHumor = humoreCliente === 'BRAVO'
            ? 'ATENÇÃO: O cliente está BRAVO ou frustrado. Responda com empatia máxima, peça desculpas sinceras, não seja robótica, mostre que se importa de verdade. Nunca ignore a raiva. Ofereça solução concreta.'
            : humoreCliente === 'IMPACIENTE'
            ? 'O cliente está impaciente. Seja ágil, direta, sem enrolação. Passe segurança e velocidade na resposta.'
            : 'Atenda com calor humano e objetividade.';

        const etapaAtual = contexto.etapa || 'inicio';
        const dadosConversa = contexto.dadosConversa || {};
        const historicoTexto = (() => {
            const parts = [];
            if (dadosConversa.origem) parts.push('Origem já informada: ' + dadosConversa.origem);
            if (dadosConversa.destino) parts.push('Destino já informado: ' + dadosConversa.destino);
            if (dadosConversa.corridaId) parts.push('Corrida ativa em andamento');
            return parts.length ? parts.join(' | ') : 'Nenhum dado coletado ainda';
        })();

        const instrucaoEtapa = (() => {
            if (etapaAtual === 'pedir_origem') return 'ETAPA ATUAL: aguardando endereço de ORIGEM do cliente. Se ele mandar qualquer endereço ou local, classifique como INFORMAR_ENDERECO_COMPLETO.';
            if (etapaAtual === 'pedir_destino') return 'ETAPA ATUAL: aguardando endereço de DESTINO. Se ele mandar endereço, classifique como INFORMAR_ENDERECO_COMPLETO.';
            if (etapaAtual === 'pedir_numero_origem') return 'ETAPA ATUAL: aguardando número do endereço. Se mandar número, classifique como INFORMAR_ENDERECO_COMPLETO.';
            if (etapaAtual === 'aguardando_motorista') return 'ETAPA ATUAL: corrida solicitada, aguardando motorista aceitar. Cliente pode estar perguntando sobre status, reclamando de demora ou cancelando.';
            if (etapaAtual === 'confirmar_endereco_anterior') return 'ETAPA ATUAL: perguntei se é o mesmo endereço de antes. Cliente deve responder 1/sim ou 2/outro.';
            if (etapaAtual === 'inicio') return 'ETAPA ATUAL: início da conversa, nenhum dado coletado ainda.';
            return 'ETAPA ATUAL: ' + etapaAtual;
        })();

        const prompt = `Você é Rebeca, assistente comercial da ${nomeEmpresa}. ${instrucaoHumor}

Cliente: ${nomeCliente}
Motoristas disponíveis agora: ${motoristasDisponiveis}
${instrucaoEtapa}
Contexto da conversa: ${historicoTexto}

PERSONALIDADE E REGRAS:
- Fala de forma natural, calorosa, como uma atendente humana — NUNCA robótica
- Respostas curtas e diretas (máximo 2 linhas WhatsApp)
- Máximo 2 emojis por mensagem
- NUNCA diga "Aqui é a Rebeca" — o cliente já sabe com quem fala
- NUNCA diga "Como posso te ajudar" ou "Como posso ajudar com isso" — você já sabe o que faz: corridas
- NUNCA mencione o nome da empresa, NUNCA diga "da UBMAX" ou qualquer nome — isso soa como call center
- Raciocine sobre o CONTEXTO COMPLETO da conversa antes de responder — não responda só a última mensagem
- Quando cliente menciona horário/compromisso (amanhã, às X horas, tenho que estar): entenda que quer uma corrida e pergunte de onde sai
- Quando cliente manda saudação: reciproque naturalmente e pergunte se precisa de carro
- Quando cliente manda algo fora de contexto: responda brevemente e redirecione para corrida
- Quando cliente agradece: "Imagina! Qualquer coisa é só chamar 😊"
- Quando cliente manda endereço: confirme e providencie motorista

INTENÇÕES POSSÍVEIS:
- SAUDACAO — cliente cumprimentando
- SOLICITAR_CORRIDA — quer uma corrida/transporte para SI MESMO
- BUSCAR_TERCEIRO — quer que o motorista busque OUTRA PESSOA (mãe, pai, filho, amigo, alguém que não é o próprio cliente) — ex: "busca minha mãe", "pega meu filho na escola", "consegue ir buscar uma pessoa pra mim"
- SOLICITAR_ENCOMENDA — quer enviar objeto, pacote, encomenda, delivery
- INFORMAR_ENDERECO_COMPLETO — enviou endereço com número
- INFORMAR_ENDERECO_SEM_NUMERO — endereço sem número
- PERGUNTAR_PRECO — pergunta sobre valor/preço
- VERIFICAR_DISPONIBILIDADE — pergunta se tem carro disponível
- RECLAMACAO — insatisfeito com algo
- AGRADECIMENTO — agradecendo
- CANCELAMENTO — quer cancelar corrida
- FALAR_RESPONSAVEL — quer falar com dono/responsável/gerente
- AGENDAMENTO — cliente mencionou horário, data ou compromisso (ex: "amanhã cedinho", "às 6h", "tenho que estar lá") — isso É uma corrida com hora marcada, trate como SOLICITAR_CORRIDA
- OUTRO — mensagem completamente fora de contexto (ex: "manda dinheiro", "vida", conteúdo aleatório)

REGRAS DE ENDEREÇO (MUITO IMPORTANTE):
- Se o cliente mandar endereço com erro de digitação, vírgula faltando, número junto ao nome, abreviação — CORRIJA automaticamente e retorne no campo "endereco_corrigido"
- Exemplos de correção:
  "rua das flores123 centro" → "Rua das Flores, 123, Centro"
  "av paulista 1000 bela vista sp" → "Avenida Paulista, 1000, Bela Vista, São Paulo - SP"
  "r jose silva 45" → "Rua José Silva, 45"
  "travessa boa esperança s/n" → "Travessa Boa Esperança, S/N"
- Se o cliente mandar APENAS bairro ou cidade sem rua, pergunte a rua e número
- Se mandar rua sem número, pergunte o número (a menos que diga S/N)
- Se o nome do cliente for abreviado ou em minúsculas, capitalize corretamente no campo "nome_cliente_corrigido"
  ex: "joao silva" → "João Silva", "MARIA JOSE" → "Maria José"

REGRAS IMPORTANTES:
- Se intencao for BUSCAR_TERCEIRO: responda com entusiasmo confirmando que vai buscar a pessoa, ex: "Claro! Vou providenciar isso 😊 Qual o nome da pessoa que devo buscar?"
- Se intencao for SOLICITAR_ENCOMENDA: responda confirmando o serviço de entrega, ex: "Claro! Vou buscar um mototaxi para sua encomenda 📦"
- Se intencao for FALAR_RESPONSAVEL: responda com empatia e diga que vai chamar o responsável. notificar_admin: true
- Se intencao for AGENDAMENTO ou OUTRO: resposta educada explicando que cuida de corridas, pergunte se pode ajudar
- Se intencao for SOLICITAR_CORRIDA com endereço: resposta animada confirmando que vai buscar motorista
- Se intencao for RECLAMACAO: empatia total, peça desculpas, ofereça solução, notificar_admin: true
- Se humor_cliente for BRAVO: comece com empatia REAL, ex: "Oi! Já estou aqui, pode falar 😊" ou "Aqui estou! Me conta o que aconteceu 🙏" — NUNCA use frases genéricas ou formais demais. Seja humana, rápida e resolve.
- Nunca seja robótica ou genérica quando o cliente estiver bravo — seja humana e resolutiva
- humor_cliente deve ser: BRAVO, IMPACIENTE ou NORMAL

${contexto.contextoExtra || ''}

IDIOMA: Responda SEMPRE em português brasileiro. NUNCA use inglês em nenhuma circunstância.

Mensagem do cliente: "${mensagem}"

RETORNE APENAS JSON VÁLIDO (sem markdown):
{
  "intencao": "",
  "humor_cliente": "NORMAL",
  "endereco_corrigido": null,
  "nome_cliente_corrigido": null,
  "tem_endereco": true ou false,
  "tem_numero": true ou false,
  "resposta": "",
  "notificar_admin": false
}`;

        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 200,
                temperature: 0.4
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const texto = response.data.choices[0]?.message?.content?.trim();
            console.log('[OPENAI] Resposta:', texto);

            const jsonLimpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const resultado = JSON.parse(jsonLimpo);

            if (resultado.intencao === 'VERIFICAR_DISPONIBILIDADE') {
                if (motoristasDisponiveis > 0) {
                    resultado.resposta = `Temos ${motoristasDisponiveis} motorista${motoristasDisponiveis > 1 ? 's' : ''} disponível agora! Me passa o endereço`;
                } else {
                    resultado.resposta = 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível?';
                    resultado.oferecerFila = true;
                }
            }

            return {
                intencao: resultado.intencao,
                humorCliente: resultado.humor_cliente || humoreCliente,
                resposta: resultado.resposta,
                temEndereco: resultado.tem_endereco,
                temNumero: resultado.tem_numero,
                motoristasDisponiveis,
                oferecerFila: resultado.oferecerFila,
                notificarAdmin: resultado.notificar_admin || resultado.intencao === 'FALAR_RESPONSAVEL',
                usarIA: true,
                confianca: 0.95
            };
        } catch (e) {
            console.error('[OPENAI] Erro:', e.message);
            return null;
        }
    }
};

module.exports = OpenAIRebecaService;
