// Módulo de Motoristas
const MotoristasModule = {
    motoristas: [],
    
    carregar: async function() {
        try {
            const response = await fetch('/api/motoristas');
            this.motoristas = await response.json();
            return this.motoristas;
        } catch (error) {
            console.error('Erro ao carregar motoristas:', error);
            return [];
        }
    },
    
    buscarPorId: function(id) {
        return this.motoristas.find(m => m.id === id);
    },
    
    filtrarPorStatus: function(status) {
        return this.motoristas.filter(m => m.status === status);
    },
    
    obterDisponiveis: function() {
        return this.filtrarPorStatus('disponivel');
    },
    
    criar: async function(dados) {
        try {
            const response = await fetch('/api/motoristas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const novoMotorista = await response.json();
            this.motoristas.push(novoMotorista);
            return novoMotorista;
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
            const index = this.motoristas.findIndex(m => m.id === id);
            if (index >= 0) this.motoristas[index] = motorista;
            return motorista;
        } catch (error) {
            console.error('Erro ao atualizar motorista:', error);
            throw error;
        }
    },
    
    atualizarStatus: async function(id, status) {
        return this.atualizar(id, { status });
    },
    
    obterEstatisticas: async function() {
        try {
            const response = await fetch('/api/motoristas/estatisticas');
            return await response.json();
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            return {};
        }
    }
};

if (typeof module !== 'undefined') module.exports = MotoristasModule;
