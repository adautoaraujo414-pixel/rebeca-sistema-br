/**
 * CÉREBRO DA REBECA DELIVERY
 * Separado completamente do cérebro de corridas.
 * Prompt, etapas, intenções e lógica próprios para pedidos de delivery.
 * 
 * STATUS: estrutura base criada — prompt será desenvolvido separadamente.
 */

const axios = require('axios');

let _promptCache = null;
let _promptCacheTs = 0;
const PROMPT_CACHE_TTL = 5 * 60 * 1000;

const CerebroRebecaDelivery = {

    isAtivo() {
        return !!(process.env.ANTHROPIC_API_KEY);
    },

    invalidarCache() {
        _promptCache = null;
        _promptCacheTs = 0;
        console.log('[CEREBRO-DELIVERY] Cache invalidado');
    },

    // ============================================================
    // PROMPT MESTRE — a ser desenvolvido
    // ============================================================
    buildPromptMestre(nomeEmpresa = 'Delivery', nomeAssistente = 'Rebeca', nomeProprietario = '') {
        // TODO: prompt completo de delivery será construído aqui
        return `Você é ${nomeAssistente}, atendente de delivery da ${nomeEmpresa} via WhatsApp. [PROMPT EM CONSTRUÇÃO]`;
    },

    // ============================================================
    // ETAPAS DO FLUXO DE DELIVERY
    // ============================================================
    descreverEtapa(etapa, dados = {}) {
        const d = {
            'inicio':              'Início — cliente ainda não fez pedido',
            'escolhendo_itens':    'Cliente montando o pedido',
            'confirmar_itens':     'Itens: ' + JSON.stringify(dados.itens || []) + ' — aguardando confirmação',
            'pedir_endereco':      'Pedido confirmado — aguardando endereço de entrega',
            'confirmar_pedido':    'Endereço: "' + (dados.endereco || '?') + '" — resumo final, aguardando OK',
            'aguardando_preparo':  'Pedido recebido — em preparo na cozinha',
            'saiu_para_entrega':   'Pedido saiu — entregador a caminho',
            'entregue':            'Pedido entregue — aguardando avaliação',
            'avaliar':             'Entrega finalizada — aguardando avaliação 1-5',
        };
        return d[etapa] || ('Etapa: ' + etapa);
    },

    // ============================================================
    // HISTÓRICO
    // ============================================================
    montarHistorico(conversa) {
        if (!conversa || !conversa.historico || conversa.historico.length === 0) {
            return '(primeira mensagem)';
        }
        return conversa.historico.slice(-30).map(h => {
            return (h.remetente === 'cliente' ? 'Cliente' : 'Rebeca') + ': ' + h.texto;
        }).join('\n');
    },

    salvarHistorico(conversa, texto, remetente = 'cliente') {
        if (!conversa.historico) conversa.historico = [];
        conversa.historico.push({
            texto: (texto || '').substring(0, 500),
            remetente,
            ts: Date.now()
        });
        if (conversa.historico.length > 30) {
            conversa.historico = conversa.historico.slice(-30);
        }
    },

    // ============================================================
    // RACIOCINAR — stub até o prompt ser desenvolvido
    // ============================================================
    async raciocinar(telefone, mensagem, contexto, config = {}) {
        // TODO: implementar quando o prompt estiver pronto
        console.log('[CEREBRO-DELIVERY] raciocinar() chamado — prompt ainda não implementado');
        return null;
    },

};

module.exports = CerebroRebecaDelivery;
