// ========== WHATSAPP EVOLUTION API SERVICE ==========

const WhatsAppService = {
    config: {
        serverUrl: '',
        apiKey: '',
        instanceName: 'ubmax'
    },

    setConfig(serverUrl, apiKey, instanceName) {
        this.config.serverUrl = serverUrl;
        this.config.apiKey = apiKey;
        this.config.instanceName = instanceName || 'ubmax';
    },

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'apikey': this.config.apiKey
        };
    },

    async criarInstancia() {
        try {
            const res = await fetch(`${this.config.serverUrl}/instance/create`, {
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
            return { error: e.message };
        }
    },

    async conectar() {
        try {
            const res = await fetch(`${this.config.serverUrl}/instance/connect/${this.config.instanceName}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await res.json();
        } catch (e) {
            return { error: e.message };
        }
    },

    async getStatus() {
        try {
            const res = await fetch(`${this.config.serverUrl}/instance/connectionState/${this.config.instanceName}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await res.json();
        } catch (e) {
            return { state: 'disconnected', error: e.message };
        }
    },

    async desconectar() {
        try {
            const res = await fetch(`${this.config.serverUrl}/instance/logout/${this.config.instanceName}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await res.json();
        } catch (e) {
            return { error: e.message };
        }
    },

    formatarNumero(telefone) {
        let numero = telefone.replace(/\D/g, '');
        if (!numero.startsWith('55')) numero = '55' + numero;
        return numero;
    },

    async enviarTexto(telefone, mensagem) {
        try {
            const numero = this.formatarNumero(telefone);
            const res = await fetch(`${this.config.serverUrl}/message/sendText/${this.config.instanceName}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ number: numero, text: mensagem })
            });
            const data = await res.json();
            return { sucesso: true, data };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    async notificarCorridaAceita(telefone, motorista, tempo) {
        const msg = `🚗 *UBMAX - Corrida Confirmada!*\n\nMotorista *${motorista.nome}* está a caminho!\n🚙 ${motorista.veiculo} - ${motorista.placa}\n⏱️ Tempo: ${tempo} min`;
        return this.enviarTexto(telefone, msg);
    },

    async notificarMotoristaChegou(telefone, motorista) {
        const msg = `📍 *UBMAX - Motorista Chegou!*\n\n*${motorista.nome}* está te esperando!\n🚙 ${motorista.veiculo} - ${motorista.placa}`;
        return this.enviarTexto(telefone, msg);
    },

    async notificarCorridaFinalizada(telefone, valor, destino) {
        const msg = `✅ *UBMAX - Corrida Finalizada!*\n\nDestino: ${destino}\n💰 Valor: R$ ${valor.toFixed(2)}\n\nObrigado! ⭐`;
        return this.enviarTexto(telefone, msg);
    },

    async notificarMensalidade(telefone, nome, valor, vencimento, chavePix) {
        const msg = `💰 *UBMAX - Mensalidade*\n\nOlá ${nome}!\nSua mensalidade de *R$ ${valor.toFixed(2)}* vence em *${vencimento}*.\n\nChave Pix: ${chavePix}`;
        return this.enviarTexto(telefone, msg);
    },

    async enviarViaRebeca(telefone, mensagem, nomeMotorista) {
        const msg = `🚗 *UBMAX*\n\n${nomeMotorista} diz:\n"${mensagem}"`;
        return this.enviarTexto(telefone, msg);
    }
};

module.exports = WhatsAppService;
