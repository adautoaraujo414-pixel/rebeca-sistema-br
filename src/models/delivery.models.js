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
    disponivel: { type: Boolean, default: true },
    bebidaVolume: { type: String, default: '' },
    bebidaEstoque: { type: Number, default: 0 },
    // Açaí
    acaiTamanho: { type: String, default: null },
    acaiEstoque: { type: Number, default: null },
    acaiAcompanhamentos: { type: String, default: null },
    // Marmita
    marmitaTamanho: { type: String, default: null },
    marmitaPeso: { type: String, default: null },
    marmitaEstoque: { type: Number, default: null },
    marmitaConteudo: { type: String, default: null },
    marmitaTipo: { type: String, default: null },
    // Controle de estoque
    estoqueAtivo: { type: Boolean, default: false },   // se false, não controla estoque
    estoqueAtual: { type: Number, default: 0 },        // unidades restantes
    estoqueMinimo: { type: Number, default: 2 },
    codigoBarra: { type: String, default: '' },      // EAN-13 / código de barras
    fornecedor: { type: String, default: '' },       // nome do fornecedor
    fornecedorTelefone: { type: String, default: '' }, // telefone/WhatsApp do fornecedor
    unidadePorPedido: { type: Number, default: 1 },  // quantas unidades saem por pedido
    custoProducao: { type: Number, default: 0 },     // custo de produção/compra por unidade
    precoCompra: { type: Number, default: 0 },       // preço pago ao fornecedor
    // ===== PIZZA =====
    // ===== PROMOÇÃO =====
    promocaoPct: { type: Number, default: 0 },    // % de desconto (0 = sem promoção)
    precoPromo: { type: Number, default: 0 },     // preço com desconto calculado
    tipoProduto: { type: String, default: 'simples' }, // simples | pizza
    pizzaTamanhos: [{ // P, M, G, GG com preços
        nome: String,   // "P", "M", "G", "GG"
        preco: Number,
        descricao: String // "4 fatias", "8 fatias"
    }],
    pizzaBordas: [{ // recheada, catupiry, chocolate...
        nome: String,
        preco: { type: Number, default: 0 }
    }],
    pizzaAdicionais: [{ // bacon, cheddar, pepperoni...
        nome: String,
        preco: { type: Number, default: 0 }
    }],
}, { timestamps: true });

// ========== PEDIDO ==========
const PedidoDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    numero: { type: Number }, // Auto-incremento por admin
    clienteNome: String,
    clienteTelefone: { type: String, default: '', index: true },
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
        enum: ['novo', 'pendente', 'confirmado', 'preparando', 'pronto', 'saiu_entrega', 'entregue', 'cancelado'],
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
    canceladoPor: { type: String, enum: ['caixa','garcom','cozinha','cliente','admin','sistema'], default: null },
    
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
    origemPedido: { type: String, enum: ['whatsapp', 'caixa', 'app', 'cardapio_digital', 'garcom', 'mesa'], default: 'whatsapp' },
    
    // Mesa (para pedidos presenciais)
    tipoLocal: { type: String, enum: ['mesa', 'balcao', 'delivery', 'retirada'], default: 'delivery' },
    numeroMesa: { type: Number },
    garcomNome: { type: String },
    garcom: { type: String },
    taxaGarcomPerc: { type: Number, default: 0 },
    taxaGarcom: { type: Number, default: 0 },
    taxaBanda: { type: Number, default: 0 },
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
PedidoDeliverySchema.pre('save', async function() {
    if (this.isNew && !this.numero) {
        try {
            const ultimo = await this.constructor.findOne({ adminId: this.adminId }).sort({ numero: -1 });
            this.numero = (ultimo?.numero || 0) + 1;
        } catch(e) {
            this.numero = Date.now();
        }
    }
});

// ========== CONFIG DELIVERY ==========
const ConfigDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, unique: true },
    nomeRestaurante: String,
    endereco: String,
    horarioFuncionamento: { type: String, default: null },
    tempoMedioEntrega: { type: Number, default: null },
    taxaEntregaFixa: { type: Number, default: null },
    taxaEntregaPorKm: { type: Number, default: 1.50 },
    raioEntregaKm: { type: Number, default: 10 },
    pedidoMinimo: { type: Number, default: null },
    cidade: { type: String, default: null },
    logo: { type: String, default: null },
    aceitaPix: { type: Boolean, default: true },
    chavePix: String,
    nomePix: String,
    bancoPix: String,
    pixQrUrl: String,
    aceitaCartao: { type: Boolean, default: false },
    aceitaDinheiro: { type: Boolean, default: true },
    taxaGarcomPerc: { type: Number, default: 0 },
    taxaBandaValor: { type: Number, default: 0 },
    cobrarTaxaGarcom: { type: Boolean, default: false },
    cobrarBanda: { type: Boolean, default: false },
    viasImpressao: { type: Number, default: 1 },
    telefoneDono: { type: String, default: '' }, // telefone do proprietário para Rebeca encaminhar dúvidas
    mensagemBoasVindas: { type: String, default: 'Olá! Bem-vindo ao nosso delivery! 🍔' },
    mensagemPedidoConfirmado: { type: String, default: 'Seu pedido foi confirmado! Estamos preparando com carinho 🍳' },
    mensagemPedidoPronto: { type: String, default: 'Seu pedido está pronto! Já já sai para entrega 🏍️' },
    aberto: { type: Boolean, default: true },
    usarEntregadorProprio: { type: Boolean, default: true },
    // Dados fiscais para cupom
    cnpj: { type: String, default: '' },
    telefoneContato: { type: String, default: '' },
    enderecoCompleto: { type: String, default: '' },
    cidadeEstado: { type: String, default: '' },
    msgRodapeCupom: { type: String, default: 'Obrigado pela preferência! Volte sempre!' }
}, { timestamps: true });

const CategoriaCardapio = mongoose.model('CategoriaCardapio', CategoriaCardapioSchema);
const ItemCardapio = mongoose.model('ItemCardapio', ItemCardapioSchema);
const PedidoDelivery = mongoose.model('PedidoDelivery', PedidoDeliverySchema);
const ConfigDelivery = mongoose.model('ConfigDelivery', ConfigDeliverySchema);

module.exports.CategoriaCardapio = CategoriaCardapio;
module.exports.ItemCardapio = ItemCardapio;
module.exports.PedidoDelivery = PedidoDelivery;
module.exports.ConfigDelivery = ConfigDelivery;

// ========== ADMIN DELIVERY (separado do Admin de corridas) ==========
const AdminDeliverySchema = new mongoose.Schema({
    // Dados do responsável
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    senha: { type: String, required: true },
    telefone: { type: String, required: true },

    // Dados do negócio
    nomeComercio: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    nomeEstabelecimento: { type: String, default: '' },
    tipoNegocio: { type: String, default: 'restaurante' },
    // Plano de assinatura
    plano: { type: String, enum: ['confort', 'plus', 'premium'], default: 'confort' },
    planoStatus: { type: String, enum: ['ativo', 'suspenso', 'cancelado', 'trial'], default: 'trial' },
    planoDataInicio: { type: Date, default: Date.now },
    planoDataVencimento: { type: Date, default: () => new Date(Date.now() + 30*24*60*60*1000) },
    planoValor: { type: Number, default: 179 },
    planoAnterior: { type: String, default: '' },
    planoUpgradeSolicitadoEm: { type: Date },
    planoHistorico: [{ plano: String, valor: Number, data: Date }],
    cidade: String,

    // Autenticação
    senha: { type: String, default: "" },
  mesas: { type: String, default: "" },
  token: { type: String, unique: true, sparse: true },

    // Trial / plano
    status: { type: String, enum: ['trial', 'ativo', 'bloqueado', 'cancelado'], default: 'trial' },
    trialInicio: { type: Date, default: Date.now },
    trialFim: { type: Date },
    plano: { type: String, default: 'basico' },
    valorMensal: { type: Number, default: 97 },

    // Cardápio do dia para assinantes
    cardapioAtivoAssinantes: { type: Boolean, default: false },
    telefoneDono: { type: String, default: '' }, // telefone para Rebeca perguntar cardápio

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
// ===== CARDÁPIO SEMANAL MARMITARIA =====
const CardapioSemanalSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
    diaSemana: { type: Number, required: true }, // 0=dom,1=seg,2=ter,3=qua,4=qui,5=sex,6=sab
    nomePrato: { type: String, required: true }, // Ex: "Frango Grelhado com Arroz"
    ingredientes: [{ // ingredientes inclusos no preço base
        nome: String,
        destaque: { type: Boolean, default: false }
    }],
    adicionais: [{ // opcionais pagos
        nome: String,
        preco: { type: Number, default: 0 },
        descricao: String
    }],
    tamanhos: [{ // P, M, G, GG com preços
        tamanho: String,
        preco: Number,
        peso: String
    }],
    ativo: { type: Boolean, default: true },
    imagemGerada: { type: String, default: '' }, // URL ou base64 da imagem gerada
}, { timestamps: true });

CardapioSemanalSchema.index({ adminId: 1, diaSemana: 1 });
const CardapioSemanal = mongoose.models.CardapioSemanal || mongoose.model('CardapioSemanal', CardapioSemanalSchema);
module.exports.CardapioSemanal = CardapioSemanal;

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
    senha:    { type: String, default: '' },
    mesas:    { type: String, default: '' },
    veiculo: { type: String, default: '' },
    tipo: { type: String, default: 'entregador' },
    ativo: { type: Boolean, default: true },
}, { timestamps: true });
const Entregador = mongoose.models.Entregador || mongoose.model('Entregador', EntregadorSchema);
module.exports.Entregador = Entregador;

// ===== GARÇONS =====
const GarcomDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    nome: { type: String, required: true },
    telefone: { type: String, default: '' },
    senha:    { type: String, default: '' },
    mesas:    { type: String, default: '' },
    token: { type: String, unique: true, sparse: true },
    ativo: { type: Boolean, default: true },
    totalMesas: { type: Number, default: 0 },
    totalPedidos: { type: Number, default: 0 },
    totalVendido: { type: Number, default: 0 },
}, { timestamps: true });
// GarcomDelivery adminId index já definido no schema field
const GarcomDelivery = mongoose.models.GarcomDelivery || mongoose.model('GarcomDelivery', GarcomDeliverySchema);
module.exports.GarcomDelivery = GarcomDelivery;

// ===== CAIXA (abertura/fechamento) =====
const CaixaDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ['aberto', 'fechado'], default: 'aberto' },
    abertoPor: { type: String, default: 'admin' },
    fechadoPor: { type: String, default: '' },
    dataAbertura: { type: Date, default: Date.now },
    dataFechamento: { type: Date },
    totalPedidos: { type: Number, default: 0 },
    totalFaturamento: { type: Number, default: 0 },
    totalEntregues: { type: Number, default: 0 },
    totalCancelados: { type: Number, default: 0 },
    totalDinheiro: { type: Number, default: 0 },
    totalCartao: { type: Number, default: 0 },
    totalPix: { type: Number, default: 0 },
    totalOutros: { type: Number, default: 0 },
    totalSangrias: { type: Number, default: 0 },
    valorFechamento: { type: Number, default: 0 },
    diferencaDinheiro: { type: Number, default: 0 },
    sangrias: [{ valor: Number, motivo: String, operador: String, data: Date }],
    vendasPorOperador: [{ operador: String, totalVendas: Number, qtdPedidos: Number }],
    produtosMaisVendidos: [{ nome: String, quantidade: Number, total: Number }],
    pedidosIds: [{ type: mongoose.Schema.Types.ObjectId }],
    observacoes: { type: String, default: '' }
}, { timestamps: true });
const CaixaDelivery = mongoose.models.CaixaDelivery || mongoose.model('CaixaDelivery', CaixaDeliverySchema);
module.exports.CaixaDelivery = CaixaDelivery;

// ===== ENTRADA DE INSUMOS =====
const EntradaInsumoSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    fornecedor: { type: String, default: '' },
    dataEntrada: { type: Date, default: Date.now },
    itens: [{
        nome: String,
        unidade: { type: String, default: 'Un' },
        quantidade: { type: Number, default: 0 },
        valorUnitario: { type: Number, default: 0 },
        fornecedor: String,
        itemId: { type: mongoose.Schema.Types.ObjectId, default: null }
    }],
    notaFiscalBase64: { type: String, default: '' },
    observacoes: { type: String, default: '' }
}, { timestamps: true });
const EntradaInsumo = mongoose.models.EntradaInsumo || mongoose.model('EntradaInsumo', EntradaInsumoSchema);
module.exports.EntradaInsumo = EntradaInsumo;

// ===== COMBO =====
const ComboDeliverySchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    nome: { type: String, required: true },
    descricao: { type: String, default: '' },
    preco: { type: Number, required: true },
    precoOriginal: { type: Number, default: 0 },
    descontoPct: { type: Number, default: 0 },
    imagem: { type: String, default: '' },
    ativo: { type: Boolean, default: true },
    destaque: { type: Boolean, default: false },
    itens: [{
        itemId: { type: String },
        nome: { type: String },
        preco: { type: Number, default: 0 },
        quantidade: { type: Number, default: 1 }
    }]
}, { timestamps: true });
// ComboDelivery adminId index já definido no schema field
const ComboDelivery = mongoose.models.ComboDelivery || mongoose.model('ComboDelivery', ComboDeliverySchema);
module.exports.ComboDelivery = ComboDelivery;

// ========== CONTAS A PAGAR ==========
const ContaPagarSchema = new mongoose.Schema({
    adminId: { type: String, required: true, index: true },
    descricao: { type: String, required: true },
    valor: { type: Number, required: true },
    vencimento: { type: String, default: '' },
    categoria: { type: String, default: 'outros' },
    status: { type: String, default: 'pendente' }, // pendente | pago
    dataPagamento: { type: Date, default: null },
    observacoes: { type: String, default: '' }
}, { timestamps: true });
const ContaPagar = mongoose.models.ContaPagar || mongoose.model('ContaPagar', ContaPagarSchema);
module.exports.ContaPagar = ContaPagar;
