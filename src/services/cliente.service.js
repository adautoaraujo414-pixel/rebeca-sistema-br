const { v4: uuidv4 } = require('uuid');

const clientes = new Map();

const NIVEIS = {
    VIP: { nome: 'VIP', corridasMinimas: 100, desconto: 15 },
    OURO: { nome: 'Ouro', corridasMinimas: 50, desconto: 10 },
    PRATA: { nome: 'Prata', corridasMinimas: 20, desconto: 5 },
    BRONZE: { nome: 'Bronze', corridasMinimas: 5, desconto: 2 },
    NOVO: { nome: 'Novo', corridasMinimas: 0, desconto: 0 }
};

const clientesExemplo = [
    {
        id: 'cli_001', nome: 'Fernando Souza', telefone: '11912345678', email: 'fernando@email.com',
        cpf: '111.222.333-44', enderecoPadrao: { endereco: 'Av. dos Autonomistas, 1500', latitude: -23.5327, longitude: -46.7917 },
        corridasRealizadas: 45, totalGasto: 1250.00, avaliacaoMedia: 4.9,
        bloqueado: false, dataCadastro: '2024-06-15T10:00:00Z'
    },
    {
        id: 'cli_002', nome: 'Mariana Lima', telefone: '11923456789', email: 'mariana@email.com',
        cpf: '222.333.444-55', enderecoPadrao: { endereco: 'Rua das Flores, 200', latitude: -23.5350, longitude: -46.7890 },
        corridasRealizadas: 128, totalGasto: 3450.00, avaliacaoMedia: 5.0,
        bloqueado: false, dataCadastro: '2023-11-20T14:30:00Z'
    },
    {
        id: 'cli_003', nome: 'Roberto Costa', telefone: '11934567890', email: 'roberto@email.com',
        cpf: '333.444.555-66', enderecoPadrao: { endereco: 'Estação Osasco CPTM', latitude: -23.5328, longitude: -46.7921 },
        corridasRealizadas: 12, totalGasto: 380.00, avaliacaoMedia: 4.2,
        bloqueado: false, dataCadastro: '2025-08-10T09:15:00Z'
    }
];

clientesExemplo.forEach(c => clientes.set(c.id, c));

const ClienteService = {
    NIVEIS,

    calcularNivel: (corridasRealizadas) => {
        if (corridasRealizadas >= NIVEIS.VIP.corridasMinimas) return NIVEIS.VIP;
        if (corridasRealizadas >= NIVEIS.OURO.corridasMinimas) return NIVEIS.OURO;
        if (corridasRealizadas >= NIVEIS.PRATA.corridasMinimas) return NIVEIS.PRATA;
        if (corridasRealizadas >= NIVEIS.BRONZE.corridasMinimas) return NIVEIS.BRONZE;
        return NIVEIS.NOVO;
    },

    listarTodos: (filtros = {}) => {
        let resultado = Array.from(clientes.values());
        if (filtros.bloqueado !== undefined) resultado = resultado.filter(c => c.bloqueado === filtros.bloqueado);
        if (filtros.busca) {
            const termo = filtros.busca.toLowerCase();
            resultado = resultado.filter(c => c.nome.toLowerCase().includes(termo) || c.telefone.includes(termo));
        }
        return resultado.map(c => ({ ...c, nivel: ClienteService.calcularNivel(c.corridasRealizadas) }));
    },

    buscarPorId: (id) => {
        const cliente = clientes.get(id);
        if (!cliente) return null;
        return { ...cliente, nivel: ClienteService.calcularNivel(cliente.corridasRealizadas) };
    },

    buscarPorTelefone: (telefone) => {
        const tel = telefone.replace(/\D/g, '');
        const cliente = Array.from(clientes.values()).find(c => c.telefone.replace(/\D/g, '') === tel);
        if (!cliente) return null;
        return { ...cliente, nivel: ClienteService.calcularNivel(cliente.corridasRealizadas) };
    },

    criar: (dados) => {
        const id = 'cli_' + uuidv4().slice(0, 8);
        const novo = {
            id, nome: dados.nome, telefone: dados.telefone.replace(/\D/g, ''),
            email: dados.email || '', cpf: dados.cpf || '',
            enderecoPadrao: dados.enderecoPadrao || null,
            corridasRealizadas: 0, totalGasto: 0, avaliacaoMedia: 5.0,
            bloqueado: false, dataCadastro: new Date().toISOString()
        };
        clientes.set(id, novo);
        return { ...novo, nivel: ClienteService.calcularNivel(0) };
    },

    atualizar: (id, dados) => {
        const cliente = clientes.get(id);
        if (!cliente) return null;
        const atualizado = { ...cliente, ...dados, id };
        clientes.set(id, atualizado);
        return { ...atualizado, nivel: ClienteService.calcularNivel(atualizado.corridasRealizadas) };
    },

    registrarCorrida: (id, valorCorrida) => {
        const cliente = clientes.get(id);
        if (!cliente) return null;
        cliente.corridasRealizadas++;
        cliente.totalGasto += valorCorrida;
        clientes.set(id, cliente);
        return { ...cliente, nivel: ClienteService.calcularNivel(cliente.corridasRealizadas) };
    },

    bloquear: (id, motivo) => {
        const cliente = clientes.get(id);
        if (!cliente) return null;
        cliente.bloqueado = true;
        cliente.motivoBloqueio = motivo;
        clientes.set(id, cliente);
        return cliente;
    },

    desbloquear: (id) => {
        const cliente = clientes.get(id);
        if (!cliente) return null;
        cliente.bloqueado = false;
        cliente.motivoBloqueio = null;
        clientes.set(id, cliente);
        return cliente;
    },

    obterEstatisticas: () => {
        const lista = Array.from(clientes.values());
        return {
            total: lista.length,
            ativos: lista.filter(c => !c.bloqueado).length,
            bloqueados: lista.filter(c => c.bloqueado).length,
            totalCorridas: lista.reduce((sum, c) => sum + c.corridasRealizadas, 0),
            totalGasto: lista.reduce((sum, c) => sum + c.totalGasto, 0)
        };
    }
};

module.exports = ClienteService;
