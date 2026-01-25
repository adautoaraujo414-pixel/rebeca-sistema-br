const { Motorista } = require('../models');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const MotoristaService = {
    // Listar todos
    async listar(filtros = {}) {
        const query = {};
        if (filtros.status) query.status = filtros.status;
        if (filtros.ativo !== undefined) query.ativo = filtros.ativo;
        return await Motorista.find(query).sort({ createdAt: -1 });
    },

    // Buscar por ID
    async buscarPorId(id) {
        return await Motorista.findById(id);
    },

    // Buscar por WhatsApp
    async buscarPorWhatsapp(whatsapp) {
        return await Motorista.findOne({ whatsapp });
    },

    // Buscar por Token
    async buscarPorToken(token) {
        return await Motorista.findOne({ token });
    },

    // Criar motorista
    async criar(dados) {
        const token = 'MOT_' + uuidv4().substring(0, 8).toUpperCase() + '_' + Date.now();
        const motorista = new Motorista({
            ...dados,
            token,
            status: 'offline',
            avaliacao: 5,
            corridasRealizadas: 0,
            saldoDevedor: 0,
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
            latitude,
            longitude,
            ultimaAtualizacaoGPS: new Date()
        }, { new: true });
    },

    // Listar disponíveis
    async listarDisponiveis() {
        return await Motorista.find({ status: 'disponivel', ativo: true });
    },

    // Buscar mais próximo
    async buscarMaisProximo(latitude, longitude) {
        const disponiveis = await this.listarDisponiveis();
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
        const motorista = await this.buscarPorWhatsapp(whatsapp);
        if (!motorista) return { sucesso: false, erro: 'Motorista não encontrado' };
        if (!motorista.ativo) return { sucesso: false, erro: 'Conta desativada' };
        
        // Por enquanto senha simples, depois usar bcrypt
        if (motorista.senha && motorista.senha !== senha) {
            return { sucesso: false, erro: 'Senha incorreta' };
        }

        await this.atualizarStatus(motorista._id, 'disponivel');
        return { sucesso: true, motorista, token: motorista.token };
    },

    // Estatísticas
    async estatisticas() {
        const total = await Motorista.countDocuments();
        const ativos = await Motorista.countDocuments({ ativo: true });
        const disponiveis = await Motorista.countDocuments({ status: 'disponivel', ativo: true });
        const emCorrida = await Motorista.countDocuments({ status: 'em_corrida' });
        return { total, ativos, disponiveis, emCorrida };
    }
};

module.exports = MotoristaService;
