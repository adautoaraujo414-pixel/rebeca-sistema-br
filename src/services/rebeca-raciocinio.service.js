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


    /**
     * Classificar endereço que o Maps não achou
     * Decide se é: ponto_referencia, endereco_incompleto, endereco_digitado_errado, texto_invalido
     *
     * - ponto_referencia: motorista provavelmente conhece ("mercadão", "campo do zé", "praça da matriz")
     * - endereco_incompleto: rua sem número ou bairro sem rua ("rua das flores", "centro")
     * - endereco_digitado_errado: parece endereço mas com typo ("av. brasilia" sem número, "r. joao slva 45")
     * - texto_invalido: não é endereço de jeito nenhum ("oi", "sim", "não sei")
     */
    async classificarEnderecoNaoEncontrado(texto, adminId = null) {
        if (!this.apiKey) return { tipo: 'ponto_referencia', confianca: 0.5, enderecoLimpo: texto };

        // Heurística rápida antes de chamar IA (economizar tokens)
        const t = texto.toLowerCase().trim();

        // Claramente não é endereço
        if (t.length < 4 || /^(sim|nao|não|ok|s|n|1|2|cancelar|oi|olá|ola)$/.test(t)) {
            return { tipo: 'texto_invalido', confianca: 0.99, enderecoLimpo: null };
        }

        // Ponto de referência claro — mandar direto
        const ehPontoRef = /(hospital|rodoviaria|rodoviária|aeroporto|shopping|terminal|mercado|supermercado|escola|colegio|colégio|universidade|faculdade|prefeitura|posto de saude|upa|ubs|igreja|catedral|cemiterio|estadio|farmacia|banco|correios|delegacia|parque|praça|praca|feira|padaria|açougue|acougue|bar do|boteco|posto.*gasolina|clube|ginásio|ginasio|campo de futebol|campo do|quadra|condomínio|condominio|residencial|conjunto|vila|bairro|setor|jardim|loteamento)/i.test(texto);

        if (ehPontoRef) {
            return { tipo: 'ponto_referencia', confianca: 0.92, enderecoLimpo: texto };
        }

        // Endereço com número mas não achou — provavelmente erro de digitação
        const temNumeroERua = /\d+/.test(texto) && /(rua|av|avenida|r\.|travessa|alameda|estrada|rod|rodovia)/i.test(texto);
        if (temNumeroERua) {
            return { tipo: 'endereco_digitado_errado', confianca: 0.85, enderecoLimpo: texto };
        }

        // Usar IA para casos ambíguos
        try {
            const prompt = `Analise este texto que um cliente de táxi enviou como endereço de destino, mas o Google Maps não conseguiu localizar.

Texto: "${texto}"

Classifique em UMA das categorias:
- "ponto_referencia": nome de estabelecimento, ponto turístico, apelido local que um motorista local provavelmente conhece (ex: "mercadão central", "campo do zé", "bar do bigode", "praça velha")
- "endereco_incompleto": parece endereço real mas falta número ou bairro (ex: "rua das flores", "avenida brasil", "rua joão silva")  
- "endereco_digitado_errado": parece endereço com erro de digitação (ex: "r. joao slva 45", "av brasiia 80")
- "texto_invalido": não é endereço de forma alguma

Também sugira uma versão corrigida/limpa se possível.

RETORNE APENAS JSON:
{"tipo": "", "confianca": 0.0, "enderecoLimpo": "versão limpa ou null", "motivo": "1 linha"}`;

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 120,
                temperature: 0.1
            }, {
                headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                timeout: 8000
            });

            const txt = response.data.choices[0]?.message?.content?.trim();
            const parsed = JSON.parse(txt.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
            console.log(`[CLASSIF_END] "${texto}" → ${parsed.tipo} (${parsed.confianca}) — ${parsed.motivo}`);
            return parsed;
        } catch(e) {
            console.log('[CLASSIF_END] Fallback heurística:', e.message);
            return { tipo: 'ponto_referencia', confianca: 0.5, enderecoLimpo: texto };
        }
    },

module.exports = RebecaRaciocinioService;
