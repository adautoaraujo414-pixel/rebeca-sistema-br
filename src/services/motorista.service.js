const { v4: uuidv4 } = require('uuid');

const motoristas = new Map();
const senhasMotoristas = new Map();
const tokensMotoristas = new Map();

const motoristasExemplo = [
    {
        id: 'mot_001', nomeCompleto: 'Carlos Silva Santos', whatsapp: '11999887766',
        cpf: '123.456.789-00', cnh: 'ABC123456789', cnhValidade: '2027-05-15',
        endereco: 'Rua das Flores, 123 - Osasco/SP',
        veiculo: { modelo: 'Fiat Uno', cor: 'Branco', placa: 'ABC-1234', ano: 2020 },
        status: 'disponivel', avaliacao: 4.8, corridasRealizadas: 245, saldoDevedor: 0,
        dataCadastro: '2024-01-15T10:30:00Z', ativo: true,
        token: 'MOT_001_' + Date.now()
    },
    {
        id: 'mot_002', nomeCompleto: 'João Santos Oliveira', whatsapp: '11988776655',
        cpf: '987.654.321-00', cnh: 'DEF987654321', cnhValidade: '2026-08-20',
        endereco: 'Av. Brasil, 456 - Osasco/SP',
        veiculo: { modelo: 'VW Gol', cor: 'Prata', placa: 'DEF-5678', ano: 2019 },
        status: 'em_corrida', avaliacao: 4.5, corridasRealizadas: 189, saldoDevedor: 25.00,
        dataCadastro: '2024-03-20T14:15:00Z', ativo: true,
        token: 'MOT_002_' + Date.now()
    },
    {
        id: 'mot_003', nomeCompleto: 'Maria Oliveira Costa', whatsapp: '11977665544',
        cpf: '456.789.123-00', cnh: 'GHI456789123', cnhValidade: '2028-02-10',
        endereco: 'Rua Principal, 789 - Carapicuíba/SP',
        veiculo: { modelo: 'Chevrolet Onix', cor: 'Preto', placa: 'GHI-9012', ano: 2022 },
        status: 'offline', avaliacao: 4.9, corridasRealizadas: 312, saldoDevedor: 0,
        dataCadastro: '2023-11-08T09:00:00Z', ativo: true,
        token: 'MOT_003_' + Date.now()
    }
];

motoristasExemplo.forEach(m => {
    motoristas.set(m.id, m);
    senhasMotoristas.set(m.id, '123456');
    tokensMotoristas.set(m.token, m.id);
});

const MotoristaService = {
    listarTodos: (filtros = {}) => {
        let resultado = Array.from(motoristas.values());
        if (filtros.status) resultado = resultado.filter(m => m.status === filtros.status);
        if (filtros.ativo !== undefined) resultado = resultado.filter(m => m.ativo === filtros.ativo);
        if (filtros.busca) {
            const termo = filtros.busca.toLowerCase();
            resultado = resultado.filter(m => 
                m.nomeCompleto.toLowerCase().includes(termo) || 
                m.whatsapp.includes(termo) ||
                m.veiculo?.placa?.toLowerCase().includes(termo)
            );
        }
        return resultado;
    },

    buscarPorId: (id) => motoristas.get(id) || null,

    buscarPorWhatsApp: (whatsapp) => {
        const tel = whatsapp.replace(/\D/g, '');
        return Array.from(motoristas.values()).find(m => m.whatsapp.replace(/\D/g, '') === tel) || null;
    },

    buscarPorToken: (token) => {
        const motoristaId = tokensMotoristas.get(token);
        if (!motoristaId) return null;
        return motoristas.get(motoristaId) || null;
    },

    criar: (dados) => {
        const id = 'mot_' + uuidv4().slice(0, 8);
        const token = 'MOT_' + id.toUpperCase() + '_' + Date.now();
        const senha = dados.senha || Math.random().toString(36).slice(-6);
        
        const novo = {
            id,
            nomeCompleto: dados.nomeCompleto,
            whatsapp: dados.whatsapp.replace(/\D/g, ''),
            cpf: dados.cpf || '',
            cnh: dados.cnh,
            cnhValidade: dados.cnhValidade || '',
            endereco: dados.endereco || '',
            veiculo: {
                modelo: dados.veiculo?.modelo || '',
                cor: dados.veiculo?.cor || '',
                placa: dados.veiculo?.placa?.toUpperCase() || '',
                ano: dados.veiculo?.ano || new Date().getFullYear()
            },
            status: 'offline',
            avaliacao: 5.0,
            corridasRealizadas: 0,
            saldoDevedor: 0,
            dataCadastro: new Date().toISOString(),
            ativo: true,
            token
        };
        
        motoristas.set(id, novo);
        senhasMotoristas.set(id, senha);
        tokensMotoristas.set(token, id);
        
        return { ...novo, senhaGerada: senha };
    },

    atualizar: (id, dados) => {
        const motorista = motoristas.get(id);
        if (!motorista) return null;
        
        const atualizado = { ...motorista };
        
        if (dados.nomeCompleto) atualizado.nomeCompleto = dados.nomeCompleto;
        if (dados.whatsapp) atualizado.whatsapp = dados.whatsapp.replace(/\D/g, '');
        if (dados.cpf) atualizado.cpf = dados.cpf;
        if (dados.cnh) atualizado.cnh = dados.cnh;
        if (dados.cnhValidade) atualizado.cnhValidade = dados.cnhValidade;
        if (dados.endereco) atualizado.endereco = dados.endereco;
        if (dados.ativo !== undefined) atualizado.ativo = dados.ativo;
        
        if (dados.veiculo) {
            atualizado.veiculo = { ...motorista.veiculo, ...dados.veiculo };
            if (dados.veiculo.placa) atualizado.veiculo.placa = dados.veiculo.placa.toUpperCase();
        }
        
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

    autenticar: (whatsapp, senha) => {
        const motorista = MotoristaService.buscarPorWhatsApp(whatsapp);
        if (!motorista || !motorista.ativo) return null;
        if (senhasMotoristas.get(motorista.id) !== senha) return null;
        return motorista;
    },

    autenticarPorToken: (token) => {
        return MotoristaService.buscarPorToken(token);
    },

    regenerarToken: (id) => {
        const motorista = motoristas.get(id);
        if (!motorista) return null;
        
        // Remove token antigo
        if (motorista.token) {
            tokensMotoristas.delete(motorista.token);
        }
        
        // Gera novo token
        const novoToken = 'MOT_' + id.toUpperCase() + '_' + Date.now();
        motorista.token = novoToken;
        tokensMotoristas.set(novoToken, id);
        motoristas.set(id, motorista);
        
        return novoToken;
    },

    alterarSenha: (id, novaSenha) => {
        if (!motoristas.has(id)) return false;
        senhasMotoristas.set(id, novaSenha);
        return true;
    },

    obterDadosIndividuais: (id) => {
        const motorista = motoristas.get(id);
        if (!motorista) return null;
        
        // Retorna apenas dados do próprio motorista (segurança)
        return {
            id: motorista.id,
            nomeCompleto: motorista.nomeCompleto,
            whatsapp: motorista.whatsapp,
            veiculo: motorista.veiculo,
            status: motorista.status,
            avaliacao: motorista.avaliacao,
            corridasRealizadas: motorista.corridasRealizadas,
            saldoDevedor: motorista.saldoDevedor
        };
    },

    desativar: (id) => {
        const motorista = motoristas.get(id);
        if (!motorista) return null;
        motorista.ativo = false;
        motoristas.set(id, motorista);
        return motorista;
    },

    obterEstatisticas: () => {
        const lista = Array.from(motoristas.values());
        const ativos = lista.filter(m => m.ativo);
        return {
            total: lista.length,
            ativos: ativos.length,
            disponiveis: ativos.filter(m => m.status === 'disponivel').length,
            emCorrida: ativos.filter(m => m.status === 'em_corrida').length,
            offline: ativos.filter(m => m.status === 'offline').length
        };
    },

    verificarWhatsAppExiste: (whatsapp) => {
        return MotoristaService.buscarPorWhatsApp(whatsapp) !== null;
    }
};

module.exports = MotoristaService;
