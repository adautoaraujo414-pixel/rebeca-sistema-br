// Localidades agora persistem no MongoDB via modelo Admin (array localidades)
const { v4: uuidv4 } = require('uuid');

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
    } catch(e) { console.error('[LOCALIDADE] Erro:', e.message); }
}

const localidadeService = {

    listarLocalidades: async function(adminId, apenasAtivas = false) {
        const admin = await getAdmin(adminId);
        let lista = admin?.localidades || [];
        if (apenasAtivas) lista = lista.filter(l => l.ativo !== false);
        return lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    },

    obterLocalidade: async function(adminId, id) {
        const admin = await getAdmin(adminId);
        return (admin?.localidades || []).find(l => l.id === id) || null;
    },

    criarLocalidade: async function(adminId, dados) {
        const nova = {
            id: 'loc_' + uuidv4().slice(0, 8),
            nome: dados.nome,
            distanciaBase: dados.distanciaBase || 0,
            taxaAdicional: dados.taxaAdicional || 0,
            ativo: true
        };
        await updateAdmin(adminId, { $push: { localidades: nova } });
        return nova;
    },

    atualizarLocalidade: async function(adminId, id, dados) {
        const { Admin } = require('../models');
        const update = {};
        if (dados.nome !== undefined) update['localidades.$[el].nome'] = dados.nome;
        if (dados.distanciaBase !== undefined) update['localidades.$[el].distanciaBase'] = dados.distanciaBase;
        if (dados.taxaAdicional !== undefined) update['localidades.$[el].taxaAdicional'] = dados.taxaAdicional;
        if (dados.ativo !== undefined) update['localidades.$[el].ativo'] = dados.ativo;
        await Admin.findByIdAndUpdate(adminId, { $set: update }, { arrayFilters: [{ 'el.id': id }] });
        return { id, ...dados };
    },

    excluirLocalidade: async function(adminId, id) {
        await updateAdmin(adminId, { $pull: { localidades: { id } } });
        return true;
    },

    // Pontos de referência — já usa modelo próprio PontoReferencia no banco
    carregarPontos: async function(adminId, filtros = {}) {
        try {
            const { PontoReferencia } = require('../models');
            const query = { adminId, ativo: true };
            if (filtros.tipo) query.tipo = filtros.tipo;
            return await PontoReferencia.find(query).lean();
        } catch(e) { return []; }
    },

    buscarPontos: async function(adminId, texto) {
        try {
            const { PontoReferencia } = require('../models');
            const regex = new RegExp(texto, 'i');
            return await PontoReferencia.find({
                adminId, ativo: true,
                $or: [{ nome: regex }, { apelidos: regex }, { endereco: regex }]
            }).lean();
        } catch(e) { return []; }
    },

    criarPonto: async function(adminId, dados) {
        try {
            const { PontoReferencia } = require('../models');
            const ponto = await PontoReferencia.create({ ...dados, adminId });
            return ponto;
        } catch(e) { throw e; }
    }
};

module.exports = localidadeService;
