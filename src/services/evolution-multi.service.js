const axios = require('axios');
const { InstanciaWhatsapp, Admin } = require('../models');

const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_GLOBAL_KEY = process.env.EVOLUTION_API_KEY || '';

const EvolutionMultiService = {
    criarInstancia: async (adminId, nomeEmpresa) => {
        try {
            const admin = await Admin.findById(adminId);
            if (!admin) throw new Error('Admin nao encontrado');
            const nomeInstancia = 'rebeca_' + nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
            let evolutionResponse = null;
            try {
                evolutionResponse = await axios.post(EVOLUTION_BASE_URL + '/instance/create', { instanceName: nomeInstancia, qrcode: true, integration: 'WHATSAPP-BAILEYS' }, { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
            } catch (e) { console.log('Evolution API nao disponivel'); }
            const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook/' + nomeInstancia;
            const instancia = await InstanciaWhatsapp.create({ adminId, nomeInstancia, apiUrl: EVOLUTION_BASE_URL, apiKey: evolutionResponse?.data?.hash || EVOLUTION_GLOBAL_KEY, status: 'desconectado', webhookUrl });
            
            // Configurar webhook na Evolution API
            try {
                await axios.post(EVOLUTION_BASE_URL + '/webhook/set/' + nomeInstancia, {
                    url: webhookUrl,
                    webhook_by_events: false,
                    webhook_base64: false,
                    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                }, { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
                console.log('[EVOLUTION] Webhook configurado:', webhookUrl);
            } catch (e) { console.log('[EVOLUTION] Erro ao configurar webhook:', e.message); }
            
            return { sucesso: true, instancia };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    gerarQRCode: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            let qrData = { code: 'QR_' + instancia.nomeInstancia, base64: null };
            try {
                const response = await axios.get(instancia.apiUrl + '/instance/connect/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } });
                qrData = response.data;
            } catch (e) {}
            instancia.qrCode = qrData.base64 || qrData.code;
            instancia.qrCodeExpira = new Date(Date.now() + 60000);
            instancia.status = 'conectando';
            // Configurar webhook automaticamente
            try {
                const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook/' + instancia.nomeInstancia;
                await axios.post(instancia.apiUrl + '/webhook/set/' + instancia.nomeInstancia, {
                    webhook: {
                        url: webhookUrl,
                        webhook_by_events: false,
                        webhook_base64: false,
                        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
                    }
                }, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
                console.log('[EVOLUTION] Webhook reconfigurado:', webhookUrl);
            } catch (e) { console.log('[EVOLUTION] Webhook ja configurado ou erro:', e.message); }
            await instancia.save();
            return { sucesso: true, qrCode: instancia.qrCode, expira: instancia.qrCodeExpira };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    verificarStatus: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            let statusApi = instancia.status;
            try {
                const response = await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } });
                statusApi = response.data?.instance?.state === 'open' ? 'conectado' : 'desconectado';
            } catch (e) {}
            instancia.status = statusApi;
            if (statusApi === 'conectado') instancia.ultimaConexao = new Date();
            await instancia.save();
            return { sucesso: true, status: statusApi, instancia };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    desconectar: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            try { await axios.delete(instancia.apiUrl + '/instance/logout/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }); } catch (e) {}
            instancia.status = 'desconectado';
            instancia.qrCode = null;
            await instancia.save();
            return { sucesso: true };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    enviarMensagem: async (instanciaId, telefone, mensagem) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            if (instancia.status !== 'conectado') throw new Error('WhatsApp nao conectado');
            let numero = telefone.replace(/\D/g, '');
            if (numero.length <= 11) numero = '55' + numero;
            
            // Enviar "digitando..." primeiro
            try {
                await axios.post(instancia.apiUrl + '/chat/presence/' + instancia.nomeInstancia, { 
                    number: numero + '@s.whatsapp.net', 
                    presence: 'composing' 
                }, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
            } catch (e) {}
            
            // Delay natural (1-3 segundos baseado no tamanho da msg)
            const delay = Math.min(1000 + (mensagem.length * 20), 3000);
            await new Promise(r => setTimeout(r, delay));
            
            try {
                const response = await axios.post(instancia.apiUrl + '/message/sendText/' + instancia.nomeInstancia, { number: numero, text: mensagem }, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
                return { sucesso: true, messageId: response.data?.key?.id };
            } catch (e) { return { sucesso: true, simulado: true }; }
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    listarTodas: async () => {
        try {
            const instancias = await InstanciaWhatsapp.find().populate('adminId', 'nome email empresa').sort({ createdAt: -1 });
            return { sucesso: true, instancias };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    listarPorAdmin: async (adminId) => {
        try {
            const instancias = await InstanciaWhatsapp.find({ adminId });
            return { sucesso: true, instancias };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    deletarInstancia: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            try { await axios.delete(instancia.apiUrl + '/instance/delete/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }); } catch (e) {}
            await InstanciaWhatsapp.findByIdAndDelete(instanciaId);
            return { sucesso: true };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    }
};
module.exports = EvolutionMultiService;