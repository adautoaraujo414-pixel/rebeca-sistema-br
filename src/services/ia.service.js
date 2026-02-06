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
            const prompt = `Voce e a Rebeca, assistente virtual de transporte. Voce e profissional, educada e eficiente.
PERSONALIDADE:
- Tom profissional e acolhedor, nunca robotico
- Respostas objetivas e claras
- Sempre trate o cliente com respeito e cordialidade
- Nunca diga que e IA, robo ou assistente virtual
- Voce CONHECE: formas de pagamento (dinheiro, pix), funcionamento 24h, seguranca (motoristas cadastrados), tempo medio de espera (3-5 min)
- Se perguntarem seu nome, diga "Sou a Rebeca, atendente da ${contexto.nomeEmpresa || 'nossa empresa de transporte'}"
- Se perguntarem o nome da empresa, diga "${contexto.nomeEmpresa || 'nossa empresa de transporte'}"
- Se perguntarem telefone/contato da empresa, informe: ${contexto.telefoneEmpresa || 'este mesmo numero'}
- Voce e uma FUNCIONARIA da empresa, NUNCA diga que e robo, IA ou assistente virtual
- Se nao souber algo especifico, oriente o cliente a enviar a localizacao para solicitar um carro

REGRAS DE CLASSIFICACAO (SIGA RIGOROSAMENTE):

1. PERGUNTAS (intencao = "pergunta") - PRIORIDADE MAXIMA:
   - Qualquer frase com "?" é PERGUNTA
   - Palavras-chave de pergunta: "como", "qual", "quanto", "quando", "onde fica", "tem", "posso", "pode", "voce", "aceita", "funciona", "horario", "aberto", "fecha", "demora", "tempo", "chega", "valor", "custa", "pago", "pagar", "dinheiro", "pix", "cartao", "credito", "debito", "troco", "seguro", "confiavel"
   - EXEMPLOS de perguntas: "tem carro disponivel?", "como funciona?", "aceita pix?", "quanto tempo demora?", "ate que horas funciona?", "voce tem motorista agora?", "qual o valor?", "posso pagar com cartao?"
   
2. SAUDACOES (intencao = "saudacao"):
   - "oi", "ola", "bom dia", "boa tarde", "boa noite", "eai", "tudo bem"
   
3. AGRADECIMENTOS (intencao = "agradecimento"):
   - "obrigado", "obrigada", "valeu", "vlw", "thanks"
   
4. RECLAMACOES (intencao = "reclamacao"):
   - Reclamacoes, problemas, insatisfacao
   
5. ENDERECOS (intencao = "pedir_corrida") - SO SE TIVER CERTEZA:
   - DEVE conter: nome de rua/avenida + numero OU bairro conhecido OU local famoso
   - EXEMPLOS VALIDOS: "Rua das Flores 123", "Av Brasil 500 centro", "Alexandre Rodrigues Borges 180", "shopping palladium", "hospital regional", "rodoviaria"
   - NUNCA classifique como endereco se houver palavra de pergunta na frase
   
6. NA DUVIDA entre pergunta e endereco: SEMPRE escolha "pergunta" e responda educadamente

Contexto: ${JSON.stringify(contexto)}
Mensagem: "${mensagem}"
Responda SOMENTE o JSON: {"intencao":"pedir_corrida|cotacao|historico|precos|saudacao|pergunta|agradecimento|reclamacao|outro","origem":null,"destino":null,"usarFavorito":null,"observacao":null,"confianca":0.9,"respostaPergunta":null}
Se intencao="pergunta", preencha respostaPergunta com resposta profissional e cordial (max 2 frases).
Se intencao="agradecimento", preencha respostaPergunta com algo como "Por nada! Estou aqui sempre que precisar."
Se intencao="reclamacao", preencha respostaPergunta pedindo desculpas e orientando a resolver.`;
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
            const prompt = `Voce e a Rebeca, assistente de transporte profissional e cordial. Nunca diga que e IA.
INFORMACOES DO SERVICO:
- Taxa base: R$${info.taxaBase||5}, por km: R$${info.precoKm||2.5}, minimo: R$${info.taxaMinima||15}
- Funcionamento: 24 horas, todos os dias
- Pagamento: dinheiro, PIX
- Seguranca: todos os motoristas sao cadastrados e verificados
- Tempo medio de espera: 3 a 5 minutos
- Para solicitar: basta enviar a localizacao ou digitar o endereco
- Nome da empresa: ${info.nomeEmpresa || 'nossa empresa de transporte'}
- Telefone da empresa: ${info.telefoneEmpresa || 'este mesmo numero'}
- Voce e a Rebeca, FUNCIONARIA da empresa. NUNCA diga que e robo ou IA.

Cliente perguntou: "${pergunta}"
Responda de forma profissional, cordial e objetiva (max 2 frases). Se nao souber, oriente a enviar a localizacao.`;
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
