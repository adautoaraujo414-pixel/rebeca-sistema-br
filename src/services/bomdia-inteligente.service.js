'use strict';
/**
 * BOM DIA INTELIGENTE — Rebeca Agenda
 * Mensagens diárias personalizadas com dados reais
 * Sem inventar informações — 100% baseado em contexto real
 */

const { AdminAgenda, AgendamentoAgenda, FinanceiroAgenda } = require('../models/AgendaServico');

// ── Apelidos por gênero ──────────────────────────────────────────────────────
const APELIDOS_M  = ['chefe', 'patrão', 'comandante', 'parceiro', 'chefão'];
const APELIDOS_F  = ['chefa', 'patroa', 'comandante', 'parceira', 'chefona'];
const APELIDOS_N  = ['chefe', 'chefa', 'patrão', 'patroa', 'comandante'];

function _apelido(genero) {
  const lista = genero === 'M' ? APELIDOS_M : genero === 'F' ? APELIDOS_F : APELIDOS_N;
  return lista[Math.floor(Math.random() * lista.length)];
}

// ── Saudações variadas ───────────────────────────────────────────────────────
const SAUDACOES = [
  'Bom dia', 'Booom dia', 'Bom diaaa', 'Opa', 'Fala', 'Oi', 'Eae', 'Partiu'
];
function _saudacao() {
  return SAUDACOES[Math.floor(Math.random() * SAUDACOES.length)];
}

// ── Fechamentos variados ─────────────────────────────────────────────────────
const FECHAMENTOS = [
  'Tô aqui se precisar! 💙',
  'Qualquer coisa é só chamar! 😊',
  'Pode contar comigo hoje! 💪',
  'Bora arrasar hoje! 🚀',
  'Vamos nessa! ✂️',
  'Tô de olho em tudo por você! 👀',
  'Me chama se precisar de algo! 💙',
];
function _fechamento() {
  return FECHAMENTOS[Math.floor(Math.random() * FECHAMENTOS.length)];
}

// ── Blocos de frases por contexto — NUNCA inventam dados ────────────────────

const FRASES_AGENDA_CHEIA = [
  'Sua agenda hoje tá movimentada 😄',
  'Hoje tem bastante gente te esperando 💇',
  'Agenda boa hoje, hein! 📅',
  'Tem cliente marcado pra hoje 😊',
  'O dia vai ser cheio! Bora lá 💪',
];

const FRASES_AGENDA_VAZIA = [
  'Agenda livre hoje — bora divulgar e encher! 📣',
  'Hoje tá mais tranquilo na agenda 😊',
  'Dia livre na agenda — ótimo pra organizar tudo!',
  'Sem clientes marcados ainda hoje 📅',
  'Agenda zerada hoje — bora conquistar mais clientes! 🚀',
];

const FRASES_FIN_POSITIVO = [
  'Ontem o caixa girou bem hein 💰',
  'Boa movimentação ontem no financeiro 😄',
  'O caixa de ontem ficou positivo 💪',
  'Ontem foi um bom dia pro negócio! 💰',
];

const FRASES_FIN_ZERADO = [
  'Bora fazer o caixa girar hoje? 💰',
  'Dia novo, oportunidade nova pro financeiro! 🚀',
  'Hoje é um bom dia pra registrar entradas 💪',
  'Bora movimentar o caixa hoje? 😊',
];

const FRASES_MUITOS_CLIENTES = [
  'Sua base de clientes tá crescendo 😄',
  'Você tem uma galera fiel te seguindo 💙',
  'Muita gente confia no seu trabalho! 🌟',
];

const FRASES_POUCOS_CLIENTES = [
  'Bora conquistar mais clientes hoje? 🚀',
  'Cada cliente novo é um passo a mais! 💪',
  'Vamos crescer a base de clientes! 😊',
];

const FRASES_DIA_SEMANA = {
  1: ['Segunda-feira — bora começar a semana com tudo! 🚀', 'Semana nova começando 💪'],
  2: ['Terça animada 😄', 'Seguindo forte na terça! 💙'],
  3: ['Quarta-feira, metade da semana! Tá indo bem 💪', 'Quarta chegou — já tá na metade! 🚀'],
  4: ['Quinta já? Semana voando! 😄', 'Quinta-feira, quase lá! 💪'],
  5: ['Sexta-feira! 🎉', 'Último dia útil da semana — bora fechar bem! 🚀'],
  6: ['Sábado — dia que o salão costuma bombar! 💇', 'Sábado chegou! 😄'],
  0: ['Domingo de trabalho, dedicação total! 💪', 'Trabalhando no domingo — respeito! 🌟'],
};

function _fraseDiaSemana() {
  const dia = new Date().getDay();
  const opcoes = FRASES_DIA_SEMANA[dia] || ['Bom dia! 😊'];
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

function _pick(arr, usadas = []) {
  // Prefere frases não usadas recentemente
  const novas = arr.filter(f => !usadas.includes(f));
  const pool = novas.length > 0 ? novas : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Montar mensagem final ────────────────────────────────────────────────────
function _fmtH(date) {
  const d = new Date(date);
  const h = d.getUTCHours() - 3; // UTC -> BRT
  const hBRT = ((h % 24) + 24) % 24;
  const m = d.getUTCMinutes();
  return `${String(hBRT).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function _montarMensagem(admin, contexto, frasesBomDiaUsadas = []) {
  const genero = admin.modoWhatsappDono?.genero || '';
  const ap = _apelido(genero);
  const sau = _saudacao();
  const {
    temAgendaHoje, totalAgendamentos, agsHojeDetalhadas = [],
    teveMovimentacao, faturamentoOntem, totalClientes,
    lembretesDodia = [], slotsVagos = [], hrAbre, hrFecha
  } = contexto;

  const partes = [];

  // ── Saudação ──────────────────────────────────────────────────────────
  partes.push(`${sau} ${ap}! ☀️`);

  // ── Cronograma do dia ─────────────────────────────────────────────────
  if (agsHojeDetalhadas.length > 0 || lembretesDodia.length > 0) {
    const linhasCron = [];

    // Misturar agendamentos e lembretes, ordenar por hora
    const eventos = [
      ...agsHojeDetalhadas.map(a => ({
        hora: new Date(a.dataHora),
        texto: `👤 ${_fmtH(a.dataHora)} — ${a.nomeCliente}${a.nomeServico ? ' (' + a.nomeServico + ')' : ''}`
      })),
      ...lembretesDodia.map(l => ({
        hora: new Date(l.dataAviso || l.dataEvento),
        texto: `⏰ ${_fmtH(l.dataAviso || l.dataEvento)} — ${l.texto}`
      }))
    ].sort((a, b) => a.hora - b.hora);

    linhasCron.push('*📅 Cronograma de hoje:*');
    eventos.forEach(e => linhasCron.push(e.texto));
    partes.push(linhasCron.join('\n'));
  } else {
    partes.push(_pick(FRASES_AGENDA_VAZIA, frasesBomDiaUsadas));
  }

  // ── Horários vagos (até 3 slots) ─────────────────────────────────────
  if (slotsVagos.length > 0) {
    const mostrar = slotsVagos.slice(0, 3);
    const resto = slotsVagos.length - mostrar.length;
    let linhaVago = `*🕐 Horários livres:* ${mostrar.join(', ')}`;
    if (resto > 0) linhaVago += ` (+${resto} mais)`;
    partes.push(linhaVago);
  }

  // ── Financeiro ontem (só se relevante) ───────────────────────────────
  if (teveMovimentacao && faturamentoOntem > 0) {
    partes.push(`*💰 Ontem:* R$ ${faturamentoOntem.toFixed(2)} em entradas`);
  }

  // ── Fechamento ────────────────────────────────────────────────────────
  partes.push(_fechamento());

  return partes.join('\n\n');
}

// ── Verificar se já enviou hoje ──────────────────────────────────────────────
function _jaEnviouHoje(admin) {
  const ultimo = admin.modoWhatsappDono?.ultimoBomDiaEm;
  if (!ultimo) return false;
  const hoje = new Date();
  const ult  = new Date(ultimo);
  return ult.getUTCFullYear() === hoje.getUTCFullYear() &&
         ult.getUTCMonth()    === hoje.getUTCMonth() &&
         ult.getUTCDate()     === hoje.getUTCDate();
}

// ── Verificar se admin é elegível ───────────────────────────────────────────
function _elegivel(admin) {
  if (!admin.ativo) return false;
  // Aceita quem tem modoWhatsappDono ativo OU quem tem whatsapp/telefone cadastrado com Meta token global
  const temInstanciaAtiva = admin.modoWhatsappDono?.ativo && admin.modoWhatsappDono?.telefonePrincipalNormalizado;
  const temTelefoneEMeta  = (admin.whatsapp || admin.telefone) && process.env.META_WA_TOKEN;
  if (!temInstanciaAtiva && !temTelefoneEMeta) return false;
  if (admin.statusPagamento === 'expirado') return false;
  if (admin.trialExpira && new Date(admin.trialExpira) < new Date()) return false;
  return true;
}

function _getTelefone(admin) {
  return admin.modoWhatsappDono?.telefonePrincipalNormalizado
    || _normalizarTel(admin.whatsapp || admin.telefone || '');
}

function _normalizarTel(tel) {
  if (!tel) return '';
  return tel.replace(/\D/g, '').replace(/^0/, '');
}

// ── Buscar contexto real do banco ────────────────────────────────────────────
async function _buscarContexto(adminId) {
  try {
    const hoje = new Date();
    const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 3, 0, 0));
    const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 1, 2, 59, 59));
    const iniOntem = new Date(ini.getTime() - 24 * 60 * 60 * 1000);
    const fimOntem = new Date(ini.getTime() - 1);

    const AdminAgendaModel = require('../models/AgendaServico').AdminAgenda;
    const adminDoc = await AdminAgendaModel.findById(adminId).select('config').lean();
    const hrAbre  = adminDoc?.config?.horarioAbertura  || '08:00';
    const hrFecha = adminDoc?.config?.horarioFechamento || '18:00';

    const [agsHojeDetalhadas, lancOntem, totalClientesArr, lembretesHoje] = await Promise.all([
      AgendamentoAgenda.find({
        adminId, dataHora: { $gte: ini, $lte: fim },
        status: { $in: ['pendente', 'confirmado'] }
      }).sort({ dataHora: 1 }).lean(),
      FinanceiroAgenda.find({
        adminId, data: { $gte: iniOntem, $lte: fimOntem }, tipo: 'receita'
      }).lean(),
      require('../models/AgendaServico').ClienteAgenda
        ? require('../models/AgendaServico').ClienteAgenda.countDocuments({ adminId }).catch(() => 0)
        : Promise.resolve(0),
      AdminAgendaModel.findById(adminId).select('config.lembretes').lean()
    ]);

    const faturamentoOntem = lancOntem.reduce((s, l) => s + l.valor, 0);
    const agsHoje = agsHojeDetalhadas.length;
    const totalClientes = totalClientesArr;

    // Lembretes pessoais do dia (dataAviso entre agora e fim do dia)
    const agora = new Date();
    const todosLembretes = lembretesHoje?.config?.lembretes || [];
    const lembretesDodia = todosLembretes.filter(l => {
      if (l.enviado) return false;
      const dav = new Date(l.dataAviso || l.dataEvento);
      return dav >= ini && dav <= fim;
    }).sort((a, b) => new Date(a.dataAviso || a.dataEvento) - new Date(b.dataAviso || b.dataEvento));

    // Calcular horários vagos (slots de 1h entre abertura e fechamento sem agendamento)
    const [hA, mA] = hrAbre.split(':').map(Number);
    const [hF, mF] = hrFecha.split(':').map(Number);
    const slotsVagos = [];
    for (let h = hA; h < hF; h++) {
      const slotIni = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), ini.getUTCDate(), h + 3, 0, 0));
      const slotFim = new Date(slotIni.getTime() + 60 * 60000);
      const ocupado = agsHojeDetalhadas.some(ag => {
        const t = new Date(ag.dataHora);
        return t >= slotIni && t < slotFim;
      });
      if (!ocupado) slotsVagos.push(`${String(h).padStart(2,'0')}:00`);
    }

    return {
      temAgendaHoje:      agsHoje > 0,
      totalAgendamentos:  agsHoje,
      agsHojeDetalhadas,
      teveMovimentacao:   faturamentoOntem > 0,
      faturamentoOntem,
      totalClientes,
      lembretesDodia,
      slotsVagos,
      hrAbre,
      hrFecha
    };
  } catch(e) {
    console.error('[BomDia] erro buscarContexto:', e.message);
    return { temAgendaHoje: false, totalAgendamentos: 0, teveMovimentacao: false, faturamentoOntem: 0, totalClientes: 0 };
  }
}

// ── Enviar bom dia para um admin ─────────────────────────────────────────────
async function _enviarParaAdmin(admin) {
  try {
    const contexto  = await _buscarContexto(admin._id);
    const usadas    = admin.modoWhatsappDono?.frasesBomDiaUsadas || [];
    const mensagem  = _montarMensagem(admin, contexto, usadas);
    const telefone  = admin.modoWhatsappDono?.telefonePrincipalNormalizado
      || (admin.whatsapp || admin.telefone || '').replace(/\D/g, '').replace(/^0/, '');
    if (!telefone) {
      console.log('[BomDia] sem telefone para', admin.email);
      return { ok: false, erro: 'sem telefone' };
    }

    // Enviar via Meta API ou Evolution
    const { InstanciaWhatsapp } = require('../models/index.js');
    const inst = await InstanciaWhatsapp.findOne({
      adminId: admin._id, adminTipo: 'agenda', status: 'conectado'
    }).lean();

    const _enviarMsg = require('./agenda-modo-dono.service')._enviarMsg ||
      async function(instancia, tel, txt) {
        if (instancia?._enviarVia === 'meta' || instancia?.apiUrl === 'meta') {
          const MetaWA = require('./meta-whatsapp.service');
          await MetaWA.enviarTexto(tel, txt);
        } else if (instancia?.apiUrl && instancia?.nomeInstancia) {
          const axios = require('axios');
          await axios.post(`${instancia.apiUrl}/message/sendText/${instancia.nomeInstancia}`,
            { number: tel, text: txt },
            { headers: { apikey: instancia.apiKey || process.env.EVOLUTION_API_KEY || '' }, timeout: 10000 }
          );
        }
      };

    // Tentar Evolution primeiro, fallback Meta API global
    const instParaEnvio = inst
      || (process.env.META_WA_TOKEN ? { _enviarVia: 'meta', apiUrl: 'meta', nomeInstancia: 'meta_oficial' } : null);
    if (!instParaEnvio) {
      console.log('[BomDia] sem canal de envio para', admin.email);
      return { ok: false, erro: 'sem canal' };
    }
    await _enviarMsg(instParaEnvio, telefone, mensagem);

    // Salvar histórico — manter últimas 30 frases usadas
    const novasUsadas = [...usadas, mensagem].slice(-30);
    await AdminAgenda.findByIdAndUpdate(admin._id, {
      'modoWhatsappDono.ultimoBomDiaEm': new Date(),
      'modoWhatsappDono.frasesBomDiaUsadas': novasUsadas
    });

    console.log('[BomDia] ✅ Enviado para', admin.email, '|', contexto.totalAgendamentos, 'ags hoje |', contexto.teveMovimentacao ? 'fin+' : 'fin0');
    return { ok: true, mensagem, contexto };

  } catch(e) {
    console.error('[BomDia] ❌ Erro para', admin.email, ':', e.message);
    return { ok: false, erro: e.message };
  }
}

// ── Função principal — rodar via cron ────────────────────────────────────────
async function rodarBomDia() {
  try {
    const admins = await AdminAgenda.find({ ativo: true }).lean();
    const elegiveis = admins.filter(_elegivel).filter(a => !_jaEnviouHoje(a));

    console.log(`[BomDia] 🌅 Rodando — ${admins.length} admins total, ${elegiveis.length} elegíveis`);

    // Enviar com delay aleatório para não bater tudo no mesmo segundo
    for (const admin of elegiveis) {
      const delay = Math.floor(Math.random() * 90) * 1000; // 0-90 segundos
      setTimeout(() => _enviarParaAdmin(admin), delay);
    }

  } catch(e) {
    console.error('[BomDia] ❌ Erro geral:', e.message);
  }
}

// ── Teste manual — gerar exemplo sem enviar ──────────────────────────────────
function testarMensagem(genero = '', contexto = {}) {
  const adminFake = { modoWhatsappDono: { genero } };
  const ctx = {
    temAgendaHoje: false, totalAgendamentos: 0,
    teveMovimentacao: false, faturamentoOntem: 0, totalClientes: 0,
    ...contexto
  };
  return _montarMensagem(adminFake, ctx, []);
}

module.exports = { rodarBomDia, testarMensagem };
