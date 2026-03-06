const mongoose = require('mongoose');

const MotoristaSchema = new mongoose.Schema({
    nomeCompleto: String, whatsapp: { type: String }, cpf: String, cnh: String,
    veiculo: { modelo: String, cor: String, placa: String, ano: Number },
    foto: String, // URL da foto do motorista
    status: { type: String, default: 'disponivel' }, latitude: Number, longitude: Number,
    avaliacao: { type: Number, default: 5 }, corridasRealizadas: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true }, bloqueado: { type: Boolean, default: false }, token: String, senha: String, pushSubscription: String, cidadeAtuacao: String, cnhValidade: Date, observacao: String, plano: { type: String, enum: ['semanal', 'mensal'], default: 'mensal' }, valorMensalidade: { type: Number, default: 100 }, adminId: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

const ClienteSchema = new mongoose.Schema({
    nome: String, telefone: { type: String }, email: String,
    enderecoFavorito: { casa: { endereco: String, latitude: Number, longitude: Number }, trabalho: { endereco: String, latitude: Number, longitude: Number } },
    corridasRealizadas: { type: Number, default: 0 },
    bloqueado: { type: Boolean, default: false }, motivoBloqueio: String,
    motoristaFavorito: { type: mongoose.Schema.Types.ObjectId, ref: 'Motorista' },
    ultimoMotorista: { type: mongoose.Schema.Types.ObjectId, ref: 'Motorista' },
    adminId: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

const CorridaSchema = new mongoose.Schema({
    clienteId: mongoose.Schema.Types.ObjectId, clienteNome: String, clienteTelefone: String,
    tokenRastreamento: { type: String, index: true }, clienteFoto: String, aparenciaCliente: String, enderecoOrigemTexto: String, enderecoDestinoTexto: String,
    tipo: { type: String, enum: ['passageiro', 'encomenda'], default: 'passageiro' },
    descricaoEncomenda: String, nomeColeta: String, nomeEntrega: String, fragilPerecivel: String,
    motoristaId: mongoose.Schema.Types.ObjectId, motoristaNome: String,
    origem: { endereco: String, latitude: Number, longitude: Number },
    destino: { endereco: String, latitude: Number, longitude: Number },
    paradas: [{ endereco: String, latitude: Number, longitude: Number, ordem: Number, concluida: { type: Boolean, default: false } }], // Múltiplas paradas
    observacaoOrigem: String, observacaoDestino: String,
    distanciaKm: Number, tempoEstimado: Number, precoEstimado: Number, precoFinal: Number,
    status: { type: String, default: 'pendente' }, formaPagamento: String, avaliacao: Number,
    motoristaChegouEm: Date, iniciadaEm: Date, finalizadaEm: Date, canceladaEm: Date, motivoCancelamento: String
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

// ==================== MULTI-TENANT: Adicionar adminId ====================
// Adiciona adminId aos schemas existentes para isolamento por empresa
const { Motorista, Cliente, Corrida } = module.exports;

// Compound index: whatsapp + adminId (permite mesmo numero em admins diferentes)
MotoristaSchema.index({ whatsapp: 1, adminId: 1 }, { unique: true });
ClienteSchema.index({ telefone: 1, adminId: 1 }, { unique: true });

// Dropar indexes unicos antigos que causam conflito
async function corrigirIndexes() {
    try { await Motorista.collection.dropIndex('whatsapp_1'); } catch(e) {}
    try { await Cliente.collection.dropIndex('telefone_1'); } catch(e) {}
}
corrigirIndexes();

Motorista.schema.add({ adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true } });
Cliente.schema.add({ adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true } });
Corrida.schema.add({ adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true } });

console.log('✅ Schemas atualizados com adminId para multi-tenant');


// ==================== MENSALIDADE ====================
const MensalidadeSchema = new mongoose.Schema({
    motoristaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Motorista', required: true },
    motoristaNome: String,
    motoristaWhatsapp: String,
    plano: { type: String, enum: ['semanal', 'mensal'], default: 'mensal' },
    valor: { type: Number, required: true },
    dataVencimento: { type: Date, required: true },
    dataPagamento: Date,
    status: { type: String, index: true, enum: ['pendente', 'pago', 'atrasado', 'bloqueado'], default: 'pendente' },
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
    telefone: { type: String, required: true, index: true },
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
    // White-label - Personalização da marca
    nomeMarca: { type: String, default: 'UBMAX' },
    nomeAssistente: { type: String, default: 'Rebeca' },
    corPrimaria: { type: String, default: '#00d4ff' },
    logoUrl: String,
    slugMotorista: String, // URL única para motoristas: /m/ubmax
    horario: { type: String, default: '24 horas' },
    pagamento: { type: String, default: 'Dinheiro, PIX' },
    boasVindas: String,
    ativo: { type: Boolean, default: false },
    testeGratis: { type: Boolean, default: false },
    dataInicioTeste: Date,
    dataFimTeste: Date,
    bloqueado: { type: Boolean, default: false },
    motivoBloqueio: String,
    origem: { type: String, default: 'cadastro_manual' }, // cadastro_manual, landing_page
    tipoAdmin: { type: String, enum: ['transporte', 'delivery', 'multi'], default: 'transporte' },
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
    }],
    // ========== CONFIGURAÇÕES DE PREÇO ==========
    configPrecos: {
        taxaBase: { type: Number, default: 5.00 },
        precoKm: { type: Number, default: 2.50 },
        taxaMinima: { type: Number, default: 15.00 },
        taxaBandeira2: { type: Number, default: 3.00 },
        precoMinuto: { type: Number, default: 0.50 }
    },
    // ========== CONFIGURAÇÕES DE DESPACHO ==========
    configDespacho: {
        modo: { type: String, enum: ['broadcast', 'proximo'], default: 'broadcast' },
        tempoAceite: { type: Number, default: 30 },
        tentativasMax: { type: Number, default: 3 }
    },
    // ========== PREÇO FIXO (FESTA/EVENTO) ==========
    precoFixo: {
        ativo: { type: Boolean, default: false },
    testeGratis: { type: Boolean, default: false },
    dataInicioTeste: Date,
    dataFimTeste: Date,
    bloqueado: { type: Boolean, default: false },
    motivoBloqueio: String,
    origem: { type: String, default: 'cadastro_manual' }, // cadastro_manual, landing_page
    tipoAdmin: { type: String, enum: ['transporte', 'delivery', 'multi'], default: 'transporte' },
        valor: { type: Number, default: 15.00 },
        motivo: String // Ex: "Carnaval", "Ano Novo"
    },
    // ========== PREÇOS SIMPLIFICADOS POR DIA ==========
    precosSimples: {
        // Segunda a Sexta
        semana: {
            manha: { type: Number, default: 15.00 },      // 06:00 - 12:00
            tarde: { type: Number, default: 15.00 },      // 12:00 - 18:00
            noite: { type: Number, default: 18.00 },      // 18:00 - 00:00
            madrugada: { type: Number, default: 20.00 }   // 00:00 - 06:00
        },
        // Sábado
        sabado: {
            manha: { type: Number, default: 18.00 },
            tarde: { type: Number, default: 18.00 },
            noite: { type: Number, default: 22.00 },
            madrugada: { type: Number, default: 25.00 }
        },
        // Domingo
        domingo: {
            manha: { type: Number, default: 18.00 },
            tarde: { type: Number, default: 18.00 },
            noite: { type: Number, default: 20.00 },
            madrugada: { type: Number, default: 25.00 }
        }
    },
    // ========== USAR PREÇO SIMPLES OU CALCULADO ==========
    modoPreco: { type: String, enum: ['simples', 'calculado'], default: 'simples' },
    // ========== FAIXAS DE PREÇO PERSONALIZADAS ==========
    faixasPreco: [{
        diaSemana: String,
        horaInicio: String,
        horaFim: String,
        nome: String,
        multiplicador: { type: Number, default: 1 },
        taxaAdicional: { type: Number, default: 0 },
        ativo: { type: Boolean, default: true }
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

// ==================== INSTÂNCIA WHATSAPP (MULTI-TENANT) ====================
const InstanciaWhatsappSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    nomeInstancia: { type: String, required: true, unique: true },
    apiUrl: { type: String, default: 'https://evolution-api.com' },
    apiKey: String,
    telefoneConectado: String,
    status: { type: String, enum: ['desconectado', 'conectando', 'conectado', 'erro'], default: 'desconectado' },
    qrCode: String,
    qrCodeExpira: Date,
    ultimaConexao: Date,
    webhookUrl: String,
    configuracoes: {
        receberMensagens: { type: Boolean, default: true },
        enviarNotificacoes: { type: Boolean, default: true },
        respostaAutomatica: { type: Boolean, default: false },
        mensagemBoasVindas: String
    }
}, { timestamps: true });

const InstanciaWhatsapp = mongoose.model('InstanciaWhatsapp', InstanciaWhatsappSchema);
module.exports.InstanciaWhatsapp = InstanciaWhatsapp;

// ==================== PREÇOS INTERMUNICIPAIS ====================
const PrecoIntermunicipalSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    cidadeOrigem: { type: String, required: true },
    cidadeDestino: { type: String, required: true },
    distanciaKm: Number,
    precoFixo: { type: Number, required: true },
    precoKmExtra: { type: Number, default: 2.50 },
    tempoEstimadoMin: Number,
    ativo: { type: Boolean, default: true }
}, { timestamps: true });

const PrecoIntermunicipal = mongoose.model('PrecoIntermunicipal', PrecoIntermunicipalSchema);
module.exports.PrecoIntermunicipal = PrecoIntermunicipal;
console.log('✅ Modelo PrecoIntermunicipal criado');

// ==================== DÚVIDAS PENDENTES (Rebeca → Admin) ====================
const DuvidaPendenteSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    clienteTelefone: { type: String, required: true },
    clienteNome: String,
    mensagemCliente: { type: String, required: true },
    status: { type: String, enum: ['pendente', 'respondida', 'expirada'], default: 'pendente' },
    respostaAdmin: String,
    respondidaEm: Date,
    instanciaId: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

const DuvidaPendente = mongoose.model('DuvidaPendente', DuvidaPendenteSchema);
module.exports.DuvidaPendente = DuvidaPendente;

// ==================== FILA DE ESPERA ====================
const FilaEsperaSchema = new mongoose.Schema({
    clienteTelefone: { type: String, required: true },
    clienteNome: String,
    origem: { endereco: String, latitude: Number, longitude: Number },
    destino: { endereco: String, latitude: Number, longitude: Number },
    posicao: { type: Number, default: 1 },
    status: { type: String, enum: ['aguardando', 'notificado', 'atendido', 'expirado'], default: 'aguardando' },
    adminId: mongoose.Schema.Types.ObjectId,
    instanciaId: mongoose.Schema.Types.ObjectId
}, { timestamps: true });

const FilaEspera = mongoose.model('FilaEspera', FilaEsperaSchema);
module.exports.FilaEspera = FilaEspera;


// ==================== PONTOS DE EMBARQUE ====================
const PontoEmbarqueSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    nome: { type: String, required: true },
    endereco: { type: String, required: true },
    lat: Number,
    lng: Number,
    ativo: { type: Boolean, default: true },
    diasSemana: [{ type: Number }], // 0=Dom, 1=Seg... 6=Sab
    horarioAbertura: String, // ex: "06:00"
    horarioFechamento: String, // ex: "22:00"
    maxCorridasPonto: { type: Number, default: 3 }, // corridas por ponto antes de broadcast
    maxCorridasBroadcast: { type: Number, default: 5 }, // corridas para todos
    tempoAceiteSegundos: { type: Number, default: 30 },
    principal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const FilaPontoSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    pontoId: { type: mongoose.Schema.Types.ObjectId, ref: 'PontoEmbarque', required: true },
    motoristaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Motorista', required: true },
    motoristaNome: String,
    chegadaEm: { type: Date, default: Date.now },
    ordemChegada: Number,
    status: { type: String, default: 'aguardando' } // aguardando, em_corrida, saiu
});
FilaPontoSchema.index({ pontoId: 1, status: 1 });
FilaPontoSchema.index({ motoristaId: 1, status: 1 }); // busca rápida por motorista

const PontoEmbarque = mongoose.model('PontoEmbarque', PontoEmbarqueSchema);
const FilaPonto = mongoose.model('FilaPonto', FilaPontoSchema);
module.exports.PontoEmbarque = PontoEmbarque;
module.exports.FilaPonto = FilaPonto;

// Dedup de mensagens WhatsApp — TTL 10 minutos
const MsgDedupSchema = new mongoose.Schema({
    msgId: { type: String, required: true, unique: true },
    criadoEm: { type: Date, default: Date.now, expires: 600 }
});
const MsgDedup = mongoose.model('MsgDedup', MsgDedupSchema);
module.exports.MsgDedup = MsgDedup;


// ===== ZONA DE PREÇO (raio no mapa com preço fixo) =====
const ZonaPrecoSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    nome: { type: String, required: true },
    ativo: { type: Boolean, default: true },
    // Centro do raio
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    enderecoReferencia: { type: String, default: '' },
    // Raio em km
    raioKm: { type: Number, required: true, default: 2 },
    // Preço fixo dentro do raio (substitui cálculo normal)
    precoFixo: { type: Number, required: true },
    // Restrições de horário/dia (opcional — null = sempre ativo)
    diasSemana: [{ type: Number }], // 0=Dom..6=Sab, vazio=todos
    horaInicio: { type: String, default: '00:00' },
    horaFim: { type: String, default: '23:59' },
    // Descrição
    descricao: { type: String, default: '' },
    criadoEm: { type: Date, default: Date.now }
}, { timestamps: true });
ZonaPrecoSchema.index({ adminId: 1, ativo: 1 });

const ZonaPreco = mongoose.model('ZonaPreco', ZonaPrecoSchema);
module.exports.ZonaPreco = ZonaPreco;
