const { v4: uuidv4 } = require('uuid');

const usuarios = new Map();
const sessoes = new Map();

// Níveis de permissão
const permissoes = {
    admin: ['tudo'],
    gerente: ['dashboard', 'corridas', 'motoristas', 'clientes', 'faturamento', 'ranking', 'reclamacoes', 'areas', 'relatorios'],
    operador: ['dashboard', 'corridas', 'motoristas', 'clientes', 'mapa', 'reclamacoes'],
    financeiro: ['dashboard', 'faturamento', 'ranking', 'relatorios', 'precos'],
    atendimento: ['dashboard', 'corridas', 'clientes', 'reclamacoes']
};

// Usuários padrão
const usuariosDefault = [
    {
        id: 'usr_001',
        nome: 'Administrador',
        email: 'admin@ubmax.com',
        login: 'admin',
        senha: 'admin123',
        nivel: 'admin',
        ativo: true,
        dataCadastro: '2024-01-01T00:00:00Z',
        ultimoAcesso: null,
        foto: null,
        telefone: '11999999999'
    },
    {
        id: 'usr_002',
        nome: 'Gerente Operacional',
        email: 'gerente@ubmax.com',
        login: 'gerente',
        senha: 'gerente123',
        nivel: 'gerente',
        ativo: true,
        dataCadastro: '2024-01-15T00:00:00Z',
        ultimoAcesso: null,
        foto: null,
        telefone: '11988888888'
    },
    {
        id: 'usr_003',
        nome: 'Operador Central',
        email: 'operador@ubmax.com',
        login: 'operador',
        senha: 'operador123',
        nivel: 'operador',
        ativo: true,
        dataCadastro: '2024-02-01T00:00:00Z',
        ultimoAcesso: null,
        foto: null,
        telefone: '11977777777'
    }
];

usuariosDefault.forEach(u => usuarios.set(u.id, u));

const UsuariosService = {
    // ==================== AUTENTICAÇÃO ====================
    login: (login, senha) => {
        const usuario = Array.from(usuarios.values()).find(u => 
            (u.login === login || u.email === login) && u.senha === senha
        );
        
        if (!usuario) return { error: 'Login ou senha inválidos' };
        if (!usuario.ativo) return { error: 'Usuário desativado' };
        
        // Gerar token de sessão
        const token = 'sess_' + uuidv4();
        const sessao = {
            token,
            usuarioId: usuario.id,
            criadoEm: new Date().toISOString(),
            expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
        };
        
        sessoes.set(token, sessao);
        
        // Atualizar último acesso
        usuario.ultimoAcesso = new Date().toISOString();
        usuarios.set(usuario.id, usuario);
        
        return {
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                nivel: usuario.nivel,
                permissoes: permissoes[usuario.nivel] || []
            }
        };
    },

    verificarToken: (token) => {
        const sessao = sessoes.get(token);
        if (!sessao) return null;
        
        if (new Date(sessao.expiraEm) < new Date()) {
            sessoes.delete(token);
            return null;
        }
        
        const usuario = usuarios.get(sessao.usuarioId);
        if (!usuario || !usuario.ativo) return null;
        
        return {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            nivel: usuario.nivel,
            permissoes: permissoes[usuario.nivel] || []
        };
    },

    logout: (token) => {
        sessoes.delete(token);
        return true;
    },

    verificarPermissao: (token, permissao) => {
        const usuario = UsuariosService.verificarToken(token);
        if (!usuario) return false;
        
        if (usuario.permissoes.includes('tudo')) return true;
        return usuario.permissoes.includes(permissao);
    },

    // ==================== CRUD USUÁRIOS ====================
    listarTodos: (filtros = {}) => {
        let lista = Array.from(usuarios.values());
        
        if (filtros.nivel) lista = lista.filter(u => u.nivel === filtros.nivel);
        if (filtros.ativo !== undefined) lista = lista.filter(u => u.ativo === filtros.ativo);
        if (filtros.busca) {
            const busca = filtros.busca.toLowerCase();
            lista = lista.filter(u => 
                u.nome.toLowerCase().includes(busca) ||
                u.email.toLowerCase().includes(busca) ||
                u.login.toLowerCase().includes(busca)
            );
        }
        
        // Remove senhas da resposta
        return lista.map(u => ({
            id: u.id,
            nome: u.nome,
            email: u.email,
            login: u.login,
            nivel: u.nivel,
            ativo: u.ativo,
            telefone: u.telefone,
            dataCadastro: u.dataCadastro,
            ultimoAcesso: u.ultimoAcesso
        }));
    },

    buscarPorId: (id) => {
        const u = usuarios.get(id);
        if (!u) return null;
        return {
            id: u.id,
            nome: u.nome,
            email: u.email,
            login: u.login,
            nivel: u.nivel,
            ativo: u.ativo,
            telefone: u.telefone,
            dataCadastro: u.dataCadastro,
            ultimoAcesso: u.ultimoAcesso
        };
    },

    criar: (dados) => {
        // Validar login único
        const existeLogin = Array.from(usuarios.values()).find(u => u.login === dados.login);
        if (existeLogin) return { error: 'Login já existe' };
        
        // Validar email único
        const existeEmail = Array.from(usuarios.values()).find(u => u.email === dados.email);
        if (existeEmail) return { error: 'Email já existe' };
        
        const id = 'usr_' + uuidv4().slice(0, 8);
        const usuario = {
            id,
            nome: dados.nome,
            email: dados.email,
            login: dados.login,
            senha: dados.senha || '123456',
            nivel: dados.nivel || 'operador',
            ativo: true,
            dataCadastro: new Date().toISOString(),
            ultimoAcesso: null,
            foto: null,
            telefone: dados.telefone || null
        };
        
        usuarios.set(id, usuario);
        
        return {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            login: usuario.login,
            nivel: usuario.nivel,
            senhaGerada: dados.senha ? null : '123456'
        };
    },

    atualizar: (id, dados) => {
        const usuario = usuarios.get(id);
        if (!usuario) return null;
        
        // Validar login único (se mudou)
        if (dados.login && dados.login !== usuario.login) {
            const existeLogin = Array.from(usuarios.values()).find(u => u.login === dados.login && u.id !== id);
            if (existeLogin) return { error: 'Login já existe' };
        }
        
        // Validar email único (se mudou)
        if (dados.email && dados.email !== usuario.email) {
            const existeEmail = Array.from(usuarios.values()).find(u => u.email === dados.email && u.id !== id);
            if (existeEmail) return { error: 'Email já existe' };
        }
        
        const atualizado = {
            ...usuario,
            nome: dados.nome || usuario.nome,
            email: dados.email || usuario.email,
            login: dados.login || usuario.login,
            nivel: dados.nivel || usuario.nivel,
            telefone: dados.telefone !== undefined ? dados.telefone : usuario.telefone
        };
        
        usuarios.set(id, atualizado);
        return UsuariosService.buscarPorId(id);
    },

    alterarSenha: (id, senhaAtual, novaSenha) => {
        const usuario = usuarios.get(id);
        if (!usuario) return { error: 'Usuário não encontrado' };
        
        if (usuario.senha !== senhaAtual) return { error: 'Senha atual incorreta' };
        
        usuario.senha = novaSenha;
        usuarios.set(id, usuario);
        return { sucesso: true };
    },

    resetarSenha: (id) => {
        const usuario = usuarios.get(id);
        if (!usuario) return { error: 'Usuário não encontrado' };
        
        const novaSenha = Math.random().toString(36).slice(-8);
        usuario.senha = novaSenha;
        usuarios.set(id, usuario);
        return { sucesso: true, novaSenha };
    },

    ativar: (id) => {
        const usuario = usuarios.get(id);
        if (!usuario) return null;
        usuario.ativo = true;
        usuarios.set(id, usuario);
        return UsuariosService.buscarPorId(id);
    },

    desativar: (id) => {
        const usuario = usuarios.get(id);
        if (!usuario) return null;
        
        // Não pode desativar o admin principal
        if (usuario.login === 'admin') return { error: 'Não é possível desativar o admin principal' };
        
        usuario.ativo = false;
        usuarios.set(id, usuario);
        
        // Remover sessões ativas
        Array.from(sessoes.entries()).forEach(([token, sessao]) => {
            if (sessao.usuarioId === id) sessoes.delete(token);
        });
        
        return UsuariosService.buscarPorId(id);
    },

    excluir: (id) => {
        const usuario = usuarios.get(id);
        if (!usuario) return { error: 'Usuário não encontrado' };
        if (usuario.login === 'admin') return { error: 'Não é possível excluir o admin principal' };
        
        usuarios.delete(id);
        return { sucesso: true };
    },

    // ==================== HELPERS ====================
    listarNiveis: () => {
        return Object.entries(permissoes).map(([nivel, perms]) => ({
            nivel,
            nome: nivel.charAt(0).toUpperCase() + nivel.slice(1),
            permissoes: perms
        }));
    },

    obterEstatisticas: () => {
        const lista = Array.from(usuarios.values());
        return {
            total: lista.length,
            ativos: lista.filter(u => u.ativo).length,
            inativos: lista.filter(u => !u.ativo).length,
            porNivel: {
                admin: lista.filter(u => u.nivel === 'admin').length,
                gerente: lista.filter(u => u.nivel === 'gerente').length,
                operador: lista.filter(u => u.nivel === 'operador').length,
                financeiro: lista.filter(u => u.nivel === 'financeiro').length,
                atendimento: lista.filter(u => u.nivel === 'atendimento').length
            },
            sessoesAtivas: sessoes.size
        };
    }
};

module.exports = UsuariosService;
