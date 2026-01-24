const { v4: uuidv4 } = require('uuid');

// Configuração base
const configBase = {
    taxaBase: 5.00,
    precoKm: 2.50,
    taxaMinima: 15.00,
    taxaBandeira2: 3.00,
    precoMinuto: 0.50
};

const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const faixasPreco = new Map();

// Faixas padrão com opção de valor fixo
const faixasPadrao = [
    // Segunda a Sexta
    { id: 'fx_001', diaSemana: 'segunda', horaInicio: '00:00', horaFim: '05:59', nome: 'Madrugada', tipo: 'multiplicador', multiplicador: 1.3, taxaAdicional: 2.00, valorFixo: 0, ativo: true },
    { id: 'fx_002', diaSemana: 'segunda', horaInicio: '06:00', horaFim: '08:59', nome: 'Pico Manhã', tipo: 'multiplicador', multiplicador: 1.5, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_003', diaSemana: 'segunda', horaInicio: '09:00', horaFim: '11:59', nome: 'Manhã', tipo: 'multiplicador', multiplicador: 1.0, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_004', diaSemana: 'segunda', horaInicio: '12:00', horaFim: '13:59', nome: 'Almoço', tipo: 'multiplicador', multiplicador: 1.2, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_005', diaSemana: 'segunda', horaInicio: '14:00', horaFim: '16:59', nome: 'Tarde', tipo: 'multiplicador', multiplicador: 1.0, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_006', diaSemana: 'segunda', horaInicio: '17:00', horaFim: '19:59', nome: 'Pico Tarde', tipo: 'multiplicador', multiplicador: 1.5, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_007', diaSemana: 'segunda', horaInicio: '20:00', horaFim: '23:59', nome: 'Noite', tipo: 'multiplicador', multiplicador: 1.2, taxaAdicional: 0, valorFixo: 0, ativo: true },
    
    // Sábado
    { id: 'fx_sab_001', diaSemana: 'sabado', horaInicio: '00:00', horaFim: '05:59', nome: 'Madrugada', tipo: 'multiplicador', multiplicador: 1.5, taxaAdicional: 3.00, valorFixo: 0, ativo: true },
    { id: 'fx_sab_002', diaSemana: 'sabado', horaInicio: '06:00', horaFim: '11:59', nome: 'Manhã', tipo: 'multiplicador', multiplicador: 1.0, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_sab_003', diaSemana: 'sabado', horaInicio: '12:00', horaFim: '17:59', nome: 'Tarde', tipo: 'multiplicador', multiplicador: 1.1, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_sab_004', diaSemana: 'sabado', horaInicio: '18:00', horaFim: '23:59', nome: 'Noite', tipo: 'multiplicador', multiplicador: 1.4, taxaAdicional: 2.00, valorFixo: 0, ativo: true },
    
    // Domingo
    { id: 'fx_dom_001', diaSemana: 'domingo', horaInicio: '00:00', horaFim: '05:59', nome: 'Madrugada', tipo: 'multiplicador', multiplicador: 1.5, taxaAdicional: 3.00, valorFixo: 0, ativo: true },
    { id: 'fx_dom_002', diaSemana: 'domingo', horaInicio: '06:00', horaFim: '11:59', nome: 'Manhã', tipo: 'multiplicador', multiplicador: 1.1, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_dom_003', diaSemana: 'domingo', horaInicio: '12:00', horaFim: '17:59', nome: 'Tarde', tipo: 'multiplicador', multiplicador: 1.2, taxaAdicional: 0, valorFixo: 0, ativo: true },
    { id: 'fx_dom_004', diaSemana: 'domingo', horaInicio: '18:00', horaFim: '23:59', nome: 'Noite', tipo: 'multiplicador', multiplicador: 1.3, taxaAdicional: 2.00, valorFixo: 0, ativo: true }
];

// Copiar faixas de segunda para os outros dias úteis
['terca', 'quarta', 'quinta', 'sexta'].forEach(dia => {
    faixasPadrao.filter(f => f.diaSemana === 'segunda').forEach(f => {
        faixasPadrao.push({
            ...f,
            id: 'fx_' + dia.slice(0,3) + '_' + f.id.split('_')[1],
            diaSemana: dia
        });
    });
});

faixasPadrao.forEach(f => faixasPreco.set(f.id, f));

const PrecoDinamicoService = {
    // ==================== CONFIG BASE ====================
    getConfig: () => ({ ...configBase }),
    
    setConfig: (novaConfig) => {
        if (novaConfig.taxaBase !== undefined) configBase.taxaBase = parseFloat(novaConfig.taxaBase);
        if (novaConfig.precoKm !== undefined) configBase.precoKm = parseFloat(novaConfig.precoKm);
        if (novaConfig.taxaMinima !== undefined) configBase.taxaMinima = parseFloat(novaConfig.taxaMinima);
        if (novaConfig.taxaBandeira2 !== undefined) configBase.taxaBandeira2 = parseFloat(novaConfig.taxaBandeira2);
        if (novaConfig.precoMinuto !== undefined) configBase.precoMinuto = parseFloat(novaConfig.precoMinuto);
        return { ...configBase };
    },

    // ==================== FAIXAS DE HORÁRIO ====================
    listarFaixas: (diaSemana = null) => {
        let faixas = Array.from(faixasPreco.values());
        if (diaSemana) {
            faixas = faixas.filter(f => f.diaSemana === diaSemana);
        }
        return faixas.sort((a, b) => {
            const diaOrdem = diasSemana.indexOf(a.diaSemana) - diasSemana.indexOf(b.diaSemana);
            if (diaOrdem !== 0) return diaOrdem;
            return a.horaInicio.localeCompare(b.horaInicio);
        });
    },

    buscarFaixa: (id) => faixasPreco.get(id),

    criarFaixa: (dados) => {
        const id = 'fx_' + uuidv4().slice(0, 8);
        const faixa = {
            id,
            diaSemana: dados.diaSemana,
            horaInicio: dados.horaInicio,
            horaFim: dados.horaFim,
            nome: dados.nome || 'Faixa Personalizada',
            tipo: dados.tipo || 'multiplicador', // 'multiplicador' ou 'fixo'
            multiplicador: parseFloat(dados.multiplicador) || 1.0,
            taxaAdicional: parseFloat(dados.taxaAdicional) || 0,
            valorFixo: parseFloat(dados.valorFixo) || 0,
            ativo: dados.ativo !== false
        };
        faixasPreco.set(id, faixa);
        return faixa;
    },

    atualizarFaixa: (id, dados) => {
        const faixa = faixasPreco.get(id);
        if (!faixa) return null;

        if (dados.horaInicio !== undefined) faixa.horaInicio = dados.horaInicio;
        if (dados.horaFim !== undefined) faixa.horaFim = dados.horaFim;
        if (dados.nome !== undefined) faixa.nome = dados.nome;
        if (dados.tipo !== undefined) faixa.tipo = dados.tipo;
        if (dados.multiplicador !== undefined) faixa.multiplicador = parseFloat(dados.multiplicador);
        if (dados.taxaAdicional !== undefined) faixa.taxaAdicional = parseFloat(dados.taxaAdicional);
        if (dados.valorFixo !== undefined) faixa.valorFixo = parseFloat(dados.valorFixo);
        if (dados.ativo !== undefined) faixa.ativo = dados.ativo;

        faixasPreco.set(id, faixa);
        return faixa;
    },

    excluirFaixa: (id) => {
        return faixasPreco.delete(id);
    },

    copiarFaixas: (diaOrigem, diaDestino) => {
        const faixasOrigem = PrecoDinamicoService.listarFaixas(diaOrigem);
        
        PrecoDinamicoService.listarFaixas(diaDestino).forEach(f => {
            faixasPreco.delete(f.id);
        });

        faixasOrigem.forEach(f => {
            PrecoDinamicoService.criarFaixa({
                ...f,
                diaSemana: diaDestino
            });
        });

        return PrecoDinamicoService.listarFaixas(diaDestino);
    },

    // ==================== CÁLCULO DE PREÇO ====================
    obterFaixaAtual: (data = new Date()) => {
        const diaSemana = diasSemana[data.getDay()];
        const horaAtual = data.toTimeString().slice(0, 5);

        const faixas = PrecoDinamicoService.listarFaixas(diaSemana).filter(f => f.ativo);
        
        for (const faixa of faixas) {
            if (horaAtual >= faixa.horaInicio && horaAtual <= faixa.horaFim) {
                return faixa;
            }
        }

        return {
            id: 'padrao',
            nome: 'Padrão',
            tipo: 'multiplicador',
            multiplicador: 1.0,
            taxaAdicional: 0,
            valorFixo: 0
        };
    },

    calcularPreco: (distanciaKm, tempoMinutos = 0, data = new Date()) => {
        const faixa = PrecoDinamicoService.obterFaixaAtual(data);
        
        let preco = 0;
        let tipoCalculo = 'calculado';

        // Se for valor fixo e tiver valor definido
        if (faixa.tipo === 'fixo' && faixa.valorFixo > 0) {
            preco = faixa.valorFixo;
            tipoCalculo = 'fixo';
        } else {
            // Cálculo normal com multiplicador
            preco = configBase.taxaBase;
            preco += distanciaKm * configBase.precoKm;
            
            if (tempoMinutos > 0) {
                preco += tempoMinutos * configBase.precoMinuto;
            }
            
            preco *= faixa.multiplicador;
            preco += faixa.taxaAdicional;
            
            if (preco < configBase.taxaMinima) {
                preco = configBase.taxaMinima;
            }
        }

        return {
            precoFinal: Math.round(preco * 100) / 100,
            tipoCalculo,
            detalhes: {
                taxaBase: configBase.taxaBase,
                distanciaKm,
                precoKm: configBase.precoKm,
                valorDistancia: Math.round(distanciaKm * configBase.precoKm * 100) / 100,
                tempoMinutos,
                valorTempo: Math.round(tempoMinutos * configBase.precoMinuto * 100) / 100,
                faixa: faixa.nome,
                tipoFaixa: faixa.tipo,
                multiplicador: faixa.multiplicador,
                taxaAdicional: faixa.taxaAdicional,
                valorFixo: faixa.valorFixo,
                precoMinimo: configBase.taxaMinima
            }
        };
    },

    simularPrecos: (distanciaKm, diaSemana) => {
        const faixas = PrecoDinamicoService.listarFaixas(diaSemana).filter(f => f.ativo);
        
        return faixas.map(faixa => {
            const [hora, minuto] = faixa.horaInicio.split(':');
            const data = new Date();
            data.setHours(parseInt(hora), parseInt(minuto), 0);
            
            let precoFinal = 0;
            let tipoCalculo = 'calculado';

            if (faixa.tipo === 'fixo' && faixa.valorFixo > 0) {
                precoFinal = faixa.valorFixo;
                tipoCalculo = 'fixo';
            } else {
                let preco = configBase.taxaBase + (distanciaKm * configBase.precoKm);
                preco *= faixa.multiplicador;
                preco += faixa.taxaAdicional;
                if (preco < configBase.taxaMinima) preco = configBase.taxaMinima;
                precoFinal = Math.round(preco * 100) / 100;
            }
            
            return {
                faixa: faixa.nome,
                horario: `${faixa.horaInicio} - ${faixa.horaFim}`,
                tipo: faixa.tipo,
                multiplicador: faixa.multiplicador,
                valorFixo: faixa.valorFixo,
                taxaAdicional: faixa.taxaAdicional,
                precoFinal,
                tipoCalculo
            };
        });
    },

    getEstatisticas: () => {
        const faixas = Array.from(faixasPreco.values());
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        
        return {
            configBase,
            totalFaixas: faixas.length,
            faixasAtivas: faixas.filter(f => f.ativo).length,
            faixasFixas: faixas.filter(f => f.tipo === 'fixo' && f.valorFixo > 0).length,
            faixaAtual: {
                nome: faixaAtual.nome,
                tipo: faixaAtual.tipo,
                multiplicador: faixaAtual.multiplicador,
                valorFixo: faixaAtual.valorFixo,
                taxaAdicional: faixaAtual.taxaAdicional
            },
            diasConfigurados: [...new Set(faixas.map(f => f.diaSemana))].length
        };
    }
};

module.exports = PrecoDinamicoService;
