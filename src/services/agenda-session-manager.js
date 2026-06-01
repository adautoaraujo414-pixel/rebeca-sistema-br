'use strict';

/**
 * SessionManager — Memória contextual híbrida
 * Camada 1: Map em memória (rápido, TTL 30min)
 * Camada 2: MongoDB (persistente, sobrevive a restarts)
 * TTL banco: 2h (índice TTL no MongoDB)
 */

const TTL_MS = 30 * 60 * 1000;
const MAX_HISTORICO = 10;
const _sessions = new Map();
const MAX_SESSIONS = 500;

// Campos críticos que persistem no banco
const CAMPOS_CRITICOS = [
  'ultimoLancamentoId','ultimoLancamentoTipo','ultimoLancamentoValor',
  'ultimoLancamentoDesc','ultimoLancamentoCat',
  '_lancamentoApagadoTipo','_lancamentoApagadoValor',
  '_lancamentoApagadoDesc','_lancamentoApagadoCat',
  'aguardandoConfirmacaoApagar','aguardandoConfirmacao',
  'ultimaAcaoPendente','ultimaPerguntaIA','ultimoClienteCitado'
];

// Limpeza automática a cada 10 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [key, session] of _sessions.entries()) {
    if (agora - session.timestampUltimaMsg > TTL_MS) {
      _sessions.delete(key);
    }
  }
}, 10 * 60 * 1000);

function _chave(adminId, telefone) {
  return `${String(adminId)}:${String(telefone).replace(/\D/g, '')}`;
}

function _sessionVazia() {
  return {
    historico: [],
    assuntoAtual: null,
    aguardandoConfirmacao: false,
    ultimaPerguntaIA: null,
    ultimaAcaoPendente: null,
    ultimoValorFinanceiro: null,
    ultimoClienteCitado: null,
    ultimoAgendamento: null,
    ultimoTopicoFinanceiro: null,
    aguardandoConfirmacaoApagar: false,
    ultimoLancamentoId: null,
    ultimoLancamentoTipo: null,
    ultimoLancamentoValor: null,
    ultimoLancamentoDesc: null,
    ultimoLancamentoCat: null,
    _lancamentoApagadoTipo: null,
    _lancamentoApagadoValor: null,
    _lancamentoApagadoDesc: null,
    _lancamentoApagadoCat: null,
    aguardandoLembrete: false,
    aguardandoCorrecao: false,
    aguardandoRecorrente: false,
    timestampUltimaMsg: Date.now()
  };
}

// ── Persistência assíncrona no banco ────────────────────────────────
function _salvarNoBanco(adminId, telefone, session) {
  try {
    const { AgendaSessao } = require('../models/AgendaServico');
    const telNorm = String(telefone).replace(/\D/g, '');
    const dados = { updatedAt: new Date() };
    for (const campo of CAMPOS_CRITICOS) {
      dados[campo] = session[campo] ?? null;
    }
    AgendaSessao.findOneAndUpdate(
      { adminId, telefone: telNorm },
      { $set: dados },
      { upsert: true, new: true }
    ).catch(e => console.error('[SM] erro ao salvar banco:', e.message));
  } catch(e) {
    console.error('[SM] _salvarNoBanco erro:', e.message);
  }
}

// ── Recuperar do banco após restart ─────────────────────────────────
async function _recuperarDoBanco(adminId, telefone) {
  try {
    const { AgendaSessao } = require('../models/AgendaServico');
    const telNorm = String(telefone).replace(/\D/g, '');
    const doc = await AgendaSessao.findOne({ adminId, telefone: telNorm }).lean();
    if (!doc) return null;
    // Só recupera se foi atualizado nas últimas 2h
    const idade = Date.now() - new Date(doc.updatedAt).getTime();
    if (idade > 2 * 60 * 60 * 1000) return null;
    const s = {};
    for (const campo of CAMPOS_CRITICOS) {
      s[campo] = doc[campo] ?? null;
    }
    console.log('[SM] sessao recuperada do banco para', telNorm);
    return s;
  } catch(e) {
    console.error('[SM] _recuperarDoBanco erro:', e.message);
    return null;
  }
}

// ── getSession com fallback para banco ──────────────────────────────
function getSession(adminId, telefone) {
  const key = _chave(adminId, telefone);
  if (!_sessions.has(key)) {
    if (_sessions.size >= MAX_SESSIONS) {
      const [oldest] = _sessions.keys();
      _sessions.delete(oldest);
      console.warn('[SM] Limite sessoes, limpando mais antiga');
    }
    _sessions.set(key, _sessionVazia());
  }
  return _sessions.get(key);
}

// ── getSession assíncrono — recupera banco se sessão nova ───────────
async function getSessionAsync(adminId, telefone) {
  const key = _chave(adminId, telefone);
  if (!_sessions.has(key)) {
    if (_sessions.size >= MAX_SESSIONS) {
      const [oldest] = _sessions.keys();
      _sessions.delete(oldest);
    }
    const base = _sessionVazia();
    // Tenta recuperar campos críticos do banco
    const salvo = await _recuperarDoBanco(adminId, telefone);
    if (salvo) Object.assign(base, salvo);
    _sessions.set(key, base);
  }
  return _sessions.get(key);
}

function addUserMsg(adminId, telefone, texto) {
  const s = getSession(adminId, telefone);
  s.historico.push({ role: 'user', content: texto });
  if (s.historico.length > MAX_HISTORICO * 2) {
    s.historico = s.historico.slice(-MAX_HISTORICO * 2);
  }
  s.timestampUltimaMsg = Date.now();
  return s;
}

function addAssistantMsg(adminId, telefone, texto) {
  const s = getSession(adminId, telefone);
  s.historico.push({ role: 'assistant', content: texto });
  s.ultimaPerguntaIA = texto;
  s.timestampUltimaMsg = Date.now();
  return s;
}

function updateSession(adminId, telefone, updates) {
  const s = getSession(adminId, telefone);
  Object.assign(s, updates, { timestampUltimaMsg: Date.now() });
  // Verificar se algum campo crítico foi alterado
  const temCritico = CAMPOS_CRITICOS.some(c => c in updates);
  if (temCritico) {
    _salvarNoBanco(adminId, telefone, s);
  }
  return s;
}

function isConfirmacao(texto) {
  return /^\s*(sim|s|ok|pode|faz|confirm[ao]|vai|bora|isso|exato|certo|claro|perfeito|ótimo|otimo|manda|envia|salva|registra)\s*[!.]?\s*$/i.test(texto.trim());
}

function isNegacao(texto) {
  return /^\s*(n[aã]o|nao|nel|cancel[ao]|esquece|deixa|para|nope|nem|jamais)\s*[!.]?\s*$/i.test(texto.trim())
    || /\b(n[aã]o\s+quero|cancela\s+isso|esquece\s+isso|deixa\s+pra\s+l[aá]|n[aã]o\s+precisa|n[aã]o\s+manda)\b/i.test(texto.trim());
}

function detectarAssunto(texto) {
  const t = texto.toLowerCase();
  if (/financeiro|faturei|entrada|saída|saida|receita|despesa|gasto|lucro|dinheiro|caixa|pix|pagou/.test(t)) return 'financeiro';
  if (/agenda|agendamento|horário|horario|cliente.*hora|marcou|agendou/.test(t)) return 'agenda';
  if (/lembr[ae]|lembrete|avisa/.test(t)) return 'lembrete';
  if (/cliente|contato|inativo|retorno/.test(t)) return 'cliente';
  if (/produto|venda|catálogo|catalogo|estoque|compra|pedido/.test(t)) return 'produto';
  return null;
}

function getHistoricoParaAPI(adminId, telefone, ultimasN = 6) {
  const s = getSession(adminId, telefone);
  return s.historico.slice(-(ultimasN * 2));
}

function clearSession(adminId, telefone) {
  _sessions.delete(_chave(adminId, telefone));
  // Limpar banco também
  try {
    const { AgendaSessao } = require('../models/AgendaServico');
    const telNorm = String(telefone).replace(/\D/g, '');
    AgendaSessao.deleteOne({ adminId, telefone: telNorm }).catch(() => {});
  } catch(e) {}
}

function validarCoerenciaFinanceira(adminId, telefone, novosDados) {
  const s = getSession(adminId, telefone);
  if (!s.ultimoValorFinanceiro) return true;
  const ant = s.ultimoValorFinanceiro;
  const delta = Math.abs((novosDados.entradas || 0) - (ant.entradas || 0));
  if (delta > 1 && !novosDados.novaConsulta) {
    console.warn('[SM] INCONSISTENCIA FINANCEIRA:', ant, '->', novosDados);
    return false;
  }
  return true;
}

const FIELD_CAPTURE_STATES = [
  'aguardandoLembrete','aguardandoRecorrente',
  'aguardandoConfirmacaoApagar','aguardandoCorrecao',
];

function getContextMode(adminId, telefone) {
  const s = getSession(adminId, telefone);
  if (s.aguardandoConfirmacao || s.ultimaAcaoPendente) return 'CONFIRMATION';
  for (const state of FIELD_CAPTURE_STATES) {
    if (s[state]) return 'FIELD_CAPTURE';
  }
  return 'DISCOVERY';
}

function getHistoricoContextual(adminId, telefone, ultimasN = 6) {
  const modo = getContextMode(adminId, telefone);
  const s = getSession(adminId, telefone);
  if (modo === 'FIELD_CAPTURE') {
    console.log('[CONTEXT-ENGINE] FIELD_CAPTURE — historico bloqueado');
    return [];
  }
  if (modo === 'CONFIRMATION') {
    console.log('[CONTEXT-ENGINE] CONFIRMATION — historico minimo');
    if (s.ultimaPerguntaIA) return [{ role: 'assistant', content: s.ultimaPerguntaIA }];
    return [];
  }
  console.log('[CONTEXT-ENGINE] DISCOVERY — ' + Math.min(s.historico.length, ultimasN * 2) + ' msgs');
  return s.historico.slice(-(ultimasN * 2));
}

module.exports = {
  getSession,
  getSessionAsync,
  addUserMsg,
  addAssistantMsg,
  updateSession,
  isConfirmacao,
  isNegacao,
  detectarAssunto,
  getHistoricoParaAPI,
  getContextMode,
  getHistoricoContextual,
  clearSession,
  validarCoerenciaFinanceira
};
