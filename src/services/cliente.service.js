const { Cliente } = require('../models');

const ClienteService = {
    // Listar (filtrado por admin)
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
    }
};

module.exports = ClienteService;