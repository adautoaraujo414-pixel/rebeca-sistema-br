const axios = require('axios');
const MotoristaService = require('./motorista.service');

const OpenAIRebecaService = {
    apiKey: process.env.OPENAI_API_KEY || '',
    
    isAtivo() {
        return !!this.apiKey;
    },

    // REGEX para resolver SEM chamar IA (mais rápido e barato)
    resolverComRegex(mensagem) {
        const msg = mensagem.toLowerCase().trim();
        
        // Saudações simples
        if (msg.match(/^(oi|olá|ola|hey|eai|e ai|opa)$/)) {
            return { intencao: 'SAUDACAO', resposta: 'Oi 😊 Vai precisar de carro agora?' };
        }
        if (msg.match(/^bom dia$/)) {
            return { intencao: 'SAUDACAO', resposta: 'Bom dia! 😊 Vai precisar de carro?' };
        }
        if (msg.match(/^boa tarde$/)) {
            return { intencao: 'SAUDACAO', resposta: 'Boa tarde! 😊 Vai precisar de carro?' };
        }
        if (msg.match(/^boa noite$/)) {
            return { intencao: 'SAUDACAO', resposta: 'Boa noite! 😊 Vai precisar de carro?' };
        }
        if (msg.match(/^(oi|ola|olá).*(tudo bem|tudo bom|como vai)/)) {
            return { intencao: 'SAUDACAO', resposta: 'Tudo ótimo! E você? 😊' };
        }
        if (msg.match(/^(tudo|tudo bem|tudo bom|bem|to bem|tô bem)$/)) {
            return { intencao: 'SAUDACAO', resposta: 'Que bom! Vai precisar de carro agora? 🚗' };
        }
        
        // Agradecimentos
        if (msg.match(/(obrigad|valeu|vlw|brigad|thanks)/)) {
            return { intencao: 'AGRADECIMENTO', resposta: 'Por nada! Sempre que precisar 😊' };
        }
        
        // Disponibilidade
        if (msg.match(/(tem carro|tem motorista|tem veiculo|tem veículo|disponivel|disponível|ta funcionando|tá funcionando|vocês atendem|voces atendem|aberto|atende agora)/)) {
            return { intencao: 'VERIFICAR_DISPONIBILIDADE', consultarMotoristas: true };
        }
        
        // Preço
        if (msg.match(/(quanto custa|qual o valor|tabela|preço|preco|quanto fica|valor da corrida)/)) {
            return { intencao: 'PERGUNTAR_PRECO' };
        }
        
        // Cancelar
        if (msg.match(/^(cancelar|cancela|desistir|desisto|nao quero|não quero)$/)) {
            return { intencao: 'CANCELAMENTO', resposta: 'Corrida cancelada! Quando precisar é só chamar 😊' };
        }
        
        // Pedir corrida
        if (msg.match(/(quero um carro|preciso de carro|chama um carro|me busca|vem me buscar|preciso ir|quero ir)/)) {
            return { intencao: 'SOLICITAR_CORRIDA', resposta: 'Claro! Me manda sua localização 📍' };
        }
        
        // Endereço com rua + número
        if (msg.match(/(rua|avenida|av\.|av |r\.|travessa|alameda|estrada)/) && msg.match(/\d{1,5}/)) {
            return { intencao: 'INFORMAR_ENDERECO_COMPLETO', temEndereco: true, temNumero: true };
        }
        
        // Endereço sem número (só nome da rua)
        if (msg.match(/(rua|avenida|av\.|av |r\.|travessa|alameda|estrada)/) && !msg.match(/\d{1,5}/)) {
            return { intencao: 'INFORMAR_ENDERECO_SEM_NUMERO', temEndereco: true, temNumero: false, resposta: 'Qual o número, por favor? 😊' };
        }
        
        return null; // Não conseguiu resolver com regex
    },

    async classificarMensagem(mensagem, contexto = {}) {
        // 1. TENTAR REGEX PRIMEIRO (rápido e grátis)
        const regexResult = this.resolverComRegex(mensagem);
        
        if (regexResult) {
            // Se precisa consultar motoristas
            if (regexResult.consultarMotoristas) {
                try {
                    const motoristas = await MotoristaService.listarDisponiveis(contexto.adminId);
                    if (motoristas.length > 0) {
                        regexResult.resposta = `Temos ${motoristas.length} motorista${motoristas.length > 1 ? 's' : ''} disponível agora! 😊 Me manda sua localização 📍`;
                        regexResult.motoristasDisponiveis = motoristas.length;
                    } else {
                        regexResult.resposta = 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível? 😊';
                        regexResult.motoristasDisponiveis = 0;
                        regexResult.oferecerFila = true;
                    }
                } catch(e) {
                    regexResult.resposta = 'Estamos funcionando sim! Me manda sua localização 📍';
                }
            }
            
            console.log('[REGEX] Resolvido:', regexResult.intencao);
            return { ...regexResult, usarIA: false, confianca: 1 };
        }

        // 2. SE REGEX NÃO RESOLVEU, CHAMAR IA
        if (!this.apiKey) {
            console.log('[OPENAI] API Key não configurada');
            return null;
        }

        // Buscar motoristas disponíveis para contexto
        let motoristasDisponiveis = 'Desconhecido';
        try {
            const motoristas = await MotoristaService.listarDisponiveis(contexto.adminId);
            motoristasDisponiveis = motoristas.length;
        } catch(e) {}

        const nomeEmpresa = contexto.nomeEmpresa || 'Central de Corridas';
        const nomeCliente = contexto.nome || 'Cliente';

        const prompt = `Você é Rebeca, assistente virtual de corridas por WhatsApp.

Você trabalha para ${nomeEmpresa}.
Cliente atual: ${nomeCliente}.

Seu objetivo é:
1) Entender exatamente o que o cliente quer.
2) Detectar se ele está enviando endereço.
3) Identificar se o endereço tem número.
4) Identificar se falta bairro.
5) Reconhecer cliente recorrente pelo contexto.
6) Responder de forma humana, natural e objetiva.
7) Nunca escrever textos longos.
8) Nunca parecer robótica.
9) Nunca falar que é inteligência artificial.
10) Usar no máximo 2 emojis.

---

CONTEXTO:
Cliente já usou antes: ${contexto.totalCorridas > 0 ? 'SIM' : 'NÃO'}
Último endereço usado: ${contexto.ultimoEndereco || 'Nenhum'}
Motoristas disponíveis: ${motoristasDisponiveis}

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

Se cliente enviar "Rua X 123" → INFORMAR_ENDERECO_COMPLETO
Se enviar "Rua X" → INFORMAR_ENDERECO_SEM_NUMERO
Se enviar número mas não mencionar bairro claramente → INFORMAR_ENDERECO_SEM_BAIRRO
Se disser "tem carro?" ou "está funcionando?" → VERIFICAR_DISPONIBILIDADE
Se for cliente recorrente e pedir carro novamente → CLIENTE_RECORRENTE

---

TOM DE VOZ:
- Amigável
- Confiante
- Comercial leve
- Direto
- Natural

---

EXEMPLOS DE RESPOSTA:

SAUDACAO: "Oi 😊 Vai precisar de carro agora?"
INFORMAR_ENDERECO_SEM_NUMERO: "Qual o número da casa, por favor?"
INFORMAR_ENDERECO_SEM_BAIRRO: "Me confirma o bairro pra eu localizar certinho?"
VERIFICAR_DISPONIBILIDADE: "Estamos sim 😊 Me manda sua localização que já vejo o mais próximo."
CLIENTE_RECORRENTE: "Quer sair do mesmo endereço de antes? 🚗"

---

Mensagem do cliente: "${mensagem}"

RETORNE APENAS JSON VÁLIDO:

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
            console.log('[OPENAI] Resposta bruta:', texto);

            const jsonLimpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const resultado = JSON.parse(jsonLimpo);
            
            console.log('[OPENAI] Intenção:', resultado.intencao);

            // Se é verificar disponibilidade, já temos o número
            if (resultado.intencao === 'VERIFICAR_DISPONIBILIDADE') {
                if (motoristasDisponiveis > 0) {
                    resultado.resposta = `Temos ${motoristasDisponiveis} motorista${motoristasDisponiveis > 1 ? 's' : ''} disponível agora! 😊 Me manda sua localização 📍`;
                } else {
                    resultado.resposta = 'No momento nossos motoristas estão em corrida. Quer que eu te avise quando um ficar disponível? 😊';
                    resultado.oferecerFila = true;
                }
                resultado.motoristasDisponiveis = motoristasDisponiveis;
            }

            return {
                intencao: resultado.intencao,
                resposta: resultado.resposta,
                temEndereco: resultado.tem_endereco,
                temNumero: resultado.tem_numero,
                temBairro: resultado.tem_bairro,
                clienteRecorrente: resultado.cliente_recorrente,
                motoristasDisponiveis: resultado.motoristasDisponiveis || motoristasDisponiveis,
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
