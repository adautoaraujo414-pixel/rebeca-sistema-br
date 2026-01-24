const axios = require('axios');

const CONFIG = {
    baseUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY || '',
    instanceName: process.env.EVOLUTION_INSTANCE || 'rebeca-taxi'
};

const TEMPLATES = {
    CORRIDA_ACEITA: (dados) => 
        `🚗 *REBECA TÁXI*\n\nSeu motorista está a caminho!\n\n👤 Motorista: ${dados.motoristaNome}\n🚙 Veículo: ${dados.veiculoModelo} ${dados.veiculoCor}\n📋 Placa: ${dados.veiculoPlaca}\n⏱️ Tempo estimado: ${dados.tempoEstimado} min`,

    MOTORISTA_CHEGOU: (dados) =>
        `🚗 *REBECA TÁXI*\n\nSeu motorista chegou! 🎉\n\n👤 ${dados.motoristaNome}\n🚙 ${dados.veiculoModelo} ${dados.veiculoCor}\n📋 Placa: ${dados.veiculoPlaca}`,

    CORRIDA_FINALIZADA: (dados) =>
        `🚗 *REBECA TÁXI*\n\nCorrida finalizada! ✅\n\n📍 De: ${dados.origem}\n📍 Para: ${dados.destino}\n📏 Distância: ${dados.distanciaKm} km\n💰 Valor: R$ ${dados.valorFinal.toFixed(2)}\n\nObrigado por viajar conosco! 🙏`,

    CORRIDA_CANCELADA: (dados) =>
        `🚗 *REBECA TÁXI*\n\nSua corrida foi cancelada. 😔\n\n${dados.motivo ? 'Motivo: ' + dados.motivo : ''}\n\nSe precisar, estamos à disposição!`,

    NOVA_CORRIDA: (dados) =>
        `🚗 *NOVA CORRIDA*\n\n👤 Cliente: ${dados.clienteNome}\n📍 Origem: ${dados.origem}\n📍 Destino: ${dados.destino}\n📏 Distância: ${dados.distanciaKm} km\n💰 Valor: R$ ${dados.valorEstimado.toFixed(2)}`,

    BOASVINDAS: (dados) =>
        `🚗 *BEM-VINDO À REBECA TÁXI!*\n\nOlá, ${dados.nome}! 👋\n\nPara solicitar corrida, envie sua localização ou endereço.\n\nEstamos à disposição! 🚗💨`
};

let connectionStatus = { connected: false, lastCheck: null };

const WhatsAppService = {
    TEMPLATES,

    verificarConexao: async () => {
        try {
            const response = await axios.get(
                `${CONFIG.baseUrl}/instance/connectionState/${CONFIG.instanceName}`,
                { headers: { 'apikey': CONFIG.apiKey } }
            );
            connectionStatus = { connected: response.data?.instance?.state === 'open', lastCheck: new Date().toISOString() };
            return connectionStatus;
        } catch (error) {
            connectionStatus.connected = false;
            return connectionStatus;
        }
    },

    enviarMensagem: async (telefone, mensagem) => {
        try {
            let numero = telefone.replace(/\D/g, '');
            if (numero.length === 11 || numero.length === 10) numero = '55' + numero;

            const response = await axios.post(
                `${CONFIG.baseUrl}/message/sendText/${CONFIG.instanceName}`,
                { number: numero, text: mensagem },
                { headers: { 'apikey': CONFIG.apiKey, 'Content-Type': 'application/json' } }
            );
            return { sucesso: true, messageId: response.data?.key?.id, timestamp: new Date().toISOString() };
        } catch (error) {
            console.log('WhatsApp não configurado, mensagem simulada:', mensagem.substring(0, 50) + '...');
            return { sucesso: true, simulado: true, timestamp: new Date().toISOString() };
        }
    },

    enviarLocalizacao: async (telefone, latitude, longitude, nome = '', endereco = '') => {
        try {
            let numero = telefone.replace(/\D/g, '');
            if (numero.length <= 11) numero = '55' + numero;

            await axios.post(
                `${CONFIG.baseUrl}/message/sendLocation/${CONFIG.instanceName}`,
                { number: numero, latitude: latitude.toString(), longitude: longitude.toString(), name: nome, address: endereco },
                { headers: { 'apikey': CONFIG.apiKey, 'Content-Type': 'application/json' } }
            );
            return { sucesso: true, timestamp: new Date().toISOString() };
        } catch (error) {
            return { sucesso: true, simulado: true, timestamp: new Date().toISOString() };
        }
    },

    notificarCorridaAceita: async (telefone, dados) => {
        return WhatsAppService.enviarMensagem(telefone, TEMPLATES.CORRIDA_ACEITA(dados));
    },

    notificarMotoristaChegou: async (telefone, dados) => {
        return WhatsAppService.enviarMensagem(telefone, TEMPLATES.MOTORISTA_CHEGOU(dados));
    },

    notificarCorridaFinalizada: async (telefone, dados) => {
        return WhatsAppService.enviarMensagem(telefone, TEMPLATES.CORRIDA_FINALIZADA(dados));
    },

    notificarCorridaCancelada: async (telefone, dados) => {
        return WhatsAppService.enviarMensagem(telefone, TEMPLATES.CORRIDA_CANCELADA(dados));
    },

    notificarNovaCorrida: async (telefone, dados) => {
        return WhatsAppService.enviarMensagem(telefone, TEMPLATES.NOVA_CORRIDA(dados));
    },

    enviarBoasVindas: async (telefone, nome) => {
        return WhatsAppService.enviarMensagem(telefone, TEMPLATES.BOASVINDAS({ nome }));
    },

    obterStatus: () => connectionStatus
};

module.exports = WhatsAppService;
