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

// ==================== MENSALIDADE ====================
const MensalidadeSchema = new mongoose.Schema({
    motoristaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Motorista', required: true },
    motoristaNome: String,
    motoristaWhatsapp: String,
    plano: { type: String, enum: ['semanal', 'mensal'], default: 'mensal' },
    valor: { type: Number, required: true },
    dataVencimento: { type: Date, required: true },
    dataPagamento: Date,
    status: { type: String, enum: ['pendente', 'pago', 'atrasado', 'bloqueado'], default: 'pendente' },
    comprovante: String,
    observacao: String,
    notificacaoEnviada: { type: Boolean, default: false },
    notificacaoAtrasoEnviada: { type: Boolean, default: false }
}, { timestamps: true });

// ==================== CONFIG FINANCEIRO ====================
const ConfigFinanceiroSchema = new mongoose.Schema({
    chavePix: String,
    tipoChavePix: { type: String, enum: ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'], default: 'aleatoria' },
    nomeTitular: String,
    valorMensalidade: { type: Number, default: 100 },
    valorSemanal: { type: Number, default: 30 },
    diasTolerancia: { type: Number, default: 2 },
    mensagemCobranca: String,
    mensagemBloqueio: String
}, { timestamps: true });

const Mensalidade = mongoose.model('Mensalidade', MensalidadeSchema);
const ConfigFinanceiro = mongoose.model('ConfigFinanceiro', ConfigFinanceiroSchema);

module.exports.Mensalidade = Mensalidade;
module.exports.ConfigFinanceiro = ConfigFinanceiro;

// ==================== CONTATOS EMERGÊNCIA ====================
const ContatoEmergenciaSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    telefone: { type: String, required: true },
    categoria: { type: String, enum: ['admin', 'mecanico', 'guincho', 'borracheiro', 'suporte', 'policia', 'hospital', 'outro'], default: 'outro' },
    descricao: String,
    disponivel24h: { type: Boolean, default: false },
    ativo: { type: Boolean, default: true }
}, { timestamps: true });

const ContatoEmergencia = mongoose.model('ContatoEmergencia', ContatoEmergenciaSchema);
module.exports.ContatoEmergencia = ContatoEmergencia;

// ==================== MENSAGENS CORRIDA ====================
const MensagemCorridaSchema = new mongoose.Schema({
    corridaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Corrida', required: true },
    remetente: { type: String, enum: ['motorista', 'cliente', 'rebeca'], required: true },
    destinatario: { type: String, enum: ['motorista', 'cliente'], required: true },
    mensagem: { type: String, required: true },
    lida: { type: Boolean, default: false },
    entregue: { type: Boolean, default: false }
}, { timestamps: true });

const MensagemCorrida = mongoose.model('MensagemCorrida', MensagemCorridaSchema);
module.exports.MensagemCorrida = MensagemCorrida;
