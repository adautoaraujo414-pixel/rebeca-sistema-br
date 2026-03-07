/**
 * RaciocinioService — classifica mensagens ambíguas para o fluxo da Rebeca
 * Substitui chamadas a IA externa com lógica local robusta e anti-falha
 */

const RaciocinioService = {

    /**
     * Classifica um endereço que não foi encontrado no Google Maps
     * Retorna: { tipo, confianca, enderecoLimpo }
     * tipos: 'endereco_parcial' | 'ponto_referencia' | 'texto_invalido' | 'endereco_outro_formato'
     */
    async classificarEnderecoNaoEncontrado(texto, adminId = null) {
        try {
            const t = texto.toLowerCase().trim();

            // Texto muito curto ou claramente não é endereço
            if (t.length < 4) {
                return { tipo: 'texto_invalido', confianca: 0.95, enderecoLimpo: texto };
            }

            // Palavras que indicam claramente não é endereço
            const naoEnderecos = /^(sim|nao|não|ok|oi|ola|olá|bom dia|boa tarde|boa noite|obrigad|valeu|cancelar|ajuda|menu|1|2|3|4|5|6|7|8|9|0)$/i;
            if (naoEnderecos.test(t)) {
                return { tipo: 'texto_invalido', confianca: 0.99, enderecoLimpo: texto };
            }

            // Emojis ou mensagem muito informal
            if (/[\u{1F300}-\u{1FFFF}]/u.test(texto) && t.split(' ').length < 3) {
                return { tipo: 'texto_invalido', confianca: 0.9, enderecoLimpo: texto };
            }

            // Ponto de referência conhecido
            const pontosRef = /(shopping|rodoviaria|rodoviária|hospital|upa|ubs|posto de saude|mercado|supermercado|escola|colegio|colégio|igreja|praça|praca|terminal|aeroporto|estação|estacao|forum|fórum|prefeitura|banco|farmacia|farmácia|posto de gasolina|lanchonete|restaurante|hotel|motel|clube|ginasio|ginásio|estádio|estadio|parque|cemitério|cemiterio|cartório|cartorio|delegacia|corpo de bombeiros|bombeiros)/i;
            if (pontosRef.test(t)) {
                // Limpar o texto — remover palavras como "no", "na", "perto do"
                const limpo = texto.replace(/^(no|na|nos|nas|perto do|perto da|aqui no|aqui na|em frente ao|em frente à)\s+/i, '').trim();
                return { tipo: 'ponto_referencia', confianca: 0.85, enderecoLimpo: limpo };
            }

            // Tem número mas sem logradouro — provavelmente endereço parcial
            if (/\d{2,}/.test(t) && t.split(' ').length >= 2) {
                return { tipo: 'endereco_parcial', confianca: 0.75, enderecoLimpo: texto };
            }

            // Tem vírgula — provavelmente "Local, Bairro" ou "Rua X, Cidade"
            if (texto.includes(',')) {
                return { tipo: 'endereco_outro_formato', confianca: 0.7, enderecoLimpo: texto };
            }

            // Tem palavras de bairro/localidade
            if (/(bairro|vila|jardim|setor|quadra|conjunto|residencial|district)/i.test(t)) {
                return { tipo: 'endereco_parcial', confianca: 0.8, enderecoLimpo: texto };
            }

            // Fallback — tratar como texto inválido com baixa confiança
            return { tipo: 'texto_invalido', confianca: 0.5, enderecoLimpo: texto };

        } catch (e) {
            console.error('[RaciocinioService] Erro:', e.message);
            // Anti-falha: nunca crasha o fluxo
            return { tipo: 'texto_invalido', confianca: 0.5, enderecoLimpo: texto };
        }
    },

    /**
     * Decide se uma mensagem numa etapa de endereço deve ser tratada como endereço
     * mesmo que pareça texto informal
     */
    deveTratarComoEndereco(mensagem, etapa) {
        const t = mensagem.toLowerCase().trim();
        const etapasEndereco = ['pedir_origem', 'pedir_destino', 'pedir_destino_rapido',
                                 'cotacao_origem', 'cotacao_destino',
                                 'pedir_origem_encomenda', 'pedir_destino_encomenda'];
        if (!etapasEndereco.includes(etapa)) return false;

        // Palavras claramente não-endereço mesmo nessas etapas
        const naoEndereco = /^(cancelar|menu|ajuda|atendente|sim|nao|não|ok|1|2|3|4|5)$/i;
        if (naoEndereco.test(t)) return false;

        return true;
    }
};

module.exports = RaciocinioService;
