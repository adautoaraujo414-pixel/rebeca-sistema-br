const Anthropic = require('@anthropic-ai/sdk');

let clienteAnthropic = null;

const configIA = {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    modelo: 'claude-3-haiku-20240307',
    ativo: false
};

const IAService = {
    // ==================== CONFIG ====================
    getConfig: () => ({
        modelo: configIA.modelo,
        ativo: configIA.ativo,
        configurado: !!configIA.apiKey
    }),

    setApiKey: (apiKey) => {
        configIA.apiKey = apiKey;
        configIA.ativo = !!apiKey;
        if (apiKey) {
            clienteAnthropic = new Anthropic({ apiKey });
        }
        return { sucesso: true, ativo: configIA.ativo };
    },

    setConfig: (config) => {
        if (config.apiKey !== undefined) IAService.setApiKey(config.apiKey);
        if (config.modelo) configIA.modelo = config.modelo;
        if (config.ativo !== undefined) configIA.ativo = config.ativo;
        return IAService.getConfig();
    },

    isAtivo: () => configIA.ativo && !!configIA.apiKey,

    // ==================== ANALISAR MENSAGEM ====================
    async analisarMensagem(mensagem, contexto = {}) {
        if (!IAService.isAtivo()) {
            return { usarIA: false };
        }

        try {
            const prompt = `Você é um assistente de análise de mensagens para um app de táxi/transporte chamado UBMAX.

Analise a mensagem do cliente e extraia as informações em JSON.

CONTEXTO DO CLIENTE:
- Nome: ${contexto.nome || 'Cliente'}
- Telefone: ${contexto.telefone || 'N/A'}
- Etapa atual: ${contexto.etapa || 'inicio'}
- Tem favoritos: Casa=${contexto.temCasa ? 'Sim' : 'Não'}, Trabalho=${contexto.temTrabalho ? 'Sim' : 'Não'}

MENSAGEM DO CLIENTE:
"${mensagem}"

Responda APENAS com JSON válido (sem markdown):
{
  "intencao": "pedir_corrida|cotacao|cancelar|historico|precos|favoritos|atendente|rastrear|saudacao|outro",
  "origem": "endereço extraído ou null",
  "destino": "endereço extraído ou null",
  "usarFavorito": "casa|trabalho|null",
  "observacao": "informação extra para motorista ou null",
  "pergunta": "pergunta do cliente ou null",
  "sentimento": "positivo|neutro|negativo|urgente",
  "confianca": 0.0 a 1.0
}

REGRAS:
- Se mencionar "casa", "minha casa", "em casa" → usarFavorito: "casa"
- Se mencionar "trabalho", "empresa", "escritório" → usarFavorito: "trabalho"
- Se pedir corrida/carro/taxi/uber → intencao: "pedir_corrida"
- Se perguntar preço/valor/quanto → intencao: "cotacao" ou "precos"
- Se mencionar endereço → extraia em "origem" ou "destino"
- Se tiver referência como "casa azul", "perto do mercado" → coloque em "observacao"`;

            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            });

            const textoResposta = response.content[0].text.trim();
            
            // Tentar parsear JSON
            try {
                const analise = JSON.parse(textoResposta);
                analise.usarIA = true;
                return analise;
            } catch (e) {
                // Se não conseguir parsear, extrair informações básicas
                console.log('Erro ao parsear resposta IA:', textoResposta);
                return { usarIA: false };
            }

        } catch (error) {
            console.error('Erro na IA:', error.message);
            return { usarIA: false, erro: error.message };
        }
    },

    // ==================== GERAR RESPOSTA NATURAL ====================
    async gerarResposta(contexto, dados) {
        if (!IAService.isAtivo()) {
            return null;
        }

        try {
            const prompt = `Você é a Rebeca, assistente virtual simpática do UBMAX (app de táxi).

Gere uma resposta curta e amigável para o cliente.

SITUAÇÃO:
${JSON.stringify(contexto, null, 2)}

DADOS:
${JSON.stringify(dados, null, 2)}

REGRAS:
- Seja breve (máximo 3 linhas)
- Use emojis moderadamente
- Seja simpática mas profissional
- Use *negrito* para destacar valores
- Não invente informações

Responda apenas com a mensagem, sem explicações.`;

            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }]
            });

            return response.content[0].text.trim();

        } catch (error) {
            console.error('Erro ao gerar resposta:', error.message);
            return null;
        }
    },

    // ==================== EXTRAIR ENDEREÇO DE TEXTO ====================
    async extrairEndereco(texto) {
        if (!IAService.isAtivo()) {
            return { encontrado: false };
        }

        try {
            const prompt = `Extraia o endereço da seguinte mensagem. Se não houver endereço claro, retorne encontrado: false.

Mensagem: "${texto}"

Responda APENAS com JSON:
{
  "encontrado": true/false,
  "endereco": "endereço formatado ou null",
  "numero": "número ou null",
  "bairro": "bairro ou null",
  "cidade": "cidade ou null",
  "referencia": "ponto de referência ou null",
  "confianca": 0.0 a 1.0
}`;

            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 200,
                messages: [{ role: 'user', content: prompt }]
            });

            return JSON.parse(response.content[0].text.trim());

        } catch (error) {
            return { encontrado: false, erro: error.message };
        }
    },

    // ==================== RESPONDER PERGUNTA ====================
    async responderPergunta(pergunta, infoEmpresa = {}) {
        if (!IAService.isAtivo()) {
            return null;
        }

        try {
            const prompt = `Você é a Rebeca, assistente do UBMAX (táxi/transporte).

INFORMAÇÕES DA EMPRESA:
- Taxa base: R$ ${infoEmpresa.taxaBase || 5}
- Preço por km: R$ ${infoEmpresa.precoKm || 2.50}
- Mínimo: R$ ${infoEmpresa.taxaMinima || 15}
- Horário: 24 horas
- Pagamento: Dinheiro, Pix, Cartão
- Área: Osasco e região

PERGUNTA DO CLIENTE:
"${pergunta}"

Responda de forma breve e útil (máximo 4 linhas). Se não souber, sugira falar com atendente.`;

            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }]
            });

            return response.content[0].text.trim();

        } catch (error) {
            return null;
        }
    },

    // ==================== TESTAR CONEXÃO ====================
    async testarConexao() {
        if (!configIA.apiKey) {
            return { sucesso: false, erro: 'API Key não configurada' };
        }

        try {
            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 50,
                messages: [{ role: 'user', content: 'Responda apenas: OK' }]
            });

            return { 
                sucesso: true, 
                modelo: configIA.modelo,
                resposta: response.content[0].text 
            };

        } catch (error) {
            return { sucesso: false, erro: error.message };
        }
    }
};

module.exports = IAService;
