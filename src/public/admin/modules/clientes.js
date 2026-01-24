// Módulo de Clientes
const ClientesModule = {
    clientes: [],
    
    carregar: async function(filtros = {}) {
        try {
            let url = '/api/clientes';
            const params = new URLSearchParams();
            if (filtros.busca) params.append('busca', filtros.busca);
            if (filtros.bloqueado !== undefined) params.append('bloqueado', filtros.bloqueado);
            if (params.toString()) url += '?' + params.toString();
            
            const response = await fetch(url);
            this.clientes = await response.json();
            return this.clientes;
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            return [];
        }
    },
    
    buscarPorId: function(id) {
        return this.clientes.find(c => c.id === id);
    },
    
    buscarPorTelefone: async function(telefone) {
        try {
            const response = await fetch('/api/clientes/telefone/' + telefone);
            if (response.ok) return await response.json();
            return null;
        } catch (error) {
            console.error('Erro ao buscar cliente:', error);
            return null;
        }
    },
    
    criar: async function(dados) {
        try {
            const response = await fetch('/api/clientes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const novoCliente = await response.json();
            this.clientes.push(novoCliente);
            return novoCliente;
        } catch (error) {
            console.error('Erro ao criar cliente:', error);
            throw error;
        }
    },
    
    atualizar: async function(id, dados) {
        try {
            const response = await fetch('/api/clientes/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const cliente = await response.json();
            const index = this.clientes.findIndex(c => c.id === id);
            if (index >= 0) this.clientes[index] = cliente;
            return cliente;
        } catch (error) {
            console.error('Erro ao atualizar cliente:', error);
            throw error;
        }
    },
    
    bloquear: async function(id, motivo) {
        try {
            const response = await fetch('/api/clientes/' + id + '/bloquear', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivo })
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao bloquear cliente:', error);
            throw error;
        }
    },
    
    desbloquear: async function(id) {
        try {
            const response = await fetch('/api/clientes/' + id + '/desbloquear', {
                method: 'PUT'
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao desbloquear cliente:', error);
            throw error;
        }
    },
    
    obterNiveis: async function() {
        try {
            const response = await fetch('/api/clientes/niveis');
            return await response.json();
        } catch (error) {
            console.error('Erro ao obter níveis:', error);
            return {};
        }
    },
    
    obterEstatisticas: async function() {
        try {
            const response = await fetch('/api/clientes/estatisticas');
            return await response.json();
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            return {};
        }
    }
};

if (typeof module !== 'undefined') module.exports = ClientesModule;
