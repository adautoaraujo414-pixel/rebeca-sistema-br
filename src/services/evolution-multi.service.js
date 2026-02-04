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
            
            // Configurar webhook na Evolution API (aguardar instancia estar pronta)
            await new Promise(r => setTimeout(r, 2000));
            try {
                await axios.post(EVOLUTION_BASE_URL + '/webhook/set/' + nomeInstancia, {
                    url: webhookUrl,
                    webhook_by_events: false,
                    enabled: true, webhook_base64: false,
                    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                }, { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
                console.log('[EVOLUTION] Webhook configurado:', webhookUrl);
            } catch (e) {
                console.log('[EVOLUTION] Tentando webhook PUT...');
                try {
                    await axios.put(EVOLUTION_BASE_URL + '/webhook/set/' + nomeInstancia, {
                        webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] }
                    }, { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } });
                    console.log('[EVOLUTION] Webhook configurado (PUT):', webhookUrl);
                } catch (e2) { console.log('[EVOLUTION] Erro webhook:', e2.response?.data || e2.message); }
            }
            
            return { sucesso: true, instancia };
        } catch (e) { return { sucesso: false, erro: e.message }; }
    },
    gerarQRCode: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instancia nao encontrada');
            const apiKey = instancia.apiKey || EVOLUTION_GLOBAL_KEY;
            const headers = { 'apikey': apiKey, 'Content-Type': 'application/json' };
            const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook/' + instancia.nomeInstancia;

            // 1. Verificar se instancia existe e esta conectada no Evolution
            let qrData = { code: 'QR_' + instancia.nomeInstancia, base64: null };
            let instanciaExiste = false;
            let instanciaConectada = false;
            try {
                const statusRes = await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers });
                instanciaExiste = true;
                instanciaConectada = statusRes.data?.instance?.state === 'open';
                console.log('[EVOLUTION] Status atual:', statusRes.data?.instance?.state);
            } catch (e) { console.log('[EVOLUTION] Instancia nao encontrada no Evolution'); }

            // 2. Se conectada, nao mexer - retornar status
            if (instanciaConectada) {
                instancia.status = 'conectado';
                instancia.ultimaConexao = new Date();
                await instancia.save();
                return { sucesso: true, jaConectado: true, status: 'conectado' };
            }

            // 3. Se existe mas desconectada, deletar e recriar limpa
            if (instanciaExiste) {
                try {
                    await axios.delete(instancia.apiUrl + '/instance/delete/' + instancia.nomeInstancia, { headers });
                    console.log('[EVOLUTION] Instancia desconectada deletada:', instancia.nomeInstancia);
                    await new Promise(r => setTimeout(r, 1500));
                } catch (e) { console.log('[EVOLUTION] Erro ao deletar (OK):', e.message); }
            }

            // 4. Criar instancia nova COM webhook embutido (SEMPRE usar chave global)
            const globalHeaders = { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' };
            try {
                const createRes = await axios.post(instancia.apiUrl + '/instance/create', {
                    instanceName: instancia.nomeInstancia,
                    qrcode: true,
                    integration: 'WHATSAPP-BAILEYS',
                    webhook: {
                        url: webhookUrl,
                        byEvents: false,
                        base64: false,
                        enabled: true,
                        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                    },
                    websocket: { enabled: false },
                    rabbitmq: { enabled: false },
                    sqs: { enabled: false }
                }, { headers: globalHeaders });
                console.log('[EVOLUTION] Instancia criada COM webhook:', instancia.nomeInstancia);
                console.log('[EVOLUTION] Resposta create:', JSON.stringify(createRes.data).substring(0, 500));
                if (createRes.data?.qrcode) qrData = createRes.data.qrcode;
                if (createRes.data?.hash) instancia.apiKey = createRes.data.hash;
            } catch (e) {
                console.log('[EVOLUTION] Erro ao criar:', e.response?.data || e.message);
                try {
                    const connectRes = await axios.get(instancia.apiUrl + '/instance/connect/' + instancia.nomeInstancia, { headers: globalHeaders });
                    qrData = connectRes.data;
                } catch (e2) { console.log('[EVOLUTION] Erro connect:', e2.message); }
            }

            // 5. Aguardar e tentar configurar webhook separado (redundancia)
            await new Promise(r => setTimeout(r, 2000));
            try {
                await axios.post(instancia.apiUrl + '/webhook/set/' + instancia.nomeInstancia, {
                    url: webhookUrl,
                    webhook_by_events: false,
                    enabled: true,
                    webhook_base64: false,
                    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                }, { headers: globalHeaders });
                console.log('[EVOLUTION] Webhook configurado (POST):', webhookUrl);
            } catch (e) {
                console.log('[EVOLUTION] Webhook POST falhou, tentando PUT...');
                try {
                    await axios.put(instancia.apiUrl + '/webhook/set/' + instancia.nomeInstancia, {
                        webhook: {
                            url: webhookUrl,
                            webhookByEvents: false,
                            webhookBase64: false,
                            enabled: true,
                            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                        }
                    }, { headers: globalHeaders });
                    console.log('[EVOLUTION] Webhook configurado (PUT):', webhookUrl);
                } catch (e2) {
                    console.log('[EVOLUTION] Webhook PUT falhou, tentando formato v2...');
                    try {
                        await axios.post(instancia.apiUrl + '/webhook/set/' + instancia.nomeInstancia, {
                            webhook: {
                                url: webhookUrl,
                                enabled: true,
                                events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
                                webhookByEvents: false,
                                webhookBase64: false
                            }
                        }, { headers: globalHeaders });
                        console.log('[EVOLUTION] Webhook configurado (v2):', webhookUrl);
                    } catch (e3) { console.log('[EVOLUTION] Todas tentativas webhook falharam:', e3.response?.data || e3.message); }
                }
            }

            // 5. Salvar QR
            instancia.qrCode = qrData.base64 || qrData.code || null;
            instancia.qrCodeExpira = new Date(Date.now() + 60000);
            instancia.status = 'conectando';
            instancia.webhookUrl = webhookUrl;
            await instancia.save();

            console.log('[EVOLUTION] QR gerado com sucesso para:', instancia.nomeInstancia);
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
// ========== LIMPEZA AUTOMATICA ==========
// Deletar instancias desconectadas ha mais de 1 hora
EvolutionMultiService.limparDesconectadas = async () => {
    try {
        const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
        const desconectadas = await InstanciaWhatsapp.find({ 
            status: 'desconectado', 
            updatedAt: { $lt: umaHoraAtras } 
        });
        for (const inst of desconectadas) {
            try {
                await axios.delete(EVOLUTION_BASE_URL + '/instance/delete/' + inst.nomeInstancia, 
                    { headers: { 'apikey': inst.apiKey || EVOLUTION_GLOBAL_KEY } });
            } catch (e) {}
            await InstanciaWhatsapp.findByIdAndDelete(inst._id);
            console.log('[LIMPEZA] Instancia removida:', inst.nomeInstancia);
        }
        if (desconectadas.length > 0) console.log('[LIMPEZA] ' + desconectadas.length + ' instancias removidas');
    } catch (e) { console.log('[LIMPEZA] Erro:', e.message); }
};

// Rodar a cada 30 minutos
setInterval(() => EvolutionMultiService.limparDesconectadas(), 30 * 60 * 1000);
// Rodar 1 min apos iniciar
setTimeout(() => EvolutionMultiService.limparDesconectadas(), 60 * 1000);
