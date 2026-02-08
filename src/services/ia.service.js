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
            const prompt = `Voce e Rebeca, atendente de transporte. Analise a mensagem e classifique.

EMPRESA: ${contexto.nomeEmpresa || 'UBMAX'}

REGRAS SIMPLES:
1. Se tem RUA/AVENIDA/NUMERO = pedir_corrida
2. Se tem "?" ou pergunta sobre servico = pergunta  
3. Se e so "oi/ola/bom dia" = saudacao
4. Se e "ok/sim/nao/certo/blz" = confirmacao
5. Se e "obrigado/valeu" = agradecimento
6. Se nao entender = outro

Mensagem: "${mensagem}"

Responda SOMENTE JSON (sem explicacao):
{"intencao":"pedir_corrida|pergunta|saudacao|confirmacao|agradecimento|outro","endereco":null,"respostaCurta":null,"confianca":0.9}

Se intencao=saudacao: respostaCurta="Oi! Pra onde vai?" (max 10 palavras)
Se intencao=pergunta: respostaCurta com resposta curta (max 15 palavras)
Se intencao=confirmacao: respostaCurta="Entendi! Me manda o endereco de onde voce esta."
Se intencao=agradecimento: respostaCurta="Por nada! Quando precisar, e so chamar."
Se intencao=outro: respostaCurta="Pra onde vai? Me manda o endereco ou localizacao."
Se intencao=pedir_corrida: endereco com o endereco extraido`;

            const response = await clienteAnthropic.messages.create({ 
                model: configIA.modelo, 
                max_tokens: 150, 
                messages: [{ role: 'user', content: prompt }] 
            });
            
            let texto = response.content[0].text.trim();
            // Extrair JSON se vier com texto extra
            const jsonMatch = texto.match(/\{[\s\S]*\}/);
            if (jsonMatch) texto = jsonMatch[0];
            
            const analise = JSON.parse(texto);
            analise.usarIA = true;
            return analise;
        } catch (e) { 
            console.log('[IA] Erro analise:', e.message);
            return { usarIA: false }; 
        }
    },

    async extrairEndereco(texto) {
        if (!IAService.isAtivo()) return { encontrado: false };
        try {
            const prompt = `Extraia endereco de: "${texto}"
Responda SOMENTE JSON: {"encontrado":true,"endereco":"Rua X 123","bairro":"Centro","referencia":"proximo ao mercado","confianca":0.9}
Se nao tiver endereco: {"encontrado":false}`;
            const response = await clienteAnthropic.messages.create({ model: configIA.modelo, max_tokens: 100, messages: [{ role: 'user', content: prompt }] });
            let texto2 = response.content[0].text.trim();
            const jsonMatch = texto2.match(/\{[\s\S]*\}/);
            if (jsonMatch) texto2 = jsonMatch[0];
            return JSON.parse(texto2);
        } catch (e) { return { encontrado: false }; }
    },

    async responderPergunta(pergunta, info = {}) {
        if (!IAService.isAtivo()) return null;
        try {
            const prompt = `Voce e Rebeca da ${info.nomeEmpresa || 'UBMAX'}. Responda em MAX 2 FRASES CURTAS.

INFO: Taxa minima R$${info.taxaMinima||15}, 24h, pix/dinheiro, motoristas verificados.

Pergunta: "${pergunta}"

Responda de forma CURTA e OBJETIVA. Sempre termine oferecendo ajuda pra chamar carro.`;
            const response = await clienteAnthropic.messages.create({ model: configIA.modelo, max_tokens: 100, messages: [{ role: 'user', content: prompt }] });
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
