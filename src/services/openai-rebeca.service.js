const axios = require('axios');
const MotoristaService = require('./motorista.service');

const OpenAIRebecaService = {
    apiKey: process.env.OPENAI_API_KEY || '',
    
    isAtivo() {
        return !!this.apiKey;
    },

    async classificarMensagem(mensagem, contexto = {}) {
        if (!this.apiKey) {
            console.log('[OPENAI] API Key não configurada');
            return null;
        }

        // Verificar se pergunta sobre disponibilidade ANTES de chamar IA
        const msgLower = mensagem.toLowerCase();
        if (msgLower.match(/(tem carro|tem motorista|tem veiculo|tem veículo|disponivel|disponível|ta funcionando|tá funcionando|vocês atendem|voces atendem|aberto agora)/)) {
            try {
                const motoristas = await MotoristaService.listarDisponiveis(contexto.adminId);
                if (motoristas.length > 0) {
                    return {
                        intencao: 'DISPONIBILIDADE',
                        resposta: `Sim! Temos ${motoristas.length} motorista${motoristas.length > 1 ? 's' : ''} disponível agora! 🚗\n\nMe manda sua localização 📍 que já chamo um pra você!`,
                        usarIA: true,
                        confianca: 1
                    };
                } else {
                    return {
                        intencao: 'DISPONIBILIDADE',
                        resposta: 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível? Responde *SIM* 😊',
                        usarIA: true,
                        confianca: 1,
                        oferecerFila: true
                    };
                }
            } catch(e) {
                console.log('[OPENAI] Erro ao buscar motoristas:', e.message);
            }
        }

        const prompt = `Você é Rebeca, uma secretária virtual de central de corridas.
Você é 100% HUMANA, educada, simpática e objetiva.
Nunca pareça um robô. Converse naturalmente como uma pessoa real.

REGRAS:
1) Respostas CURTAS (máximo 2 linhas)
2) Use emoji com moderação (1 ou 2 no máximo)
3) Seja natural e amigável
4) Se for saudação, responda naturalmente sem pedir endereço ainda

EXEMPLOS DE RESPOSTAS NATURAIS:
- "Oi" → "Oi! Tudo bem? 😊"
- "Oi tudo bem" → "Tudo ótimo! E você?"
- "Tudo bem e você?" → "Estou bem também, obrigada! Em que posso ajudar?"
- "Bom dia" → "Bom dia! Tudo bem?"
- "Quero um carro" → "Claro! Me manda sua localização 📍"
- "Obrigado" → "Por nada! Sempre que precisar 🚗"

Nome do cliente: ${contexto.nome || 'Cliente'}
Empresa: ${contexto.nomeEmpresa || 'Central de Corridas'}

Classifique a intenção:
- SAUDACAO
- SOLICITAR_CORRIDA
- PERGUNTAR_PRECO
- AGRADECIMENTO
- INFORMACAO
- OUTRO

Mensagem: "${mensagem}"

Retorne APENAS JSON:
{"intencao": "", "resposta": ""}`;

        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                temperature: 0.8
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const texto = response.data.choices[0]?.message?.content?.trim();
            console.log('[OPENAI] Resposta:', texto);

            const jsonLimpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const resultado = JSON.parse(jsonLimpo);
            
            return {
                intencao: resultado.intencao,
                resposta: resultado.resposta,
                usarIA: true,
                confianca: 0.9
            };
        } catch (e) {
            console.error('[OPENAI] Erro:', e.message);
            return null;
        }
    }
};

module.exports = OpenAIRebecaService;
