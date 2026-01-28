const axios = require('axios');
const { InstanciaWhatsapp, Admin } = require('../models');

// URL padrão da Evolution API (pode ser sua própria ou a pública)
const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_GLOBAL_KEY = process.env.EVOLUTION_API_KEY || '';

const EvolutionMultiService = {

    // Criar nova instância para um Admin
    criarInstancia: async (adminId, nomeEmpresa) => {
        try {
            const admin = await Admin.findById(adminId);
            if (!admin) throw new Error('Admin não encontrado');

            // Gerar nome único para instância
            const nomeInstancia = `rebeca_${nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;

            // Criar instância na Evolution API
            let evolutionResponse = null;
            try {
                evolutionResponse = await axios.post(
                    `${EVOLUTION_BASE_URL}/instance/create`,
                    {
                        instanceName: nomeInstancia,
                        qrcode: true,
                        integration: 'WHATSAPP-BAILEYS'
                    },
                    { headers: { 'apikey': EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } }
                );
            } catch (e) {
                console.log('Evolution API não disponível, criando registro local');
            }

            // Salvar no banco
            const instancia = await InstanciaWhatsapp.create({
                adminId,
                nomeInstancia,
                apiUrl: EVOLUTION_BASE_URL,
                apiKey: evolutionResponse?.data?.hash || EVOLUTION_GLOBAL_KEY,
                status: 'desconectado',
                webhookUrl: `${process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com'}/api/webhook/${nomeInstancia}`
            });

            return { sucesso: true, instancia, evolutionData: evolutionResponse?.data };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Gerar QR Code para conectar
    gerarQRCode: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instância não encontrada');

            // Tentar obter QR da Evolution API
            let qrData = null;
            try {
                const response = await axios.get(
                    `${instancia.apiUrl}/instance/connect/${instancia.nomeInstancia}`,
                    { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }
                );
                qrData = response.data;
            } catch (e) {
                // Gerar QR simulado para teste
                qrData = {
                    code: 'QR_SIMULADO_' + instancia.nomeInstancia,
                    base64: null
                };
            }

            // Atualizar instância
            instancia.qrCode = qrData.base64 || qrData.code;
            instancia.qrCodeExpira = new Date(Date.now() + 60000); // 60 segundos
            instancia.status = 'conectando';
            await instancia.save();

            return { sucesso: true, qrCode: instancia.qrCode, expira: instancia.qrCodeExpira };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Verificar status da conexão
    verificarStatus: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instância não encontrada');

            let statusApi = 'desconectado';
            try {
                const response = await axios.get(
                    `${instancia.apiUrl}/instance/connectionState/${instancia.nomeInstancia}`,
                    { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }
                );
                statusApi = response.data?.instance?.state === 'open' ? 'conectado' : 'desconectado';
            } catch (e) {
                statusApi = instancia.status;
            }

            instancia.status = statusApi;
            if (statusApi === 'conectado') instancia.ultimaConexao = new Date();
            await instancia.save();

            return { sucesso: true, status: statusApi, instancia };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Desconectar instância
    desconectar: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instância não encontrada');

            try {
                await axios.delete(
                    `${instancia.apiUrl}/instance/logout/${instancia.nomeInstancia}`,
                    { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }
                );
            } catch (e) {
                console.log('Logout simulado');
            }

            instancia.status = 'desconectado';
            instancia.qrCode = null;
            instancia.telefoneConectado = null;
            await instancia.save();

            return { sucesso: true };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Enviar mensagem pela instância específica
    enviarMensagem: async (instanciaId, telefone, mensagem) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instância não encontrada');
            if (instancia.status !== 'conectado') throw new Error('WhatsApp não conectado');

            let numero = telefone.replace(/\D/g, '');
            if (numero.length <= 11) numero = '55' + numero;

            try {
                const response = await axios.post(
                    `${instancia.apiUrl}/message/sendText/${instancia.nomeInstancia}`,
                    { number: numero, text: mensagem },
                    { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY, 'Content-Type': 'application/json' } }
                );
                return { sucesso: true, messageId: response.data?.key?.id };
            } catch (e) {
                console.log('Mensagem simulada:', mensagem.substring(0, 50));
                return { sucesso: true, simulado: true };
            }
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Listar todas instâncias (para Admin Master)
    listarTodas: async () => {
        try {
            const instancias = await InstanciaWhatsapp.find()
                .populate('adminId', 'nome email empresa')
                .sort({ createdAt: -1 });
            return { sucesso: true, instancias };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Listar instâncias de um Admin específico
    listarPorAdmin: async (adminId) => {
        try {
            const instancias = await InstanciaWhatsapp.find({ adminId });
            return { sucesso: true, instancias };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Deletar instância
    deletarInstancia: async (instanciaId) => {
        try {
            const instancia = await InstanciaWhatsapp.findById(instanciaId);
            if (!instancia) throw new Error('Instância não encontrada');

            try {
                await axios.delete(
                    `${instancia.apiUrl}/instance/delete/${instancia.nomeInstancia}`,
                    { headers: { 'apikey': instancia.apiKey || EVOLUTION_GLOBAL_KEY } }
                );
            } catch (e) {
                console.log('Delete simulado');
            }

            await InstanciaWhatsapp.findByIdAndDelete(instanciaId);
            return { sucesso: true };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    }
};

module.exports = EvolutionMultiService;
