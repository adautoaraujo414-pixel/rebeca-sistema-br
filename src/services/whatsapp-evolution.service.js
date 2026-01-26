// ========== WHATSAPP EVOLUTION API SERVICE ==========
const fetch = require('node-fetch');

const WhatsAppService = {
    // Configurações (serão carregadas do banco)
    config: {
        serverUrl: process.env.EVOLUTION_API_URL || '',
        apiKey: process.env.EVOLUTION_API_KEY || '',
        instanceName: process.env.EVOLUTION_INSTANCE || 'ubmax'
    },

    // Configurar credenciais
    setConfig(serverUrl, apiKey, instanceName) {
        this.config.serverUrl = serverUrl;
        this.config.apiKey = apiKey;
        this.config.instanceName = instanceName || 'ubmax';
    },

    // Headers padrão
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'apikey': this.config.apiKey
        };
    },

    // Base URL
    getBaseUrl() {
        return `${this.config.serverUrl}`;
    },

    // ========== INSTÂNCIA ==========
    
    // Criar instância
    async criarInstancia() {
        try {
            const res = await fetch(`${this.getBaseUrl()}/instance/create`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    instanceName: this.config.instanceName,
                    qrcode: true,
                    integration: 'WHATSAPP-BAILEYS'
                })
            });
            return await res.json();
        } catch (e) {
            console.error('Erro ao criar instância:', e.message);
            return { error: e.message };
        }
    },

    // Conectar instância (gerar QR Code)
    async conectar() {
        try {
            const res = await fetch(`${this.getBaseUrl()}/instance/connect/${this.config.instanceName}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await res.json();
        } catch (e) {
            console.error('Erro ao conectar:', e.message);
            return { error: e.message };
        }
    },

    // Status da instância
    async getStatus() {
        try {
            const res = await fetch(`${this.getBaseUrl()}/instance/connectionState/${this.config.instanceName}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await res.json();
        } catch (e) {
            return { state: 'disconnected', error: e.message };
        }
    },

    // Desconectar
    async desconectar() {
        try {
            const res = await fetch(`${this.getBaseUrl()}/instance/logout/${this.config.instanceName}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await res.json();
        } catch (e) {
            return { error: e.message };
        }
    },

    // ========== MENSAGENS ==========

    // Formatar número BR
    formatarNumero(telefone) {
        let numero = telefone.replace(/\D/g, '');
        if (!numero.startsWith('55')) {
            numero = '55' + numero;
        }
        return numero;
    },

    // Enviar texto
    async enviarTexto(telefone, mensagem) {
        try {
            const numero = this.formatarNumero(telefone);
            const res = await fetch(`${this.getBaseUrl()}/message/sendText/${this.config.instanceName}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    number: numero,
                    text: mensagem
                })
            });
            const data = await res.json();
            console.log(`📱 WhatsApp enviado para ${numero}`);
            return { sucesso: true, data };
        } catch (e) {
            console.error('Erro ao enviar WhatsApp:', e.message);
            return { sucesso: false, erro: e.message };
        }
    },

    // Enviar imagem
    async enviarImagem(telefone, urlImagem, legenda = '') {
        try {
            const numero = this.formatarNumero(telefone);
            const res = await fetch(`${this.getBaseUrl()}/message/sendMedia/${this.config.instanceName}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    number: numero,
                    mediatype: 'image',
                    media: urlImagem,
                    caption: legenda
                })
            });
            return { sucesso: true, data: await res.json() };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Enviar localização
    async enviarLocalizacao(telefone, latitude, longitude, nome = '', endereco = '') {
        try {
            const numero = this.formatarNumero(telefone);
            const res = await fetch(`${this.getBaseUrl()}/message/sendLocation/${this.config.instanceName}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    number: numero,
                    latitude,
                    longitude,
                    name: nome,
                    address: endereco
                })
            });
            return { sucesso: true, data: await res.json() };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Enviar botões
    async enviarBotoes(telefone, titulo, texto, botoes) {
        try {
            const numero = this.formatarNumero(telefone);
            const res = await fetch(`${this.getBaseUrl()}/message/sendButtons/${this.config.instanceName}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    number: numero,
                    title: titulo,
                    description: texto,
                    buttons: botoes.map((b, i) => ({
                        buttonId: `btn_${i}`,
                        buttonText: { displayText: b }
                    }))
                })
            });
            return { sucesso: true, data: await res.json() };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // ========== MENSAGENS UBMAX ==========

    // Notificar cliente sobre corrida aceita
    async notificarCorridaAceita(telefone, motorista, tempoEstimado) {
        const msg = `🚗 *UBMAX - Corrida Confirmada!*\n\n` +
            `Motorista *${motorista.nome}* está a caminho!\n` +
            `🚙 ${motorista.veiculo} - ${motorista.placa}\n` +
            `⏱️ Tempo estimado: ${tempoEstimado} minutos\n\n` +
            `_Aguarde no local de embarque._`;
        return this.enviarTexto(telefone, msg);
    },

    // Notificar motorista chegou
    async notificarMotoristaChegou(telefone, motorista) {
        const msg = `📍 *UBMAX - Motorista Chegou!*\n\n` +
            `*${motorista.nome}* está te esperando!\n` +
            `🚙 ${motorista.veiculo} - ${motorista.placa}\n\n` +
            `_Por favor, dirija-se ao veículo._`;
        return this.enviarTexto(telefone, msg);
    },

    // Notificar corrida finalizada
    async notificarCorridaFinalizada(telefone, valor, destino) {
        const msg = `✅ *UBMAX - Corrida Finalizada!*\n\n` +
            `Você chegou em: ${destino}\n` +
            `💰 Valor: R$ ${valor.toFixed(2)}\n\n` +
            `Obrigado por viajar conosco! ⭐\n` +
            `_Avalie sua corrida no app._`;
        return this.enviarTexto(telefone, msg);
    },

    // Notificar mensalidade
    async notificarMensalidade(telefone, nome, valor, vencimento, chavePix) {
        const msg = `💰 *UBMAX - Mensalidade*\n\n` +
            `Olá ${nome}!\n\n` +
            `Sua mensalidade de *R$ ${valor.toFixed(2)}* vence em *${vencimento}*.\n\n` +
            `Chave Pix: ${chavePix}\n\n` +
            `_Regularize para continuar trabalhando._`;
        return this.enviarTexto(telefone, msg);
    },

    // Notificar bloqueio
    async notificarBloqueio(telefone, nome, valor) {
        const msg = `🔒 *UBMAX - Acesso Bloqueado*\n\n` +
            `Olá ${nome}!\n\n` +
            `Seu acesso foi *bloqueado* por inadimplência.\n` +
            `Valor pendente: *R$ ${valor.toFixed(2)}*\n\n` +
            `_Regularize o pagamento para voltar a trabalhar._`;
        return this.enviarTexto(telefone, msg);
    },

    // Mensagem via Rebeca (motorista -> cliente)
    async enviarViaRebeca(telefone, mensagemMotorista, nomeMotorista) {
        const msg = `🚗 *UBMAX - Mensagem do Motorista*\n\n` +
            `${nomeMotorista} diz:\n` +
            `"${mensagemMotorista}"\n\n` +
            `_Responda esta mensagem para falar com o motorista._`;
        return this.enviarTexto(telefone, msg);
    }
};

module.exports = WhatsAppService;
