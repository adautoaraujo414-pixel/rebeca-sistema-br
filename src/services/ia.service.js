const Anthropic = require('@anthropic-ai/sdk');

let clienteAnthropic = null;

const configIA = {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    modelo: 'claude-3-haiku-20240307',
    ativo: !!process.env.ANTHROPIC_API_KEY
};

if (configIA.apiKey) {
    clienteAnthropic = new Anthropic({ apiKey: configIA.apiKey });
    console.log('🤖 IA Claude inicializada!');
}

const IAService = {
    getConfig: () => ({ modelo: configIA.modelo, ativo: configIA.ativo, configurado: !!configIA.apiKey }),

    setApiKey: (apiKey) => {
        configIA.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
        configIA.ativo = !!configIA.apiKey;
        if (configIA.apiKey) clienteAnthropic = new Anthropic({ apiKey: configIA.apiKey });
        return { sucesso: true, ativo: configIA.ativo };
    },

    setConfig: (config) => {
        if (config.apiKey) IAService.setApiKey(config.apiKey);
        if (config.modelo) configIA.modelo = config.modelo;
        if (config.ativo !== undefined) configIA.ativo = config.ativo && !!configIA.apiKey;
        return IAService.getConfig();
    },

    isAtivo: () => configIA.ativo && !!configIA.apiKey && !!clienteAnthropic,

    async analisarMensagem(mensagem, contexto = {}) {
        if (!IAService.isAtivo()) return { usarIA: false };
        try {
            const prompt = `Analise para app de táxi. Contexto: ${JSON.stringify(contexto)}. Mensagem: "${mensagem}". Responda JSON: {"intencao":"pedir_corrida|cotacao|historico|precos|rastrear|saudacao|pergunta|outro","origem":null,"destino":null,"usarFavorito":"casa|trabalho|null","observacao":null,"confianca":0.9}`;
            const response = await clienteAnthropic.messages.create({ model: configIA.modelo, max_tokens: 300, messages: [{ role: 'user', content: prompt }] });
            const analise = JSON.parse(response.content[0].text.trim());
            analise.usarIA = true;
            return analise;
        } catch (e) { return { usarIA: false }; }
    },

    async extrairEndereco(texto) {
        if (!IAService.isAtivo()) return { encontrado: false };
        try {
            const prompt = `Extraia endereço: "${texto}". JSON: {"encontrado":true,"endereco":"...","referencia":"...","confianca":0.9}`;
            const response = await clienteAnthropic.messages.create({ model: configIA.modelo, max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
            return JSON.parse(response.content[0].text.trim());
        } catch (e) { return { encontrado: false }; }
    },

    async responderPergunta(pergunta, info = {}) {
        if (!IAService.isAtivo()) return null;
        try {
            const prompt = `Rebeca (táxi UBMAX). Taxa R$${info.taxaBase||5}, km R$${info.precoKm||2.5}, mín R$${info.taxaMinima||15}. Pergunta: "${pergunta}". Responda breve.`;
            const response = await clienteAnthropic.messages.create({ model: configIA.modelo, max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
            return response.content[0].text.trim();
        } catch (e) { return null; }
    },

    async testarConexao() {
        if (!configIA.apiKey) return { sucesso: false, erro: 'API Key não configurada' };
        try {
            if (!clienteAnthropic) clienteAnthropic = new Anthropic({ apiKey: configIA.apiKey });
            const response = await clienteAnthropic.messages.create({ model: configIA.modelo, max_tokens: 10, messages: [{ role: 'user', content: 'Diga OK' }] });
            configIA.ativo = true;
            return { sucesso: true, modelo: configIA.modelo, resposta: response.content[0].text };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    }
};

module.exports = IAService;
