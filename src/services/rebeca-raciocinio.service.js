/**
 * RaciocinioService — interpreta mensagens ambíguas para o fluxo da Rebeca
 * Lógica local robusta, sem dependência externa, anti-falha em todos os casos
 */

const RaciocinioService = {

    /** Sempre ativo — serviço local sem dependência externa */
    isAtivo() {
        return true;
    },

    /**
     * classificarEnderecoNaoEncontrado
     * Classifica texto que não validou no Google Maps
     * Retorna: { tipo, confianca, enderecoLimpo }
     */
    async classificarEnderecoNaoEncontrado(texto, adminId = null) {
        try {
            const t = (texto || '').toLowerCase().trim();

            if (t.length < 4) {
                return { tipo: 'texto_invalido', confianca: 0.95, enderecoLimpo: texto };
            }

            // Claramente não é endereço
            if (/^(sim|nao|não|ok|oi|ola|olá|bom dia|boa tarde|boa noite|obrigad|valeu|cancelar|ajuda|menu|1|2|3|4|5|6|7|8|9|0)$/i.test(t)) {
                return { tipo: 'texto_invalido', confianca: 0.99, enderecoLimpo: texto };
            }

            // Ponto de referência
            if (/(shopping|rodoviaria|rodoviária|hospital|upa|ubs|posto de saude|mercado|supermercado|escola|colegio|colégio|igreja|praça|praca|terminal|aeroporto|estação|estacao|forum|fórum|prefeitura|banco|farmacia|farmácia|posto de gasolina|lanchonete|restaurante|hotel|clube|ginasio|ginásio|estadio|estádio|parque|cemiterio|cemitério|cartorio|cartório|delegacia)/i.test(t)) {
                const limpo = texto.replace(/^(no|na|nos|nas|perto do|perto da|aqui no|aqui na|em frente ao|em frente à)\s+/i, '').trim();
                return { tipo: 'ponto_referencia', confianca: 0.85, enderecoLimpo: limpo };
            }

            // Tem número — provavelmente endereço parcial
            if (/\d{2,}/.test(t) && t.split(/\s+/).length >= 2) {
                return { tipo: 'endereco_parcial', confianca: 0.75, enderecoLimpo: texto };
            }

            // Tem vírgula — "Local, Bairro" ou "Rua X, Cidade"
            if (texto.includes(',') && texto.length > 6) {
                return { tipo: 'endereco_outro_formato', confianca: 0.7, enderecoLimpo: texto };
            }

            // Tem indicador de bairro/localidade
            if (/(bairro|vila|jardim|setor|quadra|qd|lote|conjunto|residencial)/i.test(t)) {
                return { tipo: 'endereco_parcial', confianca: 0.8, enderecoLimpo: texto };
            }

            return { tipo: 'texto_invalido', confianca: 0.5, enderecoLimpo: texto };

        } catch (e) {
            console.error('[RaciocinioService.classificar]', e.message);
            return { tipo: 'texto_invalido', confianca: 0.5, enderecoLimpo: texto };
        }
    },

    /**
     * raciocinar — interpreta mensagem ambígua em etapa de endereço
     * Retorna: { acao: 'avancar'|'pedir_mais', valor?, mensagem? }
     */
    async raciocinar(telefone, mensagem, conversa, contexto = {}) {
        try {
            const t = (mensagem || '').toLowerCase().trim();
            const etapa = conversa && conversa.etapa ? conversa.etapa : '';

            // Endereço com número — alta chance de ser válido
            if (/\d{2,}/.test(mensagem) && mensagem.split(/\s+/).length >= 2) {
                return { acao: 'avancar', valor: mensagem, confianca: 0.8 };
            }

            // Ponto de referência — avançar com o texto como está
            if (/(shopping|rodoviaria|rodoviária|hospital|upa|ubs|mercado|supermercado|escola|colegio|colégio|igreja|praça|praca|terminal|aeroporto|prefeitura|banco|farmacia|farmácia)/i.test(t)) {
                return { acao: 'avancar', valor: mensagem, confianca: 0.75 };
            }

            // Tem vírgula — provavelmente "Local, Bairro"
            if (mensagem.includes(',') && mensagem.length > 6) {
                return { acao: 'avancar', valor: mensagem, confianca: 0.7 };
            }

            // Tem bairro/vila/jardim
            if (/(bairro|vila|jardim|setor|quadra|conjunto|residencial)/i.test(t)) {
                return { acao: 'avancar', valor: mensagem, confianca: 0.72 };
            }

            // Texto longo em etapa de endereço — tentar como endereço
            const etapasEndereco = ['pedir_origem', 'pedir_destino', 'pedir_destino_rapido', 'cotacao_origem', 'cotacao_destino'];
            if (mensagem.length > 20 && etapasEndereco.includes(etapa)) {
                return { acao: 'avancar', valor: mensagem, confianca: 0.6 };
            }

            return { acao: 'pedir_mais', mensagem: 'Pode me passar o endereço completo? Ex: Rua X, número, bairro' };

        } catch (e) {
            console.error('[RaciocinioService.raciocinar]', e.message);
            return { acao: 'pedir_mais', mensagem: 'Pode me passar o endereço completo?' };
        }
    },

    /**
     * reformularPergunta — reformula pergunta sobre endereço de forma humanizada
     */
    async reformularPergunta(etapa, tentativa, contexto = {}) {
        try {
            const msgs = {
                pedir_origem: [
                    'De onde você vai sair? Me passa o endereço 📍',
                    'Qual o endereço de partida? Ex: Rua X, 100, Bairro Y',
                    'Me manda o endereço de onde você está agora:'
                ],
                pedir_destino: [
                    'Pra onde você vai? Me passa o destino 🏁',
                    'Qual o endereço de destino? Ex: Rua X, 100, Bairro Y',
                    'Me passa o endereço completo do destino:'
                ],
                pedir_destino_rapido: [
                    'Pra onde você quer ir? 🏁',
                    'Me passa o destino:',
                    'Qual o endereço de destino?'
                ]
            };
            const opcoes = msgs[etapa] || ['Pode me passar o endereço completo?'];
            const idx = Math.min((tentativa || 0), opcoes.length - 1);
            return opcoes[idx];
        } catch (e) {
            return 'Pode me passar o endereço completo?';
        }
    },

    /**
     * deveTratarComoEndereco — decide se mensagem em etapa de endereço deve ser processada
     */
    deveTratarComoEndereco(mensagem, etapa) {
        const t = (mensagem || '').toLowerCase().trim();
        const etapasEndereco = ['pedir_origem', 'pedir_destino', 'pedir_destino_rapido',
                                 'cotacao_origem', 'cotacao_destino',
                                 'pedir_origem_encomenda', 'pedir_destino_encomenda'];
        if (!etapasEndereco.includes(etapa)) return false;
        if (/^(cancelar|menu|ajuda|atendente|sim|nao|não|ok|1|2|3|4|5)$/i.test(t)) return false;
        return true;
    }

};

module.exports = RaciocinioService;
