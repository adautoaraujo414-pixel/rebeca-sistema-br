'use strict';
/**
 * whatsapp.provider.js
 * Adapter — mesma interface do EvolutionMultiService
 * Roteia para Meta API ou Evolution conforme provider do admin
 * Zero mudança nos arquivos existentes — só trocar o require
 */

const MetaWA = require('./meta-whatsapp.service');

async function _getProvider(instanciaId) {
    const GLOBAL = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    if (!instanciaId) return GLOBAL;
    try {
        const { InstanciaWhatsapp } = require('../models');
        const inst = await InstanciaWhatsapp.findById(instanciaId).select('provider');
        if (inst?.provider) return inst.provider.toLowerCase();
    } catch(e) {}
    return GLOBAL;
}

async function enviarMensagem(instanciaId, telefone, mensagem, tentativa = 1) {
    const provider = await _getProvider(instanciaId);
    if (provider === 'meta') {
        console.log(`[WPP] META → ${telefone}`);
        return MetaWA.enviarTexto(telefone, mensagem);
    }
    return require('./evolution-multi.service').enviarMensagem(instanciaId, telefone, mensagem, tentativa);
}

async function enviarImagem(instanciaId, telefone, urlImagem, legenda = '') {
    const provider = await _getProvider(instanciaId);
    if (provider === 'meta') {
        console.log(`[WPP] META imagem → ${telefone}`);
        return MetaWA.enviarImagem(telefone, urlImagem, legenda);
    }
    return require('./evolution-multi.service').enviarImagem(instanciaId, telefone, urlImagem, legenda);
}

async function criarInstancia(adminId, nomeEmpresa) {
    const GLOBAL = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    if (GLOBAL === 'meta') {
        const { InstanciaWhatsapp } = require('../models');
        const existing = await InstanciaWhatsapp.findOne({ adminId, provider: 'meta' });
        if (existing) return { sucesso: true, instancia: existing, jaExistia: true };
        const inst = await InstanciaWhatsapp.create({
            adminId,
            nomeInstancia: 'meta_' + nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g,'_') + '_' + Date.now(),
            provider: 'meta',
            status: 'conectado',
            apiUrl: 'https://graph.facebook.com/v20.0',
            apiKey: process.env.META_WA_TOKEN || '',
            metaPhoneId: process.env.META_WA_PHONE_ID || '',
        });
        return { sucesso: true, instancia: inst };
    }
    return require('./evolution-multi.service').criarInstancia(adminId, nomeEmpresa);
}

async function gerarQRCode(instanciaId) {
    const provider = await _getProvider(instanciaId);
    if (provider === 'meta') {
        return {
            sucesso: false,
            meta: true,
            mensagem: 'Meta API não usa QR Code. Configure o número no Meta Business Manager.',
            url: 'https://business.facebook.com/wa/manage/phone-numbers/'
        };
    }
    return require('./evolution-multi.service').gerarQRCode(instanciaId);
}

async function verificarStatus(instanciaId) {
    const provider = await _getProvider(instanciaId);
    if (provider === 'meta') {
        const r = await MetaWA.testarConexao();
        return { status: r.sucesso ? 'conectado' : 'desconectado', provider: 'meta', dados: r.dados };
    }
    return require('./evolution-multi.service').verificarStatus(instanciaId);
}

async function desconectar(instanciaId) {
    const provider = await _getProvider(instanciaId);
    if (provider === 'meta') {
        return { sucesso: false, meta: true, mensagem: 'Gerencie pelo Meta Business Manager.' };
    }
    return require('./evolution-multi.service').desconectar(instanciaId);
}

async function listarTodas() {
    const GLOBAL = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    if (GLOBAL === 'meta') {
        const { InstanciaWhatsapp } = require('../models');
        return InstanciaWhatsapp.find({ provider: 'meta' });
    }
    return require('./evolution-multi.service').listarTodas();
}

async function listarPorAdmin(adminId) {
    const { InstanciaWhatsapp } = require('../models');
    return InstanciaWhatsapp.find({ adminId });
}

async function deletarInstancia(instanciaId) {
    const provider = await _getProvider(instanciaId);
    if (provider === 'meta') {
        const { InstanciaWhatsapp } = require('../models');
        await InstanciaWhatsapp.findByIdAndDelete(instanciaId);
        return { sucesso: true, meta: true };
    }
    return require('./evolution-multi.service').deletarInstancia(instanciaId);
}

async function fetchProfilePictureUrl(instanciaId, telefone) {
    const provider = await _getProvider(instanciaId);
    if (provider === 'meta') return null; // Meta requer permissão especial
    try {
        const { InstanciaWhatsapp } = require('../models');
        const inst = await InstanciaWhatsapp.findById(instanciaId);
        if (!inst) return null;
        const axios = require('axios');
        const r = await axios.get(inst.apiUrl + '/chat/fetchProfilePictureUrl/' + inst.nomeInstancia, {
            params: { number: telefone + '@s.whatsapp.net' },
            headers: { 'apikey': inst.apiKey || process.env.EVOLUTION_API_KEY },
            timeout: 5000
        });
        return r.data?.profilePictureUrl || null;
    } catch(e) { return null; }
}

async function limparDesconectadas() {
    const GLOBAL = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    if (GLOBAL === 'meta') return;
    try { return require('./evolution-multi.service').limparDesconectadas?.(); } catch(e) {}
}

async function obterInstanciaAdmin(adminId) {
    const { InstanciaWhatsapp } = require('../models');
    return InstanciaWhatsapp.findOne({ adminId, status: { $in: ['conectado','open','connected'] } });
}

module.exports = {
    enviarMensagem, enviarImagem, criarInstancia, gerarQRCode,
    verificarStatus, desconectar, listarTodas, listarPorAdmin,
    deletarInstancia, fetchProfilePictureUrl, limparDesconectadas,
    obterInstanciaAdmin, _getProvider,
};
