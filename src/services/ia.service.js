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
        
        // Filtrar frases comuns que NÃO são endereços
        const frasesComuns = [
            'ja te mandei', 'ja mandei', 'te mandei', 'mandei', 'uai', 'ue', 'ne',
            'que', 'como', 'quando', 'onde', 'porque', 'qual', 'quem',
            'tudo bem', 'beleza', 'blz', 'ok', 'sim', 'nao', 'não',
            'obrigado', 'obrigada', 'valeu', 'vlw', 'brigado',
            'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite',
            'certo', 'entendi', 'ta', 'tá', 'show', 'perfeito',
            'a maravilha', 'maravilha', 'otimo', 'ótimo', 'legal',
            'pode ser', 'vamos', 'bora', 'isso', 'isso mesmo'
        ];
        
        const ehFraseComum = frasesComuns.some(f => msgLower.includes(f)) && 
            !msgLower.match(/\b(rua|avenida|av|travessa|alameda|praca|praça|rodovia|estrada)\b/i) &&
            !msgLower.match(/\d{2,}/);
        
        if (ehFraseComum) {
            // Classificar manualmente
            if (msgLower.match(/^(oi|ola|olá|e ai|eai|opa|hey|hy)$/)) {
                return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Oi! Precisa de um carro? Me manda sua localização! 📍' };
            }
            if (msgLower.match(/(bom dia|boa tarde|boa noite)/)) {
                const hora = new Date().getHours();
                const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
                return { usarIA: true, intencao: 'saudacao', respostaCurta: `${saudacao}! Precisa de um carro? Me manda sua localização! 📍` };
            }
            if (msgLower.match(/(tudo bem|como vai|tudo certo)/)) {
                return { usarIA: true, intencao: 'saudacao', respostaCurta: 'Tudo ótimo! Precisa de um carro? Me manda sua localização! 📍' };
            }
            if (msgLower.match(/(obrigad|valeu|vlw|brigad)/)) {
                return { usarIA: true, intencao: 'agradecimento', respostaCurta: 'Por nada! Quando precisar, é só chamar! 🚗' };
            }
            if (msgLower.match(/(ok|sim|certo|beleza|blz|ta|tá|show|perfeito|entendi|pode ser|isso|vamos|bora)/)) {
                return { usarIA: true, intencao: 'confirmacao', respostaCurta: 'Beleza! Me manda sua localização ou endereço de onde você está! 📍' };
            }
            if (msgLower.match(/(ja te mandei|ja mandei|te mandei)/)) {
                return { usarIA: true, intencao: 'outro', respostaCurta: 'Desculpa! Pode mandar de novo o endereço completo com número? 😊' };
            }
            // Genérico
            return { usarIA: true, intencao: 'outro', respostaCurta: 'Precisa de um carro? Me manda sua localização ou endereço! 📍' };
        }
        
        try {
            const prompt = `Você é Rebeca, atendente simpática de transporte por aplicativo da empresa ${contexto.nomeEmpresa || 'UBMAX'}.

ANALISE a mensagem do cliente e classifique:

REGRAS:
1. Se menciona RUA, AVENIDA, NÚMERO ou parece endereço = pedir_corrida
2. Se tem "?" ou pergunta sobre preço/serviço/empresa = pergunta
3. Se é saudação curta (oi, olá, bom dia) = saudacao
4. Se é confirmação (ok, sim, certo) = confirmacao
5. Se é agradecimento = agradecimento
6. Qualquer outra coisa = outro

IMPORTANTE:
- NUNCA pergunte "pra onde vai" ou destino
- Sempre peça LOCALIZAÇÃO ou ENDEREÇO de onde o cliente ESTÁ
- Seja simpática mas DIRETA
- Respostas CURTAS (máximo 15 palavras)

Mensagem do cliente: "${mensagem}"

Responda APENAS em JSON:
{"intencao":"pedir_corrida|pergunta|saudacao|confirmacao|agradecimento|outro","endereco":null,"respostaCurta":"sua resposta curta aqui"}

Se intencao=pedir_corrida, extraia o endereco no campo "endereco"
Se intencao=pergunta sobre empresa/serviço, responda que é transporte por aplicativo
Se for saudacao/confirmacao/outro, peça localização de forma simpática`;

            const response = await clienteAnthropic.messages.create({ 
                model: configIA.modelo, 
                max_tokens: 150, 
                messages: [{ role: 'user', content: prompt }] 
            });
            
            let texto = response.content[0].text.trim();
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

    async responderPergunta(pergunta, contexto = {}) {
        if (!IAService.isAtivo()) return null;
        try {
            const prompt = `Você é Rebeca, atendente simpática de transporte da ${contexto.nomeEmpresa || 'UBMAX'}.

Responda a pergunta do cliente de forma CURTA e DIRETA (máximo 20 palavras).
Somos uma empresa de transporte por aplicativo (tipo Uber/99).
Se não souber, diga para entrar em contato pelo telefone.

Pergunta: "${pergunta}"

Responda de forma natural e simpática:`;

            const response = await clienteAnthropic.messages.create({
                model: configIA.modelo,
                max_tokens: 100,
                messages: [{ role: 'user', content: prompt }]
            });
            
            return response.content[0].text.trim();
        } catch (e) {
            console.log('[IA] Erro resposta:', e.message);
            return null;
        }
    }
};

module.exports = IAService;
