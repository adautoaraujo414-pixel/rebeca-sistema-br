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
  },
  createdAt: { type: Date, default: Date.now }
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
  observacoes: { type: String },
  preferencias: { type: String },
  restricoes: { type: String },
  historico: { type: String },
  ultimoAtendimento: { type: Date },
  totalAtendimentos: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
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
module.exports = {
  AdminAgenda: mongoose.model('AdminAgenda', adminAgendaSchema),
  ServicoAgenda: mongoose.model('ServicoAgenda', servicoAgendaSchema),
  ProfissionalAgenda: mongoose.model('ProfissionalAgenda', profissionalAgendaSchema),
  ClienteAgenda: mongoose.model('ClienteAgenda', clienteAgendaSchema),
  AgendamentoAgenda: mongoose.model('AgendamentoAgenda', agendamentoAgendaSchema),
  BloqueioAgenda: mongoose.model('BloqueioAgenda', bloqueioAgendaSchema),
  FotoAgenda: mongoose.model('FotoAgenda', fotoAgendaSchema),
  PreCadastroAgenda: mongoose.model('PreCadastroAgenda', preCadastroAgendaSchema),
};
