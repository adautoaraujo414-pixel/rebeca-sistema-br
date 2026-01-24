const { v4: uuidv4 } = require('uuid');

const motoristas = new Map();
const senhasMotoristas = new Map();

const motoristasExemplo = [
    {
        id: 'mot_001', nome: 'Carlos Silva', telefone: '11999887766', email: 'carlos@email.com',
        cpf: '123.456.789-00', cnh: 'ABC123456789', cnhValidade: '2027-05-15',
        veiculo: { modelo: 'Fiat Uno', cor: 'Branco', placa: 'ABC-1234', ano: 2020 },
        status: 'disponivel', avaliacao: 4.8, corridasRealizadas: 245, saldoDevedor: 0,
        dataCadastro: '2024-01-15T10:30:00Z', ativo: true
    },
    {
        id: 'mot_002', nome: 'João Santos', telefone: '11988776655', email: 'joao@email.com',
        cpf: '987.654.321-00', cnh: 'DEF987654321', cnhValidade: '2026-08-20',
        veiculo: { modelo: 'VW Gol', cor: 'Prata', placa: 'DEF-5678', ano: 2019 },
        status: 'em_corrida', avaliacao: 4.5, corridasRealizadas: 189, saldoDevedor: 25.00,
        dataCadastro: '2024-03-20T14:15:00Z', ativo: true
    },
    {
        id: 'mot_003', nome: 'Maria Oliveira', telefone: '11977665544', email: 'maria@email.com',
        cpf: '456.789.123-00', cnh: 'GHI456789123', cnhValidade: '2028-02-10',
        veiculo: { modelo: 'Chevrolet Onix', cor: 'Preto', placa: 'GHI-9012', ano: 2022 },
        status: 'offline', avaliacao: 4.9, corridasRealizadas: 312, saldoDevedor: 0,
        dataCadastro: '2023-11-08T09:00:00Z', ativo: true
    }
];

motoristasExemplo.forEach(m => motoristas.set(m.id, m));
senhasMotoristas.set('mot_001', '123456');
senhasMotoristas.set('mot_002', '123456');
senhasMotoristas.set('mot_003', '123456');

const MotoristaService = {
    listarTodos: (filtros = {}) => {
        let resultado = Array.from(motoristas.values());
        if (filtros.status) resultado = resultado.filter(m => m.status === filtros.status);
        if (filtros.ativo !== undefined) resultado = resultado.filter(m => m.ativo === filtros.ativo);
        if (filtros.busca) {
            const termo = filtros.busca.toLowerCase();
            resultado = resultado.filter(m => m.nome.toLowerCase().includes(termo) || m.telefone.includes(termo));
        }
        return resultado;
    },

    buscarPorId: (id) => motoristas.get(id) || null,

    buscarPorTelefone: (telefone) => {
        const tel = telefone.replace(/\D/g, '');
        return Array.from(motoristas.values()).find(m => m.telefone.replace(/\D/g, '') === tel) || null;
    },

    criar: (dados) => {
        const id = 'mot_' + uuidv4().slice(0, 8);
        const novo = {
            id, nome: dados.nome, telefone: dados.telefone.replace(/\D/g, ''),
            email: dados.email || '', cpf: dados.cpf || '', cnh: dados.cnh || '',
            cnhValidade: dados.cnhValidade || '',
            veiculo: { modelo: dados.veiculo?.modelo || '', cor: dados.veiculo?.cor || '', placa: dados.veiculo?.placa || '', ano: dados.veiculo?.ano || 2020 },
            status: 'offline', avaliacao: 5.0, corridasRealizadas: 0, saldoDevedor: 0,
            dataCadastro: new Date().toISOString(), ativo: true
        };
        motoristas.set(id, novo);
        senhasMotoristas.set(id, '123456');
        return novo;
    },

    atualizar: (id, dados) => {
        const motorista = motoristas.get(id);
        if (!motorista) return null;
        const atualizado = { ...motorista, ...dados, id };
        if (dados.veiculo) atualizado.veiculo = { ...motorista.veiculo, ...dados.veiculo };
        motoristas.set(id, atualizado);
        return atualizado;
    },

    atualizarStatus: (id, status) => {
        const motorista = motoristas.get(id);
        if (!motorista) return null;
        motorista.status = status;
        motoristas.set(id, motorista);
        return motorista;
    },

    autenticar: (telefone, senha) => {
        const motorista = MotoristaService.buscarPorTelefone(telefone);
        if (!motorista || !motorista.ativo) return null;
        if (senhasMotoristas.get(motorista.id) !== senha) return null;
        return motorista;
    },

    obterEstatisticas: () => {
        const lista = Array.from(motoristas.values());
        const ativos = lista.filter(m => m.ativo);
        return {
            total: lista.length, ativos: ativos.length,
            disponiveis: ativos.filter(m => m.status === 'disponivel').length,
            emCorrida: ativos.filter(m => m.status === 'em_corrida').length,
            offline: ativos.filter(m => m.status === 'offline').length
        };
    }
};

module.exports = MotoristaService;
