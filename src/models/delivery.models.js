const mongoose = require('mongoose');

// ========== CARDÁPIO ==========
const CategoriaCardapioSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    nome: { type: String, required: true }, // Ex: "Lanches", "Bebidas", "Sobremesas"
    ordem: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true },
    emoji: String // Ex: "🍔", "🥤"
}, { timestamps: true });

const ItemCardapioSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    categoriaId: { type: mongoose.Schema.Types.ObjectId, ref: 'CategoriaCardapio', required: true },
    nome: { type: String, required: true }, // Ex: "X-Burguer"
    descricao: String, // Ex: "Pão, hambúrguer, queijo, alface, tomate"
    preco: { type: Number, required: true },
    imagem: String, // URL da imagem
    ativo: { type: Boolean, default: true },
    destaque: { type: Boolean, default: false },
    ordem: { type: Number, default: 0 },
    opcoes: [{
        nome: String, // Ex: "Adicional"
        itens: [{
            nome: String, // Ex: "Bacon"
            preco: { type: Number, default: 0 }
        }]
    }],
    tempoPreparoMin: { type: Number, default: 20 },
    tempoEstimadoPreparo: { type: Number }, // tempo real informado pela cozinha // minutos
    disponivel: { type: Boolean, default: true }
}, { timestamps: true });

// ========== PEDIDO ==========
const PedidoDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    numero: { type: Number }, // Auto-incremento por admin
    clienteNome: String,
    clienteTelefone: { type: String, required: true, index: true },
    instanciaId: mongoose.Schema.Types.ObjectId,
    
    itens: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'ItemCardapio' },
        nome: String,
        quantidade: { type: Number, default: 1 },
        precoUnitario: Number,
        opcionais: [{ nome: String, preco: Number }],
        observacao: String,
    // GPS Entregador (rastreamento tempo real)
    entregadorLatitude: Number,
    entregadorLongitude: Number,
    entregadorGpsAtualizado: Date,
        subtotal: Number
    }],
    
    // Entrega
    tipoEntrega: { type: String, enum: ['delivery', 'retirada'], default: 'delivery' },
    enderecoEntrega: String,
    enderecoLatitude: Number,
    enderecoLongitude: Number,
    taxaEntrega: { type: Number, default: 0 },
    
    // Pagamento
    formaPagamento: { type: String, enum: ['dinheiro', 'pix', 'cartao', 'na_entrega'], default: 'na_entrega' },
    trocoPara: Number,
    
    // Valores
    subtotal: { type: Number, default: 0 },
    desconto: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    
    // Status do pedido
    status: { 
        type: String, 
        enum: ['novo', 'confirmado', 'preparando', 'pronto', 'saiu_entrega', 'entregue', 'cancelado'],
        default: 'novo',
        index: true
    },
    
    // Timestamps de cada etapa
    dataConfirmado: Date,
    dataPreparando: Date,
    dataPronto: Date,
    dataSaiuEntrega: Date,
    dataEntregue: Date,
    dataCancelado: Date,
    motivoCancelamento: String,
    
    // Entregador
    entregadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Motorista' },
    entregadorNome: String,
    ordemEntrega: Number,
    rotaIniciada: Date,
    
    // Avaliação
    avaliacao: { type: Number, min: 1, max: 5 },
    avaliacaoComentario: String,
    
    // Chat
    chatMensagens: [{
        texto: String,
        remetente: String, // 'cliente', 'restaurante', 'entregador'
        nomeRemetente: String,
        data: { type: Date, default: Date.now }
    }],
    
    // Origem do pedido
    origemPedido: { type: String, enum: ['whatsapp', 'caixa', 'app'], default: 'whatsapp' },
    
    // Mesa (para pedidos presenciais)
    tipoLocal: { type: String, enum: ['mesa', 'balcao', 'delivery', 'retirada'], default: 'delivery' },
    numeroMesa: { type: Number },
    nomeComanda: String, // identificador da comanda se não tiver número
    
    // Pagamento parcial / fechamento
    pago: { type: Boolean, default: false },
    dataPagamento: Date,
    formasPagamento: [{ // múltiplas formas de pagamento
        forma: { type: String, enum: ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'] },
        valor: Number,
        data: { type: Date, default: Date.now }
    }],
    totalPago: { type: Number, default: 0 },
    troco: { type: Number, default: 0 },
    
    // Observação geral
    observacao: String
}, { timestamps: true });

// Auto-incremento do número do pedido
PedidoDeliverySchema.pre('save', async function(next) {
    if (this.isNew && !this.numero) {
        const ultimo = await this.constructor.findOne({ adminId: this.adminId }).sort({ numero: -1 });
        this.numero = (ultimo?.numero || 0) + 1;
    }
    next();
});

// ========== CONFIG DELIVERY ==========
const ConfigDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, unique: true },
    nomeRestaurante: String,
    endereco: String,
    horarioFuncionamento: { type: String, default: '18:00 - 23:00' },
    tempoMedioEntrega: { type: Number, default: 40 }, // minutos
    taxaEntregaFixa: { type: Number, default: 5.00 },
    taxaEntregaPorKm: { type: Number, default: 1.50 },
    raioEntregaKm: { type: Number, default: 10 },
    pedidoMinimo: { type: Number, default: 15.00 },
    aceitaPix: { type: Boolean, default: true },
    chavePix: String,
    aceitaCartao: { type: Boolean, default: false },
    aceitaDinheiro: { type: Boolean, default: true },
    mensagemBoasVindas: { type: String, default: 'Olá! Bem-vindo ao nosso delivery! 🍔' },
    mensagemPedidoConfirmado: { type: String, default: 'Seu pedido foi confirmado! Estamos preparando com carinho 🍳' },
    mensagemPedidoPronto: { type: String, default: 'Seu pedido está pronto! Já já sai para entrega 🏍️' },
    aberto: { type: Boolean, default: true },
    usarEntregadorProprio: { type: Boolean, default: true }
}, { timestamps: true });

const CategoriaCardapio = mongoose.model('CategoriaCardapio', CategoriaCardapioSchema);
const ItemCardapio = mongoose.model('ItemCardapio', ItemCardapioSchema);
const PedidoDelivery = mongoose.model('PedidoDelivery', PedidoDeliverySchema);
const ConfigDelivery = mongoose.model('ConfigDelivery', ConfigDeliverySchema);

module.exports = { CategoriaCardapio, ItemCardapio, PedidoDelivery, ConfigDelivery };

// ========== ADMIN DELIVERY (separado do Admin de corridas) ==========
const AdminDeliverySchema = new mongoose.Schema({
    // Dados do responsável
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    senha: { type: String, required: true },
    telefone: { type: String, required: true },

    // Dados do negócio
    nomeComercio: { type: String, required: true },
    tipoNegocio: { type: String, default: 'restaurante' },
    cidade: String,

    // Autenticação
    token: { type: String, unique: true, sparse: true },

    // Trial / plano
    status: { type: String, enum: ['trial', 'ativo', 'bloqueado', 'cancelado'], default: 'trial' },
    trialInicio: { type: Date, default: Date.now },
    trialFim: { type: Date },
    plano: { type: String, default: 'basico' },
    valorMensal: { type: Number, default: 97 },

    // Controle master
    liberadoPor: String,
    motivoBloqueio: String,
    observacoesMaster: String,

    // Origem
    origem: { type: String, default: 'landing' }
}, { timestamps: true });

AdminDeliverySchema.index({ status: 1 });

const AdminDelivery = mongoose.models.AdminDelivery || mongoose.model('AdminDelivery', AdminDeliverySchema);

module.exports.AdminDelivery = AdminDelivery;

// ===== MENSALIDADE DE CLIENTE DELIVERY =====
const MensalidadeClienteDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    nome: { type: String, required: true },
    telefone: { type: String, required: true },
    endereco: { type: String, default: '' },
    valor: { type: Number, required: true },
    diaVencimento: { type: Number, default: 1 }, // dia do mês 1-28
    formaPagamento: { type: String, enum: ['pix', 'dinheiro', 'cartao'], default: 'pix' },
    status: { type: String, enum: ['ativo', 'inativo', 'inadimplente'], default: 'ativo' },
    observacoes: { type: String, default: '' },
    horarioEntrega: { type: String, default: '12:00' }, // horário preferido de entrega
    restricoes: { type: String, default: '' }, // ex: sem cebola, sem gluten
    ultimoPagamento: { type: Date },
    proximoVencimento: { type: Date },
}, { timestamps: true });
MensalidadeClienteDeliverySchema.index({ adminId: 1, telefone: 1 });
const MensalidadeClienteDelivery = mongoose.models.MensalidadeClienteDelivery || mongoose.model('MensalidadeClienteDelivery', MensalidadeClienteDeliverySchema);
module.exports.MensalidadeClienteDelivery = MensalidadeClienteDelivery;

// ===== CARDÁPIO DO DIA =====
const CardapioDiaSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    data: { type: String, required: true }, // formato YYYY-MM-DD
    descricao: { type: String, default: '' }, // texto livre do cardápio do dia
    horarioEnvio: { type: String, default: '08:00' }, // hora que Rebeca manda para assinantes
    enviado: { type: Boolean, default: false },
    enviadoEm: { type: Date },
    totalEnviados: { type: Number, default: 0 },
}, { timestamps: true });
CardapioDiaSchema.index({ adminId: 1, data: 1 }, { unique: true });
const CardapioDia = mongoose.models.CardapioDia || mongoose.model('CardapioDia', CardapioDiaSchema);
module.exports.CardapioDia = CardapioDia;

// ===== ENTREGADORES =====
const EntregadorSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    nome: { type: String, required: true },
    telefone: { type: String, default: '' },
    veiculo: { type: String, default: '' },
    tipo: { type: String, default: 'entregador' },
    ativo: { type: Boolean, default: true },
}, { timestamps: true });
const Entregador = mongoose.models.Entregador || mongoose.model('Entregador', EntregadorSchema);
module.exports.Entregador = Entregador;
