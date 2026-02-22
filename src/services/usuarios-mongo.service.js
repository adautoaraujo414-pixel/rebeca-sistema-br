const { Admin } = require('../models');

// Substitui usuarios.service.js (que usava Map em memória)
// Agora usa MongoDB via modelo Admin

const UsuariosService = {

    login: async (login, senha) => {
        const admin = await Admin.findOne({ email: login });
        if (!admin) return { error: 'Usuário não encontrado' };
        if (admin.senha !== senha) return { error: 'Senha incorreta' };
        if (!admin.ativo) return { error: 'Conta aguardando aprovação' };
        admin.ultimoAcesso = new Date();
        await admin.save();
        const token = 'ADMIN_' + admin._id + '_' + Date.now();
        return { token, usuario: { id: admin._id, nome: admin.nome, email: admin.email, nivel: 'admin' } };
    },

    verificarToken: (token) => {
        if (!token || !token.startsWith('ADMIN_')) return null;
        const parts = token.split('_');
        if (parts.length < 2) return null;
        return { id: parts[1], tipo: 'admin' };
    },

    logout: () => ({ sucesso: true }),

    listarNiveis: () => ([
        { id: 'admin', nome: 'Administrador', permissoes: ['tudo'] },
        { id: 'gerente', nome: 'Gerente', permissoes: ['dashboard', 'corridas', 'motoristas'] },
        { id: 'operador', nome: 'Operador', permissoes: ['dashboard', 'corridas'] }
    ]),

    obterEstatisticas: async () => {
        const total = await Admin.countDocuments();
        const ativos = await Admin.countDocuments({ ativo: true });
        return { total, ativos, inativos: total - ativos };
    },

    listarTodos: async (filtros = {}, adminId = null) => {
        const query = adminId ? { adminId } : {};
        if (filtros.ativo !== undefined) query.ativo = filtros.ativo;
        if (filtros.busca) query.$or = [
            { nome: new RegExp(filtros.busca, 'i') },
            { email: new RegExp(filtros.busca, 'i') }
        ];
        return await Admin.find(query).select('-senha');
    },

    buscarPorId: async (id) => {
        return await Admin.findById(id).select('-senha');
    },

    criar: async (dados, adminId = null) => {
        const existente = await Admin.findOne({ email: dados.email });
        if (existente) return { error: 'Email já cadastrado' };
        const admin = new Admin({ ...dados, ativo: true, adminId });
        await admin.save();
        return { sucesso: true, usuario: admin };
    },

    atualizar: async (id, dados) => {
        const admin = await Admin.findByIdAndUpdate(id, dados, { new: true }).select('-senha');
        if (!admin) return null;
        return admin;
    },

    alterarSenha: async (id, senhaAtual, novaSenha) => {
        const admin = await Admin.findById(id);
        if (!admin) return { error: 'Usuário não encontrado' };
        if (admin.senha !== senhaAtual) return { error: 'Senha atual incorreta' };
        admin.senha = novaSenha;
        await admin.save();
        return { sucesso: true };
    },

    resetarSenha: async (id) => {
        const novaSenha = 'Rebeca@' + Math.random().toString(36).slice(-6);
        await Admin.findByIdAndUpdate(id, { senha: novaSenha });
        return { sucesso: true, novaSenha };
    },

    ativar: async (id) => {
        return await Admin.findByIdAndUpdate(id, { ativo: true }, { new: true }).select('-senha');
    },

    desativar: async (id) => {
        const admin = await Admin.findById(id);
        if (!admin) return null;
        admin.ativo = false;
        await admin.save();
        return admin;
    },

    excluir: async (id) => {
        await Admin.findByIdAndDelete(id);
        return { sucesso: true };
    }
};

module.exports = UsuariosService;
