const { Admin } = require('../models');
const PrecoSimplesService = require('./preco-simples.service');

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

    // Verificar se origem está dentro de alguma zona de preço ativa
    async verificarZonaPreco(adminId, lat, lng) {
        if (!adminId || !lat || !lng) return null;
        try {
            const { ZonaPreco } = require('../models');
            const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            const diaAtual = agora.getDay();
            const horaAtual = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');

            const zonas = await ZonaPreco.find({ adminId, ativo: true });
            for (const z of zonas) {
                // Verificar dia/hora se configurado
                if (z.diasSemana && z.diasSemana.length > 0 && !z.diasSemana.includes(diaAtual)) continue;
                if (horaAtual < z.horaInicio || horaAtual > z.horaFim) continue;

                // Calcular distância do centro da zona até a origem (fórmula de Haversine simplificada)
                const R = 6371; // km
                const dLat = (lat - z.lat) * Math.PI / 180;
                const dLng = (lng - z.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(z.lat * Math.PI/180) * Math.cos(lat * Math.PI/180) *
                          Math.sin(dLng/2) * Math.sin(dLng/2);
                const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

                if (distKm <= z.raioKm) {
                    console.log('[ZONA PRECO] Origem dentro da zona "' + z.nome + '" (dist: ' + distKm.toFixed(2) + 'km / raio: ' + z.raioKm + 'km) — R$ ' + z.precoFixo);
                    return { zona: z, precoFixo: z.precoFixo, distKm };
                }
            }
            return null;
        } catch(e) {
            console.log('[ZONA PRECO] Erro:', e.message);
            return null;
        }
    },

    // Buscar configuração de preço do admin — retorna tudo
    async getConfig(adminId) {
        if (!adminId) return configPadrao;
        try {
            const admin = await Admin.findById(adminId).lean();
            if (!admin) return configPadrao;
            const cp = admin.configPrecos || {};
            return {
                // taxas base
                taxaBase:      cp.taxaBase      || configPadrao.taxaBase,
                precoKm:       cp.precoKm       || configPadrao.precoKm,
                taxaMinima:    cp.taxaMinima    || configPadrao.taxaMinima,
                taxaBandeira2: cp.taxaBandeira2 || configPadrao.taxaBandeira2,
                precoMinuto:   cp.precoMinuto   || configPadrao.precoMinuto,
                // modo e estruturas completas
                modoPreco:     admin.modoPreco     || 'simples',
                precosSimples: admin.precosSimples || null,
                precoFixo:     admin.precoFixo     || { ativo: false, valor: 0 },
                faixasPreco:   admin.faixasPreco   || [],
                configDespacho:admin.configDespacho|| { modo: 'broadcast', tempoAceite: 30 }
            };
        } catch (e) {
            console.error('[PRECO] Erro ao buscar config:', e.message);
            return configPadrao;
        }
    },

    // Buscar faixa atual do admin — lê do banco, com fallback para precosSimples
    async getFaixaAtual(adminId) {
        const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const diasSemanaStr = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
        const diaSemana = diasSemanaStr[agora.getDay()];
        const horaAtual = agora.getHours().toString().padStart(2,'0') + ':' + agora.getMinutes().toString().padStart(2,'0');

        const faixaPadrao = { id: 'padrao', nome: 'Padrão', multiplicador: 1.0, taxaAdicional: 0, tipo: 'multiplicador' };

        if (!adminId) return faixaPadrao;
        try {
            const admin = await Admin.findById(adminId).lean();
            if (!admin) return faixaPadrao;

            // 1) precoFixo de evento ativo — sobrescreve tudo
            if (admin.precoFixo?.ativo && admin.precoFixo?.valor) {
                return { id: 'fixo_evento', nome: admin.precoFixo.motivo || 'Evento', tipo: 'fixo', valorFixo: admin.precoFixo.valor, multiplicador: 1, taxaAdicional: 0 };
            }

            // 2) faixasPreco personalizadas do admin (salvas no banco)
            const faixas = (admin.faixasPreco || []).filter(f => f.ativo !== false);
            for (const f of faixas) {
                const dias = Array.isArray(f.diasSemana) ? f.diasSemana : [f.diaSemana];
                if (!dias.includes(diaSemana) && !dias.includes('todos')) continue;
                if (horaAtual >= f.horaInicio && horaAtual <= f.horaFim) {
                    return { id: f._id?.toString() || 'faixa', nome: f.nome || 'Faixa', multiplicador: f.multiplicador || 1, taxaAdicional: f.taxaAdicional || 0, tipo: 'multiplicador' };
                }
            }

            // 3) precosSimples (semana/sabado/domingo por período)
            if (admin.modoPreco === 'simples' && admin.precosSimples) {
                const ps = admin.precosSimples;
                const grupo = (agora.getDay() === 0) ? ps.domingo : (agora.getDay() === 6) ? ps.sabado : ps.semana;
                if (grupo) {
                    const h = agora.getHours();
                    let periodo, valor;
                    if (h >= 6  && h < 12) { periodo = 'manha';     valor = grupo.manha; }
                    else if (h >= 12 && h < 18) { periodo = 'tarde';     valor = grupo.tarde; }
                    else if (h >= 18 && h < 24) { periodo = 'noite';     valor = grupo.noite; }
                    else                        { periodo = 'madrugada'; valor = grupo.madrugada; }
                    if (valor) return { id: 'simples_' + periodo, nome: periodo.charAt(0).toUpperCase() + periodo.slice(1), tipo: 'fixo_minimo', taxaMinima: valor, multiplicador: 1, taxaAdicional: 0 };
                }
            }
        } catch(e) { console.log('[FAIXA] Erro:', e.message); }
        return faixaPadrao;
    },

    // Alias para compatibilidade
    async getFaixaHoraria(adminId) { return this.getFaixaAtual(adminId); },

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
        // PRIMEIRO: Tentar preço simples
        const precoSimples = await PrecoSimplesService.calcularPreco(adminId);
        if (precoSimples && precoSimples.periodo !== 'erro') {
            // Se não retornou null (modo calculado), usar preço simples
            if (precoSimples.preco) {
                return {
                    preco: precoSimples.preco,
                    precoFinal: precoSimples.preco,
                    distanciaKm,
                    tempoMinutos,
                    faixa: { nome: precoSimples.detalhes || precoSimples.periodo, multiplicador: 1 },
                    modoPreco: 'simples',
                    detalhes: precoSimples.motivo || `${precoSimples.tipoDia} - ${precoSimples.periodo}`
                };
            }
        }
        
        // FALLBACK: Usar cálculo por km com config real do admin
        const config = await this.getConfig(adminId);
        const faixa = await this.getFaixaAtual(adminId);
        const taxaMinima = faixa.taxaMinima || config.taxaMinima || 15;

        // Cálculo base
        let preco = (config.taxaBase || 5) + (distanciaKm * (config.precoKm || 2.50));

        // Adicionar tempo se houver
        if (tempoMinutos > 0) {
            preco += tempoMinutos * (config.precoMinuto || 0.50);
        }

        // Aplicar multiplicador da faixa
        preco = preco * (faixa.multiplicador || 1);

        // Adicionar taxa adicional da faixa
        preco += (faixa.taxaAdicional || 0);

        // Garantir taxa mínima
        if (preco < taxaMinima) {
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

    // Salvar configuração de preço do admin — persiste TUDO no banco
    async salvarConfig(adminId, novaConfig) {
        try {
            const update = {};

            // configPrecos (taxas base)
            if (novaConfig.taxaBase !== undefined || novaConfig.precoKm !== undefined ||
                novaConfig.taxaMinima !== undefined || novaConfig.taxaBandeira2 !== undefined ||
                novaConfig.precoMinuto !== undefined || novaConfig.configPrecos) {
                const cp = novaConfig.configPrecos || novaConfig;
                update.configPrecos = {
                    taxaBase:     parseFloat(cp.taxaBase)     || 5.00,
                    precoKm:      parseFloat(cp.precoKm)      || 2.50,
                    taxaMinima:   parseFloat(cp.taxaMinima)   || 15.00,
                    taxaBandeira2:parseFloat(cp.taxaBandeira2)|| 3.00,
                    precoMinuto:  parseFloat(cp.precoMinuto)  || 0.50
                };
            }

            // modoPreco (simples | calculado)
            if (novaConfig.modoPreco) update.modoPreco = novaConfig.modoPreco;

            // precosSimples (semana/sabado/domingo por período)
            if (novaConfig.precosSimples) update.precosSimples = novaConfig.precosSimples;

            // precoFixo (evento/festa)
            if (novaConfig.precoFixo !== undefined) update.precoFixo = novaConfig.precoFixo;

            // faixasPreco (array de faixas personalizadas)
            if (Array.isArray(novaConfig.faixasPreco)) update.faixasPreco = novaConfig.faixasPreco;

            // configDespacho
            if (novaConfig.configDespacho) update.configDespacho = novaConfig.configDespacho;

            const admin = await Admin.findByIdAndUpdate(adminId, update, { new: true });
            if (!admin) return { sucesso: false, erro: 'Admin não encontrado' };

            console.log('[PRECO] Config salva para admin', adminId, '— campos:', Object.keys(update).join(', '));
            return {
                sucesso: true,
                config: {
                    configPrecos:  admin.configPrecos,
                    modoPreco:     admin.modoPreco,
                    precosSimples: admin.precosSimples,
                    precoFixo:     admin.precoFixo,
                    faixasPreco:   admin.faixasPreco,
                    configDespacho:admin.configDespacho
                }
            };
        } catch (e) {
            console.error('[PRECO] Erro salvarConfig:', e.message);
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

    // Item 3 — Calcular preço para cidade cadastrada (fixo) ou por km (não cadastrada)
    async calcularPrecoCidade(adminId, cidadeOrigem, cidadeDestino, distanciaKm) {
        try {
            const { PrecoCidade } = require('../models');
            // Buscar preço fixo cadastrado para essa rota
            const rota = await PrecoCidade.findOne({
                adminId,
                ativo: true,
                $or: [
                    { cidadeOrigem: new RegExp(cidadeOrigem, 'i'), cidadeDestino: new RegExp(cidadeDestino, 'i') },
                    { cidadeOrigem: new RegExp(cidadeDestino, 'i'), cidadeDestino: new RegExp(cidadeOrigem, 'i') }
                ]
            }).lean();

            if (rota && rota.precoFixo) {
                console.log('[PRECO CIDADE] Rota cadastrada:', cidadeOrigem, '->', cidadeDestino, 'R$', rota.precoFixo);
                return { precoFixo: rota.precoFixo, tipo: 'fixo', rota: rota.nome || cidadeDestino };
            }

            // Cidade não cadastrada — calcular por km
            if (distanciaKm) {
                const config = await this.getConfig(adminId);
                const faixa = await this.getFaixaAtual(adminId);
                const precoKm = (config.precoKm || 2.50) * (faixa.multiplicador || 1);
                const preco = Math.max(config.taxaMinima || 15, distanciaKm * precoKm + (config.taxaBase || 5));
                console.log('[PRECO CIDADE] Rota por km:', distanciaKm, 'km x R$', precoKm, '= R$', preco.toFixed(2));
                return { precoFixo: parseFloat(preco.toFixed(2)), tipo: 'km', distanciaKm };
            }

            return null; // sem dados suficientes
        } catch(e) {
            console.log('[PRECO CIDADE] Erro:', e.message);
            return null;
        }
    },

module.exports = PrecoAdminService;