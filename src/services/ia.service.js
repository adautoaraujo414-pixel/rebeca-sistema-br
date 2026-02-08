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

// Variar respostas para não repetir
const variacoes = {
    confirmacao: ['Perfeito', 'Show', 'Ótimo', 'Beleza', 'Combinado'],
    pedir_endereco: ['Pode me passar o endereço?', 'Qual o endereço?', 'Onde te busco?', 'Me passa o endereço?'],
    random: (arr) => arr[Math.floor(Math.random() * arr.length)]
};

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
            (/\d{2,}/.test(mensagem) && mensagem.split(/\s+/).length >= 2 && mensagem.length > 8);
        
        if (pareceEndereco) {
            return { usarIA: true, intencao: 'pedir_corrida', endereco: mensagem };
        }
        
        // ========== RESPOSTAS HUMANAS (menos emojis) ==========
        
        // Saudações simples
        if (msgLower.match(/^(oi|ola|olá|e ai|eai|opa)$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Oi! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        if (msgLower.match(/^bom dia/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Bom dia! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        if (msgLower.match(/^boa tarde/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa tarde! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        if (msgLower.match(/^boa noite/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa noite! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Tudo bem? - RECONHECER primeiro
        if (msgLower.match(/(tudo bem|como vai|tudo certo|como vc ta|como você está)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Tudo sim! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Reações positivas - RECONHECER
        if (msgLower.match(/^(a maravilha|maravilha|que bom|legal|massa|top|show)$/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: 'Que bom! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        if (msgLower.match(/^(otimo|ótimo|perfeito|excelente)$/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: variacoes.random(variacoes.confirmacao) + '! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Agradecimentos - emoji só aqui no final
        if (msgLower.match(/(obrigad|valeu|vlw|brigad)/)) {
            return { usarIA: true, intencao: 'agradecimento', respostaCurta: 'Por nada! Sempre que precisar 🚗' };
        }
        
        // Confirmações simples
        if (msgLower.match(/^(ok|sim|certo|beleza|blz|ta|tá|pode ser|isso|vamos|bora)$/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: variacoes.random(variacoes.confirmacao) + '! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Cliente diz que já mandou - ADMITIR ERRO
        if (msgLower.match(/(ja te mandei|ja mandei|te mandei|mandei|ja falei|ja disse)/)) {
            return { usarIA: true, intencao: 'outro', respostaCurta: 'Verdade, desculpa! Pode mandar de novo o endereço?' };
        }
        
        // Expressões regionais
        if (msgLower.match(/(uai|ue|né|ne)/) && msgLower.length < 20) {
            return { usarIA: true, intencao: 'outro', respostaCurta: 'Desculpa, me passa o endereço completo?' };
        }
        
        // Perguntas sobre disponibilidade
        if (msgLower.match(/(tem carro|carro disponivel|disponível|tem motorista|ta funcionando|tá funcionando)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Tem sim! Me passa o endereço que já mando um pra você' };
        }
        
        // Perguntas sobre a empresa
        if (msgLower.match(/(empresa|sobre|voces|vocês|serviço|servico|o que é|oque é)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Somos de transporte por app, tipo Uber! Quer pedir um carro?' };
        }
        
        // Cliente quer ser buscado
        if (msgLower.match(/(me busca|busca eu|pega eu|me pega|vem me|venha me|manda um carro|quero um carro|preciso de um carro)/)) {
            return { usarIA: true, intencao: 'pedir_corrida', respostaCurta: variacoes.random(variacoes.confirmacao) + '! Me passa o endereço?' };
        }
        
        // Se não identificou, pedir endereço naturalmente
        return { usarIA: true, intencao: 'outro', respostaCurta: 'Me passa o endereço que já mando um carro pra você' };
    },

    async responderPergunta(pergunta, contexto = {}) {
        if (!IAService.isAtivo()) return null;
        try {
            const prompt = `Você é Rebeca, atendente simpática. Responda em NO MÁXIMO 15 palavras, como uma pessoa real no WhatsApp (informal, educada, sem emoji). Pergunta: "${pergunta}"`;

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
