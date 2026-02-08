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

// Variar respostas
const variacoes = {
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
        
        // Ponto de referência (ex: "shopping", "rodoviária", "hospital")
        const pontosReferencia = /(shopping|rodoviaria|rodoviária|hospital|posto|mercado|supermercado|escola|igreja|praça|praca|terminal|aeroporto|estação|estacao|forum|fórum|prefeitura|banco|farmacia|farmácia)/i;
        if (pontosReferencia.test(msgLower)) {
            return { usarIA: true, intencao: 'ponto_referencia', respostaCurta: 'Qual o endereço completo ou me manda a localização?' };
        }
        
        // ========== RESPOSTAS DIRETAS ==========
        
        // Saudações - responde e pergunta endereço
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
        
        // Tudo bem - responde curto e pergunta endereço
        if (msgLower.match(/(tudo bem|como vai|tudo certo)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Tudo sim! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Agradecimentos - finaliza
        if (msgLower.match(/(obrigad|valeu|vlw|brigad)/)) {
            return { usarIA: true, intencao: 'agradecimento', respostaCurta: 'Por nada! Sempre que precisar 🚗' };
        }
        
        // Cliente diz que já mandou
        if (msgLower.match(/(ja te mandei|ja mandei|te mandei|mandei|ja falei)/)) {
            return { usarIA: true, intencao: 'outro', respostaCurta: 'Desculpa! Pode mandar de novo o endereço?' };
        }
        
        // Perguntas sobre disponibilidade - responde e pede endereço
        if (msgLower.match(/(tem carro|carro disponivel|disponível|tem motorista|ta funcionando|tá funcionando)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Tem sim! Me passa o endereço?' };
        }
        
        // Perguntas sobre empresa - responde CURTO e volta pro foco
        if (msgLower.match(/(empresa|sobre|voces|vocês|serviço|servico|o que é|oque é|qual seu nome|quem é você)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Sou a Rebeca, do transporte por app! Vai precisar de carro?' };
        }
        
        // Cliente quer ser buscado
        if (msgLower.match(/(me busca|busca eu|pega eu|me pega|vem me|venha me|manda um carro|quero um carro|preciso de carro)/)) {
            return { usarIA: true, intencao: 'pedir_corrida', respostaCurta: 'Qual o endereço?' };
        }
        
        // Reações positivas
        if (msgLower.match(/^(ok|sim|certo|beleza|blz|ta|tá|show|perfeito|entendi|maravilha|otimo|ótimo|legal)$/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: 'Beleza! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Expressões regionais sem contexto
        if (msgLower.match(/(uai|ue|né|ne)/) && msgLower.length < 15) {
            return { usarIA: true, intencao: 'outro', respostaCurta: 'Me passa o endereço?' };
        }
        
        // QUALQUER OUTRA COISA - não puxa assunto, pergunta se quer carro
        return { usarIA: true, intencao: 'outro', respostaCurta: 'Vai precisar de um carro? Me passa o endereço!' };
    },

    async responderPergunta(pergunta, contexto = {}) {
        return null; // Não responde perguntas fora do contexto
    }
};

module.exports = IAService;
