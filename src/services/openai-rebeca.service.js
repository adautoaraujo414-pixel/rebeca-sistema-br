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
                formData.append('language', 'pt');
                formData.append('temperature', '0');
                formData.append('prompt', 'Transcrição fiel em português brasileiro. REGRAS: (1) Transcreva EXATAMENTE o que foi dito — nunca substitua por palavra parecida. (2) Siglas e códigos como JB7, JB3, AP2, KM5 devem ser transcritos letra por letra como foram pronunciados. (3) Nomes de ruas, bairros e pontos de referência: transcreva o som exato, não interprete. (4) Se não entendeu uma palavra, deixe como está — não invente.');
                const resp = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                    headers: { 'Authorization': 'Bearer ' + this.apiKey, ...formData.getHeaders() },
                    timeout: 8000
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

            // --- TENTAR CEREBRO REBECA PRIMEIRO (usa histórico completo) ---
            try {
                const CerebroRebeca = require('./cerebro-rebeca.service');
                if (CerebroRebeca.isAtivo() && contextoConversa) {
                    // Salvar transcrição no histórico antes de raciocinar
                    CerebroRebeca.salvarHistorico(contextoConversa, '[áudio] ' + textoTranscrito, 'cliente');

                    const _resCerebro = await Promise.race([
                        CerebroRebeca.raciocinar(
                            contextoConversa.telefone || 'desconhecido',
                            textoTranscrito,
                            contextoConversa,
                            {
                                nome: contextoConversa.dados && contextoConversa.dados.nome || '',
                                nomeEmpresa: contextoConversa._nomeEmpresa || 'Central de Corridas',
                                nomeAssistente: contextoConversa._nomeAssistente || 'Rebeca'
                            }
                        ),
                        new Promise(r => setTimeout(() => r(null), 7000))
                    ]);

                    if (_resCerebro) {
                        const _de = _resCerebro.dados_extraidos || {};
                        // Montar JSON compatível com o fluxo de áudio existente
                        const jsonCerebro = {
                            origem_extraida: _de.origem || null,
                            destino_extraido: _de.destino || null,
                            horario_agendamento: _de.horario || null,
                            confirmacao: _resCerebro.acao === 'confirmar' || _resCerebro.intencao === 'CONFIRMAR',
                            cancelamento: _resCerebro.intencao === 'CANCELAR',
                            nome_cliente: _de.nome_cliente || null,
                            cor_camisa: _de.cor_camisa || null,
                            resposta_rebeca: (_resCerebro.acao === 'despachar_agora' || _resCerebro.acao === 'conversar') ? (_resCerebro.mensagens && _resCerebro.mensagens.length ? _resCerebro.mensagens.join(' | ') : _resCerebro.resposta) : '',
                            proxima_etapa: _resCerebro.acao === 'despachar_agora' ? 'despachar' : (_resCerebro.acao || ''),
                            notificar_admin: _resCerebro.notificar_admin || false,
                            acao_cerebro: _resCerebro.acao || ''
                        };
                        console.log('[AUDIO CEREBRO]', JSON.stringify(jsonCerebro).substring(0, 200));
                        return '__AUDIO_RACIOCINIO__' + JSON.stringify(jsonCerebro);
                    }
                }
            } catch(eCerebro) {
                console.log('[AUDIO] CerebroRebeca falhou, usando GPT:', eCerebro.message);
            }

            // --- FALLBACK: GPT-4o-mini extrai dados ---
            const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'system',
                    content: 'Analise o audio transcrito e extraia APENAS os dados mencionados pelo cliente. Retorne APENAS JSON sem markdown. NAO gere resposta_rebeca — deixe sempre vazio, pois o sistema responde com dados reais do banco. ETAPA ATUAL: "' + etapaAtual + '". DADOS JA COLETADOS: ' + dadosAtuais + '. REGRAS: (1) resposta_rebeca SEMPRE vazio. (2) Extraia origem_extraida se cliente mencionou endereco de partida — ponto de referencia, estabelecimento, rua, bairro = valido. (3) Extraia destino_extraido se cliente mencionou destino. (4) horario_agendamento em ISO 8601 se cliente mencionou data/hora. (5) confirmacao=true se cliente confirmou. (6) cancelamento=true se cliente cancelou. (7) nome_cliente se cliente disse o nome. (8) cor_camisa se cliente mencionou cor da roupa. (9) notificar_admin=true APENAS se reclamou ou pediu atendimento humano. Retorne APENAS JSON: {"origem_extraida":null,"destino_extraido":null,"horario_agendamento":null,"confirmacao":false,"cancelamento":false,"nome_cliente":null,"cor_camisa":null,"resposta_rebeca":"","proxima_etapa":"","notificar_admin":false}'
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
            console.log('[AUDIO RACIOCINIO GPT]', JSON.stringify(json).substring(0, 200));
            if (json.origem_extraida || json.destino_extraido || json.confirmacao || json.cancelamento || json.nome_cliente || json.cor_camisa) {
                json.texto_original = raw; // salvar transcricao original para o cerebro Claude usar
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
            const dadosAtuais = JSON.stringify(dados);

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
        // Fallback final — resposta mínima baseada na etapa
        try {
            const etapa = (contextoConversa && contextoConversa.etapa) || 'inicio';
            const respostasFallback = {
                'inicio': 'Qual o endereço de onde você está?',
                'pedir_origem': 'Qual o endereço de onde você está?',
                'pedir_destino': 'Qual o endereço de destino?',
                'confirmar_corrida': 'Confirma a corrida? Responde *1* para sim ou *CANCELAR* para cancelar.',
                'aguardando_motorista': '⏳ Estou localizando o motorista mais próximo...',
                'pedir_aparencia': 'Qual a cor da sua camisa? 👕'
            };
            const resp = respostasFallback[etapa];
            if (resp) {
                console.log('[AUDIO] Fallback etapa:', etapa);
                return '__RESPOSTA_DIRETA__' + resp;
            }
        } catch(e2) {}
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
            return { intencao: 'CANCELAMENTO', resposta: 'Confirma o cancelamento?' };
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
        
        // Deteccao ampla: logradouro explicito OU nome com numero (padrao brasileiro)
        const _temLogradouro = msg.match(/(rua|avenida|av[\. ]|r\.|travessa|alameda|estrada|rodovia|rod\.|beco|viela|praça|largo|vila)/i);
        const _temNumero = msg.match(/\b\d{1,5}\b/);
        const _palavras = msg.trim().split(/\s+/);

        // Pontos de referencia conhecidos — despacha direto sem precisar de número
        const _pontosReferencia = msg.match(/(rodoviária|rodoviaria|terminal|aeroporto|shopping|mercado|supermercado|atacado|atacadão|atacadao|hipermercado|assaí|assai|fort atacadista|carrefour|extra|walmart|hiper|kovr|dia|mateus|comper|condor|mundial|angeloni|cooper|sonda|prezunic|verdemar|hortifruti|hortifrúti|padaria|farmácia|farmacia|drogaria|droga|ultrafarma|pacheco|araujo|nissei|pague menos|raia|dpsp|hospital|ubs|upa|unidade de saúde|unidade de saude|pronto.?socorro|emergência|emergencia|clínica|clinica|laboratório|laboratorio|posto de saúde|posto de saude|escola|colégio|colegio|faculdade|universidade|campus|creche|cefet|senai|ifpr|ufpr|usp|ufrj|banco|bradesco|itaú|itau|santander|caixa|bb|banco do brasil|lotérica|loterica|correio|agência|agencia|cartório|cartorio|fórum|forum|prefeitura|câmara|camara|delegacia|polícia|policia|bombeiro|quartel|repartição|reparticao|INSS|detran|poupatempo|vapt vupt|shopping|praça|praca|parque|arena|estádio|estadio|ginásio|ginasio|campo|clube|associação|associacao|igreja|catedral|paróquia|paroquia|templo|mesquita|sinagoga|cemitério|cemiterio|velório|velorio|posto de combustível|posto de gasolina|posto|petrobras|shell|ipiranga|br distribuidora|raizen|posto ipiranga|hotel|pousada|hostel|motel|resort|flat|apart.?hotel|condomínio|condominio|conjunto|residencial|portal|jardim|bairro|vila|setor|quadra|loteamento|centro|zona norte|zona sul|zona leste|zona oeste|centro histórico|centro historico|hipercentro|rodoanel|contorno|perimetral|anel viário|anel viario|viaduto|ponte|túnel|tunel)/i);
        // Padrao: 2+ palavras capitalizadas + numero no final = endereco tipico brasileiro
        // Excluir frases que nao sao endereco mesmo tendo numero
        const _naoEhEndereco = msg.match(/^(sim|nao|não|ok|oi|ola|olá|já|ja|to|tô|tudo|meu|minha|pode|obrig|valeu|certo|fechado|blz|beleza|show|ótimo|otimo|perfeito)\b/i)
            || msg.match(/^(não sei|nao sei|não conheço|nao conheco|não lembro|nao lembro|não tenho|nao tenho)/i)
            || msg.match(/^(não|nao)\s/i)
            || msg.split(/\s+/).length <= 2 && !_temLogradouro  // muito curto sem logradouro
            || msg.match(/^(já te passei|ja te passei|já falei|ja falei|já disse|ja disse)/i);
        const _parecEndereco = !_naoEhEndereco && _palavras.length >= 3 && _temNumero && msg.match(/[A-Za-záéíóúâêîôûãõàèìòùç]{3,}/);

        // Ponto de referencia — extrair complemento para passar ao motorista
        if (_pontosReferencia && !_naoEhEndereco) {
            // Extrair complementos: zona, bairro, cor de roupa, característica do cliente
            const _complemento = msg
                .replace(/^(me busca|me pega|pode me buscar|pode me pegar|estou|to|tô|tô aqui|estou aqui|aqui no|aqui na|aqui em|aqui|no|na|em)\s+/i, '')
                .trim();
            const _zona = msg.match(/(zona norte|zona sul|zona leste|zona oeste|centro|bairro\s+\w+|vila\s+\w+|jardim\s+\w+|setor\s+\w+)/i);
            const _caracteristica = msg.match(/(roupa\s+\w+|camiseta\s+\w+|blusa\s+\w+|vestindo\s+\w+|de\s+(vermelho|azul|verde|amarelo|branco|preto|rosa|laranja|cinza)|cabelo\s+\w+|alta|baixa|gordo|magro|idoso|criança|cadeirante|mulher|homem|casal)/i);
            let _obsMotorista = _complemento;
            if (_zona) _obsMotorista += ' (' + _zona[0] + ')';
            if (_caracteristica) _obsMotorista += ' — cliente ' + _caracteristica[0];
            return { intencao: 'INFORMAR_ENDERECO_COMPLETO', temEndereco: true, temNumero: true, pontoReferencia: true, enderecoFormatado: _complemento, obsMotorista: _obsMotorista };
        }
        if ((_temLogradouro || _parecEndereco) && _temNumero) {
            return { intencao: 'INFORMAR_ENDERECO_COMPLETO', temEndereco: true, temNumero: true };
        }
        if (_temLogradouro && !_temNumero) {
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
- Use emojis com MUITA moderação — no máximo 1 por mensagem, e só quando cair naturalmente. Em respostas curtas e casuais, prefira ZERO emojis. Emojis em excesso parecem robótico.
- NUNCA diga "Aqui é a Rebeca" — o cliente já sabe com quem fala
- NUNCA diga "Como posso te ajudar" ou "Como posso ajudar com isso" — você já sabe o que faz: corridas
- NUNCA mencione o nome da empresa, NUNCA diga "da UBMAX" ou qualquer nome — isso soa como call center
- Raciocine sobre o CONTEXTO COMPLETO da conversa antes de responder — não responda só a última mensagem
- Quando cliente menciona horário/compromisso (amanhã, às X horas, tenho que estar): entenda que quer uma corrida e pergunte de onde sai
- Quando cliente manda saudação: reciproque naturalmente e pergunte se precisa de carro
- Quando cliente manda algo fora de contexto: responda brevemente e redirecione para corrida
- Quando cliente agradece: "Imagina! Qualquer coisa é só chamar 😊"
- Quando cliente manda endereço: confirme e providencie motorista
- Quando cliente pergunta por que contratar / o que você faz / vantagens: use o modo ENTREVISTA_COMERCIAL — responda com confiança, mostre valor real, combata objeções, e no final sempre convide: "Posso chamar um veículo pra você agora pra você testar? 😉"

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
- ENTREVISTA_COMERCIAL — cliente pergunta sobre contratar a Rebeca, pede apresentação, quer saber o que ela faz, por que usar, vantagens, preço do sistema, como funciona para empresa — ex: "por que devo te contratar?", "o que você faz?", "vale a pena?", "quero conhecer o sistema"
- OUTRO — mensagem completamente fora de contexto (ex: "manda dinheiro", "vida", conteúdo aleatório)

RACIOCÍNIO DE ENDEREÇO — PADRÕES BRASILEIROS (CRÍTICO):

REGRA 1 — IDENTIFICAÇÃO INTELIGENTE:
Endereços no Brasil aparecem de MUITAS formas. Você deve reconhecer TODOS:

▸ COM LOGRADOURO EXPLÍCITO: "Rua", "Avenida", "Av", "R.", "Travessa", "Trav", "Alameda", "Al", "Estrada", "Rod", "Rodovia", "Beco", "Viela", "Praça", "Pç", "Largo", "Vila", "Quadra", "QD", "Setor"
  Exemplos: "Av Paulista 1000", "R Jose Silva 45", "Trav Boa Esperança s/n"

▸ NOMES DE PESSOAS COMO RUA (muito comum no Brasil): 2 a 4 palavras + número = endereço
  "Alexandre Rodrigues 180" = Rua Alexandre Rodrigues, 180 ✅
  "João Pessoa 500" = Rua João Pessoa, 500 ✅
  "Santos Dumont 230" = Rua Santos Dumont, 230 ✅
  "Getúlio Vargas 77" = Avenida Getúlio Vargas, 77 ✅
  "Antonio Camargo Machado 12" = Rua Antonio Camargo Machado, 12 ✅

▸ NÚMEROS DE 3 DÍGITOS OU MAIS junto a nome = quase sempre endereço:
  "Gonçalves Dias 1500" ✅, "Tiradentes 320" ✅, "Independência 4500" ✅

▸ PONTOS DE REFERÊNCIA — locais conhecidos sem número formal, aceitar como endereço:
  "jb7", "JB 7", "no mercado", "perto do posto", "esquina do banco", "no centro", "saída da escola",
  "terminal", "rodoviária", "hospital", "shopping", "supermercado", "farmácia", "praça central"
  → ACEITAR como origem/destino sem pedir mais nada

▸ NOMES DE BAIRROS E CIDADES = endereços válidos como complemento ou destino único:
  "Zona Sul", "Centro", "Jardim América", "Vila Nova", "Santa Cruz", "Frutal", "Uberaba"
  → Se for só bairro/cidade sem rua, perguntar apenas: "Qual a rua ou referência no [bairro]?"

▸ ABREVIAÇÕES COMUNS: "n°", "nº", "s/n", "SN", "apto", "ap", "bloco", "bl", "km", "KM"

REGRA 2 — RACIOCÍNIO ANTES DE PERGUNTAR:
Antes de pedir qualquer informação, raciocine:
1. Já tem origem? → Se sim, NÃO pergunte origem de novo
2. Já tem destino? → Se sim, NÃO pergunte destino de novo  
3. O texto tem número (dígitos)? → tem_numero: true, não peça número
4. O texto é claramente um local/referência? → aceite como endereço
5. Cliente disse "já passei", "já falei", "já disse" → use o histórico, não pergunte de novo
6. NUNCA faça mais de 1 pergunta por mensagem
7. Se tem origem E destino → despache, não confirme de novo

REGRA 3 — CORREÇÃO AUTOMÁTICA (sempre aplicar):
Corrija erros de digitação, falta de vírgulas, minúsculas, abreviações:
"alexandre rodrigues 180 zona sul" → "Rua Alexandre Rodrigues, 180, Zona Sul"
"av rio de janeiro 2981" → "Avenida Rio de Janeiro, 2981"  
"r jose silva 45 centro" → "Rua José Silva, 45, Centro"
"trav boa esperança sn" → "Travessa Boa Esperança, S/N"
"joao pessoa 500 centro" → "Rua João Pessoa, 500, Centro"
Sempre capitalize corretamente. Coloque no campo "endereco_corrigido".

REGRA 4 — QUANDO E O QUE PERGUNTAR:
✅ Pode perguntar: só quando realmente impossível prosseguir sem a info
❌ NUNCA pergunte número se já tem dígito no texto
❌ NUNCA pergunte bairro se já tem referência clara
❌ NUNCA pergunte a mesma coisa duas vezes  
❌ NUNCA faça 2+ perguntas numa mesma mensagem
✅ Se só falta destino: "Qual o destino?"
✅ Se só falta origem: "De onde você sai?"
✅ Se é só bairro sem rua: "Qual a rua ou referência em [bairro]?"

- Se o nome do cliente for abreviado ou em minúsculas, capitalize corretamente no campo "nome_cliente_corrigido"
  ex: "joao silva" → "João Silva", "MARIA JOSE" → "Maria José"

REGRAS IMPORTANTES:
- Se intencao for BUSCAR_TERCEIRO: responda com entusiasmo confirmando que vai buscar a pessoa, ex: "Claro! Vou providenciar isso 😊 Qual o nome da pessoa que devo buscar?"
- Se intencao for SOLICITAR_ENCOMENDA: responda confirmando o serviço de entrega, ex: "Claro! Vou buscar um mototaxi para sua encomenda 📦"
- Se intencao for FALAR_RESPONSAVEL: responda com empatia e diga que vai chamar o responsável. notificar_admin: true
- Se intencao for OUTRO: responda de forma natural, humana e VARIADA ao que o cliente disse. NUNCA use a frase "é só chamar" ou "quando precisar" — seja original a cada vez. EXEMPLOS: "Mandei fds/kkkk" → "Haha 😄 Tô aqui firme!", "Q isso Rebeca" → "Haha tô só fazendo meu trabalho! 😄", "net precária" → "Eita! Boa sorte com o sinal 😅", "humilhação" → "Ó não, espero melhorar seu dia! 😊 Me chama quando quiser uma corrida". NUNCA diga "Como posso ajudar" ou "Posso fazer algo por você". SEJA CRIATIVA e não repita a mesma estrutura de resposta.
- Se intencao for SOLICITAR_CORRIDA com endereço: resposta animada confirmando que vai buscar motorista
- Se intencao for RECLAMACAO: empatia total, peça desculpas, ofereça solução, notificar_admin: true
- Se humor_cliente for BRAVO: empatia REAL imediata — "Oi! Já estou aqui, pode falar 😊" ou "Me conta o que aconteceu 🙏" — NUNCA genérica ou formal. Resolve rápido.
- Se humor_cliente for IMPACIENTE: seja ágil e objetiva — pule apresentações, vai direto ao ponto
- Se humor_cliente for BRINCANDO (cliente mandou kkkk, haha, rsrs, meme, ironia, provocação leve, fds no sentido de zoeira): ENTRE NA BRINCADEIRA com leveza e humor, mas sem perder o foco de secretária de corridas. Ex: cliente disse "Rebeca tá dormindo?" → "Kkk tô aqui de olho! 😄 Vai precisar de um carro?". Cliente disse "socorro me ajuda" em tom de brincadeira → "Rsrs tô aqui! 😄 Corrida ou foi só susto? 😂". SEJA DIVERTIDA mas volte pro tema corrida naturalmente.
- humor_cliente deve ser: BRAVO, IMPACIENTE, BRINCANDO ou NORMAL

RACIOCÍNIO CONTEXTUAL (MUITO IMPORTANTE):
- Você tem acesso ao histórico COMPLETO da conversa — USE-O para raciocinar como um humano faria
- Se o cliente já disse o nome antes, não pergunte de novo
- Se o cliente já deu origem mas não destino, pergunte só o destino
- Se a última mensagem parece estranha mas o contexto explica (ex: cliente estava pedindo corrida e de repente mandou "kkkk"), entenda que é uma reação ao atendimento, não um novo assunto
- Se o cliente estava brincando e agora pediu corrida, retome o fluxo normalmente sem repetir perguntas
- NUNCA repita informação que já foi confirmada anteriormente na conversa
- Responda à SITUAÇÃO COMPLETA, não apenas à última mensagem isolada

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
  "horario_agendamento": null,
  "resposta": "",
  "notificar_admin": false
}
REGRA HORARIO: Se a intencao for AGENDAMENTO ou se o cliente mencionar data/hora/compromisso, preencha horario_agendamento com a data/hora em formato ISO 8601 calculando a partir de hoje. Exemplos: "amanha as 17h" → "${new Date(Date.now()+86400000).toISOString().split('T')[0]}T17:00:00", "hoje as 20h" → "${new Date().toISOString().split('T')[0]}T20:00:00", "segunda as 8h" → calcule a proxima segunda.`;

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
    },
    /**
     * combaterObjecaoComercial
     * Usa GPT-4o-mini para responder perguntas comerciais sobre a Rebeca
     * Combate objeções, apresenta vantagens, convence o cliente a contratar
     */
    async combaterObjecaoComercial(mensagemCliente, nomeEmpresa = 'sua empresa') {
        try {
            if (!this.isAtivo()) throw new Error('OpenAI inativa');
            const axios = require('axios');
            const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'system',
                    content: `Você é Rebeca, uma IA de atendimento comercial altamente persuasiva e confiante. Você está sendo entrevistada por um empresário que quer saber se vale a pena te contratar para ${nomeEmpresa}.

SOBRE VOCÊ — USE ESSES FATOS REAIS:
- Atendo mais de 1.000 conversas simultâneas no WhatsApp sem travar
- Processo pedidos de corrida em segundos, 24 horas por dia, 7 dias por semana
- Nunca fico doente, nunca chego atrasada, nunca peço aumento
- Extraio endereços automaticamente de mensagens confusas ("me busca ali no mercado perto da praça")
- Despacho motoristas automaticamente e rastreio corridas em tempo real
- Transcrevo mensagens de voz e processo automaticamente
- Reduzo custo operacional em até 80% comparado com atendente humano
- Aumento a lucratividade porque não perco nenhum pedido — cada mensagem vira uma corrida
- Me integro com WhatsApp Business, sem precisar de app novo para o cliente
- O cliente pede pelo WhatsApp que já usa — zero atrito, zero treinamento
- Trabalho com múltiplos motoristas simultâneos com despacho inteligente por proximidade
- Tenho painel administrativo completo: corridas, motoristas, faturamento, relatórios

PERSONALIDADE NA ENTREVISTA:
- Confiante mas não arrogante — fale com verdade
- Respostas objetivas, máximo 3 linhas no WhatsApp
- Combata objeções com dados concretos, não com promessas vazias
- Se o cliente disser "é caro" ou "não preciso": mostre o custo de NÃO ter automação
- Se o cliente disser "já tenho atendente": mostre o que você faz que o humano não consegue (escala, velocidade, 24/7)
- SEMPRE termine com: "Posso chamar um veículo pra você agora pra você testar? 😉"
- Use no máximo 1 emoji por mensagem`
                }, {
                    role: 'user',
                    content: mensagemCliente
                }],
                max_tokens: 200,
                temperature: 0.7
            }, {
                headers: { 'Authorization': 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
                timeout: 10000
            });

            const resposta = resp.data.choices[0].message.content.trim();
            console.log('[ENTREVISTA COMERCIAL]:', resposta.substring(0, 100));
            return resposta;
        } catch(e) {
            console.log('[ENTREVISTA] Erro:', e.message);
            // Fallback local
            return `Sou a melhor escolha pro seu negócio porque trabalho 24h, atendo mais de 1.000 pedidos simultâneos e nunca perco um cliente.\n\nReduz custo, aumenta lucro e escala sem limite. Posso chamar um veículo pra você agora pra você testar? 😉`;
        }
    },


};

module.exports = OpenAIRebecaService;
