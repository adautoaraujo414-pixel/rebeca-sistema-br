const Anthropic = require('@anthropic-ai/sdk');

let clienteAnthropic = null;

const configIA = {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    modelo: 'claude-3-haiku-20240307',
    ativo: !!process.env.ANTHROPIC_API_KEY
};

// Inicializar se tiver API Key
if (configIA.apiKey) {
    clienteAnthropic = new Anthropic({ apiKey: configIA.apiKey });
    console.log('🤖 IA Claude inicializada!');
}

const IAService = {
    getConfig: () => ({
        modelo: configIA.modelo,
        ativo: configIA.ativo,
        configurado: !!configIA.apiKey
    }),

    setApiKey: (apiKey) => {
        configIA.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
        configIA.ativo = !!configIA.apiKey;
        if (configIA.apiKey) {
            clienteAnthropic = new Anthropic({ apiKey: configIA.apiKey });
        }
        return { sucesso: true, ativo: configIA.ativo };
    },

    setConfig: (config) => {
        if (config.apiKey !== undefined && config.apiKey) IAService.setApiKey(config.apiKey);
        if (config.modelo) configIA.modelo = config.modelo;
        if (config.ativo !== undefined) configIA.ativo = config.ativo && !!configIA.apiKey;
        return IAService.getConfig();
    },

    isAtivo: () => configIA.ativo && !!configIA.apiKey && !!clienteAnthropic,

    async analisarMensagem(mensagem, contexto = {}) {
        if (!IAService.isAtivo()) return { usarIA: false };

        try {
            const prompt = `Você é um assistente de análise para um app de táxi UBMAX.

Analise a mensagem e extraia informações em JSON.

CONTEXTO:
- Nome: ${contexto.nome || 'Cliente'}
- Etapa: ${contexto.etapa || 'inicio'}
- Favoritos: Casa=${contexto.temCasa ? 'Sim' : 'Não'}, Trabalho=${contexto.temTrabalho ? 'Sim' : 'Não'}

MENSAGEM: "${mensagem}"

Responda APENAS JSON válido:
{
  "intencao": "pedir_corrida|cotacao|cancelar|historico|precos|favoritos|atendente|rastrear|saudacao|pergunta|outro",
  "origem": "endereço ou null",
  "destino": "endereço ou null",
  "usarFavorito": "casa|trabalho|null",
  "observacao": "referência para motorista ou null",
  "pergunta": "pergunta do cliente ou null",
  "sentimento": "positivo|neutro|negativo|urgente",
  "confianca": 0.0 a 1.0
}

REGRAS:
- "casa", "minha casa", "em casa", "voltar pra casa" → usarFavorito: "casa"
- "trabalho", "empresa", "escritório" → usarFavorito: "trabalho"
- pedir corrida/carro/taxi/uber/me busca → intencao: "pedir_corrida"
- preço/valor/quanto custa/tabela → intencao: "precos" ou "cotacao"
- referências como "casa azul", "perto do mercado" → observacao`;

            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            });

            try {
                const analise = JSON.parse(response.content[0].text.trim());
                analise.usarIA = true;
                return analise;
            } catch (e) {
                return { usarIA: false };
            }
        } catch (error) {
            console.error('Erro IA:', error.message);
            return { usarIA: false, erro: error.message };
        }
    },

    async extrairEndereco(texto) {
        if (!IAService.isAtivo()) return { encontrado: false };

        try {
            const prompt = `Extraia endereço da mensagem. Se não houver, retorne encontrado: false.

Mensagem: "${texto}"

JSON apenas:
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

    async responderPergunta(pergunta, infoEmpresa = {}) {
        if (!IAService.isAtivo()) return null;

        try {
            const prompt = `Você é a Rebeca, assistente do UBMAX (táxi).

INFO DA EMPRESA:
- Taxa base: R$ ${infoEmpresa.taxaBase || 5}
- Por km: R$ ${infoEmpresa.precoKm || 2.50}
- Mínimo: R$ ${infoEmpresa.taxaMinima || 15}
- Horário: 24 horas
- Pagamento: Dinheiro, Pix, Cartão
- Área: Osasco e região

PERGUNTA: "${pergunta}"

Responda breve (máx 4 linhas). Se não souber, sugira falar com atendente.`;

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

    async testarConexao() {
        if (!configIA.apiKey) return { sucesso: false, erro: 'API Key não configurada' };

        try {
            if (!clienteAnthropic) {
                clienteAnthropic = new Anthropic({ apiKey: configIA.apiKey });
            }
            
            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 50,
                messages: [{ role: 'user', content: 'Responda apenas: OK' }]
            });

            configIA.ativo = true;
            return { sucesso: true, modelo: configIA.modelo, resposta: response.content[0].text };
        } catch (error) {
            return { sucesso: false, erro: error.message };
        }
    }
};

module.exports = IAService;
