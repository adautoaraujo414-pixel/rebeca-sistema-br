// Módulo de Motoristas
const MotoristasModule = {
    motoristas: [],
    
    getAdminId: function() {
        const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
        return usuario._id || usuario.id || null;
    },
    
    carregar: async function() {
        try {
            const adminId = this.getAdminId();
            const token = localStorage.getItem('token') || '';
            const response = await fetch('/api/motoristas?adminId=' + adminId, {
                headers: { 'Authorization': 'Bearer ' + token, 'x-admin-id': adminId }
            });
            this.motoristas = await response.json();
            return this.motoristas;
        } catch (error) {
            console.error('Erro ao carregar motoristas:', error);
            return [];
        }
    },
    
    buscarPorId: function(id) {
        return this.motoristas.find(m => m._id === id || m.id === id);
    },
    
    filtrarPorStatus: function(status) {
        return this.motoristas.filter(m => m.status === status);
    },
    
    obterDisponiveis: function() {
        return this.filtrarPorStatus('disponivel');
    },
    
    criar: async function(dados) {
        try {
            const adminId = this.getAdminId();
            if (!adminId) {
                throw new Error('Sessão expirada! Faça login novamente.');
            }
            
            // Adicionar adminId aos dados
            dados.adminId = adminId;
            
            const response = await fetch('/api/motoristas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            if (result.motorista) {
                this.motoristas.push(result.motorista);
                return result;
            }
            
            this.motoristas.push(result);
            return result;
        } catch (error) {
            console.error('Erro ao criar motorista:', error);
            throw error;
        }
    },
    
    atualizar: async function(id, dados) {
        try {
            const response = await fetch('/api/motoristas/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const motorista = await response.json();
            const index = this.motoristas.findIndex(m => m._id === id || m.id === id);
            if (index >= 0) this.motoristas[index] = motorista;
            return motorista;
        } catch (error) {
            console.error('Erro ao atualizar motorista:', error);
            throw error;
        }
    },
    
    deletar: async function(id) {
        try {
            await fetch('/api/motoristas/' + id, { method: 'DELETE' });
            this.motoristas = this.motoristas.filter(m => m._id !== id && m.id !== id);
            return true;
        } catch (error) {
            console.error('Erro ao deletar motorista:', error);
            throw error;
        }
    },
    
    atualizarStatus: async function(id, status) {
        return this.atualizar(id, { status });
    },
    
    obterEstatisticas: async function() {
        try {
            const adminId = this.getAdminId();
            const response = await fetch('/api/motoristas/estatisticas?adminId=' + adminId);
            return await response.json();
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            return {};
        }
    }
};

if (typeof module !== 'undefined') module.exports = MotoristasModule;
