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

// ==================== ATUALIZAR CONFIG FINANCEIRO (Evolution API) ====================
const ConfigFinanceiroSchemaUpdate = {
    evolutionApiUrl: String,
    evolutionApiKey: String,
    evolutionInstance: { type: String, default: 'ubmax' },
    whatsappConectado: { type: Boolean, default: false }
};

// Adicionar campos ao schema existente
if (ConfigFinanceiro.schema) {
    ConfigFinanceiro.schema.add(ConfigFinanceiroSchemaUpdate);
}

// ==================== ADMIN MASTER ====================
const AdminMasterSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    telefone: String,
    ativo: { type: Boolean, default: true },
    ultimoAcesso: Date,
    permissoes: {
        gerenciarAdmins: { type: Boolean, default: true },
        gerenciarEmpresas: { type: Boolean, default: true },
        verLogs: { type: Boolean, default: true },
        suporte: { type: Boolean, default: true },
        configuracoes: { type: Boolean, default: true }
    }
}, { timestamps: true });

// ==================== ADMIN (SUB-ADMIN) ====================
const AdminSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    telefone: String,
    empresa: String,
    ativo: { type: Boolean, default: false },
    aprovadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminMaster' },
    dataAprovacao: Date,
    ultimoAcesso: Date,
    permissoes: {
        corridas: { type: Boolean, default: true },
        motoristas: { type: Boolean, default: true },
        clientes: { type: Boolean, default: true },
        financeiro: { type: Boolean, default: false },
        relatorios: { type: Boolean, default: true }
    },
    logs: [{
        acao: String,
        data: { type: Date, default: Date.now },
        ip: String
    }]
}, { timestamps: true });

// ==================== LOGS DO SISTEMA ====================
const LogSistemaSchema = new mongoose.Schema({
    tipo: { type: String, enum: ['acesso', 'acao', 'erro', 'suporte'] },
    usuario: String,
    tipoUsuario: { type: String, enum: ['master', 'admin', 'motorista', 'cliente'] },
    acao: String,
    detalhes: mongoose.Schema.Types.Mixed,
    ip: String
}, { timestamps: true });

// ==================== TICKETS SUPORTE ====================
const TicketSuporteSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    solicitante: String,
    tipoSolicitante: { type: String, enum: ['admin', 'motorista', 'cliente'] },
    assunto: String,
    descricao: String,
    status: { type: String, enum: ['aberto', 'em_andamento', 'aguardando', 'resolvido', 'fechado'], default: 'aberto' },
    prioridade: { type: String, enum: ['baixa', 'media', 'alta', 'urgente'], default: 'media' },
    atendidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminMaster' },
    mensagens: [{
        remetente: String,
        tipoRemetente: String,
        mensagem: String,
        data: { type: Date, default: Date.now }
    }],
    resolucao: String,
    dataResolucao: Date
}, { timestamps: true });

const AdminMaster = mongoose.model('AdminMaster', AdminMasterSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const LogSistema = mongoose.model('LogSistema', LogSistemaSchema);
const TicketSuporte = mongoose.model('TicketSuporte', TicketSuporteSchema);

module.exports.AdminMaster = AdminMaster;
module.exports.Admin = Admin;
module.exports.LogSistema = LogSistema;
module.exports.TicketSuporte = TicketSuporte;

// ==================== PLANOS ADMIN ====================
const PlanoAdminSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    descricao: String,
    preco: { type: Number, required: true },
    periodo: { type: String, enum: ['mensal', 'trimestral', 'semestral', 'anual'], default: 'mensal' },
    limiteMotoristas: { type: Number, default: 10 },
    limiteCorridas: { type: Number, default: 1000 },
    recursos: [String],
    ativo: { type: Boolean, default: true }
}, { timestamps: true });

// ==================== MENSALIDADE ADMIN ====================
const MensalidadeAdminSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    planoId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanoAdmin' },
    valor: { type: Number, required: true },
    dataVencimento: { type: Date, required: true },
    dataPagamento: Date,
    status: { type: String, enum: ['pendente', 'pago', 'atrasado', 'bloqueado'], default: 'pendente' },
    formaPagamento: String,
    comprovante: String,
    observacao: String
}, { timestamps: true });

// ==================== CONTABILIDADE ADMIN ====================
const ContabilidadeAdminSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    mes: { type: Number, required: true },
    ano: { type: Number, required: true },
    motoristasAtivos: { type: Number, default: 0 },
    corridasRealizadas: { type: Number, default: 0 },
    faturamentoBruto: { type: Number, default: 0 },
    comissaoPlataforma: { type: Number, default: 0 },
    faturamentoLiquido: { type: Number, default: 0 }
}, { timestamps: true });

// ==================== CONFIG MASTER ====================
const ConfigMasterSchema = new mongoose.Schema({
    chavePixMaster: String,
    tipoChavePixMaster: { type: String, enum: ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] },
    nomeTitularMaster: String,
    comissaoPlataforma: { type: Number, default: 10 },
    diasTolerancia: { type: Number, default: 5 },
    mensagemBoasVindas: String,
    termoUso: String
}, { timestamps: true });

const PlanoAdmin = mongoose.model('PlanoAdmin', PlanoAdminSchema);
const MensalidadeAdmin = mongoose.model('MensalidadeAdmin', MensalidadeAdminSchema);
const ContabilidadeAdmin = mongoose.model('ContabilidadeAdmin', ContabilidadeAdminSchema);
const ConfigMaster = mongoose.model('ConfigMaster', ConfigMasterSchema);

module.exports.PlanoAdmin = PlanoAdmin;
module.exports.MensalidadeAdmin = MensalidadeAdmin;
module.exports.ContabilidadeAdmin = ContabilidadeAdmin;
module.exports.ConfigMaster = ConfigMaster;
