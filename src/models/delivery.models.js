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
    tempoPreparoMin: { type: Number, default: 20 }, // minutos
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
