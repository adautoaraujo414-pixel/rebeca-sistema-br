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
            const gH = { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' };
            const webhookUrl = (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook/' + instancia.nomeInstancia;
            let qrData = null;

            // 1. Verificar status atual
            let existe = false, conectada = false;
            try {
                const sr = await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers: gH });
                existe = true;
                conectada = sr.data?.instance?.state === 'open';
                console.log('[EVO] Status:', sr.data?.instance?.state);
            } catch (e) { console.log('[EVO] Instancia nao existe no Evolution'); }

            // 2. Se conectada, retornar
            if (conectada) {
                instancia.status = 'conectado';
                instancia.ultimaConexao = new Date();
                await instancia.save();
                return { sucesso: true, jaConectado: true, status: 'conectado' };
            }

            // 3. Se existe mas desconectada, deletar
            if (existe) {
                try {
                    await axios.delete(instancia.apiUrl + '/instance/delete/' + instancia.nomeInstancia, { headers: gH });
                    console.log('[EVO] Deletada:', instancia.nomeInstancia);
                } catch (e) { console.log('[EVO] Erro delete (ok):', e.message); }
                await new Promise(r => setTimeout(r, 3000));
            }

            // 4. Criar instancia v2 COM webhook no body
            try {
                const cr = await axios.post(instancia.apiUrl + '/instance/create', {
                    instanceName: instancia.nomeInstancia,
                    integration: 'WHATSAPP-BAILEYS',
                    qrcode: true,
                    webhook: {
                        url: webhookUrl,
                        webhookByEvents: false,
                        webhookBase64: false,
                        enabled: true,
                        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                    }
                }, { headers: gH });
                console.log('[EVO] Criada OK:', JSON.stringify(cr.data).substring(0, 400));
                // v2: hash e objeto {apikey: "..."}
                if (cr.data?.hash?.apikey) instancia.apiKey = cr.data.hash.apikey;
                else if (cr.data?.hash && typeof cr.data.hash === 'string') instancia.apiKey = cr.data.hash;
                // QR pode vir no create
                if (cr.data?.qrcode?.base64) qrData = cr.data.qrcode.base64;
                else if (cr.data?.qrcode) qrData = cr.data.qrcode;
            } catch (e) {
                console.log('[EVO] Erro criar:', JSON.stringify(e.response?.data || e.message));
                // Tentar connect direto se ja existe
                try {
                    const cn = await axios.get(instancia.apiUrl + '/instance/connect/' + instancia.nomeInstancia, { headers: gH });
                    console.log('[EVO] Connect OK:', JSON.stringify(cn.data).substring(0, 300));
                    if (cn.data?.base64) qrData = cn.data.base64;
                    else if (cn.data?.code) qrData = cn.data.code;
                } catch (e2) { console.log('[EVO] Connect falhou:', e2.response?.status, e2.response?.data?.response?.message?.[0] || e2.message); }
            }

            // 5. Configurar webhook v2 (aguardar instancia pronta)
            await new Promise(r => setTimeout(r, 3000));
            const whKey = instancia.apiKey || EVOLUTION_GLOBAL_KEY;
            try {
                const wr = await axios.post(instancia.apiUrl + '/webhook/set/' + instancia.nomeInstancia, {
                    enabled: true,
                    url: webhookUrl,
                    webhookByEvents: false,
                    webhookBase64: false,
                    events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE']
                }, { headers: { 'apikey': whKey, 'Content-Type': 'application/json' } });
                console.log('[EVO] Webhook OK:', webhookUrl);
                console.log('[EVO] Webhook resp:', JSON.stringify(wr.data).substring(0, 200));
            } catch (e) { console.log('[EVO] Webhook FALHOU:', e.response?.status, JSON.stringify(e.response?.data || e.message)); }

            // 6. Salvar
            instancia.qrCode = qrData || ('QR_' + instancia.nomeInstancia);
            instancia.qrCodeExpira = new Date(Date.now() + 60000);
            instancia.status = 'conectando';
            instancia.webhookUrl = webhookUrl;
            await instancia.save();
            console.log('[EVO] QR salvo, tem base64:', !!qrData);
            return { sucesso: true, qrCode: instancia.qrCode, expira: instancia.qrCodeExpira };
        } catch (e) { console.log('[EVO] ERRO GERAL:', e.message); return { sucesso: false, erro: e.message }; }
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
    enviarMensagem: async (instanciaId, telefone, mensagem, tentativa = 1) => {
        const MAX_TENTATIVAS = 3;
        try {
            let instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) {
                // Tentar encontrar qualquer instância conectada
                instancia = await InstanciaWhatsapp.findOne({ status: 'conectado' });
                if (!instancia) throw new Error('Nenhuma instancia disponivel');
            }
            
            let numero = telefone.replace(/\D/g, '');
            if (numero.length <= 11) numero = '55' + numero;
            
            // Delay natural curto
            const delay = Math.min(500 + (mensagem.length * 10), 1500);
            await new Promise(r => setTimeout(r, delay));
            
            try {
                console.log('[EVO] Enviando msg para:', numero, '(tentativa', tentativa + ')');
                const response = await axios.post(instancia.apiUrl + '/message/sendText/' + instancia.nomeInstancia, { number: numero, text: mensagem }, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
                console.log('[EVO] Msg enviada OK');
                return { sucesso: true, messageId: response.data?.key?.id };
            } catch (e) { 
                const erroMsg = e.response?.data?.response?.message?.[0] || e.message;
                console.log('[EVO] ERRO ao enviar:', erroMsg);
                
                // Se Connection Closed, tentar reconectar e reenviar
                if (erroMsg?.includes?.('Connection Closed') || erroMsg?.includes?.('not connected')) {
                    console.log('[EVO] Conexao perdida! Tentando reconectar...');
                    
                    // Marcar como desconectado
                    await InstanciaWhatsapp.findByIdAndUpdate(instancia._id, { status: 'desconectado' });
                    
                    // Tentar reconectar via Evolution API
                    try {
                        await axios.get(instancia.apiUrl + '/instance/connect/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } });
                        await new Promise(r => setTimeout(r, 3000)); // Aguardar reconexão
                        
                        // Verificar status
                        const statusRes = await axios.get(instancia.apiUrl + '/instance/connectionState/' + instancia.nomeInstancia, { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } });
                        if (statusRes.data?.instance?.state === 'open') {
                            await InstanciaWhatsapp.findByIdAndUpdate(instancia._id, { status: 'conectado', ultimaConexao: new Date() });
                            console.log('[EVO] Reconectado com sucesso!');
                            
                            // Retry
                            if (tentativa < MAX_TENTATIVAS) {
                                return await EvolutionMultiService.enviarMensagem(instanciaId, telefone, mensagem, tentativa + 1);
                            }
                        }
                    } catch (reconErr) {
                        console.log('[EVO] Falha ao reconectar:', reconErr.message);
                    }
                }
                
                // Retry genérico
                if (tentativa < MAX_TENTATIVAS) {
                    console.log('[EVO] Tentando novamente em 2s...');
                    await new Promise(r => setTimeout(r, 2000));
                    return await EvolutionMultiService.enviarMensagem(instanciaId, telefone, mensagem, tentativa + 1);
                }
                
                return { sucesso: false, erro: erroMsg }; 
            }
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
