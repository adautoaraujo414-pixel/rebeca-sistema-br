const WhatsAppService = {
    config: { serverUrl: '', apiKey: '', instanceName: 'ubmax' },
    setConfig(serverUrl, apiKey, instanceName) {
        this.config.serverUrl = serverUrl;
        this.config.apiKey = apiKey;
        this.config.instanceName = instanceName || 'ubmax';
    },
    getHeaders() { return { 'Content-Type': 'application/json', 'apikey': this.config.apiKey }; },
    async criarInstancia() {
        try {
            const res = await fetch(this.config.serverUrl + '/instance/create', { method: 'POST', headers: this.getHeaders(), body: JSON.stringify({ instanceName: this.config.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }) });
            return await res.json();
        } catch (e) { return { error: e.message }; }
    },
    async conectar() {
        try {
            const res = await fetch(this.config.serverUrl + '/instance/connect/' + this.config.instanceName, { method: 'GET', headers: this.getHeaders() });
            return await res.json();
        } catch (e) { return { error: e.message }; }
    },
    async getStatus() {
        try {
            const res = await fetch(this.config.serverUrl + '/instance/connectionState/' + this.config.instanceName, { method: 'GET', headers: this.getHeaders() });
            return await res.json();
        } catch (e) { return { state: 'disconnected', error: e.message }; }
    },
    async desconectar() {
        try {
            const res = await fetch(this.config.serverUrl + '/instance/logout/' + this.config.instanceName, { method: 'DELETE', headers: this.getHeaders() });
            return await res.json();
        } catch (e) { return { error: e.message }; }
    },
    formatarNumero(tel) { let n = tel.replace(/\D/g, ''); if (!n.startsWith('55')) n = '55' + n; return n; },
    async enviarTexto(telefone, mensagem) {
        try {
            const res = await fetch(this.config.serverUrl + '/message/sendText/' + this.config.instanceName, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify({ number: this.formatarNumero(telefone), text: mensagem }) });
            return { sucesso: true, data: await res.json() };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    }
};
module.exports = WhatsAppService;
