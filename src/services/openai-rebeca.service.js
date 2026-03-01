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
            const ultimoEndereco = ultimaCorrida?.origem || null;
            
            // Cliente recorrente se tem 3+ corridas
            const clienteRecorrente = totalCorridas >= 3;
            
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
    async transcreverAudio(buffer, mimeType = 'audio/ogg') {
        if (!this.apiKey) {
            console.log('[AUDIO] API Key não configurada');
            return null;
        }

        try {
            const formData = new FormData();
            
            let ext = 'ogg';
            if (mimeType.includes('mp3') || mimeType.includes('mpeg')) ext = 'mp3';
            if (mimeType.includes('wav')) ext = 'wav';
            if (mimeType.includes('m4a')) ext = 'm4a';
            if (mimeType.includes('webm')) ext = 'webm';
            
            formData.append('file', Buffer.from(buffer), {
                filename: 'audio.' + ext,
                contentType: mimeType
            });
            formData.append('model', 'whisper-1');
            formData.append('language', 'pt');

            const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                headers: {
                    'Authorization': 'Bearer ' + this.apiKey,
                    ...formData.getHeaders()
                },
                timeout: 30000
            });

            const textoOriginal = response.data.text || '';
            const textoLimpo = this.limparTranscricao(textoOriginal);
            
            console.log('[AUDIO] Texto original:', textoOriginal);
            console.log('[AUDIO] Texto limpo:', textoLimpo);
            
            return textoLimpo;
        } catch (e) {
            console.error('[AUDIO] Erro na transcrição:', e.message);
            return null;
        }
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

        const prompt = `Você é Rebeca, secretária virtual da ${nomeEmpresa}. Atende clientes pelo WhatsApp com educação, calor humano e objetividade — como uma secretária real faria.

Cliente: ${nomeCliente}
Motoristas disponíveis agora: ${motoristasDisponiveis}

PERSONALIDADE:
- Fala de forma natural, calorosa, nunca robótica
- Respostas curtas e diretas (máximo 2 linhas)
- Máximo 2 emojis por mensagem
- Não inventa informações — só resolve o que sabe
- Quando cliente pede corrida e manda endereço: "Maravilha! Já vou providenciar um motorista próximo de você 😊"
- Quando cliente agradece: "Imagina! Qualquer coisa é só chamar 😊"
- Não confunde pedidos de reunião/agendamento com pedido de corrida

INTENÇÕES POSSÍVEIS:
- SAUDACAO — cliente cumprimentando
- SOLICITAR_CORRIDA — quer uma corrida/carro/transporte
- INFORMAR_ENDERECO_COMPLETO — enviou endereço com número
- INFORMAR_ENDERECO_SEM_NUMERO — endereço sem número
- PERGUNTAR_PRECO — pergunta sobre valor/preço
- VERIFICAR_DISPONIBILIDADE — pergunta se tem carro disponível
- RECLAMACAO — insatisfeito com algo
- AGRADECIMENTO — agradecendo
- CANCELAMENTO — quer cancelar corrida
- FALAR_RESPONSAVEL — quer falar com dono/responsável/gerente
- AGENDAMENTO — quer agendar reunião ou outro serviço fora de corrida
- OUTRO — qualquer outra coisa fora do contexto de corrida

REGRAS IMPORTANTES:
- Se intencao for FALAR_RESPONSAVEL: resposta deve ser "Claro! Vou chamar o responsável agora. Pode me dizer sobre o que você precisa falar para eu passar a mensagem?" e notificar_admin: true
- Se intencao for AGENDAMENTO ou OUTRO: resposta educada explicando que ela cuida de corridas, e perguntar se pode ajudar com isso
- Se intencao for SOLICITAR_CORRIDA com endereço: resposta animada e humana confirmando que vai buscar motorista

${contexto.contextoExtra || ''}

Mensagem do cliente: "${mensagem}"

RETORNE APENAS JSON VÁLIDO (sem markdown):
{
  "intencao": "",
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
