const { Motorista } = require('../models');
const { v4: uuidv4 } = require('uuid');

const MotoristaService = {
    // Listar todos (filtrado por admin)
    async listar(adminId, filtros = {}) {
        const query = { adminId };
        if (filtros.status) query.status = filtros.status;
        if (filtros.ativo !== undefined) query.ativo = filtros.ativo;
        return await Motorista.find(query).sort({ createdAt: -1 });
    },

    // Buscar por ID
    async buscarPorId(id) {
        return await Motorista.findById(id);
    },

    // Buscar por WhatsApp (dentro do admin)
    async buscarPorWhatsapp(whatsapp, adminId = null) {
        const query = { whatsapp };
        if (adminId) query.adminId = adminId;
        return await Motorista.findOne(query);
    },

    // Buscar por Token
    async buscarPorToken(token) {
        return await Motorista.findOne({ token });
    },

    // Criar motorista (com adminId)
    async criar(dados, adminId) {
        const token = 'MOT_' + uuidv4().substring(0, 8).toUpperCase() + '_' + Date.now();
        const motorista = new Motorista({
            ...dados,
            adminId,
            token,
            status: 'offline',
            avaliacao: 5,
            corridasRealizadas: 0,
            ativo: true
        });
        return await motorista.save();
    },

    // Atualizar motorista
    async atualizar(id, dados) {
        return await Motorista.findByIdAndUpdate(id, dados, { new: true });
    },

    // Deletar motorista
    async deletar(id) {
        return await Motorista.findByIdAndDelete(id);
    },

    // Atualizar status
    async atualizarStatus(id, status) {
        return await Motorista.findByIdAndUpdate(id, { status }, { new: true });
    },

    // Atualizar GPS
    async atualizarGPS(id, latitude, longitude) {
        return await Motorista.findByIdAndUpdate(id, {
            latitude, longitude, ultimaAtualizacaoGPS: new Date()
        }, { new: true });
    },

    // Listar disponiveis (filtrado por admin)
    async listarDisponiveis(adminId) {
        const query = { status: 'disponivel', ativo: true };
        if (adminId) query.adminId = adminId;
        return await Motorista.find(query);
    },

    // Buscar mais proximo (filtrado por admin)
    async buscarMaisProximo(latitude, longitude, adminId) {
        const disponiveis = await this.listarDisponiveis(adminId);
        if (disponiveis.length === 0) return null;

        let maisProximo = null;
        let menorDistancia = Infinity;

        for (const mot of disponiveis) {
            if (mot.latitude && mot.longitude) {
                const dist = this.calcularDistancia(latitude, longitude, mot.latitude, mot.longitude);
                if (dist < menorDistancia) {
                    menorDistancia = dist;
                    maisProximo = mot;
                }
            }
        }
        return maisProximo;
    },

    calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    // Login motorista
    async login(whatsapp, senha) {
        if (!whatsapp) return { sucesso: false, erro: 'Digite o WhatsApp' };
        if (!senha) return { sucesso: false, erro: 'Digite a senha PIN' };
        // Normalizar WhatsApp - tentar com e sem 55
        let motorista = await Motorista.findOne({ whatsapp });
        if (!motorista && !whatsapp.startsWith('55')) {
            motorista = await Motorista.findOne({ whatsapp: '55' + whatsapp });
        }
        if (!motorista && whatsapp.startsWith('55')) {
            motorista = await Motorista.findOne({ whatsapp: whatsapp.substring(2) });
        }
        if (!motorista) return { sucesso: false, erro: 'Motorista nao encontrado. Verifique o numero do WhatsApp.' };
        if (!motorista.ativo) return { sucesso: false, erro: 'Conta desativada' };
        if (motorista.senha && motorista.senha !== senha) {
            return { sucesso: false, erro: 'Senha PIN incorreta' };
        }
        await this.atualizarStatus(motorista._id, 'disponivel');
        return { sucesso: true, motorista, token: motorista.token };
    },

    // Estatisticas (filtrado por admin)
    async estatisticas(adminId) {
        const query = adminId ? { adminId } : {};
        const total = await Motorista.countDocuments(query);
        const ativos = await Motorista.countDocuments({ ...query, ativo: true });
        const disponiveis = await Motorista.countDocuments({ ...query, status: 'disponivel', ativo: true });
        const emCorrida = await Motorista.countDocuments({ ...query, status: 'em_corrida' });
        return { total, ativos, disponiveis, emCorrida };
    }
};

module.exports = MotoristaService;