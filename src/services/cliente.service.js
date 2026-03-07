const { Cliente } = require('../models');

const ClienteService = {
    async listar(adminId) {
        const query = adminId ? { adminId } : {};
        return await Cliente.find(query).sort({ createdAt: -1 });
    },

    buscarPorId(id) {
        return Cliente.findById(id);
    },

    buscarPorTelefone(telefone, adminId = null) {
        const query = { telefone };
        if (adminId) query.adminId = adminId;
        return Cliente.findOne(query);
    },

    criar(dados) {
        const cliente = new Cliente(dados);
        return cliente.save();
    },

    atualizar(id, dados) {
        return Cliente.findByIdAndUpdate(id, dados, { new: true });
    },

    deletar(id) {
        return Cliente.findByIdAndDelete(id);
    },

    async estatisticas(adminId) {
        const query = adminId ? { adminId } : {};
        const total = await Cliente.countDocuments(query);
        const novos = await Cliente.countDocuments({ ...query, createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } });
        return { total, novos };
    },

    async listarTodos(filtros = {}) {
        const query = {};
        if (filtros.adminId) query.adminId = filtros.adminId;
        if (filtros.bloqueado !== undefined) query.bloqueado = filtros.bloqueado;
        if (filtros.busca) {
            query.$or = [
                { nome: { $regex: filtros.busca, $options: "i" } },
                { telefone: { $regex: filtros.busca, $options: "i" } }
            ];
        }
        return await Cliente.find(query).sort({ createdAt: -1 });
    },

    obterEstatisticas(adminId) {
        return this.estatisticas(adminId);
    },

    // ==================== HISTÓRICO DE DESTINOS ====================
    async salvarDestino(telefone, adminId, destino) {
        try {
            if (!destino || !destino.endereco || destino.endereco.length < 5) return;
            const cliente = await this.buscarPorTelefone(telefone, adminId);
            if (!cliente) return;

            const endNorm = destino.endereco.toLowerCase().substring(0, 80);
            const destinos = cliente.ultimosDestinos || [];

            // Verificar se já existe
            const idx = destinos.findIndex(d =>
                d.endereco && d.endereco.toLowerCase().substring(0, 80) === endNorm
            );

            if (idx >= 0) {
                // Incrementar contagem e atualizar data
                destinos[idx].contagem = (destinos[idx].contagem || 1) + 1;
                destinos[idx].ultimaVez = new Date();
                // Mover para o topo (mais recente)
                const [item] = destinos.splice(idx, 1);
                destinos.unshift(item);
            } else {
                // Adicionar novo destino no início
                destinos.unshift({
                    endereco: destino.endereco,
                    latitude: destino.latitude || null,
                    longitude: destino.longitude || null,
                    contagem: 1,
                    ultimaVez: new Date()
                });
            }

            // Manter apenas últimos 5
            const destinosFinal = destinos.slice(0, 5);

            await Cliente.findByIdAndUpdate(cliente._id, {
                ultimosDestinos: destinosFinal,
                primeiraVez: false,
                $inc: { totalCorridas: 1 }
            });
        } catch(e) {
            console.log('[CLIENTE] Erro salvar destino:', e.message);
        }
    },

    async buscarUltimosDestinos(telefone, adminId) {
        try {
            const cliente = await this.buscarPorTelefone(telefone, adminId);
            if (!cliente) return [];
            return (cliente.ultimosDestinos || []).slice(0, 3);
        } catch(e) { return []; }
    },

    async marcarPrimeiraVezFeita(telefone, adminId) {
        try {
            const cliente = await this.buscarPorTelefone(telefone, adminId);
            if (cliente && cliente.primeiraVez) {
                await Cliente.findByIdAndUpdate(cliente._id, { primeiraVez: false });
            }
        } catch(e) {}
    }
};

module.exports = ClienteService;
