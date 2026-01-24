// Módulo de Localidades e Preços
const LocalidadesPrecosModule = {
    localidades: [],
    pontosReferencia: [],
    regrasPreco: [],
    configPreco: {},
    
    // ========== LOCALIDADES ==========
    carregarLocalidades: async function(apenasAtivas = false) {
        try {
            const url = '/api/localidades' + (apenasAtivas ? '?ativas=true' : '');
            const response = await fetch(url);
            this.localidades = await response.json();
            return this.localidades;
        } catch (error) {
            console.error('Erro ao carregar localidades:', error);
            return [];
        }
    },
    
    criarLocalidade: async function(dados) {
        try {
            const response = await fetch('/api/localidades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const localidade = await response.json();
            this.localidades.push(localidade);
            return localidade;
        } catch (error) {
            console.error('Erro ao criar localidade:', error);
            throw error;
        }
    },
    
    atualizarLocalidade: async function(id, dados) {
        try {
            const response = await fetch('/api/localidades/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao atualizar localidade:', error);
            throw error;
        }
    },
    
    excluirLocalidade: async function(id) {
        try {
            await fetch('/api/localidades/' + id, { method: 'DELETE' });
            this.localidades = this.localidades.filter(l => l.id !== id);
            return true;
        } catch (error) {
            console.error('Erro ao excluir localidade:', error);
            throw error;
        }
    },
    
    // ========== PONTOS DE REFERÊNCIA ==========
    carregarPontos: async function(filtros = {}) {
        try {
            let url = '/api/pontos-referencia';
            const params = new URLSearchParams();
            if (filtros.localidadeId) params.append('localidadeId', filtros.localidadeId);
            if (filtros.tipo) params.append('tipo', filtros.tipo);
            if (params.toString()) url += '?' + params.toString();
            
            const response = await fetch(url);
            this.pontosReferencia = await response.json();
            return this.pontosReferencia;
        } catch (error) {
            console.error('Erro ao carregar pontos:', error);
            return [];
        }
    },
    
    buscarPontos: async function(texto) {
        try {
            const response = await fetch('/api/pontos-referencia/buscar?texto=' + encodeURIComponent(texto));
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar pontos:', error);
            return [];
        }
    },
    
    criarPonto: async function(dados) {
        try {
            const response = await fetch('/api/pontos-referencia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao criar ponto:', error);
            throw error;
        }
    },
    
    // ========== PREÇOS ==========
    carregarConfigPreco: async function() {
        try {
            const response = await fetch('/api/preco-dinamico/config');
            this.configPreco = await response.json();
            return this.configPreco;
        } catch (error) {
            console.error('Erro ao carregar config preço:', error);
            return {};
        }
    },
    
    salvarConfigPreco: async function(config) {
        try {
            const response = await fetch('/api/preco-dinamico/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            this.configPreco = await response.json();
            return this.configPreco;
        } catch (error) {
            console.error('Erro ao salvar config preço:', error);
            throw error;
        }
    },
    
    carregarRegras: async function(apenasAtivas = false) {
        try {
            const url = '/api/preco-dinamico/regras' + (apenasAtivas ? '?ativas=true' : '');
            const response = await fetch(url);
            this.regrasPreco = await response.json();
            return this.regrasPreco;
        } catch (error) {
            console.error('Erro ao carregar regras:', error);
            return [];
        }
    },
    
    criarRegra: async function(dados) {
        try {
            const response = await fetch('/api/preco-dinamico/regras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const regra = await response.json();
            this.regrasPreco.push(regra);
            return regra;
        } catch (error) {
            console.error('Erro ao criar regra:', error);
            throw error;
        }
    },
    
    excluirRegra: async function(id) {
        try {
            await fetch('/api/preco-dinamico/regras/' + id, { method: 'DELETE' });
            this.regrasPreco = this.regrasPreco.filter(r => r.id !== id);
            return true;
        } catch (error) {
            console.error('Erro ao excluir regra:', error);
            throw error;
        }
    },
    
    calcularPreco: async function(distanciaKm, localidadeId = null) {
        try {
            let url = '/api/preco-dinamico/calcular?distancia=' + distanciaKm;
            if (localidadeId) url += '&localidadeId=' + localidadeId;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Erro ao calcular preço:', error);
            throw error;
        }
    }
};

if (typeof module !== 'undefined') module.exports = LocalidadesPrecosModule;
