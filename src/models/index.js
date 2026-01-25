const mongoose = require('mongoose');

const MotoristaSchema = new mongoose.Schema({
    nomeCompleto: String, whatsapp: { type: String, unique: true }, cpf: String, cnh: String,
    veiculo: { modelo: String, cor: String, placa: String, ano: Number },
    status: { type: String, default: 'disponivel' }, latitude: Number, longitude: Number,
    avaliacao: { type: Number, default: 5 }, corridasRealizadas: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true }, token: String, senha: String
}, { timestamps: true });

const ClienteSchema = new mongoose.Schema({
    nome: String, telefone: { type: String, unique: true }, email: String,
    enderecoFavorito: { casa: { endereco: String, latitude: Number, longitude: Number }, trabalho: { endereco: String, latitude: Number, longitude: Number } },
    corridasRealizadas: { type: Number, default: 0 }
}, { timestamps: true });

const CorridaSchema = new mongoose.Schema({
    clienteId: mongoose.Schema.Types.ObjectId, clienteNome: String, clienteTelefone: String,
    motoristaId: mongoose.Schema.Types.ObjectId, motoristaNome: String,
    origem: { endereco: String, latitude: Number, longitude: Number },
    destino: { endereco: String, latitude: Number, longitude: Number },
    observacaoOrigem: String, observacaoDestino: String,
    distanciaKm: Number, tempoEstimado: Number, precoEstimado: Number, precoFinal: Number,
    status: { type: String, default: 'pendente' }, formaPagamento: String, avaliacao: Number
}, { timestamps: true });

const ConfigSchema = new mongoose.Schema({
    chave: { type: String, unique: true }, valor: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = {
    Motorista: mongoose.model('Motorista', MotoristaSchema),
    Cliente: mongoose.model('Cliente', ClienteSchema),
    Corrida: mongoose.model('Corrida', CorridaSchema),
    Config: mongoose.model('Config', ConfigSchema)
};
