const { v4: uuidv4 } = require('uuid');

const alertas = new Map();
const blacklist = new Map();
const regras = new Map();
const historicoPontuacao = new Map();

// Regras de detecção padrão
const regrasDefault = [
    { id: 'regra_001', nome: 'Muitos cancelamentos', tipo: 'motorista', campo: 'cancelamentos_dia', operador: '>', valor: 5, pontos: 30, ativo: true },
    { id: 'regra_002', nome: 'Muitos cancelamentos cliente', tipo: 'cliente', campo: 'cancelamentos_dia', operador: '>', valor: 3, pontos: 25, ativo: true },
    { id: 'regra_003', nome: 'Corrida muito curta', tipo: 'corrida', campo: 'distancia_km', operador: '<', valor: 0.3, pontos: 20, ativo: true },
    { id: 'regra_004', nome: 'Corrida muito longa', tipo: 'corrida', campo: 'distancia_km', operador: '>', valor: 100, pontos: 15, ativo: true },
    { id: 'regra_005', nome: 'Velocidade impossível', tipo: 'gps', campo: 'velocidade_kmh', operador: '>', valor: 200, pontos: 50, ativo: true },
    { id: 'regra_006', nome: 'Teleporte GPS', tipo: 'gps', campo: 'distancia_segundos', operador: '>', valor: 1, pontos: 60, ativo: true },
    { id: 'regra_007', nome: 'Avaliação suspeita', tipo: 'avaliacao', campo: 'mesmo_ip', operador: '=', valor: true, pontos: 40, ativo: true },
    { id: 'regra_008', nome: 'Conta nova com muitas corridas', tipo: 'cliente', campo: 'corridas_primeira_hora', operador: '>', valor: 5, pontos: 35, ativo: true },
    { id: 'regra_009', nome: 'Mesmo dispositivo múltiplas contas', tipo: 'dispositivo', campo: 'contas_dispositivo', operador: '>', valor: 2, pontos: 70, ativo: true },
    { id: 'regra_010', nome: 'Horário suspeito', tipo: 'corrida', campo: 'hora', operador: 'entre', valor: [2, 5], pontos: 10, ativo: true }
];

regrasDefault.forEach(r => regras.set(r.id, r));

// Alertas de exemplo
const alertasExemplo = [
    {
        id: 'alerta_001',
        tipo: 'motorista',
        entidadeId: 'mot_002',
        entidadeNome: 'João Santos',
        nivel: 'alto',
        pontuacao: 75,
        motivos: ['Muitos cancelamentos (7 hoje)', 'GPS inconsistente detectado'],
        status: 'pendente',
        dataCriacao: new Date(Date.now() - 3600000).toISOString(),
        dataAnalise: null,
        analisadoPor: null,
        resolucao: null
    },
    {
        id: 'alerta_002',
        tipo: 'cliente',
        entidadeId: 'cli_003',
        entidadeNome: 'Pedro Almeida',
        nivel: 'medio',
        pontuacao: 45,
        motivos: ['3 cancelamentos seguidos', 'Conta criada há menos de 1 hora'],
        status: 'analisando',
        dataCriacao: new Date(Date.now() - 7200000).toISOString(),
        dataAnalise: new Date(Date.now() - 1800000).toISOString(),
        analisadoPor: 'Admin',
        resolucao: null
    }
];

alertasExemplo.forEach(a => alertas.set(a.id, a));

// Blacklist exemplo
const blacklistExemplo = [
    { id: 'bl_001', tipo: 'telefone', valor: '11999990000', motivo: 'Fraude confirmada - múltiplas contas', dataBloqueio: '2026-01-20T10:00:00Z', bloqueadoPor: 'Sistema' },
    { id: 'bl_002', tipo: 'cpf', valor: '000.000.000-00', motivo: 'CPF inválido usado em fraude', dataBloqueio: '2026-01-19T15:30:00Z', bloqueadoPor: 'Admin' }
];

blacklistExemplo.forEach(b => blacklist.set(b.id, b));

const AntiFraudeService = {
    // ==================== ANÁLISE EM TEMPO REAL ====================
    analisarCorrida: (corrida) => {
        const alertasGerados = [];
        let pontuacaoTotal = 0;

        // Verificar distância
        if (corrida.distanciaKm < 0.3) {
            pontuacaoTotal += 20;
            alertasGerados.push('Corrida muito curta (' + corrida.distanciaKm + ' km)');
        }
        if (corrida.distanciaKm > 100) {
            pontuacaoTotal += 15;
            alertasGerados.push('Corrida muito longa (' + corrida.distanciaKm + ' km)');
        }

        // Verificar horário
        const hora = new Date(corrida.dataSolicitacao).getHours();
        if (hora >= 2 && hora <= 5) {
            pontuacaoTotal += 10;
            alertasGerados.push('Horário suspeito (' + hora + ':00)');
        }

        // Verificar preço vs distância
        const precoEsperado = corrida.distanciaKm * 2.5 + 5;
        if (corrida.precoEstimado > precoEsperado * 2) {
            pontuacaoTotal += 25;
            alertasGerados.push('Preço muito acima do esperado');
        }

        if (pontuacaoTotal >= 30) {
            AntiFraudeService.criarAlerta({
                tipo: 'corrida',
                entidadeId: corrida.id,
                entidadeNome: 'Corrida ' + corrida.id.slice(-6),
                pontuacao: pontuacaoTotal,
                motivos: alertasGerados
            });
        }

        return { pontuacao: pontuacaoTotal, alertas: alertasGerados, aprovado: pontuacaoTotal < 50 };
    },

    analisarGPS: (motoristaId, novaLocalizacao, localizacaoAnterior) => {
        if (!localizacaoAnterior) return { suspeito: false };

        const distancia = AntiFraudeService.calcularDistancia(
            localizacaoAnterior.latitude, localizacaoAnterior.longitude,
            novaLocalizacao.latitude, novaLocalizacao.longitude
        );

        const tempoSegundos = (new Date(novaLocalizacao.timestamp) - new Date(localizacaoAnterior.timestamp)) / 1000;
        const velocidadeKmh = tempoSegundos > 0 ? (distancia / tempoSegundos) * 3600 : 0;

        const alertasGerados = [];
        let pontuacao = 0;

        // Teleporte (mais de 1km em menos de 1 segundo)
        if (distancia > 1 && tempoSegundos < 1) {
            pontuacao += 60;
            alertasGerados.push('Teleporte GPS detectado (' + distancia.toFixed(2) + ' km instantâneo)');
        }

        // Velocidade impossível
        if (velocidadeKmh > 200) {
            pontuacao += 50;
            alertasGerados.push('Velocidade impossível (' + velocidadeKmh.toFixed(0) + ' km/h)');
        }

        if (pontuacao >= 50) {
            AntiFraudeService.criarAlerta({
                tipo: 'motorista',
                entidadeId: motoristaId,
                entidadeNome: 'Motorista ' + motoristaId,
                pontuacao,
                motivos: alertasGerados
            });
        }

        return { suspeito: pontuacao >= 50, velocidadeKmh, distancia, alertas: alertasGerados };
    },

    analisarMotorista: (motorista, estatisticas) => {
        const alertasGerados = [];
        let pontuacao = 0;

        // Muitos cancelamentos
        if (estatisticas.cancelamentosHoje > 5) {
            pontuacao += 30;
            alertasGerados.push('Muitos cancelamentos hoje (' + estatisticas.cancelamentosHoje + ')');
        }

        // Avaliação caindo rápido
        if (estatisticas.avaliacaoSemanaPassada - motorista.avaliacao > 1) {
            pontuacao += 20;
            alertasGerados.push('Avaliação caindo rapidamente');
        }

        // Taxa de conclusão baixa
        if (estatisticas.taxaConclusao < 0.5) {
            pontuacao += 25;
            alertasGerados.push('Taxa de conclusão baixa (' + (estatisticas.taxaConclusao * 100).toFixed(0) + '%)');
        }

        return { pontuacao, alertas: alertasGerados, risco: pontuacao >= 50 ? 'alto' : pontuacao >= 30 ? 'medio' : 'baixo' };
    },

    analisarCliente: (cliente, estatisticas) => {
        const alertasGerados = [];
        let pontuacao = 0;

        // Muitos cancelamentos
        if (estatisticas.cancelamentosHoje > 3) {
            pontuacao += 25;
            alertasGerados.push('Muitos cancelamentos hoje (' + estatisticas.cancelamentosHoje + ')');
        }

        // Conta muito nova com muita atividade
        const horasCadastro = (Date.now() - new Date(cliente.dataCadastro)) / (1000 * 60 * 60);
        if (horasCadastro < 1 && estatisticas.corridasTotal > 5) {
            pontuacao += 35;
            alertasGerados.push('Conta nova com muitas corridas');
        }

        // Nunca avalia
        if (estatisticas.corridasTotal > 10 && estatisticas.avaliacoesFeitas === 0) {
            pontuacao += 15;
            alertasGerados.push('Nunca avalia motoristas');
        }

        return { pontuacao, alertas: alertasGerados, risco: pontuacao >= 50 ? 'alto' : pontuacao >= 25 ? 'medio' : 'baixo' };
    },

    // ==================== BLACKLIST ====================
    verificarBlacklist: (tipo, valor) => {
        const items = Array.from(blacklist.values());
        return items.find(b => b.tipo === tipo && b.valor === valor) || null;
    },

    adicionarBlacklist: (dados) => {
        const id = 'bl_' + uuidv4().slice(0, 8);
        const item = {
            id,
            tipo: dados.tipo,
            valor: dados.valor,
            motivo: dados.motivo,
            dataBloqueio: new Date().toISOString(),
            bloqueadoPor: dados.bloqueadoPor || 'Sistema'
        };
        blacklist.set(id, item);
        return item;
    },

    removerBlacklist: (id) => blacklist.delete(id),

    listarBlacklist: (tipo = null) => {
        let items = Array.from(blacklist.values());
        if (tipo) items = items.filter(b => b.tipo === tipo);
        return items.sort((a, b) => new Date(b.dataBloqueio) - new Date(a.dataBloqueio));
    },

    // ==================== ALERTAS ====================
    criarAlerta: (dados) => {
        const id = 'alerta_' + uuidv4().slice(0, 8);
        const nivel = dados.pontuacao >= 70 ? 'critico' : dados.pontuacao >= 50 ? 'alto' : dados.pontuacao >= 30 ? 'medio' : 'baixo';
        
        const alerta = {
            id,
            tipo: dados.tipo,
            entidadeId: dados.entidadeId,
            entidadeNome: dados.entidadeNome,
            nivel,
            pontuacao: dados.pontuacao,
            motivos: dados.motivos || [],
            status: 'pendente',
            dataCriacao: new Date().toISOString(),
            dataAnalise: null,
            analisadoPor: null,
            resolucao: null
        };
        
        alertas.set(id, alerta);
        console.log('🚨 ALERTA FRAUDE:', nivel.toUpperCase(), '-', dados.entidadeNome, '-', dados.motivos.join(', '));
        return alerta;
    },

    listarAlertas: (filtros = {}) => {
        let resultado = Array.from(alertas.values());
        if (filtros.status) resultado = resultado.filter(a => a.status === filtros.status);
        if (filtros.nivel) resultado = resultado.filter(a => a.nivel === filtros.nivel);
        if (filtros.tipo) resultado = resultado.filter(a => a.tipo === filtros.tipo);
        return resultado.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
    },

    obterAlerta: (id) => alertas.get(id),

    analisarAlerta: (id, analisadoPor) => {
        const alerta = alertas.get(id);
        if (!alerta) return null;
        alerta.status = 'analisando';
        alerta.dataAnalise = new Date().toISOString();
        alerta.analisadoPor = analisadoPor;
        alertas.set(id, alerta);
        return alerta;
    },

    resolverAlerta: (id, resolucao, acao = null) => {
        const alerta = alertas.get(id);
        if (!alerta) return null;
        alerta.status = 'resolvido';
        alerta.resolucao = resolucao;
        
        // Se ação for bloquear, adiciona à blacklist
        if (acao === 'bloquear' && alerta.entidadeId) {
            AntiFraudeService.adicionarBlacklist({
                tipo: alerta.tipo,
                valor: alerta.entidadeId,
                motivo: resolucao,
                bloqueadoPor: alerta.analisadoPor
            });
        }
        
        alertas.set(id, alerta);
        return alerta;
    },

    ignorarAlerta: (id, motivo) => {
        const alerta = alertas.get(id);
        if (!alerta) return null;
        alerta.status = 'ignorado';
        alerta.resolucao = motivo;
        alertas.set(id, alerta);
        return alerta;
    },

    // ==================== REGRAS ====================
    listarRegras: () => Array.from(regras.values()),

    obterRegra: (id) => regras.get(id),

    atualizarRegra: (id, dados) => {
        const regra = regras.get(id);
        if (!regra) return null;
        const atualizada = { ...regra, ...dados, id };
        regras.set(id, atualizada);
        return atualizada;
    },

    // ==================== ESTATÍSTICAS ====================
    obterEstatisticas: () => {
        const lista = Array.from(alertas.values());
        const bl = Array.from(blacklist.values());
        
        return {
            alertas: {
                total: lista.length,
                pendentes: lista.filter(a => a.status === 'pendente').length,
                analisando: lista.filter(a => a.status === 'analisando').length,
                resolvidos: lista.filter(a => a.status === 'resolvido').length,
                porNivel: {
                    critico: lista.filter(a => a.nivel === 'critico').length,
                    alto: lista.filter(a => a.nivel === 'alto').length,
                    medio: lista.filter(a => a.nivel === 'medio').length,
                    baixo: lista.filter(a => a.nivel === 'baixo').length
                },
                porTipo: {
                    motorista: lista.filter(a => a.tipo === 'motorista').length,
                    cliente: lista.filter(a => a.tipo === 'cliente').length,
                    corrida: lista.filter(a => a.tipo === 'corrida').length
                }
            },
            blacklist: {
                total: bl.length,
                porTipo: {
                    telefone: bl.filter(b => b.tipo === 'telefone').length,
                    cpf: bl.filter(b => b.tipo === 'cpf').length,
                    dispositivo: bl.filter(b => b.tipo === 'dispositivo').length
                }
            }
        };
    },

    // ==================== HELPERS ====================
    calcularDistancia: (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
};

module.exports = AntiFraudeService;
