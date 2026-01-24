const { v4: uuidv4 } = require('uuid');

// Configuração base
const configBase = {
    taxaBase: 5.00,
    precoKm: 2.50,
    taxaMinima: 15.00,
    taxaBandeira2: 3.00, // Adicional noturno/feriado
    precoMinuto: 0.50    // Preço por minuto parado
};

// Dias da semana
const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

// Faixas de preço por horário e dia
const faixasPreco = new Map();

// Inicializar faixas padrão
const faixasPadrao = [
    // Segunda a Sexta
    { id: 'fx_001', diaSemana: 'segunda', horaInicio: '00:00', horaFim: '05:59', nome: 'Madrugada', multiplicador: 1.3, taxaAdicional: 2.00, ativo: true },
    { id: 'fx_002', diaSemana: 'segunda', horaInicio: '06:00', horaFim: '08:59', nome: 'Pico Manhã', multiplicador: 1.5, taxaAdicional: 0, ativo: true },
    { id: 'fx_003', diaSemana: 'segunda', horaInicio: '09:00', horaFim: '11:59', nome: 'Manhã', multiplicador: 1.0, taxaAdicional: 0, ativo: true },
    { id: 'fx_004', diaSemana: 'segunda', horaInicio: '12:00', horaFim: '13:59', nome: 'Almoço', multiplicador: 1.2, taxaAdicional: 0, ativo: true },
    { id: 'fx_005', diaSemana: 'segunda', horaInicio: '14:00', horaFim: '16:59', nome: 'Tarde', multiplicador: 1.0, taxaAdicional: 0, ativo: true },
    { id: 'fx_006', diaSemana: 'segunda', horaInicio: '17:00', horaFim: '19:59', nome: 'Pico Tarde', multiplicador: 1.5, taxaAdicional: 0, ativo: true },
    { id: 'fx_007', diaSemana: 'segunda', horaInicio: '20:00', horaFim: '23:59', nome: 'Noite', multiplicador: 1.2, taxaAdicional: 0, ativo: true },
    
    // Sábado
    { id: 'fx_sab_001', diaSemana: 'sabado', horaInicio: '00:00', horaFim: '05:59', nome: 'Madrugada', multiplicador: 1.5, taxaAdicional: 3.00, ativo: true },
    { id: 'fx_sab_002', diaSemana: 'sabado', horaInicio: '06:00', horaFim: '11:59', nome: 'Manhã', multiplicador: 1.0, taxaAdicional: 0, ativo: true },
    { id: 'fx_sab_003', diaSemana: 'sabado', horaInicio: '12:00', horaFim: '17:59', nome: 'Tarde', multiplicador: 1.1, taxaAdicional: 0, ativo: true },
    { id: 'fx_sab_004', diaSemana: 'sabado', horaInicio: '18:00', horaFim: '23:59', nome: 'Noite', multiplicador: 1.4, taxaAdicional: 2.00, ativo: true },
    
    // Domingo
    { id: 'fx_dom_001', diaSemana: 'domingo', horaInicio: '00:00', horaFim: '05:59', nome: 'Madrugada', multiplicador: 1.5, taxaAdicional: 3.00, ativo: true },
    { id: 'fx_dom_002', diaSemana: 'domingo', horaInicio: '06:00', horaFim: '11:59', nome: 'Manhã', multiplicador: 1.1, taxaAdicional: 0, ativo: true },
    { id: 'fx_dom_003', diaSemana: 'domingo', horaInicio: '12:00', horaFim: '17:59', nome: 'Tarde', multiplicador: 1.2, taxaAdicional: 0, ativo: true },
    { id: 'fx_dom_004', diaSemana: 'domingo', horaInicio: '18:00', horaFim: '23:59', nome: 'Noite', multiplicador: 1.3, taxaAdicional: 2.00, ativo: true }
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
            multiplicador: parseFloat(dados.multiplicador) || 1.0,
            taxaAdicional: parseFloat(dados.taxaAdicional) || 0,
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
        if (dados.multiplicador !== undefined) faixa.multiplicador = parseFloat(dados.multiplicador);
        if (dados.taxaAdicional !== undefined) faixa.taxaAdicional = parseFloat(dados.taxaAdicional);
        if (dados.ativo !== undefined) faixa.ativo = dados.ativo;

        faixasPreco.set(id, faixa);
        return faixa;
    },

    excluirFaixa: (id) => {
        return faixasPreco.delete(id);
    },

    // Copiar faixas de um dia para outro
    copiarFaixas: (diaOrigem, diaDestino) => {
        const faixasOrigem = PrecoDinamicoService.listarFaixas(diaOrigem);
        
        // Remover faixas existentes do destino
        PrecoDinamicoService.listarFaixas(diaDestino).forEach(f => {
            faixasPreco.delete(f.id);
        });

        // Copiar faixas
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
        const horaAtual = data.toTimeString().slice(0, 5); // HH:MM

        const faixas = PrecoDinamicoService.listarFaixas(diaSemana).filter(f => f.ativo);
        
        for (const faixa of faixas) {
            if (horaAtual >= faixa.horaInicio && horaAtual <= faixa.horaFim) {
                return faixa;
            }
        }

        // Retornar faixa padrão se não encontrar
        return {
            id: 'padrao',
            nome: 'Padrão',
            multiplicador: 1.0,
            taxaAdicional: 0
        };
    },

    calcularPreco: (distanciaKm, tempoMinutos = 0, data = new Date()) => {
        const faixa = PrecoDinamicoService.obterFaixaAtual(data);
        
        // Preço base
        let preco = configBase.taxaBase;
        
        // Adicionar por KM
        preco += distanciaKm * configBase.precoKm;
        
        // Adicionar por minuto parado (se aplicável)
        if (tempoMinutos > 0) {
            preco += tempoMinutos * configBase.precoMinuto;
        }
        
        // Aplicar multiplicador da faixa
        preco *= faixa.multiplicador;
        
        // Adicionar taxa adicional da faixa
        preco += faixa.taxaAdicional;
        
        // Garantir preço mínimo
        if (preco < configBase.taxaMinima) {
            preco = configBase.taxaMinima;
        }

        return {
            precoFinal: Math.round(preco * 100) / 100,
            detalhes: {
                taxaBase: configBase.taxaBase,
                distanciaKm,
                precoKm: configBase.precoKm,
                valorDistancia: Math.round(distanciaKm * configBase.precoKm * 100) / 100,
                tempoMinutos,
                valorTempo: Math.round(tempoMinutos * configBase.precoMinuto * 100) / 100,
                faixa: faixa.nome,
                multiplicador: faixa.multiplicador,
                taxaAdicional: faixa.taxaAdicional,
                precoMinimo: configBase.taxaMinima
            }
        };
    },

    // Simular preço em diferentes horários
    simularPrecos: (distanciaKm, diaSemana) => {
        const faixas = PrecoDinamicoService.listarFaixas(diaSemana).filter(f => f.ativo);
        
        return faixas.map(faixa => {
            // Criar data fictícia para a faixa
            const [hora, minuto] = faixa.horaInicio.split(':');
            const data = new Date();
            data.setHours(parseInt(hora), parseInt(minuto), 0);
            
            const calculo = PrecoDinamicoService.calcularPreco(distanciaKm, 0, data);
            
            return {
                faixa: faixa.nome,
                horario: `${faixa.horaInicio} - ${faixa.horaFim}`,
                multiplicador: faixa.multiplicador,
                taxaAdicional: faixa.taxaAdicional,
                precoFinal: calculo.precoFinal
            };
        });
    },

    // ==================== ESTATÍSTICAS ====================
    getEstatisticas: () => {
        const faixas = Array.from(faixasPreco.values());
        const faixaAtual = PrecoDinamicoService.obterFaixaAtual();
        
        return {
            configBase,
            totalFaixas: faixas.length,
            faixasAtivas: faixas.filter(f => f.ativo).length,
            faixaAtual: {
                nome: faixaAtual.nome,
                multiplicador: faixaAtual.multiplicador,
                taxaAdicional: faixaAtual.taxaAdicional
            },
            diasConfigurados: [...new Set(faixas.map(f => f.diaSemana))].length,
            multiplicadorMedio: faixas.length > 0 ? 
                Math.round((faixas.reduce((acc, f) => acc + f.multiplicador, 0) / faixas.length) * 100) / 100 : 1
        };
    }
};

module.exports = PrecoDinamicoService;
