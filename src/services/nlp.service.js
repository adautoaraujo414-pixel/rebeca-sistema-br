/**
 * NLP Service — Entendimento Natural da Linguagem
 * Centraliza toda detecção de intenção para não duplicar lógica
 */

const NLPService = {

    // ==================== NORMALIZAR ====================
    normalizar(msg) {
        if (!msg) return '';
        return msg.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    // ==================== SIM ====================
    eSim(msg) {
        const m = this.normalizar(msg);
        const padroes = [
            /^s$/, /^sim$/, /^si$/, /^ss$/, /^sss$/,
            /^ok$/, /^okay$/, /^ok+$/,
            /^isso$/, /^exato$/, /^exatamente$/,
            /^pode$/, /^pode ser$/, /^pode sim$/, /^pode isso$/,
            /^bora$/, /^bora la$/, /^bora la$/,
            /^vai$/, /^vai la$/, /^vai sim$/,
            /^quero$/, /^quero sim$/, /^quero isso$/,
            /^claro$/, /^claro que sim$/, /^claro sim$/,
            /^com certeza$/, /^certeza$/,
            /^correto$/, /^certo$/, /^ta certo$/,
            /^ta$/, /^ta bom$/, /^ta sim$/, /^ta ok$/,
            /^tá$/, /^tá bom$/, /^tá sim$/,
            /^confirma$/, /^confirmado$/, /^confirmo$/,
            /^manda$/, /^manda sim$/, /^manda la$/,
            /^chama$/, /^chama sim$/, /^chama la$/,
            /^aceito$/, /^aceita$/, /^aceitar$/,
            /^positivo$/, /^afirmativo$/,
            /^com certeza$/, /^sem duvida$/, /^com prazer$/,
            /^perfeito$/, /^combinado$/, /^fechado$/,
            /^beleza$/, /^blz$/, /^vlw$/, /^valeu$/,
            /^1$/, /^digito 1$/
        ];
        // Verificar strings diretas
        const diretas = ['sim', 'pode', 'quero', 'vai', 'bora', 'ok', 'isso', 'claro',
            'confirma', 'confirmado', 'manda', 'chama', 'aceito', 'certo', 'correto',
            'ta bom', 'tá bom', 'beleza', 'com certeza', 'sem duvida', 'exato',
            'fechado', 'combinado', 'perfeito', 'positivo', 'afirmativo'];
        if (diretas.some(p => m === p || m.startsWith(p + ' '))) return true;
        return padroes.some(p => p.test(m));
    },

    // ==================== NÃO ====================
    eNao(msg) {
        const m = this.normalizar(msg);
        const diretas = ['nao', 'n', 'nope', 'negativo', 'nunca', 'jamais',
            'deixa', 'deixa pra la', 'deixa pra depois', 'depois', 'agora nao',
            'nao quero', 'nao precisa', 'nao obrigado', 'obrigado nao',
            'cancela', 'cancelar', 'desisto', 'desistir', 'volta atras',
            'outro', 'mudar', 'diferente', 'errado', 'nao e isso',
            'esquece', 'esquece isso', '2', 'digito 2'];
        if (diretas.some(p => m === p || m === p)) return true;
        return m.startsWith('nao ') || m === 'n';
    },

    // ==================== CANCELAR ====================
    eCancelar(msg) {
        const m = this.normalizar(msg);
        const padroes = ['cancelar', 'cancela', 'cancelei', 'cancelado',
            'desistir', 'desisto', 'desistiu',
            'nao quero mais', 'nao quero', 'nao preciso mais', 'nao vou mais',
            'nao precisa', 'deixa', 'para', 'parar', 'encerrar', 'encerra', 'sair',
            'deixa pra la', 'esquece', 'esquece tudo',
            'pode cancelar', 'vou desistir', 'nao ta mais'];
        // Evitar falsos positivos: 'nao' sozinho nao cancela
        if (m === 'nao' || m === 'n') return false;
        return padroes.some(p => m === p || m.includes(p));
    },

    // ==================== SAUDAÇÃO ====================
    eSaudacao(msg) {
        const m = this.normalizar(msg);
        const padroes = ['oi', 'ola', 'ola', 'hello', 'hi', 'hey',
            'bom dia', 'boa tarde', 'boa noite', 'boa madrugada',
            'tudo bem', 'tudo bom', 'como vai', 'e ai', 'eai',
            'opa', 'salve', 'fala', 'fala ai'];
        return padroes.some(p => m === p || m.startsWith(p + ' ') || m.startsWith(p + '!'));
    },

    // ==================== AGRADECIMENTO ====================
    eAgradecimento(msg) {
        const m = this.normalizar(msg);
        return ['obrigado', 'obrigada', 'valeu', 'vlw', 'muito obrigado',
            'agradeco', 'obg', 'grato', 'grata', 'thanks'].some(p => m.includes(p));
    },

    // ==================== QUER CARRO ====================
    querCarro(msg) {
        const m = this.normalizar(msg);
        return ['quero', 'preciso', 'pedir', 'pedindo', 'chama', 'manda',
            'solicitar', 'solicito', 'uber', 'carro', 'corrida', 'taxi',
            'motorista', 'me leva', 'me busca', 'buscar', 'busca',
            'ir para', 'ir pro', 'ir pra', 'quero ir',
            'preciso ir', 'preciso de um', 'quero um'].some(p => m.includes(p));
    },

    // ==================== SAUDAÇÃO TEMPORAL ====================
    saudacaoTemporal() {
        // Fuso horário de Brasília (UTC-3)
        const agora = new Date();
        const h = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
        if (h >= 5 && h < 12) return 'Bom dia';
        if (h >= 12 && h < 18) return 'Boa tarde';
        if (h >= 18 || h < 5) return 'Boa noite';
        return 'Olá';
    },

    // ==================== CLIENTE FREQUENTE ====================
    mensagemBoasVindas(nome, primeiraVez, corridasRealizadas, ultimosDestinos) {
        const saudacao = this.saudacaoTemporal();
        const nomeDisplay = nome ? ` *${nome.split(' ')[0]}*` : '';

        if (primeiraVez) {
            return `${saudacao}${nomeDisplay}! 😊 Bem-vindo(a)!\n\nSou a Rebeca, sua assistente de transporte.\n\nMe manda o endereço de *onde você está* que chamo um motorista pra você! 🚗`;
        }

        if (corridasRealizadas >= 10) {
            if (ultimosDestinos && ultimosDestinos.length > 0) {
                const dest = ultimosDestinos[0];
                return `${saudacao}${nomeDisplay}! Que bom te ver de novo 😊\n\nVai pro mesmo lugar? *(${dest.endereco.substring(0, 40)}...)*\n\nResponde *SIM* ou me manda o endereço novo!`;
            }
            return `${saudacao}${nomeDisplay}! Que bom te ver de novo 😊\n\nMe manda o endereço de *onde você está* que já chamo um motorista! 🚗`;
        }

        return `${saudacao}${nomeDisplay}! 😊\n\nMe manda o endereço de *onde você está* que chamo um motorista pra você! 🚗`;
    },

    // ==================== DETECTAR CHEGUEI/INICIAR/FINALIZAR (MOTORISTA) ====================
    comandoMotorista(msg) {
        const m = this.normalizar(msg);
        // CHEGUEI
        if (['cheguei', 'to ai', 'to la', 'estou ai', 'estou la', 'cheguei la',
            'to no local', 'to no ponto', 'aqui', 'ja cheguei', 'cheguei sim'].some(p => m.includes(p))) {
            return 'CHEGUEI';
        }
        // INICIAR
        if (['iniciar', 'inicio', 'iniciando', 'comecando', 'partindo', 'saindo',
            'saimos', 'vamos', 'em rota', 'a caminho', 'foi', 'partiu',
            'corrida iniciada', 'iniciei'].some(p => m.includes(p))) {
            return 'INICIAR';
        }
        // FINALIZAR
        if (['finalizar', 'finalizo', 'finalizei', 'finalizado', 'chegamos',
            'cheguei no destino', 'entregue', 'concluido', 'concluir',
            'terminei', 'terminou', 'encerrei', 'corrida finalizada'].some(p => m.includes(p))) {
            return 'FINALIZAR';
        }
        // ACEITAR CORRIDA
        if (['aceitar', 'aceito', 'aceita', 'sim', 'bora', 'pode ser', 'vou', 'pego',
            'pego sim', 'aceito sim', 'ok', 'combinado', 'top', 'pode', 'topo',
            'estou indo', 'vou buscar', 'confirmado'].some(p => m === p || m.includes(p))) {
            return 'ACEITAR';
        }
        // CANCELAR CORRIDA (motorista)
        if (['nao consigo', 'nao vou conseguir', 'cancelar corrida', 'recusar',
            'nao posso aceitar', 'pegar outra', 'recuso'].some(p => m.includes(p))) {
            return 'RECUSAR';
        }
        return null;
    },

    // ==================== VARIAÇÕES DE RESPOSTA ====================
    // Evitar que Rebeca sempre diga a mesma coisa
    variar(chave) {
        const opcoes = {
            msg_enviada: [
                '✅ Mensagem enviada ao motorista!',
                '✅ Mandei pro motorista!',
                '📨 Mensagem repassada!',
            ],
            aguardando: [
                '⏳ Só um instante, estou buscando motorista pra você...',
                '⏳ Aguarda um segundo, já estou localizando!',
                '⏳ Buscando o motorista mais próximo...',
            ],
            nao_entendi: [
                'Desculpa, não entendi bem 😅 Pode repetir?',
                'Me manda de novo? Não captei direito 😊',
                'Pode me explicar melhor? Não entendi 😅',
            ]
        };
        const lista = opcoes[chave] || ['...'];
        return lista[Math.floor(Math.random() * lista.length)];
    }
};

module.exports = NLPService;
