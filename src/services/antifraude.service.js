const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// Regras padrão (não precisam persistir — são fixas)
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
const regras = new Map();
regrasDefault.forEach(r => regras.set(r.id, r));

// Helper para pegar Admin do banco
async function getAdmin(adminId) {
    if (!adminId) return null;
    try {
        const { Admin } = require('../models');
        return await Admin.findById(adminId).lean();
    } catch(e) { return null; }
}
async function updateAdmin(adminId, update) {
    try {
        const { Admin } = require('../models');
        await Admin.findByIdAndUpdate(adminId, update);
    } catch(e) { console.error('[ANTIFRAUDE] Erro update:', e.message); }
}

const AntiFraudeService = {

    // ==================== BLACKLIST (persiste no banco) ====================
    listarBlacklist: async function(adminId, tipo) {
        const admin = await getAdmin(adminId);
        let lista = admin?.blacklist || [];
        if (tipo) lista = lista.filter(i => i.tipo === tipo);
        return lista;
    },

    verificarBlacklist: async function(tipo, valor, adminId) {
        const admin = await getAdmin(adminId);
        const lista = admin?.blacklist || [];
        return lista.find(i => i.tipo === tipo && i.valor === valor) || null;
    },

    // Versão sync para compatibilidade com motorista-app.routes (usa cache em memória 60s)
    _blacklistCache: new Map(),
    verificarBlacklistSync: function(tipo, valor) {
        const key = tipo + ':' + valor;
        return this._blacklistCache.get(key) || null;
    },
    _atualizarCacheBlacklist: async function(adminId) {
        const admin = await getAdmin(adminId);
        (admin?.blacklist || []).forEach(i => {
            this._blacklistCache.set(i.tipo + ':' + i.valor, i);
        });
    },

    adicionarBlacklist: async function(adminId, dados) {
        const item = {
            id: 'bl_' + uuidv4().slice(0, 8),
            tipo: dados.tipo,
            valor: dados.valor,
            motivo: dados.motivo || 'Adicionado manualmente',
            dataBloqueio: new Date().toISOString(),
            bloqueadoPor: dados.bloqueadoPor || 'Admin'
        };
        await updateAdmin(adminId, { $push: { blacklist: item } });
        this._blacklistCache.set(item.tipo + ':' + item.valor, item);
        return item;
    },

    removerBlacklist: async function(adminId, id) {
        await updateAdmin(adminId, { $pull: { blacklist: { id } } });
        // Limpar cache
        for (const [k, v] of this._blacklistCache.entries()) {
            if (v.id === id) this._blacklistCache.delete(k);
        }
        return true;
    },

    // ==================== ALERTAS (persiste no banco) ====================
    listarAlertas: async function(filtros = {}) {
        const admin = await getAdmin(filtros.adminId);
        let lista = admin?.alertasAntifraude || [];
        if (filtros.status) lista = lista.filter(a => a.status === filtros.status);
        if (filtros.nivel) lista = lista.filter(a => a.nivel === filtros.nivel);
        if (filtros.tipo) lista = lista.filter(a => a.tipo === filtros.tipo);
        return lista.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
    },

    obterAlerta: async function(adminId, id) {
        const admin = await getAdmin(adminId);
        return (admin?.alertasAntifraude || []).find(a => a.id === id) || null;
    },

    criarAlerta: async function(adminId, dados) {
        const alerta = {
            id: 'alerta_' + uuidv4().slice(0, 8),
            tipo: dados.tipo,
            entidadeId: dados.entidadeId,
            entidadeNome: dados.entidadeNome,
            nivel: dados.nivel || 'medio',
            pontuacao: dados.pontuacao || 0,
            motivos: dados.motivos || [],
            status: 'pendente',
            dataCriacao: new Date().toISOString(),
            dataAnalise: null,
            analisadoPor: null,
            resolucao: null
        };
        await updateAdmin(adminId, { $push: { alertasAntifraude: alerta } });
        return alerta;
    },

    resolverAlerta: async function(adminId, id, resolucao) {
        const { Admin } = require('../models');
        await Admin.findByIdAndUpdate(adminId, {
            $set: {
                'alertasAntifraude.$[el].status': 'resolvido',
                'alertasAntifraude.$[el].resolucao': resolucao,
                'alertasAntifraude.$[el].dataAnalise': new Date().toISOString()
            }
        }, { arrayFilters: [{ 'el.id': id }] });
        return { id, resolucao, status: 'resolvido' };
    },

    analisarAlerta: async function(adminId, id, analisadoPor) {
        const { Admin } = require('../models');
        await Admin.findByIdAndUpdate(adminId, {
            $set: {
                'alertasAntifraude.$[el].status': 'analisando',
                'alertasAntifraude.$[el].analisadoPor': analisadoPor,
                'alertasAntifraude.$[el].dataAnalise': new Date().toISOString()
            }
        }, { arrayFilters: [{ 'el.id': id }] });
        return { id, status: 'analisando' };
    },

    ignorarAlerta: async function(adminId, id, motivo) {
        const { Admin } = require('../models');
        await Admin.findByIdAndUpdate(adminId, {
            $set: {
                'alertasAntifraude.$[el].status': 'ignorado',
                'alertasAntifraude.$[el].resolucao': motivo
            }
        }, { arrayFilters: [{ 'el.id': id }] });
        return { id, status: 'ignorado' };
    },

    // ==================== REGRAS (fixas em memória — não mudam) ====================
    listarRegras: () => Array.from(regras.values()),
    obterRegra: (id) => regras.get(id) || null,
    atualizarRegra: (id, dados) => {
        const r = regras.get(id);
        if (!r) return null;
        Object.assign(r, dados);
        regras.set(id, r);
        return r;
    },

    // ==================== ESTATÍSTICAS ====================
    obterEstatisticas: async function(adminId) {
        const admin = await getAdmin(adminId);
        const alertasList = admin?.alertasAntifraude || [];
        const blacklistList = admin?.blacklist || [];
        return {
            alertas: {
                total: alertasList.length,
                pendentes: alertasList.filter(a => a.status === 'pendente').length,
                resolvidos: alertasList.filter(a => a.status === 'resolvido').length,
                porNivel: {
                    critico: alertasList.filter(a => a.nivel === 'critico').length,
                    alto: alertasList.filter(a => a.nivel === 'alto').length,
                    medio: alertasList.filter(a => a.nivel === 'medio').length
                }
            },
            blacklist: { total: blacklistList.length },
            regras: { total: regras.size, ativas: Array.from(regras.values()).filter(r => r.ativo).length }
        };
    },

    // ==================== ANÁLISE ====================
    analisarCorrida: (corrida) => ({ score: 0, alertas: [], corrida }),
    analisarMotorista: (motorista, stats) => ({ score: 0, alertas: [] }),
    analisarCliente: (cliente, stats) => ({ score: 0, alertas: [] })
};

module.exports = AntiFraudeService;
