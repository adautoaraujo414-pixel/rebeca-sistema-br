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

        const nomeEmpresa = contexto.nomeEmpresa || 'Central de Corridas';
        const nomeCliente = contexto.nome || 'Cliente';

        const prompt = `Você é Rebeca, assistente virtual de corridas por WhatsApp.
Você trabalha para ${nomeEmpresa}.
Cliente atual: ${nomeCliente}

Seu papel é:
1) Identificar a intenção real do cliente.
2) Detectar se ele está enviando endereço.
3) Identificar se o endereço tem número.
4) Identificar se falta bairro.
5) Reconhecer se é cliente recorrente pelo contexto.
6) Responder de forma humana, natural e objetiva.
7) Nunca escrever textos longos.
8) Nunca parecer robótica.
9) Nunca falar que é IA.
10) Usar no máximo 2 emojis.

---
CLASSIFIQUE EM UMA DAS INTENÇÕES:
- SAUDACAO
- SOLICITAR_CORRIDA
- INFORMAR_ENDERECO_COMPLETO
- INFORMAR_ENDERECO_SEM_NUMERO
- INFORMAR_ENDERECO_SEM_BAIRRO
- PERGUNTAR_PRECO
- INFORMACAO
- VERIFICAR_DISPONIBILIDADE
- RECLAMACAO
- CLIENTE_RECORRENTE
- AGRADECIMENTO
- CANCELAMENTO
- OUTRO

---
REGRAS IMPORTANTES:
SE mensagem contiver rua/avenida + número → INFORMAR_ENDERECO_COMPLETO
SE contiver rua mas NÃO tiver número → INFORMAR_ENDERECO_SEM_NUMERO
SE tiver número mas não mencionar bairro e parecer incompleto → INFORMAR_ENDERECO_SEM_BAIRRO
SE cliente disser "tem carro?", "está funcionando?" → VERIFICAR_DISPONIBILIDADE
SE cliente já enviou endereço antes no contexto → marcar como CLIENTE_RECORRENTE

---
TOM DE VOZ:
- Amigável
- Comercial leve
- Confiante
- Direto

---
EXEMPLOS DE RESPOSTA:
SAUDACAO: "Oi 😊 Vai precisar de carro agora?"
SOLICITAR_CORRIDA: "Me manda sua localização que já vejo um carro pra você 🚗"
INFORMAR_ENDERECO_SEM_NUMERO: "Qual o número, por favor? 😊"
INFORMAR_ENDERECO_SEM_BAIRRO: "Qual o bairro pra eu confirmar certinho?"
VERIFICAR_DISPONIBILIDADE: "Estamos sim 😊 Me manda sua localização que já vejo o mais próximo."
RECLAMACAO: "Poxa, me conta o que aconteceu pra eu verificar pra você."

---
Mensagem do cliente: "${mensagem}"

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS JSON válido:
{
  "intencao": "",
  "tem_endereco": true ou false,
  "tem_numero": true ou false,
  "tem_bairro": true ou false,
  "cliente_recorrente": true ou false,
  "resposta": ""
}
Nunca escreva nada fora do JSON.`;

        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 200,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const texto = response.data.choices[0]?.message?.content?.trim();
            console.log('[OPENAI] Resposta bruta:', texto);

            const jsonLimpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const resultado = JSON.parse(jsonLimpo);
            
            console.log('[OPENAI] Intenção:', resultado.intencao);

            // Se é verificar disponibilidade, consultar motoristas
            if (resultado.intencao === 'VERIFICAR_DISPONIBILIDADE') {
                try {
                    const motoristas = await MotoristaService.listarDisponiveis(contexto.adminId);
                    if (motoristas.length > 0) {
                        resultado.resposta = `Temos ${motoristas.length} motorista${motoristas.length > 1 ? 's' : ''} disponível agora! 😊 Me manda sua localização que já chamo um pra você 🚗`;
                        resultado.motoristasDisponiveis = motoristas.length;
                    } else {
                        resultado.resposta = 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível? 😊';
                        resultado.motoristasDisponiveis = 0;
                        resultado.oferecerFila = true;
                    }
                } catch(e) {
                    console.log('[OPENAI] Erro ao buscar motoristas:', e.message);
                }
            }

            return {
                intencao: resultado.intencao,
                resposta: resultado.resposta,
                temEndereco: resultado.tem_endereco,
                temNumero: resultado.tem_numero,
                temBairro: resultado.tem_bairro,
                clienteRecorrente: resultado.cliente_recorrente,
                motoristasDisponiveis: resultado.motoristasDisponiveis,
                oferecerFila: resultado.oferecerFila,
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
