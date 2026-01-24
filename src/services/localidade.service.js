const { v4: uuidv4 } = require('uuid');

const localidades = new Map();
const pontosReferencia = new Map();

const localidadesExemplo = [
    { id: 'loc_001', nome: 'Osasco', distanciaBase: 0, taxaAdicional: 0, ativo: true },
    { id: 'loc_002', nome: 'São Paulo - Centro', distanciaBase: 15, taxaAdicional: 10, ativo: true },
    { id: 'loc_003', nome: 'Barueri', distanciaBase: 8, taxaAdicional: 5, ativo: true },
    { id: 'loc_004', nome: 'Carapicuíba', distanciaBase: 5, taxaAdicional: 3, ativo: true },
    { id: 'loc_005', nome: 'Cotia', distanciaBase: 12, taxaAdicional: 8, ativo: true }
];

const pontosExemplo = [
    { id: 'pt_001', nome: 'Shopping União', tipo: 'shopping', localidadeId: 'loc_001', endereco: 'Av. dos Autonomistas, 1828', latitude: -23.5327, longitude: -46.7917, ativo: true },
    { id: 'pt_002', nome: 'Hospital Antonio Giglio', tipo: 'hospital', localidadeId: 'loc_001', endereco: 'Av. Santo Antonio, 200', latitude: -23.5350, longitude: -46.7890, ativo: true },
    { id: 'pt_003', nome: 'Estação Osasco CPTM', tipo: 'terminal', localidadeId: 'loc_001', endereco: 'Praça Antonio Menck', latitude: -23.5320, longitude: -46.7920, ativo: true },
    { id: 'pt_004', nome: 'Shopping Tamboré', tipo: 'shopping', localidadeId: 'loc_003', endereco: 'Av. Piracema, 669', latitude: -23.5100, longitude: -46.8200, ativo: true },
    { id: 'pt_005', nome: 'Aeroporto Congonhas', tipo: 'aeroporto', localidadeId: 'loc_002', endereco: 'Av. Washington Luís', latitude: -23.6273, longitude: -46.6566, ativo: true }
];

localidadesExemplo.forEach(l => localidades.set(l.id, l));
pontosExemplo.forEach(p => pontosReferencia.set(p.id, p));

const localidadeService = {
    listarLocalidades: (apenasAtivas = false) => {
        let lista = Array.from(localidades.values());
        if (apenasAtivas) lista = lista.filter(l => l.ativo);
        return lista.sort((a, b) => a.nome.localeCompare(b.nome));
    },

    obterLocalidade: (id) => localidades.get(id) || null,

    criarLocalidade: (dados) => {
        const id = 'loc_' + uuidv4().slice(0, 8);
        const nova = {
            id, nome: dados.nome, distanciaBase: dados.distanciaBase || 0,
            taxaAdicional: dados.taxaAdicional || 0, ativo: true
        };
        localidades.set(id, nova);
        return nova;
    },

    atualizarLocalidade: (id, dados) => {
        const localidade = localidades.get(id);
        if (!localidade) return null;
        const atualizada = { ...localidade, ...dados, id };
        localidades.set(id, atualizada);
        return atualizada;
    },

    excluirLocalidade: (id) => localidades.delete(id),

    listarPontosReferencia: (filtros = {}) => {
        let lista = Array.from(pontosReferencia.values());
        if (filtros.localidadeId) lista = lista.filter(p => p.localidadeId === filtros.localidadeId);
        if (filtros.tipo) lista = lista.filter(p => p.tipo === filtros.tipo);
        if (filtros.apenasAtivos) lista = lista.filter(p => p.ativo);
        return lista.sort((a, b) => a.nome.localeCompare(b.nome));
    },

    obterPontoReferencia: (id) => pontosReferencia.get(id) || null,

    buscarPontos: (texto) => {
        const textoLower = texto.toLowerCase();
        return Array.from(pontosReferencia.values())
            .filter(p => p.nome.toLowerCase().includes(textoLower) || p.endereco?.toLowerCase().includes(textoLower))
            .slice(0, 10);
    },

    criarPontoReferencia: (dados) => {
        const id = 'pt_' + uuidv4().slice(0, 8);
        const novo = {
            id, nome: dados.nome, tipo: dados.tipo || 'outro',
            localidadeId: dados.localidadeId || null, endereco: dados.endereco || '',
            latitude: dados.latitude || null, longitude: dados.longitude || null, ativo: true
        };
        pontosReferencia.set(id, novo);
        return novo;
    },

    atualizarPontoReferencia: (id, dados) => {
        const ponto = pontosReferencia.get(id);
        if (!ponto) return null;
        const atualizado = { ...ponto, ...dados, id };
        pontosReferencia.set(id, atualizado);
        return atualizado;
    },

    excluirPontoReferencia: (id) => pontosReferencia.delete(id),

    getTiposPontos: () => [
        { valor: 'shopping', label: 'Shopping' },
        { valor: 'hospital', label: 'Hospital' },
        { valor: 'escola', label: 'Escola' },
        { valor: 'terminal', label: 'Terminal/Estação' },
        { valor: 'aeroporto', label: 'Aeroporto' },
        { valor: 'outro', label: 'Outro' }
    ]
};

module.exports = localidadeService;
