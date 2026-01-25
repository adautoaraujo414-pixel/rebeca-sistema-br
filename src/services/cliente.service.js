const { Cliente } = require('../models');

const ClienteService = {
    // Listar todos
    async listar(filtros = {}) {
        const query = {};
        if (filtros.bloqueado !== undefined) query.bloqueado = filtros.bloqueado;
        return await Cliente.find(query).sort({ createdAt: -1 });
    },

    // Buscar por ID
    async buscarPorId(id) {
        return await Cliente.findById(id);
    },

    // Buscar por telefone
    async buscarPorTelefone(telefone) {
        return await Cliente.findOne({ telefone });
    },

    // Criar ou atualizar cliente
    async criarOuAtualizar(telefone, dados) {
        let cliente = await this.buscarPorTelefone(telefone);
        if (cliente) {
            return await Cliente.findByIdAndUpdate(cliente._id, dados, { new: true });
        }
        cliente = new Cliente({ telefone, ...dados });
        return await cliente.save();
    },

    // Criar cliente
    async criar(dados) {
        const cliente = new Cliente(dados);
        return await cliente.save();
    },

    // Atualizar cliente
    async atualizar(id, dados) {
        return await Cliente.findByIdAndUpdate(id, dados, { new: true });
    },

    // Deletar cliente
    async deletar(id) {
        return await Cliente.findByIdAndDelete(id);
    },

    // Salvar favorito (casa/trabalho)
    async salvarFavorito(telefone, tipo, endereco, latitude, longitude) {
        const campo = tipo === 'casa' ? 'enderecoFavorito.casa' : 'enderecoFavorito.trabalho';
        return await Cliente.findOneAndUpdate(
            { telefone },
            { $set: { [campo]: { endereco, latitude, longitude } } },
            { new: true, upsert: true }
        );
    },

    // Buscar favoritos
    async buscarFavoritos(telefone) {
        const cliente = await this.buscarPorTelefone(telefone);
        return cliente?.enderecoFavorito || { casa: null, trabalho: null };
    },

    // Incrementar corridas
    async incrementarCorridas(telefone) {
        return await Cliente.findOneAndUpdate(
            { telefone },
            { $inc: { corridasRealizadas: 1 } },
            { new: true }
        );
    },

    // Bloquear/Desbloquear
    async bloquear(id, bloqueado = true) {
        return await Cliente.findByIdAndUpdate(id, { bloqueado }, { new: true });
    },

    // Estatísticas
    async estatisticas() {
        const total = await Cliente.countDocuments();
        const bloqueados = await Cliente.countDocuments({ bloqueado: true });
        return { total, bloqueados, ativos: total - bloqueados };
    }
};

module.exports = ClienteService;
