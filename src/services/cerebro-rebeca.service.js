/**
 * CÉREBRO CENTRAL DA REBECA
 * Prompt unificado + memória de contexto + raciocínio global
 */

const axios = require('axios');

let _promptCache = null;
let _promptCacheTs = 0;
const PROMPT_CACHE_TTL = 5 * 60 * 1000;

const CerebroRebeca = {

    isAtivo() {
        return !!(process.env.ANTHROPIC_API_KEY);
    },

    invalidarCache() {
        _promptCache = null;
        _promptCacheTs = 0;
        console.log('[CEREBRO] Cache invalidado');
    },

    buildPromptMestre(nomeEmpresa = 'Central de Corridas', nomeAssistente = 'Rebeca') {
        return `Você é ${nomeAssistente}, atendente humana da ${nomeEmpresa}, central de transporte/corridas via WhatsApp.

IDENTIDADE:
- Você É humana para o cliente — nunca admita ser IA, robô ou sistema
- Seu trabalho é pedir corridas — não suporte técnico
- Você conhece a cidade, pontos de referência, bairros locais
- Você tem memória da conversa — nunca peça algo que o cliente já disse

PERSONALIDADE:
- Calorosa, direta, natural — atendente experiente de WhatsApp
- NUNCA robótica, NUNCA formal demais
- Respostas curtas: máximo 2 linhas WhatsApp
- Emojis: ZERO na maioria. Máximo 1 quando muito necessário
- NUNCA diga "Como posso te ajudar" — você sabe: corridas
- NUNCA diga "Aqui é a ${nomeAssistente}" — cliente já sabe
- NUNCA mencione nome da empresa

REGRAS DE NEGÓCIO:
- Corrida precisa de origem E destino
- Endereço incompleto: pergunte só o que falta (bairro OU número, não os dois)
- Ponto de referência (hospital, escola, mercado, praça, Igreja): aceitar como endereço válido
- Se cliente mudar de ideia: resetar sem drama
- Se cliente reclamar: acalmar primeiro, resolver depois
- Se cliente quiser falar com humano: avisar que vai chamar responsável
- CANCELAR: sempre aceitar sem questionar

MEMÓRIA:
- Leia TODO o histórico antes de responder
- Se cliente já deu origem: não peça de novo
- Se cliente mudou algo: atualizar sem drama
- Detecte humor do cliente pelo histórico e adapte o tom

INTENÇÕES:
- SOLICITAR_CORRIDA: quer transporte para si
- BUSCAR_TERCEIRO: quer buscar outra pessoa
- SOLICITAR_ENCOMENDA: quer enviar objeto
- INFORMAR_ENDERECO: dando endereço origem ou destino
- CONFIRMAR: confirmando algo
- CANCELAR: quer cancelar
- FALAR_RESPONSAVEL: quer falar com humano/dono
- RECLAMACAO: insatisfeito
- PERGUNTAR_PRECO: quer saber valor
- SAUDACAO: cumprimentando
- AGRADECIMENTO: agradecendo
- AGENDAMENTO: corrida com hora marcada
- ENTREVISTA_COMERCIAL: quer saber sobre o sistema
- OUTRO: fora de contexto — redirecionar para corrida

RETORNE APENAS JSON sem markdown:
{
  "intencao": "SOLICITAR_CORRIDA",
  "resposta": "De onde você vai sair?",
  "acao": "pedir_origem",
  "humor_cliente": "NORMAL",
  "notificar_admin": false,
  "dados_extraidos": {
    "origem": null,
    "destino": null,
    "horario": null,
    "nome_terceiro": null,
    "cor_camisa": null
  }
}`;
    },

    montarHistorico(conversa) {
        if (!conversa || !conversa.historico || conversa.historico.length === 0) {
            return '(primeira mensagem)';
        }
        return conversa.historico.slice(-12).map(h => {
            return (h.remetente === 'cliente' ? 'Cliente' : 'Rebeca') + ': ' + h.texto;
        }).join('\n');
    },

    descreverEtapa(etapa, dados = {}) {
        const d = {
            'inicio': 'Início — cliente ainda não pediu corrida',
            'pedir_origem': 'Aguardando endereço de ORIGEM',
            'pedir_destino': `Origem: "${dados.origem || '?'}" — aguardando DESTINO`,
            'confirmar_corrida': `Origem: "${dados.origem || '?'}" / Destino: "${dados.destino || '?'}" — aguardando CONFIRMAÇÃO`,
            'aguardando_motorista': 'Corrida criada — procurando motorista',
            'motorista_a_caminho': 'Motorista a caminho do cliente',
            'aguardando_embarque': 'Motorista chegou — cliente deve embarcar',
            'em_corrida': 'Corrida em andamento',
            'avaliar': 'Corrida finalizada — aguardando avaliação 1-5',
            'confirmar_preco': 'Preço calculado — aguardando confirmação',
            'pedir_aparencia': 'Aguardando cor da camisa do cliente',
            'oferecer_fila_espera': 'Sem motoristas — oferecendo fila',
            'aguardando_fila': 'Cliente na fila de espera',
            'pedir_origem_encomenda': 'Aguardando origem da encomenda',
            'pedir_destino_encomenda': 'Aguardando destino da encomenda',
        };
        return d[etapa] || `Etapa: ${etapa}`;
    },

    salvarHistorico(conversa, texto, remetente = 'cliente') {
        if (!conversa.historico) conversa.historico = [];
        conversa.historico.push({
            texto: (texto || '').substring(0, 300),
            remetente,
            ts: Date.now()
        });
        if (conversa.historico.length > 20) {
            conversa.historico = conversa.historico.slice(-20);
        }
        return conversa;
    },

    async raciocinar(telefone, msgOriginal, conversa, opcoes = {}) {
        const { nome = '', nomeEmpresa = 'Central de Corridas', nomeAssistente = 'Rebeca' } = opcoes;
        try {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            if (!anthropicKey) throw new Error('sem chave');

            const historico = this.montarHistorico(conversa);
            const contextoEtapa = this.descreverEtapa(conversa.etapa, conversa.dados);
            const promptMestre = this.buildPromptMestre(nomeEmpresa, nomeAssistente);

            const userPrompt = `HISTÓRICO:
${historico}

ETAPA ATUAL: ${conversa.etapa}
SITUAÇÃO: ${contextoEtapa}
DADOS COLETADOS: ${JSON.stringify(conversa.dados || {})}
CLIENTE: ${nome || telefone}
MENSAGEM ATUAL: "${msgOriginal}"

Responda de forma natural. Retorne APENAS o JSON.`;

            const resp = await axios.post('https://api.anthropic.com/v1/messages', {
                model: 'claude-haiku-4-5',
                max_tokens: 350,
                system: promptMestre,
                messages: [{ role: 'user', content: userPrompt }]
            }, {
                headers: {
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });

            const raw = resp.data.content[0].text.trim().replace(/```json|```/g, '').trim();
            const json = JSON.parse(raw);
            console.log('[CEREBRO]', telefone, '|', json.intencao, '|', (json.resposta || '').substring(0, 60));
            return json;
        } catch(e) {
            console.log('[CEREBRO] Erro:', e.message);
            return null;
        }
    }
};

module.exports = CerebroRebeca;
