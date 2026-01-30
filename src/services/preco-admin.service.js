const { Admin } = require('../models');

// Configuração padrão (usada quando admin não tem config)
const configPadrao = {
    taxaBase: 5.00,
    precoKm: 2.50,
    taxaMinima: 15.00,
    taxaBandeira2: 3.00,
    precoMinuto: 0.50
};

const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

const PrecoAdminService = {
    // Buscar configuração de preço do admin
    async getConfig(adminId) {
        if (!adminId) return configPadrao;
        
        try {
            const admin = await Admin.findById(adminId);
            if (!admin || !admin.configPrecos) return configPadrao;
            
            return {
                taxaBase: admin.configPrecos.taxaBase || configPadrao.taxaBase,
                precoKm: admin.configPrecos.precoKm || configPadrao.precoKm,
                taxaMinima: admin.configPrecos.taxaMinima || configPadrao.taxaMinima,
                taxaBandeira2: admin.configPrecos.taxaBandeira2 || configPadrao.taxaBandeira2,
                precoMinuto: admin.configPrecos.precoMinuto || configPadrao.precoMinuto
            };
        } catch (e) {
            console.error('[PRECO] Erro ao buscar config:', e.message);
            return configPadrao;
        }
    },

    // Buscar faixa atual do admin
    async getFaixaAtual(adminId) {
        const agora = new Date();
        const diaSemana = diasSemana[agora.getDay()];
        const horaAtual = agora.getHours().toString().padStart(2, '0') + ':' + agora.getMinutes().toString().padStart(2, '0');
        
        // Faixa padrão
        const faixaPadrao = { nome: 'Normal', multiplicador: 1, taxaAdicional: 0 };
        
        if (!adminId) return faixaPadrao;
        
        try {
            const admin = await Admin.findById(adminId);
            if (!admin || !admin.faixasPreco || admin.faixasPreco.length === 0) {
                // Usar faixas padrão do sistema
                return this.getFaixaPadraoSistema(diaSemana, horaAtual);
            }
            
            // Buscar faixa do admin
            const faixa = admin.faixasPreco.find(f => 
                f.ativo && 
                f.diaSemana === diaSemana && 
                horaAtual >= f.horaInicio && 
                horaAtual <= f.horaFim
            );
            
            return faixa || faixaPadrao;
        } catch (e) {
            return faixaPadrao;
        }
    },

    // Faixas padrão do sistema
    getFaixaPadraoSistema(diaSemana, horaAtual) {
        const hora = parseInt(horaAtual.split(':')[0]);
        
        // Madrugada (00-06): +30%
        if (hora >= 0 && hora < 6) {
            return { nome: 'Madrugada', multiplicador: 1.3, taxaAdicional: 2.00 };
        }
        // Pico manhã (06-09): +50%
        if (hora >= 6 && hora < 9) {
            return { nome: 'Pico Manhã', multiplicador: 1.5, taxaAdicional: 0 };
        }
        // Manhã (09-12): normal
        if (hora >= 9 && hora < 12) {
            return { nome: 'Manhã', multiplicador: 1.0, taxaAdicional: 0 };
        }
        // Almoço (12-14): +20%
        if (hora >= 12 && hora < 14) {
            return { nome: 'Almoço', multiplicador: 1.2, taxaAdicional: 0 };
        }
        // Tarde (14-17): normal
        if (hora >= 14 && hora < 17) {
            return { nome: 'Tarde', multiplicador: 1.0, taxaAdicional: 0 };
        }
        // Pico tarde (17-20): +50%
        if (hora >= 17 && hora < 20) {
            return { nome: 'Pico Tarde', multiplicador: 1.5, taxaAdicional: 0 };
        }
        // Noite (20-24): +20%
        return { nome: 'Noite', multiplicador: 1.2, taxaAdicional: 0 };
    },

    // Calcular preço da corrida
    async calcularPreco(adminId, distanciaKm, tempoMinutos = 0) {
        const config = await this.getConfig(adminId);
        const faixa = await this.getFaixaAtual(adminId);
        
        // Cálculo base
        let preco = config.taxaBase + (distanciaKm * config.precoKm);
        
        // Adicionar tempo se houver
        if (tempoMinutos > 0) {
            preco += tempoMinutos * config.precoMinuto;
        }
        
        // Aplicar multiplicador da faixa
        preco = preco * faixa.multiplicador;
        
        // Adicionar taxa adicional da faixa
        preco += faixa.taxaAdicional;
        
        // Garantir taxa mínima
        if (preco < config.taxaMinima) {
            preco = config.taxaMinima;
        }
        
        return {
            preco: Math.round(preco * 100) / 100,
            distanciaKm,
            tempoMinutos,
            faixa: {
                nome: faixa.nome,
                multiplicador: faixa.multiplicador
            },
            config
        };
    },

    // Salvar configuração de preço do admin
    async salvarConfig(adminId, novaConfig) {
        try {
            const admin = await Admin.findByIdAndUpdate(adminId, {
                configPrecos: novaConfig
            }, { new: true });
            return { sucesso: true, config: admin.configPrecos };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Salvar modo de despacho
    async salvarModoDespacho(adminId, modo) {
        try {
            await Admin.findByIdAndUpdate(adminId, {
                'configDespacho.modo': modo
            });
            return { sucesso: true, modo };
        } catch (e) {
            return { sucesso: false, erro: e.message };
        }
    },

    // Buscar modo de despacho
    async getModoDespacho(adminId) {
        if (!adminId) return 'broadcast';
        try {
            const admin = await Admin.findById(adminId);
            return admin?.configDespacho?.modo || 'broadcast';
        } catch (e) {
            return 'broadcast';
        }
    }
};

module.exports = PrecoAdminService;