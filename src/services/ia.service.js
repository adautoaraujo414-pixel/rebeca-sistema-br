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
        
        // ========== FLUXO HUMANO COM CONEXÃO ==========
        
        // Saudação simples - NÃO pede endereço ainda, cria conexão
        if (msgLower.match(/^(oi|ola|olá|e ai|eai|opa)$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Oi, tudo bem?' };
        }
        if (msgLower.match(/^(oi|ola|olá).*(tudo bem|tudo bom|como vai)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Tudo sim, e você?' };
        }
        if (msgLower.match(/^bom dia$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Bom dia! Tudo bem?' };
        }
        if (msgLower.match(/^boa tarde$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa tarde! Tudo bem?' };
        }
        if (msgLower.match(/^boa noite$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa noite! Tudo bem?' };
        }
        
        // Resposta de "tudo bem" - agora sim, avança pro próximo passo
        if (msgLower.match(/^(tudo|tudo bem|tudo bom|tudo certo|tudo otimo|tudo ótimo|bem|estou bem|to bem|tô bem)$/)) {
            return { usarIA: true, intencao: 'pos_saudacao', respostaCurta: 'Que bom! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        if (msgLower.match(/(tudo sim|tudo bem sim|bem e você|bem e vc|e você|e vc|e tu)/)) {
            return { usarIA: true, intencao: 'pos_saudacao', respostaCurta: 'Também! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Agradecimentos - finaliza
        if (msgLower.match(/(obrigad|valeu|vlw|brigad)/)) {
            return { usarIA: true, intencao: 'agradecimento', respostaCurta: 'Por nada! Sempre que precisar 🚗' };
        }
        
        // Cliente diz que já mandou
        if (msgLower.match(/(ja te mandei|ja mandei|te mandei|mandei|ja falei)/)) {
            return { usarIA: true, intencao: 'outro', respostaCurta: 'Desculpa! Pode mandar de novo o endereço?' };
        }
        
        // Perguntas sobre disponibilidade
        if (msgLower.match(/(tem carro|carro disponivel|disponível|tem motorista|ta funcionando|tá funcionando)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Tem sim! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Perguntas sobre empresa
        if (msgLower.match(/(empresa|sobre|voces|vocês|serviço|servico|o que é|oque é|qual seu nome|quem é você)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Sou a Rebeca, do transporte por app! Vai precisar de carro?' };
        }
        
        // Cliente quer ser buscado
        if (msgLower.match(/(me busca|busca eu|pega eu|me pega|vem me|venha me|manda um carro|quero um carro|preciso de carro)/)) {
            return { usarIA: true, intencao: 'pedir_corrida', respostaCurta: 'Qual o endereço?' };
        }
        
        // Reações positivas - avança
        if (msgLower.match(/^(ok|sim|certo|beleza|blz|ta|tá|show|perfeito|entendi|maravilha|otimo|ótimo|legal|massa|top)$/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: 'Beleza! ' + variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Expressões regionais
        if (msgLower.match(/(uai|ue|né|ne)/) && msgLower.length < 15) {
            return { usarIA: true, intencao: 'outro', respostaCurta: variacoes.random(variacoes.pedir_endereco) };
        }
        
        // Qualquer outra coisa - pergunta se quer carro
        return { usarIA: true, intencao: 'outro', respostaCurta: 'Vai precisar de um carro? Me passa o endereço!' };
    },


    async analisarMensagemDelivery(mensagem, contexto = {}) {
        if (!IAService.isAtivo()) return { usarIA: false };

        const msgLower = mensagem.toLowerCase().trim();

        const varDelivery = {
            cardapio: ['O que vai ser hoje? 🍔', 'Manda *CARDAPIO* pra ver as opcoes!', 'Me diz o que quer hoje! 😊'],
            random: (arr) => arr[Math.floor(Math.random() * arr.length)]
        };

        // ========== SAUDAÇÕES HUMANIZADAS ==========
        if (msgLower.match(/^(oi|ola|olá|e ai|eai|opa)$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Oi! Tudo bem? 😊' };
        }
        if (msgLower.match(/^(oi|ola|olá).*(tudo bem|tudo bom|como vai)/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Tudo sim! E você? 😊' };
        }
        if (msgLower.match(/^bom dia$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Bom dia! Tudo bem? ☀️' };
        }
        if (msgLower.match(/^boa tarde$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa tarde! Tudo bem? 😊' };
        }
        if (msgLower.match(/^boa noite$/)) {
            return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Boa noite! 🌙 Tudo bem?' };
        }

        // Resposta de tudo bem → avança pro cardápio
        if (msgLower.match(/^(tudo|tudo bem|tudo bom|tudo certo|bem|to bem|tô bem|estou bem)$/)) {
            return { usarIA: true, intencao: 'pos_saudacao', respostaCurta: 'Que bom! ' + varDelivery.random(varDelivery.cardapio) };
        }
        if (msgLower.match(/(e você|e vc|e tu|tudo sim)/)) {
            return { usarIA: true, intencao: 'pos_saudacao', respostaCurta: 'Também! ' + varDelivery.random(varDelivery.cardapio) };
        }

        // ========== INTENÇÃO DE PEDIDO ==========
        if (msgLower.match(/(quero pedir|quero fazer|quero um|me manda|quero comer|com fome|tô com fome|to com fome)/)) {
            return { usarIA: true, intencao: 'pedir', respostaCurta: varDelivery.random(varDelivery.cardapio) };
        }

        // ========== PERGUNTAS SOBRE FUNCIONAMENTO ==========
        if (msgLower.match(/(ta aberto|tá aberto|funcionando|aberto agora|ainda aberto|horario|horário)/)) {
            return { usarIA: true, intencao: 'pergunta_horario', respostaCurta: null }; // deixa o fluxo normal responder
        }
        if (msgLower.match(/(empresa|sobre|voces|vocês|serviço|servico|quem é|qual seu nome|o que é)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Sou a Rebeca, seu atendente virtual! ' + varDelivery.random(varDelivery.cardapio) };
        }
        if (msgLower.match(/(tem entrega|faz entrega|entrega aqui|entrega em|delivery|motoboy)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Sim, fazemos entrega! ' + varDelivery.random(varDelivery.cardapio) };
        }
        if (msgLower.match(/(quanto tempo|demora|tempo de entrega|previsao|previsão)/)) {
            return { usarIA: true, intencao: 'pergunta', respostaCurta: 'Em média 30-45 minutos! ' + varDelivery.random(varDelivery.cardapio) };
        }

        // ========== CONFIRMAÇÕES ==========
        if (msgLower.match(/^(ok|sim|certo|beleza|blz|ta|tá|show|perfeito|entendi|maravilha|otimo|ótimo|legal|massa|top)$/)) {
            return { usarIA: true, intencao: 'confirmacao', respostaCurta: 'Beleza! ' + varDelivery.random(varDelivery.cardapio) };
        }

        // ========== AGRADECIMENTOS ==========
        if (msgLower.match(/(obrigad|valeu|vlw|brigad)/)) {
            return { usarIA: true, intencao: 'agradecimento', respostaCurta: 'Por nada! Sempre que quiser é só chamar 😊🍔' };
        }

        // ========== EXPRESSÕES REGIONAIS ==========
        if (msgLower.match(/(uai|ue|né|ne)/) && msgLower.length < 15) {
            return { usarIA: true, intencao: 'outro', respostaCurta: varDelivery.random(varDelivery.cardapio) };
        }

        // ========== FALLBACK DELIVERY ==========
        return { usarIA: true, intencao: 'outro', respostaCurta: 'Vai querer pedir algo? ' + varDelivery.random(varDelivery.cardapio) };
    },

    async responderPergunta(pergunta, contexto = {}) {
        return null;
    }
};

module.exports = IAService;
