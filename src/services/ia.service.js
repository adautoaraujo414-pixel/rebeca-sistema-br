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
        
        const msgLower = mensagem.toLowerCase().trim();
        
        // Verificar se parece endereço (tem rua/av/número)
        const pareceEndereco = /\b(rua|avenida|av|travessa|alameda|rodovia|estrada)\b/i.test(mensagem) || 
            (/\d{2,}/.test(mensagem) && mensagem.split(/\s+/).length >= 2);
        
        if (pareceEndereco) {
            return { usarIA: true, intencao: 'pedir_corrida', endereco: mensagem };
        }
        
        // Frases comuns - respostas HUMANAS e DIRETAS
        if (msgLower.match(/^(oi|ola|olá|e ai|eai|opa)$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Oi! Onde te busco? 🚗' };
        }
        if (msgLower.match(/(bom dia)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Bom dia! Onde te busco? 🚗' };
        }
        if (msgLower.match(/(boa tarde)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa tarde! Onde te busco? 🚗' };
        }
        if (msgLower.match(/(boa noite)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa noite! Onde te busco? 🚗' };
        }
        if (msgLower.match(/(tudo bem|como vai|tudo certo)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Tudo ótimo! Onde mando o carro? 🚗' };
        }
        if (msgLower.match(/(obrigad|valeu|vlw|brigad)/)) {
            return { usarIA: true, intencao: 'agradecimento', respostaCurta: 'Por nada! Sempre que precisar! 🚗' };
        }
        if (msgLower.match(/(ok|sim|certo|beleza|blz|ta|tá|show|perfeito|entendi|pode ser|isso|vamos|bora)/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: 'Beleza! Qual seu endereço? 📍' };
        }
        if (msgLower.match(/(ja te mandei|ja mandei|te mandei|mandei)/)) {
            return { usarIA: true, intencao: 'outro', respostaCurta: 'Desculpa! Manda o endereço de novo? 😊' };
        }
        if (msgLower.match(/(maravilha|otimo|ótimo|legal|massa|top)/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: 'Qual endereço te busco? 📍' };
        }
        if (msgLower.match(/(tem carro|carro disponivel|disponível|veiculo)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Sim! Qual seu endereço? 📍' };
        }
        if (msgLower.match(/(empresa|sobre|voces|vocês|serviço|servico)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Somos transporte por app! Onde te busco? 🚗' };
        }
        if (msgLower.match(/(busca|me busca|pega|me pega|vem|venha)/)) {
            return { usarIA: true, intencao: 'pedir_corrida', respostaCurta: 'Qual seu endereço? 📍' };
        }
        
        // Se não identificou, pedir endereço de forma natural
        return { usarIA: true, intencao: 'outro', respostaCurta: 'Qual seu endereço? 📍' };
    },

    async responderPergunta(pergunta, contexto = {}) {
        if (!IAService.isAtivo()) return null;
        try {
            const prompt = `Responda em NO MÁXIMO 10 palavras, de forma natural e simpática:
"${pergunta}"`;

            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 50,
                messages: [{ role: 'user', content: prompt }]
            });
            
            return response.content[0].text.trim();
        } catch (e) {
            return null;
        }
    }
};

module.exports = IAService;
