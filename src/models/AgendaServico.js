const mongoose = require('mongoose');

// Model para AdminAgenda (dono do negócio na Rebeca Agenda)
const adminAgendaSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  token: { type: String },
  nomeNegocio: { type: String },
  segmento: { type: String },
  telefone: { type: String },
  whatsapp: { type: String },
  logo: { type: String },
  descricao: { type: String },
  endereco: { type: String },
  cidade: { type: String },
  instagram: { type: String },
  plano: { type: String, enum: ['espaco_digital', 'espaco_digital_ia'], default: 'espaco_digital' },
  ativo: { type: Boolean, default: true },
  trialExpira: { type: Date },
  instanciaWhatsappId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstanciaWhatsapp' },
  config: {
    horarioAbertura: { type: String, default: '08:00' },
    horarioFechamento: { type: String, default: '18:00' },
    diasFuncionamento: { type: [Number], default: [1,2,3,4,5,6] }, // 0=dom
    intervaloAgendamento: { type: Number, default: 30 }, // minutos
    antecedenciaMinima: { type: Number, default: 60 }, // minutos
    antecedenciaMaxima: { type: Number, default: 30 }, // dias
    mensagemBoasVindas: { type: String, default: 'Olá 😊 Seja bem-vindo(a)! Será um prazer te atender.' },
    mensagemConfirmacao: { type: String, default: 'Seu horário foi confirmado com sucesso 💛' },
    mensagemLembrete: { type: String, default: 'Lembrete: seu atendimento está chegando 😊' },
    diasRetornoInativo: { type: Number, default: 30 },
    corPrimaria: { type: String, default: '#f97316' },
    corSecundaria: { type: String, default: '#1f2937' },
    lembretes: { type: [{
      texto:      { type: String },
      dataEvento: { type: Date },
      dataAviso:  { type: Date },
      enviado:    { type: Boolean, default: false },
      criadoEm:  { type: Date, default: Date.now }
    }], default: [] },
  },
  modoWhatsappDono: {
    ativo: { type: Boolean, default: false },
    telefonesAutorizados: { type: [String], default: [] },
    telefonePrincipalNormalizado: { type: String, default: '' },
    usarTelefoneComoIdentidadeOperacional: { type: Boolean, default: true },
    offlinePreparado: { type: Boolean, default: false },
    ultimoSyncOfflineEm: { type: Date },
    boasVindasEnviado: { type: Boolean, default: false },
    boasVindasOficialEnviadaEm: { type: Date },
    ultimoBomDiaEm: { type: Date },
    frasesBomDiaUsadas: { type: [String], default: [] },
    genero: { type: String, enum: ['M','F',''], default: '' }
  },
  isRebecaOficial: { type: Boolean, default: false },
  planoExpira: { type: Date },
  statusPagamento: { type: String, enum: ['pendente','aguardando_comprovante','pago','expirado'], default: 'pendente' },
  comprovantePagamento: { type: String },
  avisadoVencimento: { type: Boolean, default: false },
  configBot: {
    ativo:          { type: Boolean, default: false },
    foraHorario:    { type: Boolean, default: false },
    linkAgenda:     { type: Boolean, default: true  },
    atenderClientes: { type: Boolean, default: false }, // Rebeca atende clientes pelo WhatsApp
  },
  createdAt: { type: Date, default: Date.now },
  ultimaMensagemDono: { type: Date, default: null }
});

// Serviços oferecidos
const servicoAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  nome: { type: String, required: true },
  descricao: { type: String },
  duracao: { type: Number, required: true }, // minutos
  preco: { type: Number, required: true },
  categoria: { type: String },
  foto: { type: String },
  ativo: { type: Boolean, default: true },
  ordem: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Profissionais
const profissionalAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  nome: { type: String, required: true },
  foto: { type: String },
  especialidades: [String],
  atribuicoes: [String],
  cargo: { type: String },
  telefone: { type: String },
  bio: { type: String },
  token: { type: String },
  diasAtendimento: { type: [Number], default: [1,2,3,4,5] },
  horario: {
    inicio: { type: String, default: '08:00' },
    fim: { type: String, default: '18:00' },
    almocoInicio: { type: String, default: '12:00' },
    almocoFim: { type: String, default: '13:00' }
  },
  ativo: { type: Boolean, default: true },
  ordem: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Clientes da agenda
const clienteAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  nome: { type: String, required: true },
  telefone: { type: String, required: true },
  email: { type: String },
  dataNascimento: { type: Date },
  observacoes: { type: String },
  preferencias: { type: String },
  restricoes: { type: String },
  historico: { type: String },
  ultimoAtendimento: { type: Date },
  ultimoServico: { type: String },
  totalAtendimentos: { type: Number, default: 0 },
  canalPreferido: { type: String, enum: ['whatsapp','telefone','presencial'], default: 'whatsapp' },
  consentimentoContato: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// CRM — Retornos e Manutenções
const retornoAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClienteAgenda' },
  nome: { type: String, required: true },
  telefone: { type: String, required: true },
  tipoRetorno: { type: String, enum: ['retorno','manutencao','acompanhamento','recadastramento','inativo'], default: 'retorno' },
  dataRetornoSugerida: { type: Date },
  proximoContatoEm: { type: Date },
  observacaoRetorno: { type: String },
  ultimoAtendimentoEm: { type: Date },
  ultimoServico: { type: String },
  statusContato: { type: String, enum: ['pendente','contatado','agendado','sem_resposta','dispensado'], default: 'pendente' },
  historicoContatos: [{ data: Date, status: String, obs: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Agendamentos
const agendamentoAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClienteAgenda' },
  servicoId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicoAgenda' },
  profissionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfissionalAgenda' },
  nomeCliente: { type: String, required: true },
  telefoneCliente: { type: String, required: true },
  nomeServico: { type: String },
  nomeProfissional: { type: String },
  dataHora: { type: Date, required: true },
  duracao: { type: Number }, // minutos
  preco: { type: Number },
  status: { type: String, enum: ['pendente','confirmado','concluido','cancelado','faltou'], default: 'pendente' },
  origem: { type: String, enum: ['site','whatsapp','admin'], default: 'site' },
  observacoes: { type: String },
  fotoReferencia: { type: String },
  lembreteEnviado: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Bloqueios de horário
const bloqueioAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  profissionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfissionalAgenda' },
  dataHoraInicio: { type: Date, required: true },
  dataHoraFim: { type: Date, required: true },
  motivo: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Fotos da galeria
const fotoAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  url: { type: String, required: true },
  tipo: { type: String, enum: ['ambiente','resultado','servico'], default: 'resultado' },
  legenda: { type: String },
  ordem: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Pré-cadastro agenda
const preCadastroAgendaSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  whatsapp: { type: String, required: true },
  email: { type: String },
  nomeNegocio: { type: String },
  segmento: { type: String },
  cidade: { type: String },
  planoInteresse: { type: String },
  status: { type: String, enum: ['novo','contatado','convertido'], default: 'novo' },
  createdAt: { type: Date, default: Date.now }
});



// ===== PUSH SUBSCRIPTION =====
const PushSubscriptionAgenda = mongoose.model('PushSubscriptionAgenda', new mongoose.Schema({
  adminId:  { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda' },
  clienteTelefone: { type: String },
  endpoint:  { type: String, required: true, unique: true },
  keys:      { p256dh: String, auth: String },
  tipo:      { type: String, enum: ['admin','cliente'], default: 'admin' },
  ativo:     { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
}));

// Exportar tudo


// Financeiro — receitas registradas automaticamente
const financeiroAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  agendamentoId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgendamentoAgenda' },
  tipo: { type: String, enum: ['receita', 'despesa'], required: true },
  descricao: { type: String, required: true },
  valor: { type: Number, required: true },
  categoria: { type: String, default: 'servico' },
  data: { type: Date, default: Date.now },
  pago: { type: Boolean, default: false },
  formaPagamento: { type: String, enum: ['dinheiro','pix','cartao_debito','cartao_credito','outro'], default: 'pix' },
  observacao: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Contas a pagar (aluguel, agua, luz, etc)
const contaPagarAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  descricao: { type: String, required: true },
  valor: { type: Number, required: true },
  vencimento: { type: Date, required: true },
  categoria: { type: String, enum: ['aluguel','agua','luz','internet','telefone','salario','imposto','fornecedor','outro'], default: 'outro' },
  recorrente: { type: Boolean, default: false },
  recorrenciaMeses: { type: Number, default: 1 },
  pago: { type: Boolean, default: false },
  dataPagamento: { type: Date },
  comprovante: { type: String },
  observacao: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Fila de encaixe — clientes esperando horário
const filaEncaixeAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClienteAgenda' },
  nomeCliente: { type: String, required: true },
  telefoneCliente: { type: String, required: true },
  servicoId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicoAgenda' },
  profissionalId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfissionalAgenda' },
  dataPreferida: { type: Date },
  horarioPreferido: { type: String },
  status: { type: String, enum: ['aguardando','notificado','confirmado','expirado'], default: 'aguardando' },
  notificadoEm: { type: Date },
  expiradoEm: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// CRM — Modelos de mensagem humanizada
const mensagemModeloAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda' }, // null = modelo padrão global
  categoria: { type: String, enum: ['agradecimento','pos_atendimento','cuidado','avaliacao','retorno','manutencao','cliente_inativo','recadastramento','recuperacao','aniversario','promocao'], required: true },
  titulo: { type: String, required: true },
  texto: { type: String, required: true }, // suporta {nome},{servico},{profissional},{diasSemVir},{nomeEmpresa},{linkAgenda}
  ativo: { type: Boolean, default: true },
  editavel: { type: Boolean, default: true },
  diasAposAtendimento: { type: Number }, // sugestão de quando enviar
  canal: { type: String, default: 'whatsapp' },
  createdAt: { type: Date, default: Date.now }
});

// CRM — Registro de conexão/contato com cliente
const conexaoClienteAgendaSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClienteAgenda' },
  agendamentoId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgendamentoAgenda' },
  nome: { type: String, required: true },
  telefone: { type: String, required: true },
  ultimoServico: { type: String },
  ultimoAtendimento: { type: Date },
  profissional: { type: String },
  categoria: { type: String, enum: ['agradecimento','pos_atendimento','cuidado','avaliacao','retorno','manutencao','cliente_inativo','recadastramento','recuperacao','aniversario','promocao'], required: true },
  mensagemEnviada: { type: String },
  statusContato: { type: String, enum: ['sugerido','enviado','contatado','sem_resposta','satisfeito','insatisfeito','quer_retorno','quer_reclamar','precisa_humano'], default: 'sugerido' },
  observacao: { type: String },
  enviadoEm: { type: Date },
  respondidoEm: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const FinanceiroAgenda = mongoose.model('FinanceiroAgenda', financeiroAgendaSchema);
const ContaPagarAgenda = mongoose.model('ContaPagarAgenda', contaPagarAgendaSchema);
const FilaEncaixeAgenda = mongoose.model('FilaEncaixeAgenda', filaEncaixeAgendaSchema);

const RetornoAgenda = mongoose.model('RetornoAgenda', retornoAgendaSchema);


// ══════════════════════════════════════════════════════════════════
// Log de comandos WhatsApp — base para suporte offline futuro
// Registra comandos recebidos pelo WhatsApp Oficial e pelo número
// do cliente. adminId é sempre a chave de gravação.
// ══════════════════════════════════════════════════════════════════
const agendaWhatsappCommandLogSchema = new mongoose.Schema({
  adminId                 : { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  telefoneAdminNormalizado: { type: String, required: true },
  origem                  : { type: String, enum: ['rebeca_oficial', 'numero_cliente'], default: 'numero_cliente' },
  textoOriginal           : { type: String, default: '' },
  tipoMensagem            : { type: String, enum: ['text', 'audio', 'image', 'video', 'document', 'unknown'], default: 'text' },
  intencao                : { type: String, default: '' },
  status                  : { type: String, enum: ['recebido', 'processado', 'pendente', 'erro'], default: 'recebido' },
  resultado               : { type: String, default: '' },
  erro                    : { type: String, default: '' },
  processadoEm            : { type: Date },
  createdAt               : { type: Date, default: Date.now }
  // payloadOriginalSeguro omitido intencionalmente — não guardar tokens/keys
});

agendaWhatsappCommandLogSchema.index({ adminId: 1, createdAt: -1 });
agendaWhatsappCommandLogSchema.index({ telefoneAdminNormalizado: 1, createdAt: -1 });

const AgendaWhatsappCommandLog = mongoose.model('AgendaWhatsappCommandLog', agendaWhatsappCommandLogSchema);


// ══════════════════════════════════════════════════════════════════
// REBECA AGENDA — CATÁLOGO DIGITAL (exclusivo, isolado)
// ══════════════════════════════════════════════════════════════════

// ── ProdutoAgenda ─────────────────────────────────────────────────
const produtoAgendaSchema = new mongoose.Schema({
  adminId:          { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  nome:             { type: String, required: true },
  descricao:        { type: String, default: '' },
  descricaoLonga:   { type: String, default: '' },
  categoria:        { type: String, default: 'geral' },
  subcategoria:     { type: String, default: '' },
  tags:             { type: [String], default: [] },
  palavrasChave:    { type: [String], default: [] },
  fotos:            { type: [String], default: [] },
  fotoPrincipal:    { type: String, default: '' },
  preco:            { type: Number, required: true },
  precoPromocional: { type: Number, default: null },
  estoque:          { type: Number, default: null },
  sku:              { type: String, default: '' },
  marca:            { type: String, default: '' },
  observacoes:      { type: String, default: '' },
  ativo:            { type: Boolean, default: true },
  variacoes: [{
    nome:   { type: String },
    opcoes: [{
      valor:   { type: String },
      preco:   { type: Number, default: null },
      estoque: { type: Number, default: null },
      foto:    { type: String, default: '' }
    }]
  }],
  atributos: {
    peso:      { type: String, default: '' },
    cores:     { type: [String], default: [] },
    tamanhos:  { type: [String], default: [] },
    materiais: { type: [String], default: [] }
  },
  catalogo_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CatalogoAgenda' }],
  ordem:        { type: Number, default: 0 },
  destaque:     { type: Boolean, default: false },
  combo:        { type: Boolean, default: false },
  produtosCombo:[{ type: mongoose.Schema.Types.ObjectId, ref: 'ProdutoAgenda' }],
  precoCombo:   { type: Number, default: null },
  totalVendas:  { type: Number, default: 0 },
  criadoEm:     { type: Date, default: Date.now }
});
produtoAgendaSchema.index({ adminId: 1, ativo: 1 });
produtoAgendaSchema.index({ adminId: 1, categoria: 1 });
produtoAgendaSchema.index({ adminId: 1, tags: 1 });

// ── CatalogoAgenda ────────────────────────────────────────────────
const catalogoAgendaSchema = new mongoose.Schema({
  adminId:    { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  nome:       { type: String, required: true },
  descricao:  { type: String, default: '' },
  capa:       { type: String, default: '' },
  cor:        { type: String, default: '#f97316' },
  ativo:      { type: Boolean, default: true },
  ordem:      { type: Number, default: 0 },
  secoes: [{
    nome:   { type: String },
    ordem:  { type: Number, default: 0 },
    subsecoes: [{
      nome:         { type: String },
      ordem:        { type: Number, default: 0 },
      produtos_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProdutoAgenda' }]
    }],
    produtos_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProdutoAgenda' }]
  }],
  // Seções visuais especiais — configuradas pelo admin, IA nunca inventa
  secoesVisuais: {
    destaques:      { ativo: { type: Boolean, default: false }, produtos_ids: [{ type: mongoose.Schema.Types.ObjectId }] },
    lancamentos:    { ativo: { type: Boolean, default: false }, produtos_ids: [{ type: mongoose.Schema.Types.ObjectId }] },
    promocoes:      { ativo: { type: Boolean, default: false }, produtos_ids: [{ type: mongoose.Schema.Types.ObjectId }] },
    maisProcurados: { ativo: { type: Boolean, default: false }, produtos_ids: [{ type: mongoose.Schema.Types.ObjectId }] }
  },
  produtos_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProdutoAgenda' }],
  criadoEm:    { type: Date, default: Date.now }
});
catalogoAgendaSchema.index({ adminId: 1, ativo: 1 });

// ── CarrinhoAgenda ────────────────────────────────────────────────
const carrinhoAgendaSchema = new mongoose.Schema({
  adminId:         { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  sessionId:       { type: String, required: true },
  clienteTelefone: { type: String, default: '' },
  clienteNome:     { type: String, default: '' },
  itens: [{
    produtoId:           { type: mongoose.Schema.Types.ObjectId, ref: 'ProdutoAgenda' },
    nome:                { type: String },
    foto:                { type: String },
    preco:               { type: Number },
    quantidade:          { type: Number, default: 1 },
    variacaoSelecionada: { type: String, default: '' },
    subtotal:            { type: Number }
  }],
  total:         { type: Number, default: 0 },
  status:        { type: String, enum: ['ativo','finalizado','abandonado'], default: 'ativo' },
  pixPreparado:  { type: Boolean, default: false },
  criadoEm:     { type: Date, default: Date.now },
  atualizadoEm: { type: Date, default: Date.now }
});
carrinhoAgendaSchema.index({ adminId: 1, sessionId: 1 });
carrinhoAgendaSchema.index({ adminId: 1, status: 1 });

// ── ConhecimentoAgenda ────────────────────────────────────────────
const conhecimentoAgendaSchema = new mongoose.Schema({
  adminId:   { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  tipo:      { type: String, enum: ['faq','politica','pagamento','horario','garantia','outro'], default: 'faq' },
  pergunta:  { type: String, required: true },
  resposta:  { type: String, required: true },
  tags:      { type: [String], default: [] },
  ativo:     { type: Boolean, default: true },
  ordem:     { type: Number, default: 0 },
  criadoEm: { type: Date, default: Date.now }
});
conhecimentoAgendaSchema.index({ adminId: 1, ativo: 1 });
conhecimentoAgendaSchema.index({ adminId: 1, tipo: 1 });

// ── LeadProdutoAgenda ─────────────────────────────────────────────
const leadProdutoAgendaSchema = new mongoose.Schema({
  adminId:     { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAgenda', required: true },
  telefone:    { type: String, default: '' },
  produtoId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ProdutoAgenda', default: null },
  produtoNome: { type: String, default: '' },
  origem:      { type: String, default: 'whatsapp' },
  acao:        { type: String, enum: ['consultou','recebeu_foto','adicionou_carrinho','solicitou_atendimento','finalizou_compra'], required: true },
  data:        { type: Date, default: Date.now }
});
leadProdutoAgendaSchema.index({ adminId: 1, data: -1 });
leadProdutoAgendaSchema.index({ adminId: 1, produtoId: 1 });

module.exports = {
  FinanceiroAgenda,
  ContaPagarAgenda,
  FilaEncaixeAgenda,
  AdminAgenda: mongoose.model('AdminAgenda', adminAgendaSchema),
  ServicoAgenda: mongoose.model('ServicoAgenda', servicoAgendaSchema),
  ProfissionalAgenda: mongoose.model('ProfissionalAgenda', profissionalAgendaSchema),
  ClienteAgenda: mongoose.model('ClienteAgenda', clienteAgendaSchema),
  AgendamentoAgenda: mongoose.model('AgendamentoAgenda', agendamentoAgendaSchema),
  BloqueioAgenda: mongoose.model('BloqueioAgenda', bloqueioAgendaSchema),
  FotoAgenda: mongoose.model('FotoAgenda', fotoAgendaSchema),
  PreCadastroAgenda: mongoose.model('PreCadastroAgenda', preCadastroAgendaSchema),
  RetornoAgenda,
  MensagemModeloAgenda: mongoose.model('MensagemModeloAgenda', mensagemModeloAgendaSchema),
  ConexaoClienteAgenda: mongoose.model('ConexaoClienteAgenda', conexaoClienteAgendaSchema),
  AgendaWhatsappCommandLog,
  ProdutoAgenda: mongoose.model('ProdutoAgenda', produtoAgendaSchema),
  CatalogoAgenda: mongoose.model('CatalogoAgenda', catalogoAgendaSchema),
  CarrinhoAgenda: mongoose.model('CarrinhoAgenda', carrinhoAgendaSchema),
  ConhecimentoAgenda: mongoose.model('ConhecimentoAgenda', conhecimentoAgendaSchema),
  LeadProdutoAgenda: mongoose.model('LeadProdutoAgenda', leadProdutoAgendaSchema),
};
