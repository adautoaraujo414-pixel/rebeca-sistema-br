const { Config } = require('../models');

// Configurações padrão
const configPadrao = {
    taxaBase: 5,
    precoKm: 2.5,
    taxaMinima: 15,
    tempoEspera: 0.5,
    raioDespacho: 5,
    tempoMaximoAceite: 60,
    notificacoes: { tempos: [3, 1, 0] },
    horarioPico: { inicio: '07:00', fim: '09:00', multiplicador: 1.3 },
    horarioNoturno: { inicio: '22:00', fim: '06:00', multiplicador: 1.5 }
};

const ConfigService = {
    // Buscar configuração
    async buscar(chave) {
        const config = await Config.findOne({ chave });
        return config ? config.valor : configPadrao[chave];
    },

    // Salvar configuração
    async salvar(chave, valor) {
        return await Config.findOneAndUpdate(
            { chave },
            { chave, valor },
            { new: true, upsert: true }
        );
    },

    // Buscar todas
    async buscarTodas() {
        const configs = await Config.find();
        const resultado = { ...configPadrao };
        configs.forEach(c => resultado[c.chave] = c.valor);
        return resultado;
    },

    // Salvar múltiplas
    async salvarMultiplas(configs) {
        for (const [chave, valor] of Object.entries(configs)) {
            await this.salvar(chave, valor);
        }
        return await this.buscarTodas();
    },

    // Calcular preço
    async calcularPreco(distanciaKm) {
        const taxaBase = await this.buscar('taxaBase') || 5;
        const precoKm = await this.buscar('precoKm') || 2.5;
        const taxaMinima = await this.buscar('taxaMinima') || 15;
        
        let preco = taxaBase + (distanciaKm * precoKm);
        
        // Aplicar multiplicador de horário
        const multiplicador = this.getMultiplicadorHorario();
        preco *= multiplicador;
        
        return Math.max(preco, taxaMinima);
    },

    getMultiplicadorHorario() {
        const agora = new Date();
        const hora = agora.getHours();
        
        // Horário noturno (22h - 6h)
        if (hora >= 22 || hora < 6) return 1.5;
        
        // Horário pico (7h - 9h e 17h - 19h)
        if ((hora >= 7 && hora < 9) || (hora >= 17 && hora < 19)) return 1.3;
        
        return 1;
    }
};

// Funções usadas pelas rotas
ConfigService.obterConfig = function() {
    return configPadrao;
};

ConfigService.atualizarConfig = function(dados) {
    Object.assign(configPadrao, dados);
    return configPadrao;
};

ConfigService.listarAreas = function(ativas) {
    return [];
};

ConfigService.obterArea = function(id) {
    return null;
};

ConfigService.criarArea = function(dados) {
    return dados;
};

ConfigService.atualizarArea = function(id, dados) {
    return dados;
};

ConfigService.deletarArea = function(id) {
    return true;
};

module.exports = ConfigService;

// Adicionar antes do module.exports
ConfigService.obterConfigWhatsApp = function() {
    return {
        apiUrl: process.env.EVOLUTION_API_URL || 'https://evolution-api-production-794f.up.railway.app',
        apiKey: process.env.EVOLUTION_API_KEY,
        instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'rebeca',
        webhookUrl: (process.env.APP_URL || 'https://rebeca-sistema-br.onrender.com') + '/api/evolution/webhook'
    };
};
