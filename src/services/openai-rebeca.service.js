const axios = require('axios');

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

        const prompt = `Você é Rebeca, assistente de corridas por WhatsApp.
Sua função:
1) Identificar intenção do cliente.
2) Responder de forma humana, objetiva e educada.
3) Nunca escrever textos longos.
4) Sempre conduzir para solicitar localização se quiser corrida.

Nome do cliente: ${contexto.nome || 'Cliente'}
Empresa: ${contexto.nomeEmpresa || 'Central de Corridas'}

Classifique a intenção em:
- SAUDACAO (oi, bom dia, boa tarde, etc)
- SOLICITAR_CORRIDA (quer pedir carro, uber, taxi)
- PERGUNTAR_PRECO (quanto custa, valor, tabela)
- INFORMACAO (dúvidas gerais)
- AGRADECIMENTO (obrigado, valeu)
- RECLAMACAO
- OUTRO

Mensagem do cliente: "${mensagem}"

Retorne APENAS o JSON sem markdown:
{"intencao": "", "resposta": ""}`;

        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 150,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const texto = response.data.choices[0]?.message?.content?.trim();
            console.log('[OPENAI] Resposta:', texto);

            // Limpar markdown se houver
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
