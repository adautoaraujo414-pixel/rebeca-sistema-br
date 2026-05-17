/**
 * tenant.model.js — Modelo de Tenant / Empresa
 * Versão 1.0
 *
 * Cada adminId mapeia para um Tenant com:
 *   - branding (logo, cor, nome)
 *   - plano (starter | pro | enterprise)
 *   - módulos ativos
 *   - billing ready (sem cobrança ainda)
 */

const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
  // ── IDENTIFICAÇÃO ──────────────────────────────────────────────────────────
  adminId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  modulo: {
    type: String,
    enum: ['agenda', 'delivery', 'corrida', 'combo', 'enterprise'],
    default: 'delivery',
  },
  ativo: { type: Boolean, default: true },

  // ── EMPRESA ────────────────────────────────────────────────────────────────
  empresa: {
    nome:     { type: String, default: '' },
    cnpj:     { type: String, default: '' },
    telefone: { type: String, default: '' },
    email:    { type: String, default: '' },
    cidade:   { type: String, default: '' },
    estado:   { type: String, default: '' },
  },

  // ── BRANDING WHITE-LABEL ──────────────────────────────────────────────────
  branding: {
    nome:        { type: String, default: '' },         // Nome exibido no app
    corPrimaria: { type: String, default: '#f97316' },  // Hex
    logo:        { type: String, default: '' },          // URL ou base64
    favicon:     { type: String, default: '' },
    dominio:     { type: String, default: '' },          // Futuro: white-label domain
    splash:      { type: String, default: '' },          // PWA splash
  },

  // ── PLANO (Billing Ready — sem cobrança ainda) ────────────────────────────
  plano: {
    tipo: {
      type: String,
      enum: ['agenda_solo','delivery_solo','corrida_solo','combo_agd_del','combo_del_cor','combo_completo','enterprise'],
      default: 'delivery_solo',
    },
    // Datas para billing futuro
    inicioEm:    { type: Date, default: null },
    expiraEm:    { type: Date, default: null },
    trialAteEm:  { type: Date, default: null },
    emTrial:     { type: Boolean, default: true },
    // Stripe/gateway futuro
    customerId:  { type: String, default: '' },
    subscriptionId: { type: String, default: '' },
  },

  // ── MÓDULOS ATIVOS ────────────────────────────────────────────────────────
  // Módulos reais ativos: agenda | delivery | corrida
  modulos: {
    agenda:    { type: Boolean, default: false },
    delivery:  { type: Boolean, default: false },
    corrida:   { type: Boolean, default: false },
    whatsapp:  { type: Boolean, default: false }, // add-on futuro
    relatorio: { type: Boolean, default: false }, // add-on futuro
    multiuser: { type: Boolean, default: false }, // add-on futuro
  },

  // ── LIMITES POR PLANO ─────────────────────────────────────────────────────
  limites: {
    pedidosMes:      { type: Number, default: 500 },
    agendamentosMes: { type: Number, default: 200 },
    usuariosMax:     { type: Number, default: 1 },
    storageGb:       { type: Number, default: 1 },
    corridasMes:     { type: Number, default: 0 },
  },

  // ── COUNTERS (incrementados via hooks) ────────────────────────────────────
  uso: {
    pedidosMes:      { type: Number, default: 0 },
    agendamentosMes: { type: Number, default: 0 },
    corridasMes:     { type: Number, default: 0 },
    resetEm:         { type: Date, default: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0,0,0,0);
      return d;
    }},
  },

  // ── CONFIGURAÇÕES ─────────────────────────────────────────────────────────
  config: {
    timezone:     { type: String, default: 'America/Sao_Paulo' },
    idioma:       { type: String, default: 'pt-BR' },
    moeda:        { type: String, default: 'BRL' },
    notifEmail:   { type: Boolean, default: false },
    notifWhats:   { type: Boolean, default: false },
  },

  // ── AUDITORIA ─────────────────────────────────────────────────────────────
  criadoEm:       { type: Date, default: Date.now },
  atualizadoEm:   { type: Date, default: Date.now },
  ultimoAcessoEm: { type: Date, default: Date.now },
}, {
  collection: 'tenants',
  timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' },
});

// ── ÍNDICES ───────────────────────────────────────────────────────────────
TenantSchema.index({ adminId: 1 }, { unique: true });
TenantSchema.index({ 'plano.tipo': 1 });
TenantSchema.index({ ativo: 1 });
TenantSchema.index({ 'branding.dominio': 1 }, { sparse: true });

// ── MÉTODOS ───────────────────────────────────────────────────────────────
TenantSchema.methods.pode = function(modulo) {
  return !!this.modulos[modulo];
};

TenantSchema.methods.dentroDoLimite = function(tipo) {
  const mapa = {
    pedidos:      ['uso.pedidosMes',      'limites.pedidosMes'],
    agendamentos: ['uso.agendamentosMes', 'limites.agendamentosMes'],
    corrida:      ['uso.corridasMes',      'limites.corridasMes'],
  };
  const [usoKey, limKey] = mapa[tipo] || [];
  if (!usoKey) return true;
  const uso = usoKey.split('.').reduce((o,k) => o?.[k], this);
  const lim = limKey.split('.').reduce((o,k) => o?.[k], this);
  return uso < lim;
};

// ── PLANOS PADRÃO ────────────────────────────────────────────────────────
// ── PLANOS baseados nos 3 módulos reais: agenda | delivery | corrida ────────
TenantSchema.statics.PLANOS = {
  // Módulo único
  agenda_solo: {
    label: 'Agenda',
    limites: { pedidosMes: 0, agendamentosMes: 500, corridasMes: 0, usuariosMax: 1, storageGb: 2 },
    modulos: { agenda: true,  delivery: false, corrida: false, whatsapp: false, relatorio: false, multiuser: false },
  },
  delivery_solo: {
    label: 'Delivery',
    limites: { pedidosMes: 1000, agendamentosMes: 0, corridasMes: 0, usuariosMax: 2, storageGb: 2 },
    modulos: { agenda: false, delivery: true,  corrida: false, whatsapp: false, relatorio: false, multiuser: false },
  },
  corrida_solo: {
    label: 'Corrida',
    limites: { pedidosMes: 0, agendamentosMes: 0, corridasMes: 2000, usuariosMax: 1, storageGb: 2 },
    modulos: { agenda: false, delivery: false, corrida: true,  whatsapp: false, relatorio: false, multiuser: false },
  },
  // Combos
  combo_agd_del: {
    label: 'Agenda + Delivery',
    limites: { pedidosMes: 1000, agendamentosMes: 500, corridasMes: 0, usuariosMax: 3, storageGb: 5 },
    modulos: { agenda: true,  delivery: true,  corrida: false, whatsapp: false, relatorio: false, multiuser: false },
  },
  combo_del_cor: {
    label: 'Delivery + Corrida',
    limites: { pedidosMes: 1000, agendamentosMes: 0, corridasMes: 2000, usuariosMax: 3, storageGb: 5 },
    modulos: { agenda: false, delivery: true,  corrida: true,  whatsapp: false, relatorio: false, multiuser: false },
  },
  combo_completo: {
    label: 'Agenda + Delivery + Corrida',
    limites: { pedidosMes: 2000, agendamentosMes: 1000, corridasMes: 5000, usuariosMax: 5, storageGb: 10 },
    modulos: { agenda: true,  delivery: true,  corrida: true,  whatsapp: false, relatorio: true,  multiuser: false },
  },
  // Enterprise
  enterprise: {
    label: 'Enterprise',
    limites: { pedidosMes: 999999, agendamentosMes: 999999, corridasMes: 999999, usuariosMax: 999, storageGb: 100 },
    modulos: { agenda: true,  delivery: true,  corrida: true,  whatsapp: true,  relatorio: true,  multiuser: true  },
  },
};

// ── HELPER: upsert seguro ────────────────────────────────────────────────
TenantSchema.statics.garantir = async function(adminId, modulo = 'delivery') {
  let tenant = await this.findOne({ adminId });
  if (!tenant) {
    const planoDefault = this.PLANOS[modulo + '_solo'] || this.PLANOS.delivery_solo;
    tenant = await this.create({
      adminId,
      modulo,
      modulos: { ...planoDefault.modulos, [modulo]: true },
      limites: planoDefault.limites,
    });
    console.log(`[Tenant] Novo tenant criado: ${adminId} (${modulo})`);
  }
  return tenant;
};

const Tenant = mongoose.model('Tenant', TenantSchema);
module.exports = Tenant;
