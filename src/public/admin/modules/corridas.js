// Módulo de Corridas
const CorridasModule = {
    corridas: [],
    
    getAdminId: function() {
        const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
        return usuario._id || usuario.id || null;
    },

    carregar: async function(filtros = {}) {
        try {
            let url = '/api/corridas';
            const params = new URLSearchParams();
            const adminId = this.getAdminId();
            if (adminId) params.append('adminId', adminId);
            const statusFiltro = filtros.status || 'em_andamento,a_caminho,aguardando_cliente';
            params.append('status', statusFiltro);
            if (filtros.motoristaId) params.append('motoristaId', filtros.motoristaId);
            if (params.toString()) url += '?' + params.toString();
            
            const response = await fetch(url);
            this.corridas = await response.json();
            return this.corridas;
        } catch (error) {
            console.error('Erro ao carregar corridas:', error);
            return [];
        }
    },
    
    buscarPorId: function(id) {
        return this.corridas.find(c => String(c._id || c.id) === String(id));
    },
    
    listarPendentes: async function() {
        try {
            const adminId = this.getAdminId();
            const response = await fetch('/api/corridas/pendentes' + (adminId ? '?adminId=' + adminId : ''));
            return await response.json();
        } catch (error) {
            console.error('Erro ao listar pendentes:', error);
            return [];
        }
    },
    
    listarAtivas: async function() {
        try {
            const adminId = this.getAdminId();
            const response = await fetch('/api/corridas/ativas' + (adminId ? '?adminId=' + adminId : ''));
            return await response.json();
        } catch (error) {
            console.error('Erro ao listar ativas:', error);
            return [];
        }
    },
    
    criar: async function(dados) {
        try {
            const response = await fetch('/api/corridas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao criar corrida:', error);
            throw error;
        }
    },
    
    atribuirMotorista: async function(corridaId, motoristaId, motoristaNome) {
        try {
            const response = await fetch('/api/corridas/' + corridaId + '/atribuir', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motoristaId, motoristaNome })
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao atribuir motorista:', error);
            throw error;
        }
    },
    
    iniciar: async function(corridaId) {
        try {
            const response = await fetch('/api/corridas/' + corridaId + '/iniciar', {
                method: 'PUT'
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao iniciar corrida:', error);
            throw error;
        }
    },
    
    finalizar: async function(corridaId, precoFinal) {
        try {
            const response = await fetch('/api/corridas/' + corridaId + '/finalizar', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ precoFinal })
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao finalizar corrida:', error);
            throw error;
        }
    },
    
    cancelar: async function(corridaId, motivo) {
        try {
            const response = await fetch('/api/corridas/' + corridaId + '/cancelar', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivo })
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao cancelar corrida:', error);
            throw error;
        }
    },
    
    obterEstatisticas: async function() {
        try {
            const response = await fetch('/api/corridas/estatisticas');
            return await response.json();
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            return {};
        }
    }
};

if (typeof module !== 'undefined') module.exports = CorridasModule;
