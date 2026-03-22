const { v4: uuidv4 } = require('uuid');

// Cache em memória para leitura rápida (últimos 200 logs)
let _cache = [];

const LogsService = {
    registrar: async (dados) => {
        const log = {
            id: 'log_' + uuidv4().slice(0, 8),
            tipo: dados.tipo || 'info',
            acao: dados.acao,
            usuarioId: dados.usuarioId || null,
            usuarioNome: dados.usuarioNome || 'Sistema',
            usuarioTipo: dados.usuarioTipo || 'sistema',
            adminId: dados.adminId || null,
            detalhes: dados.detalhes || {},
            ip: dados.ip || null,
            dataHora: new Date().toISOString()
        };
        // Cache local
        _cache.unshift(log);
        if (_cache.length > 200) _cache.pop();
        // Persistir no banco
        try {
            const { LogSistema } = require('../models');
            await LogSistema.create({
                tipo: log.tipo,
                usuario: log.usuarioNome,
                tipoUsuario: log.usuarioTipo || 'admin',
                acao: log.acao,
                detalhes: { ...log.detalhes, id: log.id, adminId: log.adminId },
                ip: log.ip
            });
        } catch(e) { /* silencioso — log não pode travar o sistema */ }
        return log;
    },

    listar: async (filtros = {}) => {
        try {
            const { LogSistema } = require('../models');
            const query = {};
            if (filtros.tipo) query.tipo = filtros.tipo;
            const limite = parseInt(filtros.limite) || 50;
            const logs = await LogSistema.find(query)
                .sort({ createdAt: -1 })
                .limit(limite)
                .lean();
            return logs.map(l => ({
                id: l._id.toString(),
                tipo: l.tipo,
                acao: l.acao,
                usuarioNome: l.usuario,
                usuarioTipo: l.tipoUsuario,
                detalhes: l.detalhes || {},
                ip: l.ip,
                dataHora: l.createdAt?.toISOString() || ''
            }));
        } catch(e) {
            // Fallback para cache em memória
            return _cache.slice(0, parseInt(filtros.limite) || 50);
        }
    },

    obterEstatisticas: async () => {
        try {
            const { LogSistema } = require('../models');
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const [total, hoje_count, erros] = await Promise.all([
                LogSistema.countDocuments(),
                LogSistema.countDocuments({ createdAt: { $gte: hoje } }),
                LogSistema.countDocuments({ tipo: 'erro' })
            ]);
            return { total, hoje: hoje_count, porTipo: { erro: erros } };
        } catch(e) {
            return { total: _cache.length, hoje: 0, porTipo: { erro: 0 } };
        }
    },

    // Compatibilidade sync (usado em alguns lugares com registrar sem await)
    buscarPorId: (id) => _cache.find(l => l.id === id) || null
};

module.exports = LogsService;
