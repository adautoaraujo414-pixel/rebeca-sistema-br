/**
 * RebecaRaciocinioService
 * Raciocínio amplificado para manter o fluxo da corrida
 * Roda quando a Rebeca não entende uma mensagem numa etapa intermediária
 */

const axios = require('axios');

const ETAPAS_FLUXO = {
    pedir_origem:               { espera: 'endereço de origem',         proxima: 'pedir_referencia' },
    pedir_numero_origem:        { espera: 'número ou bairro da origem',  proxima: 'pedir_referencia' },
    pedir_bairro_origem:        { espera: 'bairro da origem',            proxima: 'pedir_referencia' },
    pedir_referencia:           { espera: 'referência ou 0',             proxima: 'pedir_destino_rapido' },
    pedir_destino_rapido:       { espera: 'endereço de destino',         proxima: 'aguardando_motorista' },
    pedir_destino:              { espera: 'endereço de destino',         proxima: 'confirmar_corrida' },
    confirmar_corrida:          { espera: 'confirmação (sim/não)',        proxima: 'aguardando_motorista' },
    confirmar_preco:            { espera: 'confirmação do preço',         proxima: 'aguardando_motorista' },
    pedir_observacao_origem:    { espera: 'observação ou 0',             proxima: 'pedir_destino_rapido' },
    pedir_observacao_destino:   { espera: 'observação ou 0',             proxima: 'aguardando_motorista' },
    pedir_complemento_gps:      { espera: 'complemento do endereço GPS', proxima: 'pedir_destino_rapido' },
    confirmar_origem_auto:      { espera: 'confirmação do endereço',     proxima: 'pedir_destino_rapido' },
    confirmar_endereco_suspeito:{ espera: 'confirmação do endereço',     proxima: 'pedir_destino_rapido' },
    oferecer_fila_espera:       { espera: 'sim ou não',                  proxima: 'aguardando_fila' },
};

const RebecaRaciocinioService = {

    apiKey: process.env.OPENAI_API_KEY || '',

    isAtivo() {
        return !!this.apiKey;
    },

    /**
     * Raciocinar sobre o que o cliente quis dizer numa etapa intermediária
     * Retorna: { acao, valor, resposta, confianca }
     *
     * acao:
     *   'avancar'   — extraiu o dado esperado, seguir fluxo com `valor`
     *   'repetir'   — não entendeu mas deve reformular sem perder etapa
     *   'cancelar'  — cliente quer cancelar/sair
     *   'voltar'    — cliente quer corrigir etapa anterior
     *   'confirmar' — cliente confirmou (sim/ok/bora)
     *   'negar'     — cliente negou (não/cancela)
     */
    async raciocinar(telefone, mensagem, conversa, contextoExtra = {}) {
        if (!this.apiKey) return null;

        const etapa = conversa.etapa;
        const infoEtapa = ETAPAS_FLUXO[etapa];
        if (!infoEtapa) return null;

        const dadosAtual = conversa.dados || {};
        const origemJaSalva   = dadosAtual.origem  || null;
        const destinoJaSalvo  = dadosAtual.destino  || null;

        const promptSistema = `Você é o motor de raciocínio interno da Rebeca, assistente de central de táxi/corridas.

Sua função: analisar o que o cliente enviou dentro de um fluxo de pedido de corrida e decidir qual ação tomar.

CONTEXTO ATUAL DA CONVERSA:
- Etapa: ${etapa}
- O que a Rebeca estava esperando: ${infoEtapa.espera}
- Origem já salva: ${origemJaSalva || 'não informada ainda'}
- Destino já salvo: ${destinoJaSalvo || 'não informado ainda'}
- Observação origem: ${dadosAtual.observacaoOrigem || 'nenhuma'}
- Nome do cliente: ${contextoExtra.nome || 'Cliente'}

MENSAGEM DO CLIENTE: "${mensagem}"

REGRAS DE RACIOCÍNIO:
1. Se o cliente mandou algo que claramente é ${infoEtapa.espera} → acao: "avancar", valor: o dado extraído limpo
2. Se o cliente confirmou (sim, ok, pode, bora, vai, s, 1, confirma, exato, isso, correto, certo) → acao: "confirmar"
3. Se o cliente negou ou quer cancelar (não, nao, cancela, desisto, para, chega, errei, errado, 2) → acao: "negar"
4. Se o cliente quer corrigir a etapa anterior (errei o endereço, muda a origem, quero mudar) → acao: "voltar"
5. Se não deu pra entender mas parece boa fé → acao: "repetir", reformule a pergunta de forma diferente e mais clara
6. NUNCA invente dados — se não tem certeza do endereço extraído, use "repetir"
7. Para endereços: extraia a rua, número e bairro se presentes. Corrija abreviações óbvias.
8. Para confirmações em etapas de confirmar_corrida/confirmar_preco: qualquer variante de "sim" → "confirmar"

RETORNE APENAS JSON VÁLIDO:
{
  "acao": "avancar|repetir|cancelar|voltar|confirmar|negar",
  "valor": "dado extraído (endereço limpo, número, referência etc) ou null",
  "resposta": "mensagem amigável para enviar ao cliente (máx 2 linhas)",
  "confianca": 0.0 a 1.0,
  "raciocinio": "explicação interna de 1 linha do que você concluiu"
}`;

        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: promptSistema }],
                max_tokens: 250,
                temperature: 0.2
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const texto = response.data.choices[0]?.message?.content?.trim();
            const limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const resultado = JSON.parse(limpo);

            console.log(`[RACIOCINIO] Etapa: ${etapa} | Acao: ${resultado.acao} | Confianca: ${resultado.confianca} | ${resultado.raciocinio}`);

            return resultado;
        } catch (e) {
            console.error('[RACIOCINIO] Erro:', e.message);
            return null;
        }
    },

    /**
     * Gerar resposta de "não entendi mas vou continuar" sem perder o fluxo
     */
    reformularPergunta(etapa, dadosConversa) {
        const templates = {
            pedir_origem:               `📍 Me passa o endereço de onde você está agora (rua e número)`,
            pedir_numero_origem:        `📍 Qual o número ou bairro do endereço *${dadosConversa.origem || ''}*?`,
            pedir_bairro_origem:        `📍 Qual o bairro? (ex: Centro, Boa Vista...)`,
            pedir_referencia:           `📍 Tem alguma referência perto? (ou manda *0* para pular)`,
            pedir_destino_rapido:       `🏁 Pra onde você vai? Me passa o endereço de destino`,
            pedir_destino:              `🏁 Qual o endereço de destino?`,
            confirmar_corrida:          `👆 Confirma a corrida? Responde *1* para SIM ou *2* para CANCELAR`,
            confirmar_preco:            `💰 Confirma o valor? Responde *SIM* ou *NÃO*`,
            pedir_observacao_origem:    `📝 Alguma referência ou observação? (ou *0* para pular)`,
            pedir_observacao_destino:   `📝 Alguma referência no destino? (ou *0* para pular)`,
            pedir_complemento_gps:      `📍 Qual o complemento ou referência da sua localização?`,
            confirmar_origem_auto:      `📍 Esse é o endereço certo? Confirma ou manda o correto`,
            oferecer_fila_espera:       `🙋 Quer entrar na fila de espera? Responde *SIM* ou *NÃO*`,
        };
        return templates[etapa] || `Pode repetir? Não entendi bem 😊`;
    }
};

module.exports = RebecaRaciocinioService;
